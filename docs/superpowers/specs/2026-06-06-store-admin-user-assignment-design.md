# Store Admin: User Management & Cross-Store Assignment

**Date:** 2026-06-06
**Branch:** feat/new-business-model
**Status:** Approved

## Overview

Extend the store portal (`kioskly-admin`) so that STORE_ADMINs can fully manage their store's users and — when they manage multiple stores — assign existing users from their managed stores pool to other stores they control.

## Business Rules

- All STORE_ADMINs can: create new users, update user info, toggle active/inactive, remove assigned users' access.
- Only STORE_ADMINs who manage **2 or more stores** can assign existing users to another store.
- Assignable user pool = users whose primary `tenantId` or active `UserStoreAccess` belongs to any store the requesting admin manages.
- A user can be assigned with a **different role per store** (e.g., CASHIER in Store A, STORE_ADMIN in Store B).
- A STORE_ADMIN can only assign to stores they manage and only from users in their managed pool.
- Revoking access only applies to `UserStoreAccess` assignments; primary users must be deactivated via the existing deactivate flow, not the revoke endpoint.

## Backend Changes (kioskly-api)

### 1. `getStoreUsers` — include assigned users + fix scope check

**File:** `src/users/users.service.ts`

**Scope check update:** The current guard is `storeId !== requestingTenantId`, which blocks a multi-store STORE_ADMIN from viewing secondary stores they manage via `UserStoreAccess`. Replace with: allow if `storeId === requestingTenantId` OR `storeId` is in `getManagedStoreIds(requestingUserId, requestingTenantId)`.

Change the query to union:
- Primary users: `user.findMany({ where: { tenantId: storeId } })`
- Assigned users: `userStoreAccess.findMany({ where: { tenantId: storeId, isActive: true }, include: { user: true } })`

Merge and deduplicate on `userId`. Add `isAssigned: boolean` to each record (`false` = primary, `true` = cross-store assignment). Also include the user's primary store name for assigned users so the frontend can display it.

**Note on effective role:** For assigned users, the role shown in the store should be `assignedRole` (from `UserStoreAccess.role`), not the user's global `role`. The response includes both so the frontend can display the correct role per context.

Response shape per user:
```ts
{
  id, username, firstName, lastName, email, role, isActive, isFirstLogin, createdAt,
  isAssigned: boolean,
  assignedRole?: 'STORE_ADMIN' | 'CASHIER',  // the role in THIS store (from UserStoreAccess)
  primaryStore?: { id, name, slug }           // only populated for isAssigned=true
}
```

### 2. Allow STORE_ADMIN to query their own store access

**File:** `src/users/users.controller.ts`

`GET /users/:userId/stores` is currently restricted to COMPANY_ADMIN / PLATFORM_ADMIN. Add STORE_ADMIN to the allowed roles with a self-check: if the caller is STORE_ADMIN, `userId` must equal `req.user.id`, else `403`. This allows the frontend to detect multi-store status on page load.

### 3. New endpoint: `GET /users/stores/:storeId/assignable-pool`

**File:** `src/users/users.controller.ts` + `src/users/users.service.ts`

**Roles:** STORE_ADMIN, PLATFORM_ADMIN

**Query param:** `?q=` (optional search string)

**Service logic (`getAssignablePool`):**
1. Resolve the requesting admin's managed stores:
   - Their primary `tenantId` (from JWT)
   - All active `UserStoreAccess` records where `userId = requestingUserId`
2. Fetch all users in that store pool:
   - Primary: `user.findMany({ where: { tenantId: { in: managedStoreIds } } })`
   - Assigned: `userStoreAccess.findMany({ where: { tenantId: { in: managedStoreIds }, isActive: true } })`
   - Merge, deduplicate on `userId`
3. Exclude users already present in the target `storeId` (as primary or active `UserStoreAccess`)
4. Apply `?q=` filter: username, firstName, lastName contains match
5. Return max 20 results

**Response shape per user:**
```ts
{ id, username, firstName, lastName, role, primaryStore: { id, name, slug } }
```

**Scope validation:** If caller is STORE_ADMIN, verify `storeId` is in their managed stores set. Throw `403` if not.

### 4. Extend `POST /users/stores/:storeId/assign` — allow STORE_ADMIN

**File:** `src/users/users.controller.ts` + `src/users/users.service.ts`

Add `STORE_ADMIN` to `@Roles()`. Pass `req.user.id` and `req.user.role` to the service.

