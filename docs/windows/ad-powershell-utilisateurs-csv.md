# Script — Créer des utilisateurs Active Directory depuis un CSV (PowerShell)

À exécuter sur un contrôleur de domaine ou un poste avec les outils RSAT (module `ActiveDirectory`).

## 1. Format du fichier CSV

Fichier `utilisateurs.csv`, encodé en **UTF-8**, séparateur `;` (format Excel français) :

```csv
Prenom;Nom;Service;Fonction;MotDePasse
Jean;Dupont;Comptabilite;Comptable;Bienvenue2026!
Marie;Martin;Informatique;Technicienne;Bienvenue2026!
Éloïse;Lefèvre;RH;Assistante RH;Bienvenue2026!
```

Chaque service doit avoir son OU : `OU=<Service>,OU=Utilisateurs,DC=entreprise,DC=local`
et un groupe `GG_<Service>`.

## 2. Script complet

```powershell
<#
.SYNOPSIS
  Crée des comptes AD à partir d'un CSV.
.EXAMPLE
  .\New-UsersFromCsv.ps1 -CsvPath .\utilisateurs.csv -WhatIf   # simulation
  .\New-UsersFromCsv.ps1 -CsvPath .\utilisateurs.csv           # exécution réelle
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [string] $CsvPath,
    [string] $Domaine = 'entreprise.local',
    [string] $OuRacine = 'OU=Utilisateurs,DC=entreprise,DC=local',
    [string] $LogPath = ".\creation-utilisateurs-$(Get-Date -Format 'yyyyMMdd-HHmm').log"
)

Import-Module ActiveDirectory

# Supprime les accents et caractères spéciaux pour le login (Éloïse -> eloise)
function ConvertTo-Login([string] $texte) {
    $normalise = $texte.Normalize([Text.NormalizationForm]::FormD)
    ($normalise -replace '\p{Mn}', '' -replace "[^a-zA-Z0-9-]", '').ToLower()
}

function Write-Log([string] $message) {
    $ligne = "$(Get-Date -Format 'HH:mm:ss') $message"
    Write-Host $ligne
    Add-Content -Path $LogPath -Value $ligne
}

$utilisateurs = Import-Csv -Path $CsvPath -Delimiter ';' -Encoding UTF8

foreach ($u in $utilisateurs) {
    # Login au format prenom.nom (tronqué à 20 caractères, limite du sAMAccountName)
    $sam = "$(ConvertTo-Login $u.Prenom).$(ConvertTo-Login $u.Nom)"
    if ($sam.Length -gt 20) { $sam = $sam.Substring(0, 20) }
    $ou = "OU=$($u.Service),$OuRacine"

    if (Get-ADUser -Filter "SamAccountName -eq '$sam'" -ErrorAction SilentlyContinue) {
        Write-Log "[IGNORÉ] $sam existe déjà"
        continue
    }

    $params = @{
        Name                  = "$($u.Prenom) $($u.Nom)"
        GivenName             = $u.Prenom
        Surname               = $u.Nom
        DisplayName           = "$($u.Prenom) $($u.Nom)"
        SamAccountName        = $sam
        UserPrincipalName     = "$sam@$Domaine"
        Department            = $u.Service
        Title                 = $u.Fonction
        Path                  = $ou
        AccountPassword       = ConvertTo-SecureString $u.MotDePasse -AsPlainText -Force
        ChangePasswordAtLogon = $true
        Enabled               = $true
    }

    try {
        if ($PSCmdlet.ShouldProcess($sam, 'Créer l''utilisateur')) {
            New-ADUser @params -ErrorAction Stop
            Add-ADGroupMember -Identity "GG_$($u.Service)" -Members $sam -ErrorAction Stop
            Write-Log "[OK] $sam créé dans $ou"
        }
    }
    catch {
        Write-Log "[ERREUR] $sam : $($_.Exception.Message)"
    }
}
Write-Log "Terminé. Journal : $LogPath"
```

## 3. Utilisation

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass   # pour cette session uniquement
.\New-UsersFromCsv.ps1 -CsvPath .\utilisateurs.csv -WhatIf    # toujours simuler d'abord
.\New-UsersFromCsv.ps1 -CsvPath .\utilisateurs.csv
```

⚠️ Le CSV contient des mots de passe en clair : le **supprimer** après usage et ne jamais le
stocker sur un partage. Mieux : générer un mot de passe aléatoire par utilisateur et le
communiquer par un canal sécurisé.

## 4. Créer les OU et groupes au préalable

```powershell
$services = 'Comptabilite', 'Informatique', 'RH'
New-ADOrganizationalUnit -Name 'Utilisateurs' -Path 'DC=entreprise,DC=local' -ProtectedFromAccidentalDeletion $true
foreach ($s in $services) {
    New-ADOrganizationalUnit -Name $s -Path 'OU=Utilisateurs,DC=entreprise,DC=local'
    New-ADGroup -Name "GG_$s" -GroupScope Global -GroupCategory Security -Path "OU=$s,OU=Utilisateurs,DC=entreprise,DC=local"
}
```

## 5. Commandes AD utiles au quotidien

```powershell
Get-ADUser jean.dupont -Properties *                      # tout voir sur un compte
Unlock-ADAccount jean.dupont                              # déverrouiller
Set-ADAccountPassword jean.dupont -Reset -NewPassword (Read-Host -AsSecureString 'Nouveau mdp')
Set-ADUser jean.dupont -ChangePasswordAtLogon $true
Disable-ADAccount jean.dupont                             # départ d'un salarié
Search-ADAccount -LockedOut                               # comptes verrouillés
Search-ADAccount -AccountInactive -TimeSpan 90.00:00:00 -UsersOnly |
    Select-Object Name, SamAccountName, LastLogonDate |
    Export-Csv .\inactifs-90j.csv -NoTypeInformation -Encoding UTF8 -Delimiter ';'
Get-ADGroupMember GG_Informatique | Select-Object Name
Get-ADPrincipalGroupMembership jean.dupont | Select-Object Name
```

Désactivation propre lors d'un départ : désactiver le compte, le déplacer dans une OU
`Desactives`, retirer les groupes, puis supprimer après la durée de conservation définie.

## 6. Stratégie de nommage (convention interne)

- Utilisateurs : `prenom.nom` (homonymes : `prenom.nom2`)
- Groupes globaux : `GG_<Service>` — groupes domaine local (droits) : `GDL_<Ressource>_<Droit>`
  (ex. `GDL_Compta_RW`). Méthode **AGDLP** : Comptes → Groupes Globaux → Groupes Domaine Local → Permissions.
