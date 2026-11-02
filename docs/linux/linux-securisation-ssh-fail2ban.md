# Procédure — Sécuriser un serveur Linux (SSH, fail2ban, mises à jour)

Checklist appliquée à chaque nouveau serveur Debian / Ubuntu.

## 1. Compte administrateur et clés SSH

Sur **ton poste** (une seule fois) :

```bash
ssh-keygen -t ed25519 -C "admin@entreprise"
ssh-copy-id admin@192.168.20.50        # copie la clé publique sur le serveur
ssh admin@192.168.20.50                # doit se connecter sans mot de passe
```

Sur le serveur :

```bash
sudo adduser admin
sudo usermod -aG sudo admin
```

## 2. Durcir la configuration SSH

⚠️ **Garder une session SSH ouverte** pendant la modification, et tester la connexion dans
un second terminal avant de fermer la première. Sinon risque de perdre l'accès.

Créer `/etc/ssh/sshd_config.d/99-durcissement.conf` :

```ini
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowUsers admin
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
sudo sshd -t                          # vérifie la syntaxe (aucune sortie = OK)
sudo systemctl reload ssh             # "sshd" sur Debian/RHEL selon la version
```

Changer le port SSH (ex. 2222) réduit le bruit dans les logs mais **n'est pas une vraie
sécurité** ; penser à ouvrir le nouveau port dans le pare-feu **avant**.

## 3. Pare-feu

```bash
sudo apt install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.99.0/24 to any port 22 proto tcp   # SSH depuis le réseau d'admin uniquement
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status numbered
sudo ufw delete 3                     # supprimer la règle n°3
```

## 4. fail2ban (bannit les IP qui tentent des mots de passe)

```bash
sudo apt install fail2ban
```

Créer `/etc/fail2ban/jail.local` (ne jamais modifier `jail.conf`) :

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 192.168.99.0/24
# Les distributions récentes journalisent via systemd (pas de /var/log/auth.log)
backend  = systemd

[sshd]
enabled = true
```

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip 203.0.113.25
```

## 5. Mises à jour de sécurité automatiques

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
sudo unattended-upgrade --dry-run --debug
```

## 6. Autres vérifications

```bash
ss -tulpn                                     # services en écoute : fermer l'inutile
sudo systemctl disable --now <service-inutile>
sudo apt purge telnetd rsh-server             # supprimer les protocoles non chiffrés
last -a | head                                # dernières connexions
sudo journalctl -u ssh --since today | grep -i "failed"
sudo find / -perm -4000 -type f 2>/dev/null   # binaires SUID (à surveiller)
```

- Synchroniser l'heure : `timedatectl set-ntp true` (logs cohérents).
- Audit rapide de durcissement : `sudo apt install lynis && sudo lynis audit system`.
- Sauvegardes testées et supervision (Zabbix) : voir les mémos dédiés.
