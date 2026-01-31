# Kioskly Docker Deployment Guide

This guide covers deploying Kioskly to AWS using Docker.

## Prerequisites

- Docker and Docker Compose installed on your AWS EC2 instance
- Git installed
- Domain name (optional, for SSL)

## Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url> kioskly
cd kioskly
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# ================================
# MongoDB Configuration
# ================================
MONGO_ROOT_USERNAME=root
MONGO_ROOT_PASSWORD=your-secure-mongodb-password
MONGO_DATABASE=kioskly

# ================================
# API Configuration
# ================================
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRES_IN=7d

# ================================
# Frontend Configuration
# ================================
# Replace with your domain or EC2 public IP (include /api/v1 suffix)
NEXT_PUBLIC_API_URL=http://your-domain-or-ip/api/v1
```

### 3. Build and Start Services

```bash
# Build and start all services
# Use 'docker compose' on Ubuntu 24.04, 'docker-compose' on older systems
docker compose up -d --build

# View logs
docker compose logs -f

# Check service status
docker compose ps
```

### 4. Access the Application

- **Admin Panel**: `http://your-domain-or-ip`
- **API Documentation (Swagger)**: `http://your-domain-or-ip/api/v1/docs`
- **API Health Check**: `http://your-domain-or-ip/health`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Nginx (Port 80/443)                      │
│                     Reverse Proxy + SSL                      │
└─────────────────────────────────────────────────────────────┘
                    │                    │
         ┌──────────┘                    └──────────┐
         ▼                                          ▼
┌─────────────────────────┐           ┌─────────────────────────┐
│    Admin Frontend       │           │      API Backend        │
│    (Next.js :3000)      │           │     (NestJS :3000)      │
└─────────────────────────┘           └─────────────────────────┘
                                                   │
                                                   ▼
                                      ┌─────────────────────────┐
                                      │    MongoDB (Replica)    │
                                      │       (:27017)          │
                                      └─────────────────────────┘
```

## Services

| Service | Description | Internal Port |
|---------|-------------|---------------|
| `nginx` | Reverse proxy, SSL termination | 80, 443 |
| `admin` | Next.js admin frontend | 3000 |
| `api` | NestJS backend API | 3000 |
| `mongo` | MongoDB with replica set | 27017 |

## File Structure

```
kioskly/
├── docker-compose.yml          # Main compose file
├── .env                        # Environment variables
├── docker/
│   ├── nginx/
│   │   └── nginx.conf          # Nginx configuration
│   └── mongodb_rs/
│       └── dockerfile          # MongoDB replica set
├── kioskly-api/
│   ├── Dockerfile              # API Dockerfile
│   └── .dockerignore
└── kioskly-admin/
    ├── Dockerfile              # Admin Dockerfile
    └── .dockerignore
```

## AWS EC2 Setup

### 1. Launch EC2 Instance

- **AMI**: Ubuntu 24.04 LTS (recommended), Ubuntu 22.04 LTS, or Amazon Linux 2023
- **Instance Type**: t3.small or larger (recommended: t3.medium for production)
- **Storage**: 30GB+ SSD (gp3 recommended)
- **Security Group**:
  - Port 22 (SSH)
  - Port 80 (HTTP)
  - Port 443 (HTTPS)

### 2. Install Docker

#### For Ubuntu 24.04 LTS (Recommended)

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Docker Compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group (replace 'ubuntu' with your username if different)
sudo usermod -aG docker ubuntu

# Apply group changes (or logout and login again)
newgrp docker
```

#### For Amazon Linux 2023

```bash
# Update and install Docker
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login again for group changes to take effect
```

### 3. Verify Installation

```bash
# Check Docker version
docker --version

# Check Docker Compose version (Ubuntu 24.04 uses plugin syntax)
docker compose version

# Test Docker is working
docker run hello-world
```

### 4. Clone and Deploy

```bash
# Clone repository
git clone <your-repo-url> kioskly
cd kioskly

# Create .env file
nano .env

# Deploy (note: Ubuntu 24.04 uses 'docker compose' instead of 'docker-compose')
docker compose up -d --build
```

> **Note for Ubuntu 24.04**: Docker Compose is installed as a Docker plugin, so use `docker compose` (with a space) instead of `docker-compose` (with a hyphen).

