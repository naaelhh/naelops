# Mémo — Scripts d'administration Bash et PowerShell

## Bash : modèle de script robuste

```bash
#!/usr/bin/env bash
# Description : <ce que fait le script>
set -euo pipefail          # arrêt sur erreur, variable non définie, ou erreur dans un pipe
IFS=$'\n\t'

readonly LOG="/var/log/$(basename "$0" .sh).log"

log()  { echo "$(date '+%F %T') [INFO] $*" | tee -a "$LOG"; }
err()  { echo "$(date '+%F %T') [ERREUR] $*" | tee -a "$LOG" >&2; }
trap 'err "Échec ligne $LINENO"' ERR

[[ $EUID -eq 0 ]] || { err "À lancer en root (sudo)"; exit 1; }
[[ $# -ge 1 ]]    || { echo "Usage : $0 <argument>"; exit 2; }

log "Début avec l'argument : $1"
# ... traitement ...
log "Terminé"
```

Vérifier un script avant usage : `bash -n script.sh` (syntaxe) et **shellcheck** (`sudo apt install shellcheck`).

## Bash : alerte d'espace disque

```bash
#!/usr/bin/env bash
set -euo pipefail
SEUIL=85
df -hP -x tmpfs -x devtmpfs | awk 'NR>1 {gsub("%","",$5); print $5, $6}' |
while read -r usage point; do
  if (( usage >= SEUIL )); then
    echo "ALERTE $(hostname) : $point est plein à ${usage}%" |
      mail -s "Disque presque plein sur $(hostname)" support@entreprise.fr
  fi
done
```

## Bash : créer des comptes depuis un fichier

`comptes.txt` : une ligne `login;Nom complet`.

```bash
#!/usr/bin/env bash
set -euo pipefail
while IFS=';' read -r login nom; do
  [[ -z "$login" || "$login" == \#* ]] && continue
  if id "$login" &>/dev/null; then
    echo "[IGNORÉ] $login existe déjà"; continue
  fi
  mdp=$(openssl rand -base64 12)
  useradd -m -s /bin/bash -c "$nom" "$login"
  echo "$login:$mdp" | chpasswd
  chage -d 0 "$login"                  # changement du mot de passe à la 1re connexion
  echo "[OK] $login  mot de passe provisoire : $mdp"
done < comptes.txt
```

## Bash : vérifier des services et les relancer

```bash
for svc in nginx mariadb zabbix-agent2; do
  if ! systemctl is-active --quiet "$svc"; then
    logger -t surveillance "$svc arrêté, redémarrage"
    systemctl restart "$svc"
  fi
done
```

## Bash : rappels utiles

```bash
"$var"                       # toujours mettre les variables entre guillemets
${var:-defaut}               # valeur par défaut
$(commande)                  # substitution de commande
[[ -f fichier ]]  [[ -d dossier ]]  [[ -z "$var" ]]
for f in /var/log/*.log; do echo "$f"; done
grep -rn "motif" /etc/  |  awk -F: '{print $1}'  |  sort -u
sed -i.bak 's/ancien/nouveau/g' fichier.conf     # remplace en gardant une copie .bak
```

## PowerShell : modèle de script

```powershell
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [string] $Cible
)
$ErrorActionPreference = 'Stop'
Start-Transcript -Path "C:\Logs\$(Get-Date -Format yyyyMMdd-HHmm)-script.log"
try {
    # ... traitement ...
    Write-Host "Traitement de $Cible" -ForegroundColor Green
}
catch {
    Write-Error "Erreur : $($_.Exception.Message)"
    exit 1
}
finally {
    Stop-Transcript
}
```

`-WhatIf` et `-Confirm` deviennent disponibles grâce à `SupportsShouldProcess`.
Politique d'exécution : `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` (ou signer les scripts en entreprise).

## PowerShell : état des disques de plusieurs serveurs

```powershell
$serveurs = 'SRV-DC01', 'SRV-FICHIERS', 'SRV-APP-01'
Invoke-Command -ComputerName $serveurs -ScriptBlock {
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
        Select-Object @{n='Serveur';e={$env:COMPUTERNAME}}, DeviceID,
            @{n='Taille(Go)';e={[math]::Round($_.Size/1GB,1)}},
            @{n='Libre(Go)';e={[math]::Round($_.FreeSpace/1GB,1)}},
            @{n='Libre(%)';e={[math]::Round($_.FreeSpace/$_.Size*100,1)}}
} | Sort-Object 'Libre(%)' | Format-Table -AutoSize
```

## PowerShell : redémarrer un service arrêté

```powershell
$services = 'Spooler', 'W32Time'
foreach ($s in $services) {
    $svc = Get-Service -Name $s
    if ($svc.Status -ne 'Running') {
        Start-Service -Name $s
        Write-EventLog -LogName Application -Source 'Application' -EventId 1000 -EntryType Warning -Message "$s redémarré"
    }
}
```

## PowerShell : journaux d'événements

```powershell
# Échecs d'ouverture de session (ID 4625) des dernières 24 h
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddDays(-1)} |
    Select-Object TimeCreated, @{n='Compte';e={$_.Properties[5].Value}}, @{n='IP';e={$_.Properties[19].Value}}
# Erreurs système récentes
Get-WinEvent -LogName System -MaxEvents 50 | Where-Object LevelDisplayName -eq 'Erreur'
```

## PowerShell : rappels utiles

```powershell
Get-Command *service*                 # trouver une commande
Get-Help Get-ADUser -Examples         # exemples d'utilisation
Get-Service | Get-Member              # propriétés et méthodes d'un objet
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10
Test-NetConnection srv-web -Port 443  # test de port (équivalent telnet)
Get-NetIPConfiguration
Enter-PSSession -ComputerName SRV-APP-01   # session distante (WinRM)
Export-Csv -NoTypeInformation -Encoding UTF8 -Delimiter ';'   # CSV lisible dans Excel FR
```

## Planification

- Linux : `cron` ou timer systemd (voir le mémo sauvegardes).
- Windows : Planificateur de tâches, ou en PowerShell :

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -File C:\Scripts\verif.ps1'
$trigger = New-ScheduledTaskTrigger -Daily -At 7am
Register-ScheduledTask -TaskName 'Verification quotidienne' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest
```
