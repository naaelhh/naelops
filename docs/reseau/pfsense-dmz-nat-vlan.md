# Procédure — pfSense : VLAN, DMZ, NAT et règles de pare-feu

pfSense se configure principalement depuis l'interface web (`https://<ip-lan>`).

## Principes des règles de pare-feu pfSense

- Les règles s'appliquent sur l'interface **par laquelle le trafic entre** dans pfSense.
- Elles sont lues **de haut en bas**, la **première règle correspondante** l'emporte.
- Une nouvelle interface (OPT, DMZ…) **bloque tout par défaut** tant qu'aucune règle n'est créée.
- pfSense est **stateful** : la réponse à une connexion autorisée est automatiquement acceptée.
- Utiliser des **alias** (*Firewall → Aliases*) pour regrouper IP, réseaux et ports.

## 1. Créer les VLAN

1. *Interfaces → Assignments → VLANs → Add*
   - Parent interface : la carte LAN (ex. `igb1`)
   - VLAN Tag : `50` — Description : `DMZ`
2. *Interfaces → Assignments* : ajouter le VLAN créé → il apparaît en `OPT1`.
3. Cliquer sur `OPT1` :
   - Enable ✔, Description : `DMZ`
   - IPv4 Configuration Type : Static IPv4 → `192.168.50.254/24`
4. *Services → DHCP Server → DMZ* (optionnel, souvent en IP fixes pour une DMZ).

Côté switch, le port vers pfSense doit être en **trunk** avec le VLAN 50 autorisé.

## 2. Plan type

| Interface | Réseau           | Rôle                              |
|-----------|------------------|-----------------------------------|
| WAN       | IP publique      | Internet                          |
| LAN       | 192.168.20.0/24  | Utilisateurs                      |
| DMZ       | 192.168.50.0/24  | Serveurs exposés (web, mail…)     |
| MGMT      | 192.168.99.0/24  | Administration                    |

## 3. Alias recommandés

*Firewall → Aliases* :
- `NET_PRIVES` (Network) : `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- `SRV_WEB_DMZ` (Host) : `192.168.50.10`
- `PORTS_WEB` (Port) : `80`, `443`

## 4. Règles de la DMZ

Objectif : la DMZ peut sortir sur Internet (mises à jour) mais **ne peut jamais initier de
connexion vers le LAN ou le MGMT**.

*Firewall → Rules → DMZ*, dans cet ordre :

| # | Action | Proto | Source     | Destination   | Port   | Description                    |
|---|--------|-------|------------|---------------|--------|--------------------------------|
| 1 | Pass   | UDP   | DMZ net    | DMZ address   | 53     | DNS vers pfSense               |
| 2 | Pass   | UDP   | DMZ net    | DMZ address   | 123    | NTP vers pfSense               |
| 3 | Block  | any   | DMZ net    | NET_PRIVES    | *      | Interdit DMZ → réseaux internes|
| 4 | Pass   | TCP   | DMZ net    | any           | PORTS_WEB | Mises à jour HTTP/HTTPS     |
| 5 | Block  | any   | DMZ net    | any           | *      | Tout le reste (avec log)       |

Règles **LAN → DMZ** (*Firewall → Rules → LAN*) : autoriser seulement ce qui est utile, par
exemple `LAN net → SRV_WEB_DMZ : 443`, et SSH uniquement depuis le réseau MGMT.

## 5. Publier un serveur de la DMZ sur Internet (NAT / Port Forward)

*Firewall → NAT → Port Forward → Add* :
- Interface : `WAN` — Protocol : `TCP`
- Destination : `WAN address` — Destination port : `443`
- Redirect target IP : `SRV_WEB_DMZ` — Redirect target port : `443`
- Filter rule association : **Add associated filter rule** (crée la règle WAN automatiquement)

⚠️ Ne jamais publier SSH, RDP ou l'interface d'administration de pfSense sur le WAN.
Utiliser un VPN à la place (voir le mémo VPN pfSense).

## 6. NAT sortant

Par défaut (*Firewall → NAT → Outbound* : **Automatic**), tous les réseaux internes sortent
avec l'IP WAN. Passer en *Hybrid* seulement pour des cas particuliers (IP publique dédiée à la DMZ).

## 7. Vérifications et dépannage

- *Status → System Logs → Firewall* : voir ce qui est bloqué (activer *Log* sur les règles Block).
- *Diagnostics → States* : connexions en cours.
- *Diagnostics → Packet Capture* : capture sur une interface.
- *Diagnostics → Ping / Traceroute / Test Port*.
- Après une modification, penser à **Apply Changes**.

## 8. Sauvegarde

⚠️ Avant toute modification importante : *Diagnostics → Backup & Restore → Download configuration as XML*.
L'historique des configurations est aussi disponible dans *Diagnostics → Backup & Restore → Config History*.
