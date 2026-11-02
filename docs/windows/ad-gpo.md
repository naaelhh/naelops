# Mémo — Stratégies de groupe (GPO) Active Directory

## Principes

- Une GPO se crée dans la **console GPMC** (`gpmc.msc`) puis se **lie** à un site, un domaine ou une OU.
- Ordre d'application **LSDOU** : Local → Site → Domaine → OU (la dernière appliquée gagne).
- **Configuration ordinateur** : s'applique au démarrage, à l'ordinateur (l'objet ordinateur doit être dans l'OU).
- **Configuration utilisateur** : s'applique à l'ouverture de session (l'utilisateur doit être dans l'OU).
- **Appliqué (Enforced)** : la GPO ne peut pas être écrasée par une GPO d'OU enfant.
- **Bloquer l'héritage** sur une OU : ignore les GPO parentes (sauf celles en *Enforced*).
- **Filtrage de sécurité** : limiter une GPO à un groupe (retirer *Utilisateurs authentifiés*,
  ajouter le groupe, et laisser *Utilisateurs authentifiés* en **Lecture** dans l'onglet *Délégation*).

Bonne pratique : **une GPO = un objectif**, nommée clairement, ex. `U_Lecteurs_Reseau`,
`C_Securite_Postes`, `C_WSUS`.

## Création en PowerShell

```powershell
Import-Module GroupPolicy
New-GPO -Name 'U_Lecteurs_Reseau' -Comment 'Mappage des lecteurs réseau par service'
New-GPLink -Name 'U_Lecteurs_Reseau' -Target 'OU=Utilisateurs,DC=entreprise,DC=local'
Get-GPO -All | Select-Object DisplayName, GpoStatus, ModificationTime
Backup-GPO -All -Path 'D:\Sauvegardes\GPO'               # sauvegarde de toutes les GPO
Get-GPOReport -Name 'U_Lecteurs_Reseau' -ReportType Html -Path .\rapport.html
```

## GPO courantes et leur emplacement

### Mappage de lecteurs réseau
*Configuration utilisateur → Préférences → Paramètres Windows → Mappages de lecteurs*
- Action : **Mettre à jour** — Emplacement : `\\srv-fichiers\Compta` — Lettre : `S:`
- Onglet *Commun* → **Ciblage au niveau de l'élément** → Groupe de sécurité `GG_Comptabilite`

### Stratégie de mots de passe (domaine)
Dans la **Default Domain Policy** (une seule stratégie de mots de passe par domaine) :
*Configuration ordinateur → Stratégies → Paramètres Windows → Paramètres de sécurité → Stratégies de comptes*
- Longueur minimale : 12 — Complexité : activée — Verrouillage : 5 tentatives / 15 minutes
- Pour des règles différentes par groupe (admins…) : **stratégies de mot de passe affinées (PSO)**
  via le *Centre d'administration Active Directory*.

### Fond d'écran
*Configuration utilisateur → Stratégies → Modèles d'administration → Bureau → Bureau → Papier peint du Bureau*
→ chemin UNC accessible en lecture : `\\entreprise.local\NETLOGON\fond.jpg`

### Imprimantes
*Configuration utilisateur → Préférences → Paramètres du Panneau de configuration → Imprimantes*
→ Imprimante partagée `\\srv-print\Imprimante-RDC`

### Restrictions de sécurité courantes
- Bloquer le panneau de configuration : *Config. utilisateur → Modèles d'administration → Panneau de configuration → Interdire l'accès…*
- Bloquer les clés USB de stockage : *Config. ordinateur → Modèles d'administration → Système → Accès au stockage amovible*
- Verrouillage automatique de session : *Config. ordinateur → Paramètres Windows → Paramètres de sécurité → Stratégies locales → Options de sécurité → Ouverture de session interactive : limite d'inactivité de l'ordinateur* (ex. 600 s)
- Pare-feu Windows : *Config. ordinateur → Paramètres Windows → Paramètres de sécurité → Pare-feu Windows Defender avec fonctions avancées de sécurité*

### Déploiement de logiciel (MSI)
*Configuration ordinateur → Stratégies → Paramètres du logiciel → Installation de logiciel → Nouveau → Package*
→ chemin **UNC** vers le `.msi` (partage lisible par les *Ordinateurs du domaine*). Installation au redémarrage.

### Scripts d'ouverture de session
*Configuration utilisateur → Stratégies → Paramètres Windows → Scripts → Ouverture de session*

### Mode de bouclage (loopback)
Pour appliquer des paramètres utilisateur selon l'**ordinateur** (salles de formation, serveurs RDS) :
*Config. ordinateur → Modèles d'administration → Système → Stratégie de groupe → Configurer le mode de traitement par bouclage* → **Remplacer** ou **Fusionner**.

## Tester et dépanner

```powershell
gpupdate /force                         # forcer l'application
gpresult /r                             # GPO appliquées (résumé)
gpresult /h C:\Temp\gpresult.html /f    # rapport détaillé HTML
```

Dans la GPMC : **Modélisation de stratégie de groupe** (simulation) et **Résultats de stratégie de groupe**.

Problèmes fréquents :
- GPO utilisateur liée à une OU qui ne contient que des ordinateurs (ou l'inverse) → rien ne s'applique.
- Filtrage de sécurité trop restrictif (manque le droit *Lecture* pour *Utilisateurs authentifiés*).
- Problème DNS : le poste doit utiliser **uniquement** le DNS du contrôleur de domaine.
- Réplication SYSVOL : `dcdiag /test:sysvolcheck`, `repadmin /replsummary`.
