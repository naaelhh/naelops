# Procédure — Supervision avec Zabbix (agents, SNMP, alertes)

## Architecture

- **Zabbix Server** : collecte, stocke (base MySQL/PostgreSQL) et déclenche les alertes.
- **Interface web (frontend)** : configuration et tableaux de bord.
- **Agent / Agent 2** : installé sur les serveurs Linux et Windows.
- **SNMP** : pour les équipements réseau (switchs, routeurs, pare-feu, imprimantes).
- **Proxy** (optionnel) : collecte pour un site distant.

| Port  | Sens                                  | Usage                         |
|-------|---------------------------------------|-------------------------------|
| 10050 | serveur → agent                       | contrôles **passifs**         |
| 10051 | agent → serveur                       | contrôles **actifs** (et proxy) |
| 161/udp | serveur → équipement               | SNMP                          |

## Installation du serveur

Suivre l'assistant officiel <https://www.zabbix.com/download> (choisir la version LTS, l'OS,
la base et le serveur web) : il donne les commandes exactes pour ajouter le dépôt
`zabbix-release`, installer les paquets et importer le schéma de base.

Après l'installation, se connecter sur `http://<serveur>/zabbix` avec `Admin` / `zabbix`
et **changer ce mot de passe immédiatement**.

## Agent Linux

Ajouter le dépôt Zabbix (même méthode que le serveur, même version), puis :

```bash
sudo apt install zabbix-agent2
```

`/etc/zabbix/zabbix_agent2.conf` :

```ini
Server=192.168.99.10            # IP du serveur Zabbix (contrôles passifs)
ServerActive=192.168.99.10      # contrôles actifs
Hostname=srv-web-01             # doit être identique au nom de l'hôte dans Zabbix
```

```bash
sudo systemctl enable --now zabbix-agent2
sudo systemctl restart zabbix-agent2
sudo ufw allow from 192.168.99.10 to any port 10050 proto tcp
```

## Agent Windows

Installer le MSI **Zabbix Agent 2** (même version que le serveur) en indiquant le serveur et
le nom d'hôte, ou en silencieux :

```powershell
msiexec /i zabbix_agent2-x.y.z-windows-amd64-openssl.msi /qn SERVER=192.168.99.10 SERVERACTIVE=192.168.99.10 HOSTNAME=SRV-DC01
New-NetFirewallRule -DisplayName 'Zabbix Agent' -Direction Inbound -Protocol TCP -LocalPort 10050 -RemoteAddress 192.168.99.10 -Action Allow
```

Déploiement sur de nombreux postes : GPO d'installation de logiciel ou script.

## Ajouter un hôte dans Zabbix

*Data collection → Hosts → Create host* :
- Host name : identique au `Hostname` de l'agent
- Host groups : `Linux servers`, `Windows servers`, `Network devices`…
- Interfaces : **Agent** (IP, port 10050) ou **SNMP**
- Templates :
  - `Linux by Zabbix agent` / `Windows by Zabbix agent`
  - `Cisco IOS by SNMP`, `pfSense by SNMP`, `Generic by SNMP`
  - `Proxmox VE by HTTP` (via un jeton API Proxmox)

L'icône **ZBX** devient verte quand l'agent répond.

## SNMP sur les équipements réseau

Cisco, de préférence en **SNMPv3** (authentifié et chiffré) :

```cisco
snmp-server group ZABBIX v3 priv
snmp-server user zabbix ZABBIX v3 auth sha MotDePasseAuth priv aes 128 MotDePassePriv
snmp-server location Baie-RDC
snmp-server contact support@entreprise.fr
```

SNMPv2c (labo uniquement, communauté en clair) :

```cisco
ip access-list standard ACL-SNMP
 permit host 192.168.99.10
snmp-server community LectureSeule RO ACL-SNMP
```

pfSense : *Services → SNMP* (activer, communauté, interface de management uniquement).

## Alertes

1. **Triggers** : fournis par les templates (disque plein, CPU, service arrêté, hôte injoignable).
2. **Media types** (*Alerts → Media types*) : e-mail, Teams, Telegram, Slack… configurer le serveur SMTP.
3. **Utilisateur** : *Users → Users → Media* : ajouter l'adresse de destination.
4. **Action** (*Alerts → Actions → Trigger actions*) : conditions (sévérité ≥ *Average*, groupe d'hôtes) et opérations (envoi).

## Dépannage

```bash
# Depuis le serveur Zabbix : tester un agent
zabbix_get -s 192.168.20.50 -k agent.ping          # doit renvoyer 1
zabbix_get -s 192.168.20.50 -k system.uname
# Tester le SNMP
snmpwalk -v3 -l authPriv -u zabbix -a SHA -A MotDePasseAuth -x AES -X MotDePassePriv 192.168.99.11 1.3.6.1.2.1.1
# Logs
sudo tail -f /var/log/zabbix/zabbix_agent2.log
sudo tail -f /var/log/zabbix/zabbix_server.log
```

Causes fréquentes : pare-feu (10050), `Hostname` différent, IP du serveur absente de `Server=`,
versions agent/serveur trop éloignées.
