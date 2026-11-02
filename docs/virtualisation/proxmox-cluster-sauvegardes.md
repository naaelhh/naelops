# Procédure — Proxmox VE : cluster, conteneurs LXC, sauvegardes et maintenance

## Dépôts et mises à jour (sans abonnement)

Par défaut, Proxmox active le dépôt *enterprise* (payant) : les mises à jour échouent sans abonnement.
Dans l'interface : *nœud → Updates → Repositories* :
1. Désactiver les dépôts **enterprise** (`pve-enterprise` et `ceph … enterprise`).
2. **Add → No-Subscription** (et le dépôt Ceph No-Subscription si Ceph est utilisé).

```bash
apt update && apt full-upgrade     # toujours full-upgrade (dist-upgrade) sur Proxmox, jamais "apt upgrade" seul
pveversion -v
```

⚠️ Migrer ou arrêter les VM critiques avant une mise à jour qui touche le noyau, puis redémarrer le nœud.

## Créer un cluster

Prérequis : même version de Proxmox, noms d'hôtes et IP **fixes**, heure synchronisée, réseau
fiable et faible latence entre les nœuds. Idéalement **3 nœuds** minimum (quorum).

```bash
# Sur le premier nœud
pvecm create CLUSTER-PROD
# Sur chaque nœud à ajouter (il ne doit héberger aucune VM)
pvecm add 192.168.99.21
# Vérifications
pvecm status
pvecm nodes
```

**Quorum** : le cluster a besoin de plus de la moitié des votes. Avec 2 nœuds, la panne d'un
seul bloque les actions : ajouter un **QDevice** (petite VM ou Raspberry Pi externe).

```bash
# Sur un serveur externe : apt install corosync-qnetd
# Sur tous les nœuds : apt install corosync-qdevice
pvecm qdevice setup 192.168.99.30
```

## Migration et haute disponibilité

```bash
qm migrate 110 pve2 --online           # migration à chaud d'une VM
pct migrate 201 pve2 --restart         # conteneur LXC
```

La **HA** (*Datacenter → HA*) redémarre automatiquement une VM sur un autre nœud en cas de panne.
Elle nécessite un **stockage partagé** (Ceph, NFS, iSCSI) ou la réplication ZFS.

## Conteneurs LXC

Plus légers qu'une VM (partagent le noyau de l'hôte), parfaits pour des services Linux simples.

```bash
pveam update
pveam available --section system | grep debian
pveam download local debian-13-standard_13.1-2_amd64.tar.zst     # nom exact selon la liste
pct create 201 local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst \
  --hostname ct-dns-01 --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,tag=99,ip=192.168.99.53/24,gw=192.168.99.254 \
  --unprivileged 1 --features nesting=1 --password
pct start 201
pct enter 201
```

Toujours privilégier les conteneurs **non privilégiés** (`--unprivileged 1`).

## Sauvegardes (vzdump)

Modes : **snapshot** (sans arrêt, recommandé), **suspend**, **stop** (le plus cohérent, avec coupure).

```bash
vzdump 110 --storage backup-nfs --mode snapshot --compress zstd
vzdump --all --storage backup-nfs --mode snapshot --compress zstd --prune-backups keep-daily=7,keep-weekly=4
```

Tâche planifiée : *Datacenter → Backup → Add* (sélection des VM, horaire, rétention).

### Restauration

```bash
qmrestore /mnt/pve/backup-nfs/dump/vzdump-qemu-110-2026_11_02-02_00_00.vma.zst 120 --storage local-lvm
pct restore 220 /mnt/pve/backup-nfs/dump/vzdump-lxc-201-2026_11_02-02_00_00.tar.zst --storage local-lvm
```

Restaurer sous un **nouveau VMID** (ici 120) pour tester sans écraser la VM en production.

### Proxmox Backup Server (PBS)

Solution recommandée : sauvegardes **incrémentales dédupliquées**, chiffrement, vérification.
1. Installer PBS sur une machine dédiée (idéalement hors du cluster).
2. Créer un *Datastore*, puis récupérer l'empreinte (*Dashboard → Show Fingerprint*).
3. Sur Proxmox VE : *Datacenter → Storage → Add → Proxmox Backup Server*.
4. Planifier des tâches de **Verify** et de **Prune** sur PBS.

## Stockage : commandes utiles

```bash
pvesm status                 # état des stockages
lvs                          # volumes LVM-thin (surveiller Data% et Meta%)
zpool status                 # santé ZFS
df -h
```

⚠️ Un LVM-thin plein à 100 % peut corrompre les VM : surveiller l'occupation (alerte Zabbix).

## Dépannage courant

```bash
qm list ; pct list
qm unlock 110                       # VM bloquée "locked" après une sauvegarde interrompue
qm stop 110 --skiplock
systemctl status pve-cluster corosync pvedaemon pveproxy
journalctl -u corosync -b
```

Interface web inaccessible : `systemctl restart pveproxy`. Elle écoute sur `https://<ip>:8006`.
