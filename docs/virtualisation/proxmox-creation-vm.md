# Procédure — Créer une VM Ubuntu sur Proxmox VE

Procédure standard pour déployer une VM Ubuntu Server 24.04 LTS sur notre cluster Proxmox.

## Conventions internes

- **VMID** : 100-199 = serveurs Linux, 200-299 = Windows, 9000+ = templates
- **Stockage** : `local-lvm` pour les disques, `local` pour les ISO
- **Pont réseau** : `vmbr0` (tag VLAN selon le service : 20 = users, 99 = management)
- **Nom** : `srv-<rôle>-<numéro>` (ex. `srv-web-01`)

## 1. Télécharger l'ISO

Dans l'interface : *Datacenter → nœud → local → ISO Images → Download from URL*.

En ligne de commande sur le nœud :

```bash
cd /var/lib/vz/template/iso/
wget https://releases.ubuntu.com/24.04/ubuntu-24.04.3-live-server-amd64.iso
```

## 2. Créer la VM en ligne de commande (qm)

```bash
qm create 110 \
  --name srv-web-01 \
  --memory 4096 --cores 2 --cpu host \
  --net0 virtio,bridge=vmbr0,tag=20 \
  --scsihw virtio-scsi-single \
  --scsi0 local-lvm:32,discard=on,ssd=1 \
  --ide2 local:iso/ubuntu-24.04.3-live-server-amd64.iso,media=cdrom \
  --boot order='scsi0;ide2' \
  --ostype l26 \
  --agent enabled=1
qm start 110
```

Paramètres recommandés :
- Contrôleur **VirtIO SCSI single** + option `discard` (libère l'espace sur thin-LVM)
- Type de CPU **host** (meilleures performances, mais bloque la migration à chaud entre CPU différents)
- **QEMU Guest Agent** activé

## 3. Après l'installation d'Ubuntu

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

Puis retirer l'ISO :

```bash
qm set 110 --ide2 none
```

## 4. Méthode rapide : template cloud-init

Créer le template une seule fois :

```bash
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
qm create 9000 --name tpl-ubuntu-2404 --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0
qm importdisk 9000 noble-server-cloudimg-amd64.img local-lvm
qm set 9000 --scsihw virtio-scsi-single --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --ide2 local-lvm:cloudinit --boot order=scsi0 --serial0 socket --vga serial0
qm set 9000 --agent enabled=1
qm template 9000
```

Cloner une nouvelle VM :

```bash
qm clone 9000 111 --name srv-app-01 --full
qm set 111 --ipconfig0 ip=192.168.20.111/24,gw=192.168.20.254 \
  --ciuser admin --sshkeys ~/.ssh/id_ed25519.pub
qm resize 111 scsi0 +20G
qm start 111
```

## 5. Sauvegarde

⚠️ Faire un snapshot avant toute mise à jour majeure :

```bash
qm snapshot 110 avant-maj --description "Avant mise à jour"
vzdump 110 --storage backup-nfs --mode snapshot --compress zstd
```
