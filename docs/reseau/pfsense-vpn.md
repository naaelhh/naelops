# Procédure — pfSense : VPN d'accès distant (OpenVPN et WireGuard)

Le VPN permet aux administrateurs et télétravailleurs d'accéder au réseau interne sans exposer
de services sur Internet.

## Choix de la solution

| Solution  | Points forts                                         | Points faibles                    |
|-----------|------------------------------------------------------|-----------------------------------|
| OpenVPN   | Assistant intégré, export des profils clients, auth. locale/LDAP/RADIUS | Plus lent, config plus lourde |
| WireGuard | Très rapide, simple, moderne                         | Pas d'authentification utilisateur (clé par appareil) |
| IPsec     | Standard pour le VPN site à site entre équipements de marques différentes | Plus complexe |

## OpenVPN accès distant (avec l'assistant)

### 1. Créer l'autorité de certification et le certificat serveur

L'assistant s'en charge : *VPN → OpenVPN → Wizards*.
- Type of Server : **Local User Access** (ou LDAP pour l'authentification AD)
- Créer une **CA** (ex. `CA-VPN`) puis un **certificat serveur**
- Protocol : UDP on IPv4 — Local Port : `1194`
- Tunnel Network : `10.8.0.0/24` (réseau dédié, ne doit chevaucher aucun réseau existant)
- Local Network : `192.168.20.0/24, 192.168.99.0/24` (réseaux accessibles via le VPN)
- Cocher **Firewall Rule** et **OpenVPN rule** pour créer les règles automatiquement

### 2. Créer les utilisateurs

*System → User Manager → Add* : nom, mot de passe, et cocher **Click to create a user certificate**
(choisir la CA du VPN).

### 3. Exporter les profils clients

1. *System → Package Manager → Available Packages* → installer **openvpn-client-export**.
2. *VPN → OpenVPN → Client Export* → télécharger le profil (`.ovpn`) ou l'installeur Windows
   pour chaque utilisateur.
3. Sur le poste : installer **OpenVPN Connect** (ou OpenVPN GUI) et importer le profil.

### 4. Restreindre les droits

*Firewall → Rules → OpenVPN* : remplacer la règle « any » créée par l'assistant par des règles
précises (ex. les admins vers MGMT, les utilisateurs vers le serveur de fichiers uniquement).

## WireGuard

### 1. Installation

*System → Package Manager → Available Packages* → installer **WireGuard**.

### 2. Créer le tunnel

*VPN → WireGuard → Tunnels → Add Tunnel* :
- Listen Port : `51820`
- Interface Keys : **Generate**
- Interface Address : `10.9.0.1/24`

Puis *Interfaces → Assignments* : assigner `tun_wg0`, l'activer (sans IP supplémentaire).

### 3. Ajouter un client (peer)

Sur le client, générer une paire de clés (application WireGuard → *Ajouter un tunnel vide*).
Sur pfSense, *VPN → WireGuard → Peers → Add Peer* :
- Tunnel : `tun_wg0`
- Public Key : clé publique du client
- Allowed IPs : `10.9.0.2/32` (IP unique par client)

Configuration côté client :

```ini
[Interface]
PrivateKey = <clé privée du client>
Address = 10.9.0.2/32
DNS = 192.168.99.5

[Peer]
PublicKey = <clé publique du tunnel pfSense>
Endpoint = vpn.entreprise.fr:51820
AllowedIPs = 192.168.20.0/24, 192.168.99.0/24
PersistentKeepalive = 25
```

`AllowedIPs` côté client = réseaux qui passent dans le tunnel (split tunneling).
Mettre `0.0.0.0/0` pour faire passer **tout** le trafic par le VPN.

### 4. Règles de pare-feu

- *Firewall → Rules → WAN* : `Pass UDP any → WAN address : 51820`
- *Firewall → Rules → WireGuard* (ou l'interface assignée) : autoriser `10.9.0.0/24` vers les
  réseaux internes nécessaires.

## Dépannage

- *Status → OpenVPN* / *Status → WireGuard* : clients connectés, dernier handshake.
- Pas de handshake WireGuard → vérifier le port WAN, les clés, l'heure des équipements.
- Connecté mais aucun accès → règles de l'interface VPN ou route manquante (`AllowedIPs` / Local Network).
- Les réseaux du domicile et de l'entreprise ne doivent pas se chevaucher (éviter `192.168.1.0/24` en interne).
