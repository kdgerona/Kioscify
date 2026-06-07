# Kioscify — Production Deployment Guide

## Domain Structure

| URL | Service |
|---|---|
| `https://kioscify.com` | Store Portal |
| `https://platform.kioscify.com` | Platform Admin |
| `https://<company-slug>.kioscify.com` | Company Portal |
| `https://kioscify.com/api/v1` | API |
| `https://kioscify.com/api/v1/docs` | Swagger UI |

---

## Prerequisites

A fresh Ubuntu 22.04/24.04 VPS with:
- Minimum 2 vCPU, 4GB RAM
- Docker + Docker Compose v2

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## Step 1 — Clone the Repository

```bash
mkdir -p ~/apps
cd ~/apps
git clone <your-repo-url> Kioscify
cd Kioscify
```

---

## Step 2 — Create the `.env` File

```bash
cp .env.example .env
nano .env
```

Fill in all values:

```env
# MongoDB
MONGO_ROOT_USERNAME=kioscify_admin
MONGO_ROOT_PASSWORD=<generate below>
MONGO_DATABASE=kioscify

# API
JWT_SECRET=<generate below>
JWT_EXPIRES_IN=7d
BASE_URL=https://kioscify.com

# Frontend
NEXT_PUBLIC_API_URL=https://kioscify.com/api/v1
PLATFORM_DOMAIN=kioscify.com

# Backup
BACKUP_TIMEZONE=Asia/Manila
```

Generate strong secrets (hex — no special characters that break MongoDB URLs):

```bash
openssl rand -hex 32   # use for MONGO_ROOT_PASSWORD
openssl rand -hex 64   # use for JWT_SECRET
```

---

## Step 3 — DNS Setup

In your DNS provider add these A records pointing to your server's public IP:

| Type | Name | Value |
|---|---|---|
| A | `kioscify.com` | `<server-ip>` |
| A | `*.kioscify.com` | `<server-ip>` |

Verify propagation before continuing:

```bash
dig kioscify.com +short
dig platform.kioscify.com +short   # should return the same IP
```

---

## Step 4 — SSL Certificate (Wildcard)

Requires a wildcard cert for `*.kioscify.com`. Uses DNS challenge — shown here with Cloudflare:

```bash
sudo apt install -y certbot python3-certbot-dns-cloudflare

# Create Cloudflare API token file
sudo nano /root/cloudflare.ini
# Paste:  dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
sudo chmod 600 /root/cloudflare.ini

# Request certificate
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/cloudflare.ini \
  -d kioscify.com \
  -d '*.kioscify.com' \
  --agree-tos \
  --email kevindavegerona@gmail.com \
  --non-interactive
```

> Not using Cloudflare? Use `--dns-route53`, `--dns-digitalocean`, or `--manual`.

---

## Step 5 — Copy Certificates to Nginx

```bash
mkdir -p ~/apps/Kioscify/docker/nginx/ssl/live/kioscify.com

cp /etc/letsencrypt/live/kioscify.com/fullchain.pem \
  ~/apps/Kioscify/docker/nginx/ssl/live/kioscify.com/fullchain.pem

cp /etc/letsencrypt/live/kioscify.com/privkey.pem \
  ~/apps/Kioscify/docker/nginx/ssl/live/kioscify.com/privkey.pem
```

---

## Step 6 — Build and Start All Services

```bash
cd ~/apps/Kioscify
docker compose up -d --build
```

This builds and starts: MongoDB (replica set), Redis, API, Store Portal, Company Portal, Platform Admin, Nginx, and the DB backup service.

Monitor startup:

```bash
# Watch all service states
docker compose ps

# Wait for "REPLICA SET ONLINE"
docker compose logs -f mongo

# Wait for "Nest application successfully started"
docker compose logs -f api
```

All services should show `healthy` within ~3 minutes.

---

## Step 7 — Create the Platform Admin User

Run once after the API is healthy:

```bash
docker exec -it kioskly-api node dist/prisma/create-platform-admin.js
```

You will be prompted for first name, last name, email, and username. A secure password is generated and displayed — **save it immediately, it will not be shown again**.

---

## Step 8 — Verify Everything Works

```bash
# API health check
curl https://kioscify.com/health

# Should return: {"status":"ok"}
```

Open in browser:
- `https://kioscify.com` → Store Portal
- `https://platform.kioscify.com` → Platform Admin (log in with credentials from Step 7)
- `https://<company-slug>.kioscify.com` → Company Portal

---

## Step 9 — SSL Auto-Renewal Cron Job

```bash
# Create renewal script
echo '#!/bin/bash' > /root/renew-certs.sh
echo 'certbot renew --quiet' >> /root/renew-certs.sh
echo 'cp /etc/letsencrypt/live/kioscify.com/fullchain.pem /root/apps/Kioscify/docker/nginx/ssl/live/kioscify.com/fullchain.pem' >> /root/renew-certs.sh
echo 'cp /etc/letsencrypt/live/kioscify.com/privkey.pem /root/apps/Kioscify/docker/nginx/ssl/live/kioscify.com/privkey.pem' >> /root/renew-certs.sh
echo 'docker exec kioskly-nginx nginx -s reload' >> /root/renew-certs.sh
chmod +x /root/renew-certs.sh

# Add cron job (runs daily at 3am)
(crontab -l 2>/dev/null; echo "0 3 * * * /root/renew-certs.sh") | crontab -

# Verify
crontab -l
```

---

## Future Deployments

```bash
cd ~/apps/Kioscify
git pull
docker compose up -d --build
```

Docker rebuilds only changed images and does a rolling restart.

---

## Useful Commands

```bash
# View logs
docker compose logs -f api
docker compose logs -f store
docker compose logs -f mongo

# Restart a single service
docker compose restart api

# Check all service health
docker compose ps

# Stop everything (data preserved)
docker compose down

# Stop and wipe all data (DESTRUCTIVE)
docker compose down -v
```

---

## Troubleshooting

### API unhealthy — MongoDB auth failure
If the API fails with `SCRAM failure: Authentication failed`, the MongoDB root user may not have been created. Create it manually:

```bash
docker exec -it kioskly-mongo mongosh admin --eval "
db.createUser({
  user: 'kioscify_admin',
  pwd: '<your MONGO_ROOT_PASSWORD from .env>',
  roles: ['root']
})
"
docker compose restart api
```

### API unhealthy — password contains special characters
Passwords generated with `openssl rand -base64` may contain `+`, `/`, or `=` which break MongoDB connection URLs. Use hex instead:

```bash
openssl rand -hex 32   # safe for MongoDB URLs
```

Update `.env`, wipe volumes, and restart:

```bash
docker compose down -v
docker compose up -d
```

### SSL certificate not found
Make sure the cert files exist at the exact paths nginx expects:

```bash
ls ~/apps/Kioscify/docker/nginx/ssl/live/kioscify.com/
# Should show: fullchain.pem  privkey.pem
```

### Check container logs
```bash
docker logs kioskly-api
docker logs kioskly-mongo
docker logs kioskly-nginx
```
