# Commandes Linux essentielles (Debian / Ubuntu)

Mémo des commandes utilisées au quotidien pour l'administration de nos serveurs.

## Système et ressources

```bash
hostnamectl                 # nom d'hôte, OS, noyau
uptime                      # charge et durée de fonctionnement
free -h                     # mémoire
df -hT                      # espace disque par partition
du -sh /var/log/* | sort -h # dossiers les plus volumineux
lsblk                       # disques et partitions
htop                        # processus en temps réel
```

## Services (systemd)

```bash
systemctl status nginx
sudo systemctl restart nginx
sudo systemctl enable --now nginx   # démarrer + activer au boot
systemctl list-units --type=service --state=failed
```

## Journaux

```bash
journalctl -u nginx -f              # suivre les logs d'un service
journalctl -p err -b                # erreurs depuis le dernier démarrage
journalctl --since "1 hour ago"
tail -f /var/log/syslog
```

## Réseau

```bash
ip -br a                    # adresses IP (format court)
ip r                        # table de routage
ss -tulpn                   # ports en écoute et processus associés
ping -c 4 8.8.8.8
dig +short exemple.fr
traceroute 8.8.8.8
```

Configuration IP statique avec Netplan (`/etc/netplan/01-netcfg.yaml`) :

```yaml
network:
  version: 2
  ethernets:
    ens18:
      addresses: [192.168.20.50/24]
      routes:
        - to: default
          via: 192.168.20.254
      nameservers:
        addresses: [192.168.99.5, 1.1.1.1]
```

```bash
sudo netplan try    # applique avec retour arrière automatique si perte de connexion
```

## Utilisateurs et droits

```bash
sudo adduser jdupont
sudo usermod -aG sudo jdupont
sudo passwd -l jdupont           # verrouiller un compte
chmod 640 fichier && chown root:www-data fichier
```

## Pare-feu (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

⚠️ Toujours autoriser SSH **avant** d'activer UFW sur un serveur distant.

## Mises à jour

```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove --purge
cat /var/run/reboot-required 2>/dev/null   # redémarrage nécessaire ?
```

## Commandes dangereuses — prudence

| Commande | Risque | Précaution |
|----------|--------|------------|
| `rm -rf` | suppression définitive | vérifier le chemin, faire un `ls` avant |
| `dd` | écrase un disque entier | vérifier `of=` avec `lsblk` |
| `chmod -R 777` | faille de sécurité | ne jamais faire en production |
| `reboot` / `shutdown` | coupure de service | prévenir, faire en heure creuse |

Sauvegarde rapide d'un dossier de configuration avant modification :

```bash
sudo tar czf /root/etc-backup-$(date +%F).tar.gz /etc
```
