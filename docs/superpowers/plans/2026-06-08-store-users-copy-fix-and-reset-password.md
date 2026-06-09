# Store Users: Copy Fix & Reset Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the clipboard copy button failing on tablet browsers and add a "Reset Password" action for store users (excluding self and assigned users).

**Architecture:** Backend gets a new store-scoped `POST /users/stores/:storeId/:userId/reset-password` endpoint restricted to `STORE_ADMIN`/`PLATFORM_ADMIN` that validates tenant membership and returns a new temporary password. The admin frontend adds a `resetStoreUserPassword` API method, a `KeyRound` icon button in the Actions column, and a clipboard fallback utility. The temporary password display reuses the existing green banner already shown after user creation.

**Tech Stack:** NestJS (backend), Next.js 15 App Router (frontend), Prisma/MongoDB, Axios, Tailwind CSS, lucide-react

---

## File Map

| File | Change |
|------|--------|
| `kioskly-api/src/users/users.service.ts` | Add `resetStoreUserPassword` method |
| `kioskly-api/src/users/users.controller.ts` | Add `POST stores/:storeId/:userId/reset-password` endpoint |
| `kioskly-admin/lib/api.ts` | Add `resetStoreUserPassword` method |
| `kioskly-admin/app/(main)/users/page.tsx` | Fix copy button, add reset password button + state |

---

