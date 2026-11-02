# Procédure — Windows Server : rôles DHCP et DNS (PowerShell)

## Serveur DHCP

### Installation et autorisation dans l'AD

```powershell
Install-WindowsFeature DHCP -IncludeManagementTools
# Crée les groupes de sécurité DHCP locaux
netsh dhcp add securitygroups
Restart-Service DHCPServer
# Autorise le serveur dans Active Directory (obligatoire dans un domaine)
Add-DhcpServerInDC -DnsName srv-dc01.entreprise.local -IPAddress 192.168.99.5
# Supprime l'avertissement post-installation du Gestionnaire de serveur
Set-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\ServerManager\Roles\12 -Name ConfigurationState -Value 2
```

### Créer une étendue (scope)

```powershell
Add-DhcpServerv4Scope -Name 'USERS' -StartRange 192.168.20.50 -EndRange 192.168.20.200 `
    -SubnetMask 255.255.255.0 -LeaseDuration 1.00:00:00 -State Active
Set-DhcpServerv4OptionValue -ScopeId 192.168.20.0 -Router 192.168.20.254 `
    -DnsServer 192.168.99.5 -DnsDomain entreprise.local
Add-DhcpServerv4ExclusionRange -ScopeId 192.168.20.0 -StartRange 192.168.20.50 -EndRange 192.168.20.60
```

### Réservation (IP fixe pour une imprimante, un serveur…)

```powershell
Add-DhcpServerv4Reservation -ScopeId 192.168.20.0 -IPAddress 192.168.20.10 `
    -ClientId 'AA-BB-CC-DD-EE-FF' -Name 'IMP-RDC' -Description 'Imprimante accueil'
```

### Plusieurs VLAN avec un seul serveur DHCP

Créer une étendue par VLAN, puis configurer un **relais DHCP** sur la passerelle de chaque VLAN :
- Cisco : `ip helper-address 192.168.99.5` sur l'interface VLAN
- pfSense : *Services → DHCP Relay*

### Haute disponibilité (basculement DHCP)

```powershell
Add-DhcpServerv4Failover -Name 'FO-DHCP' -PartnerServer srv-dc02.entreprise.local `
    -ScopeId 192.168.20.0 -LoadBalancePercent 50 -SharedSecret 'SecretPartage' -AutoStateTransition $true
```

### Vérifications

```powershell
Get-DhcpServerv4Scope
Get-DhcpServerv4Lease -ScopeId 192.168.20.0
Get-DhcpServerv4ScopeStatistics            # taux d'occupation
Get-DhcpServerInDC
```

Côté client : `ipconfig /release`, `ipconfig /renew`, `ipconfig /all`.

## Serveur DNS

Sur un contrôleur de domaine, le DNS est installé avec l'AD et les zones sont **intégrées à l'AD**.

```powershell
Install-WindowsFeature DNS -IncludeManagementTools   # si serveur DNS séparé
```

### Zones

```powershell
# Zone de recherche directe intégrée à l'AD
Add-DnsServerPrimaryZone -Name 'services.entreprise.local' -ReplicationScope Domain
# Zone de recherche inversée (pour les PTR)
Add-DnsServerPrimaryZone -NetworkId '192.168.20.0/24' -ReplicationScope Domain
Get-DnsServerZone
```

### Enregistrements

```powershell
Add-DnsServerResourceRecordA -ZoneName 'entreprise.local' -Name 'srv-web' -IPv4Address 192.168.50.10 -CreatePtr
Add-DnsServerResourceRecordCName -ZoneName 'entreprise.local' -Name 'intranet' -HostNameAlias 'srv-web.entreprise.local'
Add-DnsServerResourceRecordMX -ZoneName 'entreprise.local' -Name '.' -MailExchange 'mail.entreprise.local' -Preference 10
Get-DnsServerResourceRecord -ZoneName 'entreprise.local' -Name 'srv-web'
Remove-DnsServerResourceRecord -ZoneName 'entreprise.local' -Name 'srv-web' -RRType A -Force
```

### Redirecteurs (résolution Internet)

```powershell
Add-DnsServerForwarder -IPAddress 1.1.1.1, 9.9.9.9
Get-DnsServerForwarder
```

### Nettoyage automatique (scavenging)

Évite les vieux enregistrements des postes qui ont changé d'IP :

```powershell
Set-DnsServerScavenging -ScavengingState $true -ScavengingInterval 7.00:00:00 -ApplyOnAllZones
```

### Diagnostic

```powershell
Resolve-DnsName srv-web.entreprise.local
Resolve-DnsName -Type SRV _ldap._tcp.dc._msdcs.entreprise.local   # vérifie les enregistrements AD
nslookup srv-web 192.168.99.5
ipconfig /flushdns          # vider le cache du poste
ipconfig /registerdns       # réenregistrer le poste dans le DNS
Clear-DnsServerCache        # vider le cache du serveur
dcdiag /test:dns
```

⚠️ Les postes du domaine doivent utiliser **uniquement les DNS des contrôleurs de domaine**
(jamais 8.8.8.8 en DNS secondaire), sinon problèmes d'ouverture de session et de GPO.
