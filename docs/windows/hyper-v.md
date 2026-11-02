# Procédure — Hyper-V : installation, réseau et machines virtuelles (PowerShell)

## Installation du rôle

```powershell
# Windows Server
Install-WindowsFeature -Name Hyper-V -IncludeManagementTools -Restart
# Windows 10/11 Pro (poste de test)
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
```

Prérequis : virtualisation (VT-x / AMD-V) activée dans le BIOS/UEFI.

## Commutateurs virtuels

| Type      | Usage                                                       |
|-----------|-------------------------------------------------------------|
| Externe   | Relié à une carte physique : les VM sont sur le réseau réel |
| Interne   | Communication VM ↔ hôte uniquement                          |
| Privé     | Communication entre VM uniquement (labo isolé)              |

```powershell
Get-NetAdapter
New-VMSwitch -Name 'vSwitch-Externe' -NetAdapterName 'Ethernet' -AllowManagementOS $true
New-VMSwitch -Name 'vSwitch-Lab' -SwitchType Private
```

⚠️ Créer un commutateur externe sur la carte utilisée pour l'administration à distance peut
couper la connexion quelques secondes.

## Créer une VM

```powershell
$nom = 'SRV-APP-01'
New-VM -Name $nom -Generation 2 -MemoryStartupBytes 4GB `
    -NewVHDPath "D:\Hyper-V\$nom\$nom.vhdx" -NewVHDSizeBytes 80GB `
    -SwitchName 'vSwitch-Externe' -Path 'D:\Hyper-V'
Set-VMProcessor -VMName $nom -Count 2
Set-VMMemory -VMName $nom -DynamicMemoryEnabled $true -MinimumBytes 2GB -MaximumBytes 8GB
Add-VMDvdDrive -VMName $nom -Path 'D:\ISO\WindowsServer2025.iso'
Set-VMFirmware -VMName $nom -FirstBootDevice (Get-VMDvdDrive -VMName $nom)
Start-VM -Name $nom
vmconnect.exe localhost $nom
```

Pour une VM **Linux** en génération 2, changer le modèle de démarrage sécurisé :

```powershell
Set-VMFirmware -VMName $nom -SecureBootTemplate MicrosoftUEFICertificateAuthority
```

## VLAN sur une VM

```powershell
Set-VMNetworkAdapterVlan -VMName $nom -Access -VlanId 20
Get-VMNetworkAdapterVlan -VMName $nom
```

Le port du switch physique relié à l'hôte doit être en **trunk**.

## Points de contrôle (checkpoints)

```powershell
Checkpoint-VM -Name $nom -SnapshotName 'Avant mise a jour'
Get-VMSnapshot -VMName $nom
Restore-VMSnapshot -VMName $nom -Name 'Avant mise a jour' -Confirm:$false
Remove-VMSnapshot -VMName $nom -Name 'Avant mise a jour'
```

⚠️ Un point de contrôle **n'est pas une sauvegarde** : ne pas le conserver longtemps
(il dégrade les performances et grossit), et ne jamais restaurer un ancien checkpoint d'un
contrôleur de domaine.

## Export / import (sauvegarde simple, migration)

```powershell
Export-VM -Name $nom -Path 'E:\Exports'
Import-VM -Path 'E:\Exports\SRV-APP-01\Virtual Machines\<GUID>.vmcx' -Copy -GenerateNewId
```

## Gestion courante

```powershell
Get-VM
Stop-VM -Name $nom                # arrêt propre (services d'intégration)
Stop-VM -Name $nom -TurnOff       # coupure brutale
Set-VM -Name $nom -AutomaticStartAction Start -AutomaticStartDelay 60
Resize-VHD -Path "D:\Hyper-V\$nom\$nom.vhdx" -SizeBytes 120GB   # puis étendre la partition dans la VM
Enable-VMIntegrationService -VMName $nom -Name 'Interface de services d''invité'
Measure-VM -Name $nom
```

## Bonnes pratiques

- Disques **VHDX** (pas VHD), génération 2 pour les OS récents.
- Séparer les disques : système de l'hôte / stockage des VM.
- Réserver de la RAM à l'hôte (ne pas tout allouer aux VM).
- Sauvegarder avec un vrai outil (Windows Server Backup, Veeam…) et tester la restauration.
- Haute disponibilité : cluster de basculement (Failover Cluster) + stockage partagé.
