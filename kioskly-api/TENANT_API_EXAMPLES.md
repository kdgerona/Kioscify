# Tenant API Examples

This document provides practical examples for working with the Kioskly multi-tenant API.

## Table of Contents
- [Authentication](#authentication)
- [Create a Tenant](#create-a-tenant)
- [Get All Tenants](#get-all-tenants)
- [Get Tenant by Slug](#get-tenant-by-slug)
- [Update Tenant](#update-tenant)
- [Upload Logo](#upload-logo)
- [Update Theme Colors](#update-theme-colors)
- [Delete Tenant](#delete-tenant)

## Authentication

Most tenant endpoints require admin authentication. First, login to get a JWT token:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@kioskly.com",
    "role": "ADMIN"
  }
}
```

Use the `access_token` in subsequent requests:
```bash
-H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Create a Tenant

### Basic Tenant

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Coffee Paradise",
    "slug": "coffee-paradise"
  }'
```

### Tenant with Full Details

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Coffee Paradise",
    "slug": "coffee-paradise",
    "description": "Your daily dose of happiness in a cup",
    "contactEmail": "hello@coffeeparadise.com",
    "contactPhone": "+1 (555) 123-4567",
    "address": "123 Coffee Street, Bean City, CA 90210",
    "themeColors": {
      "primary": "#6f4e37",
      "secondary": "#a67c52",
      "accent": "#d4a574",
      "background": "#ffffff",
      "text": "#2d2d2d"
    },
    "isActive": true
  }'
```

Response:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Coffee Paradise",
  "slug": "coffee-paradise",
  "description": "Your daily dose of happiness in a cup",
  "logo": null,
  "contactEmail": "hello@coffeeparadise.com",
  "contactPhone": "+1 (555) 123-4567",
  "address": "123 Coffee Street, Bean City, CA 90210",
  "themeColors": {
    "primary": "#6f4e37",
    "secondary": "#a67c52",
    "accent": "#d4a574",
    "background": "#ffffff",
    "text": "#2d2d2d"
  },
  "isActive": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

## Get All Tenants

```bash
curl -X GET http://localhost:3000/tenants
```

Response:
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "name": "Coffee Paradise",
    "slug": "coffee-paradise",
    "description": "Your daily dose of happiness in a cup",
    "logo": "/uploads/logos/tenant-507f1f77bcf86cd799439011-1234567890.png",
    "contactEmail": "hello@coffeeparadise.com",
    "contactPhone": "+1 (555) 123-4567",
    "address": "123 Coffee Street, Bean City, CA 90210",
    "themeColors": {
      "primary": "#6f4e37",
      "secondary": "#a67c52",
      "accent": "#d4a574",
      "background": "#ffffff",
      "text": "#2d2d2d"
    },
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
]
```

## Get Tenant by Slug

This endpoint is public (no authentication required) and used by the mobile app:

```bash
curl -X GET http://localhost:3000/tenants/slug/coffee-paradise
```

Response:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Coffee Paradise",
  "slug": "coffee-paradise",
  "description": "Your daily dose of happiness in a cup",
  "logo": "/uploads/logos/tenant-507f1f77bcf86cd799439011-1234567890.png",
  "contactEmail": "hello@coffeeparadise.com",
  "contactPhone": "+1 (555) 123-4567",
  "address": "123 Coffee Street, Bean City, CA 90210",
  "themeColors": {
    "primary": "#6f4e37",
    "secondary": "#a67c52",
    "accent": "#d4a574",
    "background": "#ffffff",
    "text": "#2d2d2d"
  },
  "isActive": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

## Update Tenant

### Update Basic Information

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Coffee Paradise & Bakery",
    "description": "Amazing coffee and fresh pastries daily"
  }'
```

### Update Contact Information

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "contactEmail": "support@coffeeparadise.com",
    "contactPhone": "+1 (555) 987-6543",
    "address": "456 New Address, Bean City, CA 90211"
  }'
```

### Deactivate Tenant

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "isActive": false
  }'
```

## Upload Logo

```bash
curl -X POST http://localhost:3000/tenants/507f1f77bcf86cd799439011/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@/path/to/logo.png"
```

Response:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Coffee Paradise",
  "slug": "coffee-paradise",
  "logo": "/uploads/logos/tenant-507f1f77bcf86cd799439011-1704067200000-123456789.png",
  ...
}
```

The logo will be accessible at:
```
http://localhost:3000/uploads/logos/tenant-507f1f77bcf86cd799439011-1704067200000-123456789.png
```

## Update Theme Colors

### Example: Blue Theme

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "themeColors": {
      "primary": "#1e40af",
      "secondary": "#3b82f6",
      "accent": "#60a5fa",
      "background": "#ffffff",
      "text": "#1f2937"
    }
  }'
```

### Example: Green Theme

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "themeColors": {
      "primary": "#16a34a",
      "secondary": "#22c55e",
      "accent": "#86efac",
      "background": "#ffffff",
      "text": "#1f2937"
    }
  }'
```

### Example: Purple Theme

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "themeColors": {
      "primary": "#7c3aed",
      "secondary": "#a78bfa",
      "accent": "#c4b5fd",
      "background": "#ffffff",
      "text": "#1f2937"
    }
  }'
```

### Example: Dark Theme

```bash
curl -X PATCH http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "themeColors": {
      "primary": "#f59e0b",
      "secondary": "#fbbf24",
      "accent": "#fcd34d",
      "background": "#1f2937",
      "text": "#f9fafb"
    }
  }'
```

## Delete Tenant

⚠️ **Warning**: This will delete the tenant and all associated data (users, products, transactions, etc.)

```bash
curl -X DELETE http://localhost:3000/tenants/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Coffee Paradise",
  "slug": "coffee-paradise",
  ...
}
```

## Testing with JavaScript/TypeScript

### Using fetch (Browser/Node.js)

```typescript
// Login
const loginResponse = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});
const { access_token } = await loginResponse.json();

// Create Tenant
const tenantResponse = await fetch('http://localhost:3000/tenants', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${access_token}`
  },
  body: JSON.stringify({
    name: 'My Store',
    slug: 'my-store',
    themeColors: {
      primary: '#ea580c',
      secondary: '#fb923c',
      accent: '#fdba74',
      background: '#ffffff',
      text: '#1f2937'
    }
  })
});
const tenant = await tenantResponse.json();
console.log('Created tenant:', tenant);
```

### Using axios

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000'
});

// Login
const { data: { access_token } } = await api.post('/auth/login', {
  username: 'admin',
  password: 'admin123'
});

// Create Tenant
const { data: tenant } = await api.post('/tenants', {
  name: 'My Store',
  slug: 'my-store',
  themeColors: {
    primary: '#ea580c',
    secondary: '#fb923c',
    accent: '#fdba74',
    background: '#ffffff',
    text: '#1f2937'
  }
}, {
  headers: { Authorization: `Bearer ${access_token}` }
});

console.log('Created tenant:', tenant);
```

## Error Responses

### 400 Bad Request - Invalid Slug
```json
{
  "statusCode": 400,
  "message": ["slug must be a string"],
  "error": "Bad Request"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden - Not Admin
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Tenant with slug my-store not found",
  "error": "Not Found"
}
```

### 409 Conflict - Slug Already Exists
```json
{
  "statusCode": 409,
  "message": "Tenant with this slug already exists",
  "error": "Conflict"
}
```

## Tips

1. **Slug Format**: Use lowercase letters, numbers, and hyphens only. Examples: `my-store`, `coffee-shop-123`
2. **Color Format**: Use hex color codes with the `#` prefix. Examples: `#ea580c`, `#1e40af`
3. **Logo Files**: PNG format recommended. Max 5MB, recommended size 512x512px or larger
4. **Testing**: Use the public `GET /tenants/slug/:slug` endpoint to test without authentication

## Swagger Documentation

For interactive API documentation, visit:
```
http://localhost:3000/api
```

The Swagger UI provides a visual interface to test all endpoints with proper authentication.

