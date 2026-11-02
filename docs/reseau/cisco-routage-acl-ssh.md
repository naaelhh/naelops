# Mémo — Cisco : routage, ACL, SSH et sécurisation de base

Configuration courante d'un routeur ou d'un switch de niveau 3 Cisco (IOS / IOS-XE).

## Configuration de base et sécurisation

```cisco
enable
configure terminal
hostname R-SITE1
no ip domain-lookup                       ! évite l'attente si on tape une commande inconnue
service password-encryption               ! chiffre (faiblement) les mots de passe en clair
enable algorithm-type scrypt secret MotDePasseEnable
banner motd # Acces reserve au personnel autorise #
```

Bonnes pratiques :
- Toujours utiliser `secret` (haché) et non `password`.
- Désactiver les services inutiles : `no ip http server`, `no cdp run` sur les ports exposés (ou `no cdp enable` par interface).
- Mettre en place la synchronisation horaire : `ntp server 192.168.99.5` (indispensable pour les logs).

## Accès SSH (et désactivation de Telnet)

```cisco
ip domain-name entreprise.local
crypto key generate rsa modulus 2048
ip ssh version 2
ip ssh time-out 60
ip ssh authentication-retries 3
username admin privilege 15 algorithm-type scrypt secret MotDePasseAdmin
line vty 0 15
 transport input ssh
 login local
 exec-timeout 10 0
line console 0
 login local
 exec-timeout 10 0
```

Restreindre l'accès SSH au réseau d'administration :

```cisco
ip access-list standard ACL-MGMT
 permit 192.168.99.0 0.0.0.255
 deny any log
line vty 0 15
 access-class ACL-MGMT in
```

Vérifier : `show ip ssh`, `show ssh`, puis depuis un poste : `ssh admin@192.168.99.1`.

## Routage statique

```cisco
ip route 0.0.0.0 0.0.0.0 203.0.113.1            ! route par défaut vers le FAI
ip route 10.20.0.0 255.255.0.0 192.168.1.2      ! réseau distant via un autre routeur
ip route 10.20.0.0 255.255.0.0 192.168.2.2 250  ! route flottante de secours (distance 250)
```

## Routage dynamique OSPF

```cisco
router ospf 1
 router-id 1.1.1.1
 passive-interface default                  ! pas d'annonces OSPF sur les ports LAN
 no passive-interface GigabitEthernet0/0/1  ! seulement vers les autres routeurs
 network 192.168.10.0 0.0.0.255 area 0
 network 192.168.20.0 0.0.0.255 area 0
 network 10.0.0.0 0.0.0.3 area 0
 default-information originate              ! propage la route par défaut
```

Vérifications : `show ip ospf neighbor`, `show ip route ospf`, `show ip protocols`.

## ACL (listes de contrôle d'accès)

Règles à retenir :
- Une ACL est lue **de haut en bas**, la première règle qui correspond s'applique.
- Il y a toujours un **`deny any` implicite** à la fin.
- ACL **standard** (source uniquement) : à placer **près de la destination**.
- ACL **étendue** (source, destination, protocole, port) : à placer **près de la source**.
- Le masque est un **masque générique** (wildcard) : `0.0.0.255` pour un /24.

Exemple : le VLAN utilisateurs (192.168.20.0/24) peut aller sur Internet et utiliser le DNS/web
du serveur 192.168.99.5, mais pas accéder au reste du réseau de management.

```cisco
ip access-list extended ACL-USERS-IN
 remark --- Services autorises vers le serveur ---
 permit udp 192.168.20.0 0.0.0.255 host 192.168.99.5 eq domain
 permit tcp 192.168.20.0 0.0.0.255 host 192.168.99.5 eq 443
 remark --- Interdit le reste du management ---
 deny   ip 192.168.20.0 0.0.0.255 192.168.99.0 0.0.0.255 log
 remark --- Internet ---
 permit ip 192.168.20.0 0.0.0.255 any
interface Vlan20
 ip access-group ACL-USERS-IN in
```

⚠️ Appliquer une ACL à distance peut **couper ta propre session**. Astuce : programmer un
rechargement de secours avant la modification, puis l'annuler si tout va bien :

```cisco
reload in 10          ! redémarre dans 10 min si on perd la main (config non sauvegardée)
! ... modification ...
reload cancel
```

Vérifier : `show access-lists` (compteurs de correspondances), `show ip interface Vlan20`.

## NAT / PAT (accès Internet)

```cisco
interface GigabitEthernet0/0/0
 description WAN
 ip address dhcp
 ip nat outside
interface GigabitEthernet0/0/1
 ip nat inside
ip access-list standard ACL-NAT
 permit 192.168.0.0 0.0.255.255
ip nat inside source list ACL-NAT interface GigabitEthernet0/0/0 overload
! Redirection de port vers un serveur web interne :
ip nat inside source static tcp 192.168.50.10 443 interface GigabitEthernet0/0/0 443
```

Vérifier : `show ip nat translations`, `show ip nat statistics`.

## DHCP sur le routeur

```cisco
ip dhcp excluded-address 192.168.20.1 192.168.20.20
ip dhcp pool USERS
 network 192.168.20.0 255.255.255.0
 default-router 192.168.20.254
 dns-server 192.168.99.5
 domain-name entreprise.local
 lease 1
```

## Commandes de diagnostic utiles

```cisco
show running-config | section interface
show ip interface brief
show interfaces status
show cdp neighbors detail
show logging
show version
ping 8.8.8.8 source Vlan99
traceroute 8.8.8.8
```

## Sauvegarde

```cisco
copy running-config startup-config
copy running-config tftp://192.168.99.5/R-SITE1.cfg
```
