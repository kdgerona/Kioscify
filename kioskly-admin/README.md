# Kioskly Admin Panel

A comprehensive web admin dashboard for managing your Kioskly POS system. Built with Next.js 15, React 19, and Tailwind CSS.

## Features

- **Dashboard Overview**: Real-time sales statistics and top-performing products
- **Transactions Management**: View, filter, and export transaction history
- **Reports & Analytics**: Visual charts and insights with sales trends and payment method distribution
- **Product Management**: Full CRUD operations for products with category assignment
- **Category Management**: Organize products into categories
- **Settings**: View business and account information, theme colors, and API configuration
- **Authentication**: Secure admin-only access with JWT authentication

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19, Tailwind CSS
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Date Formatting**: date-fns
- **TypeScript**: Full type safety

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Running Kioskly API (port 3000)
- Admin user credentials

### Installation

From the project root:

```bash
# Install dependencies
npm install

# Or install just for admin panel
npm install --workspace=kioskly-admin
```

### Environment Variables

Create a `.env.local` file in the `kioskly-admin` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Running the Development Server

From the project root:

```bash
# Run admin panel only
npm run admin:dev

# Or run all workspaces in parallel
npm run dev
```

The admin panel will be available at [http://localhost:3001](http://localhost:3001)

### Building for Production

```bash
# Build admin panel
npm run admin:build

# Start production server
npm start --workspace=kioskly-admin
```

## Project Structure

```
kioskly-admin/
├── app/                      # Next.js App Router pages
│   ├── dashboard/           # Dashboard pages
│   │   ├── page.tsx        # Main dashboard
│   │   ├── transactions/   # Transactions page
│   │   ├── reports/        # Reports & analytics
│   │   ├── products/       # Product management
│   │   ├── categories/     # Category management
│   │   └── settings/       # Settings page
│   ├── login/              # Login page
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Root redirect page
├── components/             # Reusable components
│   └── Sidebar.tsx        # Navigation sidebar
├── lib/                   # Utilities and API client
│   ├── api.ts            # API client with all endpoints
│   └── utils.ts          # Helper functions
├── types/                # TypeScript type definitions
│   └── index.ts         # Shared types
└── public/              # Static assets
```

## Usage

### Login

1. Navigate to `http://localhost:3001`
2. Enter admin credentials:
   - Username: `admin`
   - Password: `admin123`
3. Only users with ADMIN role can access the panel

### Dashboard

The main dashboard displays:
- Total sales with growth percentage
- Transaction count
- Average order value
- Products sold
- Top 5 selling products with revenue

### Transactions

View all transactions with:
- Search by transaction ID or username
- Filter by payment status (Completed, Pending, Failed)
- Filter by payment method (Cash, Card, GCash, PayMaya)
- Export to CSV
- Click on any transaction to view detailed order items

### Reports

Generate visual reports with:
- Sales trend line chart (last 30 days)
- Payment method distribution pie chart
- Daily sales bar chart
- Export report data as JSON

### Products

Manage products with:
- Create new products with name, description, category, and price
- Edit existing products
- Toggle product availability
- Delete products
- Search products by name or description

### Categories

Organize products by:
- Creating categories with name and description
- Editing category information
- Deleting categories (if no products are associated)

### Settings

View configuration:
- Business information (name, slug)
- Account details (username, email, role)
- Brand theme colors
- API base URL

## API Integration

The admin panel communicates with the Kioskly API using a centralized API client (`lib/api.ts`).

### Authentication

- JWT tokens are stored in localStorage
- Tokens are automatically included in all API requests
- Expired tokens trigger automatic logout and redirect to login

### Available Endpoints

All CRUD operations are abstracted in the API client:
- Authentication (login, logout)
- Transactions (get all, get by ID, get stats)
- Products (CRUD operations)
- Categories (CRUD operations)
- Sizes (CRUD operations)
- Addons (CRUD operations)
- Tenants (get current tenant info)

## Development

### Type Checking

```bash
npm run type-check --workspace=kioskly-admin
```

### Linting

```bash
npm run lint --workspace=kioskly-admin
```

### Building

```bash
npm run build --workspace=kioskly-admin
```

## Customization

### Theme Colors

The admin panel uses Tailwind CSS. You can customize colors in `tailwind.config.ts`.

### Adding New Pages

1. Create a new page in `app/dashboard/[your-page]/page.tsx`
2. Add navigation link in `components/Sidebar.tsx`
3. Add API methods in `lib/api.ts` if needed
4. Add TypeScript types in `types/index.ts`

### Adding New API Endpoints

1. Add method to `lib/api.ts`
2. Add TypeScript types if needed
3. Use the method in your page components

## Troubleshooting

### "Cannot connect to API"

- Ensure Kioskly API is running on port 3000
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Verify MongoDB is running

### "Access denied"

- Only ADMIN users can access the panel
- Verify user role in the API

### "Module not found" errors

- Run `npm install` from project root
- Clear `.next` cache: `rm -rf .next`

## Security Considerations

- Change default admin credentials in production
- Use HTTPS in production
- Set secure environment variables
- Implement rate limiting on API
- Add CORS protection
- Use secure session management

## Future Enhancements

- User management (create/edit users)
- Inventory tracking
- Sales forecasting
- Email reports
- Real-time dashboard updates (WebSocket)
- Multi-language support
- Dark mode
- Sizes and addons management UI
- Bulk product import/export
- Advanced filtering and search

## Contributing

This is part of the Kioskly monorepo. See the main project README for contribution guidelines.

## License

Proprietary - All rights reserved
