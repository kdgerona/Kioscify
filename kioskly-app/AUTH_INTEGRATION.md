# Authentication Integration

This document describes the authentication implementation in the Kioskly mobile application.

## Overview

The Kioskly mobile app now integrates with the NestJS backend authentication API. Users must authenticate with valid credentials to access the POS system.

## Architecture

### Authentication Flow

1. **Tenant Selection** (`/tenant-setup`)
   - User enters store slug
   - App fetches tenant configuration from API
   - Tenant info stored in AsyncStorage

2. **Login** (`/index`)
   - User enters username and password
   - App sends credentials + tenantId to backend
   - Backend validates and returns JWT token + user info
   - Token and user data stored in AsyncStorage

3. **Home/POS** (`/home`)
   - Requires both tenant and user to be set
   - Redirects to login if not authenticated
   - Uses JWT token for all authenticated API requests

4. **Logout**
   - Clears token and user data from AsyncStorage
   - Redirects to login screen

## Files Created/Modified

### New Files

1. **`contexts/AuthContext.tsx`**
   - Manages authentication state (user, token, loading, error)
   - Provides `useAuth()` hook for accessing auth state
   - Handles login, logout, and token storage
   - Stores token and user data in AsyncStorage

2. **`utils/api.ts`**
   - Utility functions for making authenticated API requests
   - Automatically includes JWT token in request headers
   - Helper functions: `apiGet()`, `apiPost()`, `apiPut()`, `apiDelete()`
   - Configurable authentication requirement per request

### Modified Files

1. **`app/_layout.tsx`**
   - Added `AuthProvider` to wrap the app
   - Provides auth context to all screens

2. **`app/index.tsx` (Login Screen)**
   - Integrated with `useAuth()` hook
   - Implements actual authentication logic
   - Shows loading state during login
   - Displays error messages from API
   - Validates input fields
   - Disabled inputs during loading

3. **`app/home.tsx` (POS Screen)**
   - Added authentication guard
   - Redirects to login if user not authenticated
   - Updated logout to use `logout()` from AuthContext
   - Clears auth data on logout

## API Integration

### Login Endpoint

```typescript
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123",
  "tenantId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```typescript
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "tenantId": "507f1f77bcf86cd799439012",
    "username": "admin",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

### Error Responses

- **401 Unauthorized**: Invalid credentials
- **500 Internal Server Error**: Server error

## Usage

### Using the Auth Context

```typescript
import { useAuth } from "../contexts/AuthContext";

function MyComponent() {
  const { user, token, loading, error, login, logout } = useAuth();

  // Check if user is authenticated
  if (!user) {
    return <Text>Please login</Text>;
  }

  // Display user info
  return (
    <View>
      <Text>Welcome, {user.username}</Text>
      <Text>Role: {user.role}</Text>
      <TouchableOpacity onPress={logout}>
        <Text>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Making Authenticated API Requests

```typescript
import { apiGet, apiPost } from "../utils/api";

// GET request (automatically includes auth token)
const response = await apiGet("/products");
const products = await response.json();

// POST request
const response = await apiPost("/transactions", {
  items: orderItems,
  total: 100.00
});

// Request without authentication
const response = await apiGet("/public/info", {
  requiresAuth: false
});
```

## Storage Keys

The app uses the following AsyncStorage keys:

- `@kioskly:auth_token` - JWT authentication token
- `@kioskly:user` - User object (JSON stringified)
- `@kioskly:tenant_slug` - Selected tenant slug

## Security Considerations

1. **Token Storage**: JWT tokens are stored in AsyncStorage (encrypted on iOS, less secure on Android)
2. **Token Expiration**: Tokens expire in 7 days (configured in backend)
3. **HTTPS**: Use HTTPS in production for secure communication
4. **Token Refresh**: Not implemented yet (consider adding for production)

## Testing

### Default Credentials

Based on the backend seed data:

- **Admin User**
  - Username: `admin`
  - Password: `admin123`
  - Role: ADMIN

- **Cashier User**
  - Username: `cashier`
  - Password: `cashier123`
  - Role: CASHIER

### Testing Steps

1. Start the backend API:
   ```bash
   cd kioskly-api
   npm run start:dev
   ```

2. Ensure MongoDB is running:
   ```bash
   docker-compose up -d
   ```

3. Create a tenant (if not exists):
   ```bash
   # Login as admin to get token
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123","tenantId":"YOUR_TENANT_ID"}'

   # Create tenant (requires admin token)
   curl -X POST http://localhost:3000/tenants \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Coffee Shop",
       "slug": "test-coffee",
       "themeColors": {
         "primary": "#8b4513",
         "secondary": "#a67c52",
         "accent": "#d4a574",
         "background": "#ffffff",
         "text": "#1f2937"
       }
     }'
   ```

4. Run the mobile app:
   ```bash
   cd kioskly-app
   npm start
   ```

5. Test the flow:
   - Enter tenant slug: `test-coffee`
   - Login with: `admin` / `admin123`
   - Verify you reach the home screen
   - Test logout functionality

## Environment Configuration

Ensure `.env` file exists in `kioskly-app/`:

```env
# For Android Emulator (10.0.2.2 = host machine localhost)
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000

# For iOS Simulator or physical device on same network
# EXPO_PUBLIC_API_URL=http://localhost:3000
# EXPO_PUBLIC_API_URL=http://192.168.1.XXX:3000
```

## Future Enhancements

1. **Token Refresh**: Implement automatic token refresh before expiration
2. **Biometric Auth**: Add fingerprint/face recognition for quick login
3. **Session Management**: Track active sessions and allow remote logout
4. **Password Reset**: Add forgot password functionality
5. **Role-Based UI**: Show different UI elements based on user role (ADMIN vs CASHIER)
6. **Offline Mode**: Cache authentication and support offline login
7. **Multi-Factor Authentication**: Add 2FA for enhanced security

## Troubleshooting

### Login fails with "API URL is not configured"

**Solution**: Create `.env` file with `EXPO_PUBLIC_API_URL` set to your API URL.

### Login fails with network error

**Solutions**:
- Verify backend API is running (`http://localhost:3000`)
- Check API URL in `.env` matches your setup
- For Android emulator, use `10.0.2.2` instead of `localhost`
- For physical device, use your computer's IP address on the same network

### Token expired errors

**Solution**: The token expires after 7 days. Simply logout and login again.

### User data persists after logout

**Solution**: Check that `logout()` function is being called properly. It should clear both `@kioskly:auth_token` and `@kioskly:user` from AsyncStorage.

### Home screen shows but user is null

**Solution**: The authentication guard should redirect to login. If not, check the `useEffect` hook in `home.tsx` and ensure `useAuth()` is properly imported.
