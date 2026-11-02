# Mémo — Ansible : automatiser la configuration des serveurs

Ansible se connecte en **SSH** (Linux) ou **WinRM** (Windows), sans agent sur les machines gérées.
Il est **idempotent** : relancer un playbook ne change rien si l'état voulu est déjà atteint.

## Installation (sur le poste ou serveur d'administration)

```bash
sudo apt install ansible
# ou version plus récente :
pipx install --include-deps ansible
ansible --version
```

Prérequis sur les serveurs gérés : SSH, Python 3, un compte avec `sudo` et ta clé SSH (`ssh-copy-id`).

## Inventaire

`inventaire.ini` :

```ini
[web]
srv-web-01 ansible_host=192.168.50.10
srv-web-02 ansible_host=192.168.50.11

[bdd]
srv-bdd-01 ansible_host=192.168.20.30

[linux:children]
web
bdd

[linux:vars]
ansible_user=admin
ansible_python_interpreter=/usr/bin/python3
```

## Commandes ad hoc

```bash
ansible all -i inventaire.ini -m ping
ansible web -i inventaire.ini -m command -a "uptime"
ansible linux -i inventaire.ini -b -m apt -a "update_cache=yes upgrade=dist"   # -b = sudo
ansible all -i inventaire.ini -m setup -a "filter=ansible_distribution*"     # informations système
```

## Playbook : configuration de base d'un serveur

`base.yml` :

```yaml
- name: Configuration de base des serveurs Linux
  hosts: linux
  become: true
  vars:
    paquets: [vim, htop, curl, fail2ban, ufw, unattended-upgrades]
    admins:
      - { nom: admin2, cle: "ssh-ed25519 AAAA... admin2@poste" }

  tasks:
    - name: Mettre à jour le cache et les paquets
      ansible.builtin.apt:
        update_cache: true
        upgrade: dist

    - name: Installer les paquets de base
      ansible.builtin.apt:
        name: "{{ paquets }}"
        state: present

    - name: Créer les comptes administrateurs
      ansible.builtin.user:
        name: "{{ item.nom }}"
        groups: sudo
        append: true
        shell: /bin/bash
      loop: "{{ admins }}"

    - name: Déployer les clés SSH
      ansible.posix.authorized_key:
        user: "{{ item.nom }}"
        key: "{{ item.cle }}"
      loop: "{{ admins }}"

    - name: Interdire la connexion root en SSH
      ansible.builtin.lineinfile:
        path: /etc/ssh/sshd_config.d/99-durcissement.conf
        line: "PermitRootLogin no"
        create: true
        mode: "0644"
        validate: "sshd -t -f %s"
      notify: Recharger SSH

    - name: Autoriser SSH dans UFW
      community.general.ufw:
        rule: allow
        port: "22"
        proto: tcp

    - name: Activer UFW
      community.general.ufw:
        state: enabled
        policy: deny

  handlers:
    - name: Recharger SSH
      ansible.builtin.service:
        name: ssh
        state: reloaded
```

```bash
ansible-playbook -i inventaire.ini base.yml --syntax-check
ansible-playbook -i inventaire.ini base.yml --check --diff     # simulation : montre ce qui changerait
ansible-playbook -i inventaire.ini base.yml
ansible-playbook -i inventaire.ini base.yml --limit srv-web-01  # une seule machine
```

⚠️ Toujours lancer `--check --diff` avant d'appliquer un playbook en production, et le
tester d'abord sur une machine de test.

## Templates (fichiers de configuration personnalisés)

`templates/motd.j2` :

```jinja
Serveur {{ inventory_hostname }} — {{ ansible_distribution }} {{ ansible_distribution_version }}
Géré par Ansible : toute modification manuelle sera écrasée.
```

```yaml
- name: Déployer le message d'accueil
  ansible.builtin.template:
    src: templates/motd.j2
    dest: /etc/motd
    mode: "0644"
```

## Secrets avec Ansible Vault

```bash
ansible-vault create secrets.yml          # fichier chiffré (ex. mdp_bdd: "...")
ansible-vault edit secrets.yml
ansible-playbook -i inventaire.ini site.yml --ask-vault-pass
```

Dans le playbook : `vars_files: [secrets.yml]`. Ne jamais versionner de mot de passe en clair.

## Organisation en rôles

```bash
ansible-galaxy init roles/nginx
```

```
roles/nginx/
├── tasks/main.yml        # tâches
├── handlers/main.yml     # redémarrages
├── templates/            # fichiers .j2
├── defaults/main.yml     # variables par défaut
└── files/
```

```yaml
- hosts: web
  become: true
  roles: [nginx]
```

## Windows avec Ansible

- Activer WinRM sur les serveurs Windows (HTTPS de préférence), ou utiliser OpenSSH Server.
- Variables d'inventaire : `ansible_connection=winrm`, `ansible_winrm_transport=ntlm` (ou `kerberos`).
- Modules de la collection `ansible.windows` : `win_feature`, `win_service`, `win_updates`, `win_user`…

```yaml
- hosts: windows
  tasks:
    - name: Installer le rôle IIS
      ansible.windows.win_feature:
        name: Web-Server
        include_management_tools: true
```

## Collections utiles

```bash
ansible-galaxy collection install community.general ansible.posix ansible.windows cisco.ios
```

`cisco.ios` permet aussi de configurer les switchs et routeurs Cisco (`ios_config`, `ios_vlans`…).
