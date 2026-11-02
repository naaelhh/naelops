# Mémo — VLAN sur switch Cisco (IOS)

Procédure interne pour créer et affecter des VLAN sur un switch Cisco Catalyst.

## Plan d'adressage des VLAN

| VLAN | Nom          | Réseau            | Usage                    |
|------|--------------|-------------------|--------------------------|
| 10   | ADMIN        | 192.168.10.0/24   | Postes administratifs    |
| 20   | USERS        | 192.168.20.0/24   | Postes utilisateurs      |
| 30   | VOIP         | 192.168.30.0/24   | Téléphones IP            |
| 99   | MGMT         | 192.168.99.0/24   | Administration des switchs |
| 999  | NATIVE-VIDE  | —                 | VLAN natif des trunks (inutilisé) |

## Créer les VLAN

```cisco
enable
configure terminal
vlan 10
 name ADMIN
vlan 20
 name USERS
vlan 30
 name VOIP
vlan 99
 name MGMT
vlan 999
 name NATIVE-VIDE
exit
```

## Port d'accès (poste utilisateur)

```cisco
interface range GigabitEthernet1/0/1 - 24
 description Postes utilisateurs
 switchport mode access
 switchport access vlan 20
 switchport voice vlan 30
 spanning-tree portfast
 spanning-tree bpduguard enable
 no shutdown
```

## Port trunk (vers un autre switch ou le routeur)

```cisco
interface GigabitEthernet1/0/48
 description TRUNK vers SW-CORE
 switchport trunk encapsulation dot1q   ! seulement sur les modèles qui le demandent
 switchport mode trunk
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,30,99
 switchport nonegotiate
```

> Bonne pratique : ne jamais laisser le VLAN 1 comme VLAN natif, et limiter
> les VLAN autorisés sur chaque trunk.

## Interface de management (SVI)

```cisco
interface Vlan99
 ip address 192.168.99.11 255.255.255.0
 no shutdown
exit
ip default-gateway 192.168.99.254
```

## Routage inter-VLAN (switch de niveau 3)

```cisco
ip routing
interface Vlan10
 ip address 192.168.10.254 255.255.255.0
 ip helper-address 192.168.99.5   ! serveur DHCP
interface Vlan20
 ip address 192.168.20.254 255.255.255.0
 ip helper-address 192.168.99.5
```

## Vérifications

```cisco
show vlan brief
show interfaces trunk
show interfaces GigabitEthernet1/0/1 switchport
show ip interface brief
```

## Sauvegarde de la configuration

⚠️ Toujours sauvegarder avant et après une modification en production :

```cisco
copy running-config startup-config
copy running-config tftp://192.168.99.5/sw-acces-01.cfg
```