**Additional scope check in `assignUserToStore` when caller is STORE_ADMIN:**
1. Resolve caller's managed stores (same helper as above)
2. Verify `storeId` is in their managed stores — else `403`
3. After looking up the target user by username, verify that user is in the caller's managed pool (their `tenantId` or `UserStoreAccess.tenantId` overlaps with the managed stores set) — else `403 'User not in your managed stores'`

Existing COMPANY_ADMIN path is unchanged (company-wide scope).

### 5. Extend `DELETE /users/stores/:storeId/:userId/access` — allow STORE_ADMIN

**File:** `src/users/users.controller.ts` + `src/users/users.service.ts`

Add `STORE_ADMIN` to `@Roles()`. Pass `req.user.id` and `req.user.role`.

**Additional scope check in `revokeStoreAccess` when caller is STORE_ADMIN:**
1. Verify `storeId` is in their managed stores — else `403`
2. Verify the target user is NOT primary in `storeId` (i.e., their `tenantId !== storeId`) — else `400 'Cannot revoke primary store assignment; deactivate the user instead'`

### 6. Helper: `getManagedStoreIds(userId, tenantId)`

Extract into a private service method to avoid duplication across `getAssignablePool`, `assignUserToStore`, and `revokeStoreAccess`:

```ts
private async getManagedStoreIds(userId: string, tenantId: string | null): Promise<string[]> {
  const accessRecords = await this.prisma.userStoreAccess.findMany({
    where: { userId, isActive: true },
    select: { tenantId: true },
  });
  const ids = accessRecords.map(r => r.tenantId);
  if (tenantId) ids.push(tenantId);
  return [...new Set(ids)];
}
```

## Frontend Changes (kioskly-admin)

### 1. Update `lib/api.ts`

Add two new methods:
- `getAssignablePool(storeId: string, q?: string): Promise<AssignableUser[]>`
- New `revokeStoreAccess` method already exists — confirm it passes `storeId` and `userId` correctly

Update `getStoreUsers` return type to include `isAssigned`, `assignedRole`, and `primaryStore`.

### 2. Update `app/(main)/users/page.tsx`

**Detect multi-store admin:**
- On mount, call `GET /users/:userId/stores` using the current user's ID from localStorage
- Store result in `managedStores` state
- `isMultiStoreAdmin = managedStores.length >= 2`

**Updated user list table:**
- Add a "Store" column (hidden or shown as a dash for primary users, shows `primaryStore.name` for assigned users)
- For `isAssigned=true` users: show an "Assigned" badge next to the name; the active toggle action becomes "Remove access" (calls `revokeStoreAccess`)
- For `isAssigned=false` users: existing deactivate/activate flow unchanged

**"Assign Existing User" button:**
- Rendered only when `isStoreAdmin && isMultiStoreAdmin`
- Opens the assign modal

### 3. New `AssignUserModal` component

**File:** `app/(main)/users/AssignUserModal.tsx`

State: `query`, `results`, `selectedUser`, `selectedRole`, `loading`, `error`

Behavior:
- Search input calls `api.getAssignablePool(storeId, query)` debounced 300ms
- Results list: name, username, current primary store, current role badge
- Role picker (Radix Select): CASHIER / STORE_ADMIN
- Confirm: calls `api.assignUserToStore(storeId, { username: selectedUser.username, role: selectedRole })`
- On success: close modal, call `fetchUsers()`
- On error: show inline error message

Props: `{ isOpen, onClose, storeId, onAssigned }`

## Error States

| Scenario | Backend response | Frontend display |
|---|---|---|
| Assigning user not in managed pool | 403 | "This user is not in your managed stores" |
| Target store not in managed stores | 403 | "You don't have access to manage this store" |
| User already assigned to store | 409 | "User already has access to this store" |
| Revoking primary store user | 400 | "Cannot remove a user's primary store; deactivate instead" |
| Single-store admin tries to assign | Button hidden (frontend guard) | N/A |

## Files Changed

**Backend:**
- `kioskly-api/src/users/users.service.ts` — `getStoreUsers`, `assignUserToStore`, `revokeStoreAccess`, new `getAssignablePool`, new `getManagedStoreIds`
- `kioskly-api/src/users/users.controller.ts` — new route, role + self-check on `getStoreAccess`, role updates on assign/revoke

**Frontend:**
- `kioskly-admin/lib/api.ts` — new `getAssignablePool`, updated types
- `kioskly-admin/types/index.ts` — updated `User` type, new `AssignableUser` type
- `kioskly-admin/app/(main)/users/page.tsx` — multi-store detection, updated list, new button
- `kioskly-admin/app/(main)/users/AssignUserModal.tsx` — new component
