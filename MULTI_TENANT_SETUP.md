# Kioskly Multi-Tenant Setup Guide

## Overview

Kioskly now supports multi-tenancy, allowing multiple businesses to use the same application with their own branding, themes, and data isolation. Each tenant can customize:

- **Logo**: Upload a custom logo
- **Theme Colors**: Customize primary, secondary, accent, background, and text colors
- **Business Information**: Store name, description, contact details, and address
- **Data Isolation**: All users, products, categories, and transactions are scoped to the tenant

## Architecture

### Backend (kioskly-api)

The backend has been updated with:

1. **Tenant Model** (`prisma/schema.prisma`):
   - Stores tenant information, logo URL, and theme configuration
   - All other models (User, Product, Category, Size, Addon, Transaction) now have a `tenantId` foreign key

2. **Tenants Module** (`src/tenants/`):
   - Full CRUD operations for tenant management
   - Logo upload endpoint with file validation
   - Endpoints protected with JWT and role-based guards (ADMIN only)

3. **File Upload Support**:
   - Logos are stored in `/uploads/logos/`
   - Static file serving configured in `main.ts`
   - Supported formats: JPG, PNG, GIF, SVG
   - Max file size: 5MB

### Frontend (kioskly-app)

The frontend includes:

1. **Tenant Context** (`contexts/TenantContext.tsx`):
   - Global state management for tenant data
   - Methods to fetch tenant by slug
   - Theme color management

2. **Tenant Setup Screen** (`app/tenant-setup.tsx`):
   - Initial screen for entering store identifier
   - Validates and loads tenant configuration
   - User-friendly error handling

3. **Dynamic Theming**:
   - Login screen uses tenant logo and primary color
   - Home screen applies tenant theme throughout
   - All UI elements respect tenant colors

## API Endpoints

### Tenant Management

```
GET    /tenants              - List all tenants
GET    /tenants/:id          - Get tenant by ID
GET    /tenants/slug/:slug   - Get tenant by slug (public)
POST   /tenants              - Create new tenant (ADMIN only)
PATCH  /tenants/:id          - Update tenant (ADMIN only)
POST   /tenants/:id/logo     - Upload tenant logo (ADMIN only)
DELETE /tenants/:id          - Delete tenant (ADMIN only)
```

## Getting Started

### 1. Generate Prisma Client

After pulling the changes, generate the Prisma client:

```bash
cd kioskly-api
npm run prisma:generate
```

### 2. Run Migrations

Apply the schema changes to your database:

```bash
npm run prisma:migrate
```

Note: You'll need to update the existing seed file or manually create tenants before using the app.

### 3. Create an uploads directory

```bash
mkdir -p kioskly-api/uploads/logos
```

### 4. Start the API

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### 5. Start the Mobile App

```bash
cd kioskly-app
npm start
```

## Creating Your First Tenant

### Using the API

You can create a tenant using any API client (Postman, curl, etc.):

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "My Coffee Shop",
    "slug": "my-coffee-shop",
    "description": "The best coffee in town",
    "contactEmail": "info@mycoffeeshop.com",
    "contactPhone": "+1234567890",
    "address": "123 Main St, City, State",
    "themeColors": {
      "primary": "#8b4513",
      "secondary": "#d2691e",
      "accent": "#daa520",
      "background": "#ffffff",
      "text": "#1f2937"
    },
    "isActive": true
  }'
```

### Uploading a Logo

After creating a tenant, upload a logo:

```bash
curl -X POST http://localhost:3000/tenants/TENANT_ID/logo \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "logo=@/path/to/your/logo.png"
```

## Using the Mobile App

### First Time Setup

1. Launch the app - you'll be redirected to the Tenant Setup screen
2. Enter your store slug (e.g., "my-coffee-shop")
3. Click "Continue"
4. If valid, you'll be redirected to the login screen with your branding
5. Login with your credentials

### Changing Stores

From the login screen, you can click "Change Store" to switch to a different tenant.

## Theme Colors Explained

Each tenant can customize 5 color values:

- **Primary**: Main brand color (buttons, headers, selected items)
- **Secondary**: Secondary brand color (gradients, accents)
- **Accent**: Highlight color (special elements, badges)
- **Background**: Main background color
- **Text**: Primary text color

Default colors (orange theme):
```json
{
  "primary": "#ea580c",
  "secondary": "#fb923c", 
  "accent": "#fdba74",
  "background": "#ffffff",
  "text": "#1f2937"
}
```

## Data Isolation

All data is automatically scoped to the tenant:

- Users can only belong to one tenant
- Products, categories, sizes, and addons are tenant-specific
- Transactions are linked to the tenant
- Username and email are unique per tenant (not globally)

## Security Considerations

1. **Authentication**: Users must authenticate with tenant-scoped credentials
2. **Authorization**: Only ADMIN users can manage tenants
3. **File Upload**: Logo uploads are validated for type and size
4. **Data Access**: All queries are filtered by tenant ID

## Customization Tips

### Logo Guidelines
- **Format**: PNG recommended for transparency
- **Size**: 512x512px or larger
- **File Size**: Under 5MB
- **Design**: Simple, recognizable, works on colored backgrounds

### Theme Color Selection
1. Choose colors that represent your brand
2. Ensure sufficient contrast for accessibility
3. Test on both light and dark screens
4. Consider color psychology for your industry

## Troubleshooting

### "Tenant not found" Error
- Verify the slug is correct
- Check that the tenant exists in the database
- Ensure `isActive` is set to `true`

### Logo Not Displaying
- Verify the logo was uploaded successfully
- Check that the API is serving static files correctly
- Ensure the URL is accessible: `http://localhost:3000/uploads/logos/filename.png`

### Theme Colors Not Applying
- Verify theme colors are saved in the database
- Check the TenantContext is properly loaded
- Restart the app to reload the context

## Future Enhancements

Potential improvements for the multi-tenant system:

- [ ] Custom domain/subdomain support
- [ ] Tenant-specific email templates
- [ ] White-label mobile app builds
- [ ] Tenant analytics dashboard
- [ ] Subscription/billing management
- [ ] Multi-language support per tenant
- [ ] Tenant onboarding wizard
- [ ] Logo validation and automatic resizing

## Support

For issues or questions about the multi-tenant setup, please refer to the main README or contact your system administrator.