## Task 1: Backend — `resetStoreUserPassword` service method

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts` (after `deleteStoreUser` method, before the private helpers section)

- [ ] **Step 1: Add `resetStoreUserPassword` to `UsersService`**

Open `kioskly-api/src/users/users.service.ts`. Find the `assertStoreUserExists` private method (around line 516). Insert the following method **before** it (after the last public store-user method):

```typescript
async resetStoreUserPassword(
  storeId: string,
  userId: string,
  requestingUserId: string,
  requestingRole?: string,
) {
  if (requestingRole !== 'PLATFORM_ADMIN' && requestingUserId === userId) {
    throw new ForbiddenException('Cannot reset your own password via this endpoint');
  }

  const user = await this.prisma.user.findFirst({
    where: { id: userId, tenantId: storeId },
    select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
  });
  if (!user) throw new NotFoundException(`User not found in this store`);

  const password = this.authService.generateSecurePassword();
  const hashed = await bcrypt.hash(password, 12);

  await this.prisma.user.update({
    where: { id: userId },
    data: { password: hashed, isFirstLogin: true },
  });

  return {
    user,
    temporaryPassword: password,
    note: 'User will be required to change this password on next login.',
  };
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd kioskly-api && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output (no errors).

---

## Task 2: Backend — controller endpoint

**Files:**
- Modify: `kioskly-api/src/users/users.controller.ts` (after the `deleteStoreUser` endpoint, around line 96)

- [ ] **Step 1: Add the reset-password endpoint**

Open `kioskly-api/src/users/users.controller.ts`. Find the `deleteStoreUser` endpoint block (ends around line 96). Insert the following immediately after it:

```typescript
@Post('stores/:storeId/:userId/reset-password')
@UseGuards(RolesGuard)
@Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
@ApiOperation({ summary: 'Reset a store user\'s password (generates new temporary password)' })
resetStoreUserPassword(
  @Param('storeId') storeId: string,
  @Param('userId') userId: string,
  @Request() req,
) {
  return this.usersService.resetStoreUserPassword(storeId, userId, req.user.id, req.user.role);
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd kioskly-api && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 3: Start the API and test the endpoint manually**

```bash
cd kioskly-api && npm run start:dev
```

In a second terminal, test with curl (replace IDs with real ones from your DB):
```bash
curl -s -X POST http://localhost:3000/api/v1/users/stores/<storeId>/<userId>/reset-password \
  -H "Authorization: Bearer <store_admin_token>" | jq .
```
Expected response shape:
```json
{
  "user": { "id": "...", "username": "...", ... },
  "temporaryPassword": "Abc1Xyz2...",
  "note": "User will be required to change this password on next login."
}
```

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.controller.ts
git commit -m "feat(api): add store-scoped reset-password endpoint for STORE_ADMIN"
```

---

## Task 3: Frontend — API client method

**Files:**
- Modify: `kioskly-admin/lib/api.ts` (after `deactivateStoreUser`, around line 682)

- [ ] **Step 1: Add `resetStoreUserPassword` to the API client**

Open `kioskly-admin/lib/api.ts`. Find `deactivateStoreUser` (line ~679). Insert after its closing brace:

```typescript
async resetStoreUserPassword(storeId: string, userId: string): Promise<{ user: User; temporaryPassword: string }> {
  const { data } = await this.client.post(`/users/stores/${storeId}/${userId}/reset-password`);
  return data;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd kioskly-admin && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

---

## Task 4: Frontend — users page changes

**Files:**
- Modify: `kioskly-admin/app/(main)/users/page.tsx`

### 4a: Fix the clipboard Copy button (tablet-safe fallback)

- [ ] **Step 1: Add `copyToClipboard` helper and `copied` state**

At the top of `UsersPage`, add a `copied` state after the existing `showPassword` state:

```typescript
const [copied, setCopied] = useState(false);
```

Then add a `copyToClipboard` helper function inside the component (after `handleRevokeAccess`):

```typescript
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for tablets/browsers that block navigator.clipboard
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

- [ ] **Step 2: Update the Copy button to use `copyToClipboard` and show feedback**

Find the existing Copy button (around line 152):
```tsx
<button
  onClick={() => navigator.clipboard.writeText(createdPassword)}
  className="text-xs text-green-700 underline ml-2"
>
  Copy
</button>
```

Replace it with:
```tsx
<button
  onClick={() => copyToClipboard(createdPassword)}
  className="text-xs text-green-700 underline ml-2"
>
  {copied ? 'Copied!' : 'Copy'}
</button>
```

### 4b: Add Reset Password action

- [ ] **Step 3: Add `KeyRound` to lucide-react imports**

Find the import line:
```typescript
import { UserPlus, Eye, EyeOff, UserCheck, UserX } from 'lucide-react';
```
Replace with:
```typescript
import { UserPlus, Eye, EyeOff, UserCheck, UserX, KeyRound } from 'lucide-react';
```

- [ ] **Step 4: Add `resettingUserId` state**

After the `formLoading` state line, add:
```typescript
const [resettingUserId, setResettingUserId] = useState<string | null>(null);
```

- [ ] **Step 5: Add `handleResetPassword` handler**

After `handleRevokeAccess`, add:
```typescript
const handleResetPassword = async (user: User) => {
  if (!tenant?.id) return;
  setResettingUserId(user.id);
  try {
    const result = await api.resetStoreUserPassword(tenant.id, user.id);
    setCreatedPassword(result.temporaryPassword);
    setShowPassword(true);
    setCopied(false);
  } catch (err) {
    console.error('Failed to reset password:', err);
  } finally {
    setResettingUserId(null);
  }
};
```

- [ ] **Step 6: Add the Reset Password button in the Actions column**

Find the Actions cell in the users table. The current structure for non-assigned users (around line 328) is:
```tsx
<div className="relative group inline-block">
  <button
    onClick={() => handleToggleActive(user)}
    className="text-gray-400 hover:text-gray-600"
  >
    {user.isActive ? (
      <UserX className="h-4 w-4" />
    ) : (
      <UserCheck className="h-4 w-4" />
    )}
  </button>
  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
    {user.isActive ? 'Disable account' : 'Enable account'}
  </div>
</div>
```

Wrap the existing toggle button and the new reset password button together in a `flex gap-2` wrapper. Replace the entire non-assigned branch (the second `<div className="relative group inline-block">` block) with:

```tsx
<div className="flex items-center justify-center gap-2">
  <div className="relative group inline-block">
    <button
      onClick={() => handleToggleActive(user)}
      className="text-gray-400 hover:text-gray-600"
    >
      {user.isActive ? (
        <UserX className="h-4 w-4" />
      ) : (
        <UserCheck className="h-4 w-4" />
      )}
    </button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
      {user.isActive ? 'Disable account' : 'Enable account'}
    </div>
  </div>
  <div className="relative group inline-block">
    <button
      onClick={() => handleResetPassword(user)}
      disabled={resettingUserId === user.id}
      className="text-gray-400 hover:text-amber-500 disabled:opacity-50"
    >
      <KeyRound className="h-4 w-4" />
    </button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
      Reset password
    </div>
  </div>
</div>
```

- [ ] **Step 7: Verify TypeScript**

```bash
cd kioskly-admin && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add kioskly-admin/lib/api.ts kioskly-admin/app/(main)/users/page.tsx
git commit -m "feat(admin): fix tablet clipboard copy and add reset password action for store users"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Run the admin dev server**

```bash
npm run admin:dev
```
Open `http://localhost:3000` and navigate to Store Users.

- [ ] **Step 2: Test Copy button**

Create a new user (or use an existing `createdPassword` banner if one is still showing). Click **Copy** — verify:
- The button text changes to "Copied!" for ~2 seconds, then reverts to "Copy"
- Paste the value somewhere to confirm the correct password was copied

- [ ] **Step 3: Test Reset Password button**

In the users table, find a user that is **not yourself** and **not assigned**:
- A `KeyRound` icon should appear in the Actions column next to the toggle
- Click it — the button should briefly show a disabled/spinner state
- The green temporary-password banner at the top should appear with a new password
- Verify the "Copy" button on the new banner also works

- [ ] **Step 4: Verify self-exclusion**

Your own user row should show **"No action"** (as before) — no reset button visible.

- [ ] **Step 5: Verify assigned-user exclusion**

An assigned user row shows only the **"Remove access"** (`UserX`) button — no reset button.
