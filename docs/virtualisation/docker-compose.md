# Mémo — Docker et Docker Compose

## Installation (Debian / Ubuntu, dépôt officiel)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
less get-docker.sh                 # toujours lire un script avant de l'exécuter
sudo sh get-docker.sh
sudo usermod -aG docker $USER      # utiliser docker sans sudo (se reconnecter ensuite)
docker version
docker compose version
```

⚠️ Être membre du groupe `docker` revient à être **root** sur la machine : le réserver aux admins.

## Commandes essentielles

```bash
docker ps                          # conteneurs en cours (-a pour tous)
docker images
docker run -d --name web -p 8080:80 --restart unless-stopped nginx:stable
docker logs -f web
docker exec -it web sh             # ouvrir un shell dans le conteneur
docker stop web && docker rm web
docker pull nginx:stable           # mettre à jour l'image
docker stats                       # CPU / RAM en temps réel
docker inspect web | less
```

## Docker Compose

Fichier `compose.yaml` d'exemple : une application web avec base MariaDB.

```yaml
services:
  db:
    image: mariadb:11
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MARIADB_DATABASE: app
      MARIADB_USER: app
      MARIADB_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
    networks: [backend]
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      retries: 5

  web:
    image: wordpress:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: app
      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}
      WORDPRESS_DB_NAME: app
    ports:
      - "8080:80"
    volumes:
      - ./wp-content:/var/www/html/wp-content
    networks: [backend]

volumes:
  db_data:

networks:
  backend:
```

Les secrets vont dans un fichier `.env` à côté (à **ne jamais** versionner dans Git) :

```ini
DB_ROOT_PASSWORD=ChangeMoi-Root
DB_PASSWORD=ChangeMoi-App
```

```bash
docker compose up -d               # créer / démarrer
docker compose ps
docker compose logs -f web
docker compose pull && docker compose up -d     # mise à jour des images
docker compose down                # arrêter et supprimer les conteneurs (les volumes restent)
docker compose config              # vérifier le fichier final (variables résolues)
```

⚠️ `docker compose down -v` supprime **aussi les volumes**, donc les données de la base.

## Volumes et sauvegarde

- **Volume nommé** (`db_data`) : géré par Docker, dans `/var/lib/docker/volumes/`.
- **Bind mount** (`./wp-content`) : dossier de l'hôte, facile à sauvegarder.

```bash
# Sauvegarde d'une base dans un conteneur
docker compose exec db mariadb-dump -u root -p"$DB_ROOT_PASSWORD" --all-databases > dump-$(date +%F).sql
# Sauvegarde d'un volume nommé
docker run --rm -v projet_db_data:/data -v "$PWD":/backup alpine tar czf /backup/db_data.tar.gz -C /data .
```

## Construire sa propre image

`Dockerfile` :

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -r appuser
USER appuser
EXPOSE 8000
CMD ["python", "app.py"]
```

```bash
docker build -t monapp:1.0 .
docker run -d -p 8000:8000 monapp:1.0
```

## Bonnes pratiques

- Fixer les versions d'images (`mariadb:11` plutôt que `latest`) en production.
- Ne pas exécuter les processus en root dans le conteneur (`USER`).
- Ne publier (`ports:`) que ce qui doit être accessible ; les services internes communiquent par le réseau Compose.
- Attention : les ports publiés par Docker **contournent UFW** (règles iptables propres à Docker).
  Publier sur `127.0.0.1:8080:80` et passer par un reverse proxy.
- Nettoyage : `docker system df`, puis `docker image prune` (⚠️ `docker system prune -a --volumes` supprime beaucoup de choses).
