# Mémo — Serveurs web Nginx et Apache (Debian / Ubuntu)

## Nginx

### Installation

```bash
sudo apt install nginx
sudo systemctl enable --now nginx
```

Arborescence : configs dans `/etc/nginx/sites-available/`, activées par lien symbolique dans
`/etc/nginx/sites-enabled/`. Logs : `/var/log/nginx/access.log` et `error.log`.

### Site statique

`/etc/nginx/sites-available/intranet` :

```nginx
server {
    listen 80;
    server_name intranet.entreprise.local;
    root /var/www/intranet;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

```bash
sudo mkdir -p /var/www/intranet
sudo ln -s /etc/nginx/sites-available/intranet /etc/nginx/sites-enabled/
sudo nginx -t                  # toujours tester avant de recharger
sudo systemctl reload nginx
```

### Reverse proxy (vers une application sur le port 3000)

```nginx
server {
    listen 80;
    server_name app.entreprise.fr;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### HTTPS avec Let's Encrypt

Le nom de domaine doit pointer vers le serveur et le port 80 être accessible depuis Internet.

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.entreprise.fr
sudo certbot renew --dry-run    # le renouvellement automatique est déjà programmé (timer systemd)
```

Pour un site interne sans accès Internet : certificat de l'**autorité de certification interne**
(AD CS) ou certificat auto-signé.

### En-têtes de sécurité recommandés

```nginx
server_tokens off;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Strict-Transport-Security "max-age=31536000" always;   # uniquement en HTTPS
```

## Apache

### Installation et modules

```bash
sudo apt install apache2
sudo a2enmod ssl rewrite headers proxy proxy_http
sudo systemctl restart apache2
```

### Virtual host

`/etc/apache2/sites-available/intranet.conf` :

```apache
<VirtualHost *:80>
    ServerName intranet.entreprise.local
    DocumentRoot /var/www/intranet

    <Directory /var/www/intranet>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/intranet_error.log
    CustomLog ${APACHE_LOG_DIR}/intranet_access.log combined
</VirtualHost>
```

```bash
sudo a2ensite intranet
sudo a2dissite 000-default
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### Reverse proxy Apache

```apache
<VirtualHost *:80>
    ServerName app.entreprise.fr
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

HTTPS : `sudo apt install python3-certbot-apache && sudo certbot --apache -d app.entreprise.fr`

## Stack PHP (pour GLPI, WordPress…)

```bash
sudo apt install php-fpm php-mysql php-curl php-gd php-intl php-xml php-mbstring php-zip php-bz2 php-ldap
# Nginx : utiliser le socket PHP-FPM
#   location ~ \.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:/run/php/php-fpm.sock; }
```

## Dépannage

```bash
sudo nginx -t   |   sudo apache2ctl configtest
sudo tail -f /var/log/nginx/error.log
sudo ss -tlnp | grep -E ':80|:443'     # un autre service occupe-t-il le port ?
curl -I http://localhost
curl -vk https://app.entreprise.fr
```

- **403 Forbidden** : droits sur les fichiers (`www-data` doit pouvoir lire) ou `index` manquant.
- **502 Bad Gateway** : l'application derrière le proxy (ou PHP-FPM) ne répond pas.
- **Conflit de ports** : Apache et Nginx ne peuvent pas écouter tous les deux sur le port 80.
