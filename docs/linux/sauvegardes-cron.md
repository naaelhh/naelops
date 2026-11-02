# Procédure — Sauvegardes Linux (rsync, tar, bases de données) et planification cron

## Règle du 3-2-1

- **3** copies des données (la production + 2 sauvegardes)
- sur **2** supports différents
- dont **1** hors site (ou hors ligne / immuable, contre les rançongiciels)

Et surtout : **tester régulièrement la restauration**. Une sauvegarde jamais restaurée n'est pas fiable.

## rsync (copie incrémentale)

```bash
# Copie locale ou vers un disque monté
rsync -aAXv /srv/donnees/ /mnt/backup/donnees/
# Vers un serveur distant via SSH
rsync -aAXvz -e ssh /srv/donnees/ backup@srv-backup:/backups/srv-web-01/
# Simulation (n'écrit rien)
rsync -aAXvn --delete /srv/donnees/ /mnt/backup/donnees/
```

- `-a` archive (droits, dates, liens), `-A` ACL, `-X` attributs étendus, `-z` compression réseau.
- Le `/` final de la source compte : `donnees/` copie le **contenu**, `donnees` copie le **dossier**.
- ⚠️ `--delete` supprime dans la destination ce qui n'existe plus dans la source : toujours tester avec `-n` d'abord.

## tar (archives datées)

```bash
sudo tar czf /mnt/backup/etc-$(hostname)-$(date +%F).tar.gz /etc
tar tzf /mnt/backup/etc-srv-web-01-2026-11-02.tar.gz | head          # lister le contenu
sudo tar xzf archive.tar.gz -C /tmp/restauration                      # restaurer dans un dossier de test
```

## Bases de données

```bash
# MariaDB / MySQL (cohérent sans bloquer les tables InnoDB)
mysqldump --single-transaction --routines --triggers -u backup -p glpi | gzip > /mnt/backup/glpi-$(date +%F).sql.gz
# Restauration
gunzip < glpi-2026-11-02.sql.gz | mysql -u root -p glpi

# PostgreSQL
sudo -u postgres pg_dump -Fc mabase > /mnt/backup/mabase-$(date +%F).dump
sudo -u postgres pg_restore -d mabase /mnt/backup/mabase-2026-11-02.dump
```

Stocker les identifiants dans `~/.my.cnf` (droits `600`) plutôt que dans le script :

```ini
[client]
user=backup
password=MotDePasseSauvegarde
```

## Script de sauvegarde complet

`/usr/local/bin/sauvegarde.sh` :

```bash
#!/usr/bin/env bash
set -euo pipefail

DEST="/mnt/backup/$(hostname)"
DATE="$(date +%F_%H%M)"
RETENTION_JOURS=14
LOG="/var/log/sauvegarde.log"

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

mkdir -p "$DEST"
log "Début de la sauvegarde"

tar czf "$DEST/etc-$DATE.tar.gz" /etc
rsync -aAX --delete /srv/donnees/ "$DEST/donnees/"
mysqldump --single-transaction --all-databases | gzip > "$DEST/mysql-$DATE.sql.gz"

# Rotation : supprime les archives de plus de RETENTION_JOURS jours
find "$DEST" -maxdepth 1 -type f -name '*.gz' -mtime +"$RETENTION_JOURS" -print -delete | tee -a "$LOG"

log "Fin de la sauvegarde ($(du -sh "$DEST" | cut -f1))"
```

```bash
sudo chmod 750 /usr/local/bin/sauvegarde.sh
sudo /usr/local/bin/sauvegarde.sh        # test manuel
```

⚠️ Avant d'activer la ligne `find … -delete`, la tester sans `-delete` pour vérifier ce qui serait supprimé.

## Planification avec cron

```bash
sudo crontab -e
```

```cron
# m  h  jdm mois jds  commande
30   2  *   *    *    /usr/local/bin/sauvegarde.sh > /dev/null 2>> /var/log/sauvegarde.log
0    3  *   *    0    /usr/local/bin/sauvegarde-complete.sh
*/15 *  *   *    *    /usr/local/bin/verif-disque.sh
```

| Champ | Valeurs | Exemple |
|---|---|---|
| minute | 0-59 | `30` |
| heure | 0-23 | `2` |
| jour du mois | 1-31 | `1` = le 1er du mois |
| mois | 1-12 | `*` |
| jour de la semaine | 0-7 (0 et 7 = dimanche) | `1-5` = lundi à vendredi |

- `crontab -l` liste les tâches ; les logs cron : `journalctl -u cron`.
- Cron a un `PATH` réduit : utiliser des **chemins absolus** dans les scripts.

## Alternative : timer systemd

`/etc/systemd/system/sauvegarde.service` :

```ini
[Unit]
Description=Sauvegarde quotidienne

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sauvegarde.sh
```

`/etc/systemd/system/sauvegarde.timer` :

```ini
[Unit]
Description=Lance la sauvegarde chaque nuit

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sauvegarde.timer
systemctl list-timers
journalctl -u sauvegarde.service
```

`Persistent=true` rattrape l'exécution si le serveur était éteint à l'heure prévue.

## Outils plus avancés

- **BorgBackup** / **restic** : sauvegardes dédupliquées et chiffrées.
- **Proxmox Backup Server** pour les VM (voir le mémo Proxmox).
- **Veeam Agent for Linux** (gratuit) si l'entreprise utilise Veeam.
