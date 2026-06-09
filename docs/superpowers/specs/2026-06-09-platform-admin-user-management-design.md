# Platform Admin User Management

**Date:** 2026-06-09
**Status:** Approved

## Overview

Allow existing platform admins to manage other platform admin accounts from within the `kioscify-platform` portal. This replaces the current manual/seed-only process for creating PLATFORM_ADMIN users.

## Scope

Full CRUD for PLATFORM_ADMIN users:
- List all platform admins
- Create a new platform admin (returns one-time temporary password)
- Enable / disable a platform admin
- Reset a platform admin's password (returns new one-time temporary password)
- Hard delete a platform admin

Self-protection: a platform admin cannot disable or delete their own account.

## API Changes (`kioskly-api`)

### Module

All new endpoints are added to the existing `platform` module (`PlatformController` / `PlatformService`). No new module is created.

### New DTO

`src/platform/dto/create-platform-admin.dto.ts`:

```
CreatePlatformAdminDto {
  firstName: string   // @IsString, @IsNotEmpty
  lastName:  string   // @IsString, @IsNotEmpty
  email:     string   // @IsEmail
  username:  string   // @IsString, @IsNotEmpty
}
```

### New Endpoints

All endpoints require `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('PLATFORM_ADMIN')`.

| Method   | Route                              | Description                                     |
|----------|------------------------------------|-------------------------------------------------|
| GET      | /platform/admins                   | List all PLATFORM_ADMIN users (id, names, email, username, isActive, createdAt) |
| POST     | /platform/admins                   | Create admin → `{ user, temporaryPassword }`    |
| PATCH    | /platform/admins/:id               | Update `isActive` — forbidden if id === self    |
| POST     | /platform/admins/:id/reset-password| Generate new temp password → `{ user, temporaryPassword }` |
| DELETE   | /platform/admins/:id               | Hard delete — forbidden if id === self          |

### Service Logic

- **Create:** Check username uniqueness globally (no tenantId scope for platform admins). Generate a random 12-char temporary password, bcrypt-hash it, create user with `role: 'PLATFORM_ADMIN'`, `isFirstLogin: true`, `tenantId: null`, `companyId: null`. Return plaintext password once.
- **Disable / Delete self-guard:** Extract requesting user id from `req.user.id` (passed in from controller). Throw `ForbiddenException('Cannot modify your own account')` if ids match.
- **Reset password:** Generate new random password, bcrypt-hash it, set `isFirstLogin: true`. Return plaintext password once.
- **Delete:** Hard delete via `prisma.user.delete`. No cascade concerns — platform admins have no tenants, companies, or store records.

## Frontend Changes (`kioscify-platform`)

### Navigation

Add to `navItems` in `app/(main)/layout.tsx`:

```ts
{ href: '/users', label: 'Users', icon: Users }  // lucide-react Users icon
```

### New Route

`app/(main)/users/page.tsx` — client component.

**Layout:**
- Page header: "Users" title + "Add Admin" button (top-right)
- Table of platform admins with columns: Name, Username, Email, Status badge (Active/Inactive), Created date, Actions

**Actions column (per row):**
- Enable/Disable toggle button — hidden when row is the logged-in user
- Reset Password button — shows confirmation dialog, then displays temp password in a copy modal
- Delete button — hidden when row is the logged-in user; shows confirmation dialog before calling delete

**Add Admin modal:**
- Fields: First Name, Last Name, Email, Username
- On success: close form modal, open a "Save this password" modal showing the temporary password with a copy-to-clipboard button

**Temp password modal** (reused for create + reset):
- Displays the one-time temporary password
- Copy button
- Warning: "This password will not be shown again"
- Dismiss button

**Current user identification:** Read from `localStorage.getItem('user')`, parse `id`. Compare against each row's `id` to hide self-action buttons.

### API Client Additions (`lib/api.ts`)

```ts
getPlatformAdmins(): Promise<User[]>
createPlatformAdmin(payload: { firstName: string; lastName: string; email: string; username: string }): Promise<{ user: User; temporaryPassword: string }>
updatePlatformAdmin(id: string, payload: { isActive: boolean }): Promise<User>
resetPlatformAdminPassword(id: string): Promise<{ user: User; temporaryPassword: string }>
deletePlatformAdmin(id: string): Promise<{ message: string }>
```

## Error Handling

- Username already taken → API returns 409 Conflict → show inline form error
- Self-modify attempt → API returns 403 → toast error (should not reach API normally due to UI hiding the buttons, but handled defensively)
- Network errors → toast error, no optimistic updates

## Out of Scope

- Role hierarchy / "super admin" distinction — all PLATFORM_ADMIN users have equal permissions
- Audit log of admin actions
- Email notifications on account creation (no email service configured)
- Pagination of platform admins list (expected to be a small list)