## SSL Configuration (Let's Encrypt)

### 1. Update Nginx Configuration

Edit `docker/nginx/nginx.conf` and uncomment the SSL server block.

### 2. Obtain SSL Certificate

```bash
# Stop nginx temporarily
docker compose stop nginx

# Run certbot
docker run -it --rm \
  -v $(pwd)/docker/nginx/ssl:/etc/letsencrypt \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d your-domain.com \
  --email admin@your-domain.com \
  --agree-tos \
  --no-eff-email

# Update nginx.conf to use SSL
# Uncomment the HTTPS server block and HTTP redirect

# Restart services
docker compose up -d
```

### 3. Auto-Renewal

Uncomment the `certbot` service in `docker-compose.yml` for automatic certificate renewal.

## Common Commands

> **Note**: On Ubuntu 24.04, use `docker compose` (with a space) instead of `docker-compose` (with a hyphen). Both syntaxes are shown below.

```bash
# Start all services
docker compose up -d          # Ubuntu 24.04
docker-compose up -d          # Amazon Linux / older systems

# Stop all services
docker compose down
docker-compose down

# Rebuild a specific service
docker compose up -d --build api
docker-compose up -d --build api

# View logs
docker compose logs -f api
docker compose logs -f admin
docker compose logs -f nginx

# Execute command in container
docker compose exec api sh
docker compose exec mongo mongosh

# Restart a service
docker compose restart api

# Check resource usage
docker stats

# Check service status
docker compose ps
```

## Backup and Restore

### Backup MongoDB

```bash
# Create backup
docker compose exec mongo mongodump \
  --username root \
  --password your-password \
  --authenticationDatabase admin \
  --out /data/backup

# Copy backup to host
docker cp kioskly-mongo:/data/backup ./backup
```

### Restore MongoDB

```bash
# Copy backup to container
docker cp ./backup kioskly-mongo:/data/backup

# Restore
docker compose exec mongo mongorestore \
  --username root \
  --password your-password \
  --authenticationDatabase admin \
  /data/backup
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose logs api

# Check container status
docker compose ps

# Restart the service
docker compose restart api
```

### MongoDB Connection Issues

```bash
# Check MongoDB is healthy
docker compose exec mongo mongosh --eval "rs.status()"

# Check network connectivity
docker compose exec api ping mongo
```

### Nginx 502 Bad Gateway

This usually means the upstream service isn't running:

```bash
# Check if api and admin are running
docker compose ps

# Restart all services
docker compose restart
```

### Out of Disk Space

```bash
# Clean unused Docker resources
docker system prune -a

# Clean unused volumes (careful!)
docker volume prune
```

## Performance Tuning

### For Production

1. **Increase MongoDB memory**:
   Add to `docker-compose.yml` under mongo service:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
   ```

2. **Enable Nginx caching**:
   Add caching configuration in `nginx.conf`

3. **Use SSD storage for MongoDB**

4. **Enable swap on EC2** (if not using swapfile):
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

## Monitoring

### Basic Health Checks

```bash
# Check all services
curl http://localhost/health

# Check API docs
curl http://localhost/api/v1/docs

# Check Nginx status
curl http://localhost/nginx_status
```

### Resource Monitoring

```bash
# Container stats
docker stats

# Disk usage
df -h
docker system df
```

## Security Recommendations

1. **Change default passwords** in `.env`
2. **Use strong JWT secret** (minimum 32 characters)
3. **Enable SSL** for production
4. **Restrict MongoDB access** (not exposed publicly by default)
5. **Keep Docker and system updated**
6. **Use AWS Security Groups** to limit access
7. **Enable AWS CloudWatch** for monitoring
8. **Regular backups** to S3

## Mobile App Configuration

The mobile app (`kioskly-app`) connects directly to your API:

1. Update your app's API URL to point to your production server
2. Ensure CORS is properly configured in the API
3. For React Native/Expo, update the API base URL in your app configuration

---

# Seed
npm run prisma:seed --workspace=kioskly-api

## Within docker api container
docker exec -it kioskly-api node dist/prisma/seed.js

For more help, check the individual project README files or open an issue.

