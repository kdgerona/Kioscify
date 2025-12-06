# Kioskly API

A NestJS backend API with Prisma ORM, MongoDB, and JWT authentication for the Kioskly POS application.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with role-based access control (ADMIN, CASHIER)
- 📦 **Product Management** - Categories, Products, Sizes, and Addons
- 💰 **Transaction Processing** - Complete POS transaction handling
- 📊 **Statistics** - Sales analytics and reporting
- 📚 **API Documentation** - Swagger/OpenAPI documentation
- 🔒 **Type Safety** - Full TypeScript support
- 🗄️ **MongoDB** - NoSQL database with Prisma ORM

## Tech Stack

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [MongoDB](https://www.mongodb.com/) - NoSQL database
- [JWT](https://jwt.io/) - JSON Web Tokens for authentication
- [Passport](http://www.passportjs.org/) - Authentication middleware
- [Swagger](https://swagger.io/) - API documentation

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB (local installation or MongoDB Atlas account)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kioskly-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure your MongoDB connection:
   
   **For local MongoDB:**
   ```env
   DATABASE_URL="mongodb://localhost:27017/kioskly"
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   ```
   
   **For MongoDB Atlas (cloud):**
   ```env
   DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/kioskly?retryWrites=true&w=majority"
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   ```

4. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

5. **Seed the database**
   ```bash
   npx prisma db seed
   ```
   
   This will create:
   - Default admin user: `username=admin`, `password=admin123`
   - Default cashier user: `username=cashier`, `password=cashier123`
   - Sample categories, products, sizes, and addons

## Running the Application

```bash
# development
npm run start

# watch mode (recommended for development)
npm run start:dev

# production mode
npm run start:prod
```

The API will be available at `http://localhost:3000`

## API Documentation

Once the application is running, visit:
- **Swagger UI**: `http://localhost:3000/api`

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token

### Categories
- `GET /categories` - Get all categories
- `GET /categories/:id` - Get category by ID
- `POST /categories` - Create category (ADMIN only)
- `PATCH /categories/:id` - Update category (ADMIN only)
- `DELETE /categories/:id` - Delete category (ADMIN only)

### Products
- `GET /products` - Get all products (with optional category filter)
- `GET /products/:id` - Get product by ID
- `POST /products` - Create product (ADMIN only)
- `PATCH /products/:id` - Update product (ADMIN only)
- `DELETE /products/:id` - Delete product (ADMIN only)

### Sizes
- `GET /sizes` - Get all sizes
- `GET /sizes/:id` - Get size by ID
- `POST /sizes` - Create size (ADMIN only)
- `PATCH /sizes/:id` - Update size (ADMIN only)
- `DELETE /sizes/:id` - Delete size (ADMIN only)

### Addons
- `GET /addons` - Get all addons
- `GET /addons/:id` - Get addon by ID
- `POST /addons` - Create addon (ADMIN only)
- `PATCH /addons/:id` - Update addon (ADMIN only)
- `DELETE /addons/:id` - Delete addon (ADMIN only)

### Transactions
- `GET /transactions` - Get all transactions
- `GET /transactions/:id` - Get transaction by ID
- `POST /transactions` - Create new transaction
- `GET /transactions/stats/daily` - Get daily statistics
- `GET /transactions/stats/weekly` - Get weekly statistics
- `GET /transactions/stats/monthly` - Get monthly statistics

## Database Schema

The application uses the following main models:

- **User** - System users (admin/cashier)
- **Category** - Product categories
- **Product** - Products available for sale
- **Size** - Product size options
- **Addon** - Product addons/extras
- **Transaction** - Sales transactions
- **TransactionItem** - Individual items in a transaction

## MongoDB Setup

### Local MongoDB

1. **Install MongoDB:**
   - macOS: `brew install mongodb-community`
   - Windows: Download from [MongoDB website](https://www.mongodb.com/try/download/community)
   - Linux: Follow [official installation guide](https://docs.mongodb.com/manual/administration/install-on-linux/)

2. **Start MongoDB service:**
   - macOS: `brew services start mongodb-community`
   - Windows: MongoDB runs as a service automatically
   - Linux: `sudo systemctl start mongod`

3. **Verify connection:**
   ```bash
   mongosh
   ```

### MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Create a new cluster
3. Add your IP address to the whitelist
4. Create a database user
5. Get your connection string and update `.env`

## Testing

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Linting

```bash
npm run lint
```

## Default Credentials

After seeding the database, you can use these credentials:

- **Admin Account**
  - Username: `admin`
  - Password: `admin123`
  - Role: ADMIN (full access)

- **Cashier Account**
  - Username: `cashier`
  - Password: `cashier123`
  - Role: CASHIER (limited access)

⚠️ **Important**: Change these credentials in production!

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MongoDB connection string | `mongodb://localhost:27017/kioskly` |
| `JWT_SECRET` | Secret key for JWT tokens | - |
| `JWT_EXPIRES_IN` | JWT token expiration time | `7d` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |

## Project Structure

```
kioskly-api/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Database seed script
├── src/
│   ├── auth/              # Authentication module
│   ├── categories/        # Categories module
│   ├── products/          # Products module
│   ├── sizes/             # Sizes module
│   ├── addons/            # Addons module
│   ├── transactions/      # Transactions module
│   ├── common/            # Shared resources
│   │   ├── decorators/    # Custom decorators
│   │   └── guards/        # Auth guards
│   ├── prisma/            # Prisma service
│   └── main.ts            # Application entry point
├── test/                  # E2E tests
├── .env.example           # Environment variables example
└── README.md
```

## Troubleshooting

### Database Connection Issues

If you encounter MongoDB connection issues:

1. **Check MongoDB is running:**
   ```bash
   # macOS/Linux
   brew services list
   # or
   sudo systemctl status mongod
   ```

2. **Verify connection string:**
   - Ensure `DATABASE_URL` in `.env` is correct
   - For local: `mongodb://localhost:27017/kioskly`
   - For Atlas: Check your connection string from MongoDB Atlas dashboard

3. **Regenerate Prisma Client:**
   ```bash
   npx prisma generate
   ```

### Port Already in Use

If port 3000 is already in use, change the `PORT` in your `.env` file.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is [MIT licensed](LICENSE).

## Support

For questions or support, please create an issue in the repository.
