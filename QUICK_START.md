# 🚀 Quick Start Guide - Multi-Tenant Kioskly

Get your multi-tenant POS system up and running in 5 minutes!

## Prerequisites

- Node.js (v18+)
- MongoDB database
- npm or yarn

## Step 1: Setup Backend (2 min)

```bash
# Navigate to API directory
cd kioskly-api

# Install dependencies (if not already done)
npm install

# Install the new dependency
npm install @nestjs/mapped-types

# Generate Prisma client with new schema
npm run prisma:generate

# Create uploads directory for logos
mkdir -p uploads/logos

# Start the API server
npm run dev
```

The API should now be running at `http://localhost:3000`

## Step 2: Create Your First Tenant (1 min)

### Option A: Using curl

```bash
# First, login as admin to get a token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Copy the access_token from the response

# Create a tenant
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "Demo Coffee Shop",
    "slug": "demo-coffee",
    "description": "A demo coffee shop for testing",
    "themeColors": {
      "primary": "#8b4513",
      "secondary": "#a67c52",
      "accent": "#d4a574",
      "background": "#ffffff",
      "text": "#1f2937"
    }
  }'
```

### Option B: Using Swagger UI (Recommended)

1. Open http://localhost:3000/api in your browser
2. Click "Authorize" and login with:
   - Username: `admin`
   - Password: `admin123`
3. Find `POST /tenants` endpoint
4. Click "Try it out"
5. Use this example body:

```json
{
  "name": "Demo Coffee Shop",
  "slug": "demo-coffee",
  "description": "A demo coffee shop for testing",
  "themeColors": {
    "primary": "#8b4513",
    "secondary": "#a67c52",
    "accent": "#d4a574",
    "background": "#ffffff",
    "text": "#1f2937"
  }
}
```

6. Click "Execute"

### Verify Tenant Creation

```bash
# Test the public endpoint (no auth needed)
curl http://localhost:3000/tenants/slug/demo-coffee
```

## Step 3: Setup Mobile App (1 min)

```bash
# Navigate to app directory
cd ../kioskly-app

# Install dependencies (if not already done)
npm install

# Start the app
npm start
```

## Step 4: Test the App (1 min)

1. **Launch App** - Scan QR code or press 'w' for web
2. **Enter Store ID** - Type `demo-coffee` and click Continue
3. **See Your Branding** - Notice the brown coffee theme!
4. **Login** - Use your credentials:
   - Username: `admin`
   - Password: `admin123`
5. **Explore** - See how the theme is applied throughout

## 🎨 Try Different Themes

### Blue Theme

```json
{
  "name": "Blue Store",
  "slug": "blue-store",
  "themeColors": {
    "primary": "#1e40af",
    "secondary": "#3b82f6",
    "accent": "#60a5fa",
    "background": "#ffffff",
    "text": "#1f2937"
  }
}
```

### Green Theme

```json
{
  "name": "Green Store",
  "slug": "green-store",
  "themeColors": {
    "primary": "#16a34a",
    "secondary": "#22c55e",
    "accent": "#86efac",
    "background": "#ffffff",
    "text": "#1f2937"
  }
}
```

### Purple Theme

```json
{
  "name": "Purple Store",
  "slug": "purple-store",
  "themeColors": {
    "primary": "#7c3aed",
    "secondary": "#a78bfa",
    "accent": "#c4b5fd",
    "background": "#ffffff",
    "text": "#1f2937"
  }
}
```

## 📤 Upload a Logo (Optional)

1. **Prepare Your Logo**
   - Format: PNG (recommended), JPG, GIF, or SVG
   - Size: 512x512px or larger recommended
   - Max file size: 5MB

2. **Upload via Swagger UI**
   - Go to `POST /tenants/{id}/logo`
   - Enter your tenant ID
   - Click "Try it out"
   - Choose your logo file
   - Click "Execute"

3. **Upload via curl**

```bash
curl -X POST http://localhost:3000/tenants/YOUR_TENANT_ID/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@path/to/your/logo.png"
```

4. **Verify Logo**
   - Restart your mobile app
   - Enter your store slug
   - Your logo should appear on the login screen!

## 🔄 Switch Between Stores

1. On the login screen, click **"Change Store"**
2. Enter a different slug
3. See the new branding instantly!

## 🎯 What You've Accomplished

✅ Set up multi-tenant backend
✅ Created your first tenant
✅ Applied custom theme colors
✅ Connected mobile app to tenant
✅ Tested tenant switching

## 📚 Next Steps

- **Read Full Documentation**: `MULTI_TENANT_SETUP.md`
- **API Examples**: `kioskly-api/TENANT_API_EXAMPLES.md`
- **Implementation Details**: `IMPLEMENTATION_SUMMARY.md`

## 🆘 Troubleshooting

### "Tenant not found"
- Check that you entered the slug correctly (lowercase, no spaces)
- Verify tenant exists: `curl http://localhost:3000/tenants/slug/YOUR_SLUG`

### API not starting
- Ensure MongoDB is running
- Check `.env` file has correct `DATABASE_URL`
- Run `npm run prisma:generate` again

### Mobile app errors
- Ensure API is running on port 3000
- Check that `contexts` folder was created
- Try clearing Metro cache: `npm start -- --reset-cache`

### Logo not showing
- Verify logo was uploaded successfully
- Check uploads directory: `ls -la kioskly-api/uploads/logos/`
- Ensure file size is under 5MB
- Try a PNG file if other formats fail

## 💡 Pro Tips

1. **Use Meaningful Slugs**: `johns-coffee` is better than `store1`
2. **Test Themes First**: Create test tenants to try different colors
3. **Optimize Logos**: Use PNG with transparency for best results
4. **Bookmark Swagger**: http://localhost:3000/api for quick testing
5. **Keep Tokens**: Save your auth tokens for repeated API testing

## 🎉 You're All Set!

Your multi-tenant Kioskly POS system is ready to use. Each business can now have its own unique branding while sharing the same powerful infrastructure.

**Enjoy building!** 🚀

