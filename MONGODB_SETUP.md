# MongoDB Replica Set Setup with Docker

This guide explains how to set up MongoDB with replica set support using Docker Compose, which is required for Prisma transactions.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed

## Quick Start

### 1. Start MongoDB with Replica Set

```bash
# From the project root
docker-compose up -d
```

This will:
- Start MongoDB 7.0 configured as a replica set (`rs0`)
- Initialize the replica set automatically
- Persist data in Docker volumes
- Expose MongoDB on port 27017

### 2. Verify MongoDB is Running

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs mongodb

# Connect to MongoDB shell
docker exec -it kioskly-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin
```

In the MongoDB shell, verify the replica set:
```javascript
rs.status()
```

### 3. Configure Your .env File

Create a `.env` file in the `kioskly-api` directory:

```env
# MongoDB Connection (with authentication and replica set)
DATABASE_URL="mongodb://admin:admin123@localhost:27017/kioskly?authSource=admin&replicaSet=rs0"

# JWT Configuration
JWT_SECRET="your-secret-key-change-this-in-production"
JWT_EXPIRES_IN="7d"

# Server Configuration
PORT=3000
NODE_ENV=development

# Upload Configuration
UPLOAD_PATH=./uploads
```

### 4. Run Prisma Migrations and Seed

```bash
cd kioskly-api

# Generate Prisma Client
npm run prisma:generate

# Push schema to database
npx prisma db push

# Seed the database
npm run prisma:seed
```

## Docker Compose Configuration Details

The `docker-compose.yml` includes:

- **mongodb**: Main MongoDB service with replica set enabled
  - Root credentials: admin/admin123
  - Replica set name: rs0
  - Port: 27017
  - Health check to ensure MongoDB is ready

- **mongodb-init**: One-time initialization container
  - Initializes the replica set
  - Runs only once and exits

- **Volumes**: 
  - `mongodb_data`: Persists database data
  - `mongodb_config`: Persists MongoDB configuration

## Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v

# View logs
docker-compose logs -f mongodb

# Restart MongoDB
docker-compose restart mongodb

# Access MongoDB shell
docker exec -it kioskly-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin
```

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Ensure MongoDB is running:
   ```bash
   docker-compose ps
   ```

2. Check MongoDB logs:
   ```bash
   docker-compose logs mongodb
   ```

3. Verify replica set status:
   ```bash
   docker exec -it kioskly-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin --eval "rs.status()"
   ```

### Prisma Transaction Errors

If you still get "MongoDB needs to run as a replica set" errors:

1. Verify your DATABASE_URL includes `replicaSet=rs0`
2. Check that the replica set is initialized:
   ```bash
   docker exec -it kioskly-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin --eval "rs.status().ok"
   ```
   Should return `1` for success

### Reset Everything

To completely reset the database:

```bash
# Stop and remove all data
docker-compose down -v

# Start fresh
docker-compose up -d

# Wait for initialization (check logs)
docker-compose logs -f mongodb-init

# Re-run migrations and seed
cd kioskly-api
npx prisma db push
npm run prisma:seed
```

## Production Considerations

For production, consider:

1. **Use stronger passwords** - Change default admin credentials
2. **Enable authentication** - Already enabled in this setup
3. **Use environment variables** - Store credentials securely
4. **Multiple replica set members** - Use 3+ nodes for high availability
5. **Backup strategy** - Regular backups of the `mongodb_data` volume
6. **Resource limits** - Add memory and CPU limits to the container
7. **SSL/TLS** - Enable encrypted connections

## Additional Resources

- [Prisma MongoDB Documentation](https://www.prisma.io/docs/concepts/database-connectors/mongodb)
- [MongoDB Replica Set Documentation](https://www.mongodb.com/docs/manual/replication/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

