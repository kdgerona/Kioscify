# Persistent Tenant & Auth Session Implementation

## Overview
Updated the Kioskly mobile app to persist tenant (store) information and authentication sessions across app restarts. Users no longer need to re-enter their store ID/slug every time they open the app.

## Changes Made

### 1. AuthContext (`kioskly-app/contexts/AuthContext.tsx`)

**Added:**
- `initializing` state to track when auth data is being loaded from storage
- Auto-load functionality that runs on app startup to restore authentication session
- `useEffect` hook that automatically calls `loadStoredAuth()` on mount

**Updated:**
- `AuthContextType` interface to include `initializing: boolean`
- `loadStoredAuth()` function to set `initializing` to `false` after completion
- Context provider to export the `initializing` state

**Behavior:**
- On app startup, automatically checks AsyncStorage for stored auth token and user data
- If found, restores the session without requiring login
- Sets `initializing` to `false` once the check is complete

### 2. TenantContext (`kioskly-app/contexts/TenantContext.tsx`)

**Added:**
- `initializing` state to track when tenant data is being loaded from storage
- The tenant slug was already being persisted (this was working correctly)

**Updated:**
- `TenantContextType` interface to include `initializing: boolean`
- `loadStoredTenant()` function to set `initializing` to `false` after completion
- Context provider to export the `initializing` state

**Behavior:**
- On app startup, automatically checks AsyncStorage for stored tenant slug
- If found, fetches the tenant data from the API
- Sets `initializing` to `false` once the check is complete
- Tenant data remains stored even after logout (only cleared when user manually changes store)

### 3. Login Page (`kioskly-app/app/index.tsx`)

**Added:**
- Loading state that shows a spinner while tenant and auth contexts are initializing
- Auto-navigation to home page if user is already authenticated

**Updated:**
- `useEffect` hook to wait for both `tenantInitializing` and `authInitializing` to complete before making navigation decisions
- Navigation logic:
  1. If still initializing → show loading spinner
  2. If no tenant → redirect to tenant-setup
  3. If tenant exists AND user is authenticated → redirect to home
  4. Otherwise → show login form

**Behavior:**
- Prevents premature navigation while checking for stored data
- Auto-logs in users if they have a valid session
- Shows loading indicator during initialization
- Maintains tenant information even when session expires (goes to login, not tenant-setup)

## User Flow

### First Time User
1. Opens app → No tenant stored → Redirects to tenant-setup
2. Enters store ID/slug → Stored in AsyncStorage → Redirects to login
3. Logs in → Auth stored in AsyncStorage → Redirects to home

### Returning User (Session Valid)
1. Opens app → Shows "Loading..." spinner
2. Tenant loaded from AsyncStorage ✓
3. Auth session loaded from AsyncStorage ✓
4. Auto-redirects to home (no login required)

### Returning User (Session Expired)
1. Opens app → Shows "Loading..." spinner
2. Tenant loaded from AsyncStorage ✓
3. Auth session NOT found or invalid
4. Redirects to login (NOT tenant-setup)
5. User logs in → Redirects to home

### User Logs Out
1. User clicks logout → Auth cleared (tenant remains stored)
2. Redirects to login page
3. User can log in again without re-entering store ID

### User Changes Store
1. User clicks "Change Store" on login page
2. Tenant data cleared from AsyncStorage
3. Redirects to tenant-setup
4. User enters new store ID → Process starts over

## Technical Details

### AsyncStorage Keys
- `@kioskly:tenant_slug` - Stores the tenant slug (store ID)
- `@kioskly:auth_token` - Stores the JWT authentication token
- `@kioskly:user` - Stores the user object (JSON stringified)

### Initialization Flow
Both contexts run initialization in parallel:
1. TenantContext loads tenant slug → Fetches tenant data from API
2. AuthContext loads auth token and user data
3. Login page waits for both to complete
4. Navigation decision made based on what data was found

### Benefits
✅ Better user experience - no repetitive data entry
✅ Maintains separate concerns - tenant vs auth
✅ Session persistence across app restarts
✅ Clean logout behavior (keeps tenant, clears auth)
✅ Proper loading states prevent race conditions
✅ Works seamlessly with existing API and authentication flow

## Testing Recommendations

1. **First Launch**: Verify tenant-setup flow works
2. **Subsequent Launches**: Verify auto-login works when session is valid
3. **After Logout**: Verify user goes to login (not tenant-setup)
4. **Change Store**: Verify tenant can be changed from login page
5. **App Reinstall**: Verify starts fresh at tenant-setup
6. **Session Expiry**: Test behavior when token expires (API returns 401)

## Notes

- The tenant slug was already being stored in the original implementation
- The main issue was that auth wasn't being auto-loaded on startup
- Added proper initialization states to prevent race conditions
- All navigation now waits for both contexts to initialize before making decisions

