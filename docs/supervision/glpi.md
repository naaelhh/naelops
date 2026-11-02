# Procédure — GLPI : installation, inventaire automatique et gestion des tickets

GLPI est l'outil de **gestion de parc** (inventaire) et de **helpdesk** (tickets).

## Prérequis

- Serveur web (Apache ou Nginx) + **PHP** (vérifier la version exigée dans les notes de version GLPI)
- **MariaDB / MySQL**
- Extensions PHP : `curl gd intl mysqli mbstring xml zip bz2 ldap` (+ `opcache` conseillé)

```bash
sudo apt install apache2 mariadb-server php php-{curl,gd,intl,mysql,mbstring,xml,zip,bz2,ldap,apcu} libapache2-mod-php
```

## Base de données

```bash
sudo mariadb-secure-installation
sudo mariadb
```

```sql
CREATE DATABASE glpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'glpi'@'localhost' IDENTIFIED BY 'MotDePasseFort';
GRANT ALL PRIVILEGES ON glpi.* TO 'glpi'@'localhost';
FLUSH PRIVILEGES;
```

Fuseaux horaires (recommandé par GLPI) :

```bash
mariadb-tzinfo-to-sql /usr/share/zoneinfo | sudo mariadb mysql
sudo mariadb -e "GRANT SELECT ON mysql.time_zone_name TO 'glpi'@'localhost';"
```

## Installation de GLPI

1. Télécharger la dernière version stable sur <https://github.com/glpi-project/glpi/releases>.
2. Extraire dans `/var/www/glpi` et donner les droits :

```bash
sudo tar xzf glpi-*.tgz -C /var/www/
sudo chown -R www-data:www-data /var/www/glpi
```

3. Configurer le virtual host avec la racine sur le dossier **`public/`** (sécurité : les
   fichiers internes ne sont pas exposés) :

```apache
<VirtualHost *:80>
    ServerName glpi.entreprise.local
    DocumentRoot /var/www/glpi/public
    <Directory /var/www/glpi/public>
        Require all granted
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteRule ^(.*)$ index.php [QSA,L]
    </Directory>
</VirtualHost>
```

```bash
sudo a2enmod rewrite && sudo a2ensite glpi && sudo systemctl reload apache2
```

4. Ouvrir `http://glpi.entreprise.local` et suivre l'assistant (connexion à la base `glpi`).

## Sécurisation après installation (obligatoire)

- Supprimer le fichier d'installation : `sudo rm /var/www/glpi/install/install.php`
- **Changer les mots de passe** des comptes par défaut ou les désactiver :
  `glpi/glpi` (super-admin), `tech/tech`, `normal/normal`, `post-only/postonly`
- Passer en **HTTPS**.
- Configurer la tâche planifiée (cron) GLPI dans le fichier `/etc/cron.d/glpi` (ce format inclut l'utilisateur `www-data`) :

```cron
* * * * * www-data /usr/bin/php /var/www/glpi/front/cron.php &>/dev/null
```

## Liaison avec Active Directory (LDAP)

*Configuration → Authentification → Annuaires LDAP → Ajouter* :
- Serveur : `srv-dc01.entreprise.local` — Port : `389` (ou `636` en LDAPS)
- BaseDN : `OU=Utilisateurs,DC=entreprise,DC=local`
- Compte de liaison (RootDN) : un compte de service en lecture seule
- Filtre de connexion : `(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))` (exclut les comptes désactivés)
- Champ de l'identifiant : `samaccountname`

Puis *Administration → Utilisateurs → Liaison annuaire LDAP → Importer de nouveaux utilisateurs*.

## Inventaire automatique (GLPI Agent)

Depuis GLPI 10, l'inventaire est **natif** : activer *Administration → Inventaire → Activer l'inventaire*.

Installer **GLPI Agent** sur les postes (<https://github.com/glpi-project/glpi-agent/releases>) :

```powershell
# Windows, installation silencieuse
msiexec /i GLPI-Agent-x.y-x64.msi /quiet SERVER="https://glpi.entreprise.local/" RUNNOW=1
```

```bash
# Linux (installeur fourni sur la page des releases)
sudo perl glpi-agent-x.y-linux-installer.pl --server="https://glpi.entreprise.local/" --runnow
sudo glpi-agent --force            # forcer un inventaire
```

Les ordinateurs apparaissent dans *Parc → Ordinateurs* avec matériel, logiciels, réseau.
Les équipements réseau peuvent être découverts et inventoriés en SNMP via la tâche *NetDiscovery / NetInventory* de l'agent.

## Helpdesk : bonnes pratiques

- **Catégories ITIL** (*Configuration → Intitulés → Catégories ITIL*) : Matériel, Logiciel, Réseau, Comptes…
- **Groupes de techniciens** et **règles métier** pour assigner automatiquement les tickets.
- **Collecteur de mails** (*Configuration → Collecteurs*) : un e-mail à `support@…` crée un ticket.
- **SLA / OLA** : délais de prise en charge et de résolution par priorité.
- **Base de connaissances** : documenter les solutions récurrentes.
- Distinguer **incident** (quelque chose ne fonctionne plus) et **demande** (besoin nouveau).

## Sauvegarde

```bash
mysqldump --single-transaction -u root -p glpi | gzip > glpi-$(date +%F).sql.gz
sudo tar czf glpi-files-$(date +%F).tar.gz /var/www/glpi/files /var/www/glpi/config
```

⚠️ Avant une mise à jour de GLPI : sauvegarder la base **et** les dossiers `files/`, `config/`,
`plugins/`, `marketplace/`, puis lancer la migration (`php bin/console db:update`).
