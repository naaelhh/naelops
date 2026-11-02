# Mémo — Cisco : Spanning Tree, EtherChannel et sécurité des ports

## Spanning Tree (STP / Rapid PVST+)

Le Spanning Tree évite les **boucles** entre switchs en bloquant les liens redondants.
Chez nous : **Rapid PVST+** partout, le switch cœur est **racine** de tous les VLAN.

```cisco
spanning-tree mode rapid-pvst
! Sur le switch cœur principal :
spanning-tree vlan 10,20,30,99 root primary
! Sur le switch cœur secondaire :
spanning-tree vlan 10,20,30,99 root secondary
```

Ports d'accès (postes, imprimantes) : passage immédiat en transmission et protection contre
le branchement d'un switch non autorisé.

```cisco
interface range GigabitEthernet1/0/1 - 44
 spanning-tree portfast
 spanning-tree bpduguard enable
! Ou en global pour tous les ports d'accès :
spanning-tree portfast default
spanning-tree portfast bpduguard default
```

Réactiver automatiquement un port coupé par BPDU Guard (sinon `shutdown` / `no shutdown`) :

```cisco
errdisable recovery cause bpduguard
errdisable recovery interval 300
```

Vérifications :

```cisco
show spanning-tree summary
show spanning-tree vlan 20
show spanning-tree root
show interfaces status err-disabled
```

## EtherChannel (agrégation de liens LACP)

Regroupe plusieurs liens physiques en un seul lien logique : plus de débit et de la redondance.
Les ports doivent avoir **la même vitesse, le même mode et les mêmes VLAN**.

```cisco
interface range GigabitEthernet1/0/47 - 48
 description Uplink vers SW-CORE (Po1)
 channel-group 1 mode active        ! LACP (standard). "passive" de l'autre côté fonctionne aussi
exit
interface Port-channel1
 description Uplink vers SW-CORE
 switchport mode trunk
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,30,99
```

⚠️ Configurer les deux côtés **avant** de brancher le second câble, sinon risque de boucle.

Vérifications :

```cisco
show etherchannel summary     ! "SU" = OK, "P" = port dans le canal
show lacp neighbor
show interfaces Port-channel1
```

## Port Security

Limite le nombre d'adresses MAC sur un port (prise murale dans un lieu public, par exemple).

```cisco
interface GigabitEthernet1/0/10
 switchport mode access
 switchport access vlan 20
 switchport port-security
 switchport port-security maximum 2            ! PC + téléphone IP
 switchport port-security mac-address sticky   ! apprend et retient les MAC
 switchport port-security violation restrict   ! bloque et journalise (shutdown = coupe le port)
```

Vérifier : `show port-security interface Gi1/0/10`, `show port-security address`.

## DHCP Snooping et DAI

Protège contre les **faux serveurs DHCP** et l'**usurpation ARP**.

```cisco
ip dhcp snooping
ip dhcp snooping vlan 10,20,30
no ip dhcp snooping information option
interface GigabitEthernet1/0/48
 ip dhcp snooping trust          ! uniquement le port vers le vrai serveur DHCP / uplink
ip arp inspection vlan 10,20,30
interface GigabitEthernet1/0/48
 ip arp inspection trust
```

Vérifier : `show ip dhcp snooping binding`, `show ip arp inspection`.

## Ports inutilisés

```cisco
interface range GigabitEthernet1/0/45 - 46
 description NON UTILISE
 switchport mode access
 switchport access vlan 998     ! VLAN "parking" sans routage
 shutdown
```
