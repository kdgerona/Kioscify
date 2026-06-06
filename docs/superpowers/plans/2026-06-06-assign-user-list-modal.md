# Assign User List Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace search-on-type in "Assign Existing User" flows with load-all-upfront + client-side filter, across the store portal (`AssignUserModal`) and platform portal (companies/[id] page).

**Architecture:** Backend endpoints already skip text filters when `query` is empty — we only need to remove the `take: 20` cap. Frontends load all users once on modal open, store the full list in state, and filter client-side. No debounce. No per-keystroke API calls.

**Tech Stack:** NestJS + Prisma (backend), Next.js 15 + React + Tailwind CSS (frontend)

---

## Files

| File | Change |
|---|---|
| `kioskly-api/src/users/users.service.ts` | Remove `take: 20` from `getAssignablePool` and `searchUsersInCompany` when query is absent |
| `kioskly-api/src/users/users.service.spec.ts` | Add tests for no-query = no-take behavior |
| `kioskly-admin/app/(main)/users/AssignUserModal.tsx` | Replace debounced search with load-all + client-side filter |
| `kioscify-platform/app/(main)/companies/[id]/page.tsx` | Replace both existing-user search flows with load-all + client-side filter |

---

### Task 1: Backend — Remove `take` limit when no query

**Files:**
- Modify: `kioskly-api/src/users/users.service.ts` (lines ~250, ~431)
- Modify: `kioskly-api/src/users/users.service.spec.ts`

**Context:** Two service methods have `take: 20` unconditionally. Both already handle empty/absent query by skipping the OR filter. We need to also skip `take` when query is absent.

- [ ] **Step 1: Write two failing tests**

Open `kioskly-api/src/users/users.service.spec.ts` and add these tests inside the existing `describe('UsersService')` block:

```typescript
describe('getAssignablePool — no query returns all', () => {
  it('should not apply take limit when query is empty', async () => {
    // Requesting user manages storeId as primary store
    mockPrisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u1' }])          // primaryInManaged
      .mockResolvedValueOnce([]);                       // final user fetch (empty = no users in pool)
    mockPrisma.userStoreAccess.findMany
      .mockResolvedValueOnce([])                        // assignedInManaged
      .mockResolvedValueOnce([]);                       // existingAssigned

    await service.getAssignablePool('storeId', 'requestorId', 'STORE_ADMIN', '');

    // The final findMany (returning actual users) should NOT include take
    const finalCall = mockPrisma.user.findMany.mock.calls.at(-1)?.[0];
    expect(finalCall?.take).toBeUndefined();
  });

  it('should apply take: 20 when query is provided', async () => {
    mockPrisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u1' }])
      .mockResolvedValueOnce([]);
    mockPrisma.userStoreAccess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getAssignablePool('storeId', 'requestorId', 'STORE_ADMIN', 'john');

    const finalCall = mockPrisma.user.findMany.mock.calls.at(-1)?.[0];
    expect(finalCall?.take).toBe(20);
  });
});

describe('searchUsersInCompany — no query returns all', () => {
  it('should not apply take limit when query is empty', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await service.searchUsersInCompany('companyId', '');

    const call = mockPrisma.user.findMany.mock.calls[0]?.[0];
    expect(call?.take).toBeUndefined();
  });

  it('should apply take: 20 when query is provided', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await service.searchUsersInCompany('companyId', 'alice');

    const call = mockPrisma.user.findMany.mock.calls[0]?.[0];
    expect(call?.take).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd kioskly-api && npx jest --testPathPattern=users.service.spec --no-coverage 2>&1 | tail -20
```

Expected: failures mentioning `take` being 20 when undefined was expected.

- [ ] **Step 3: Implement the fix in `users.service.ts`**

Find the `getAssignablePool` method (~line 230). Change the `take: 20` line inside the `prisma.user.findMany` call:

```typescript
// BEFORE:
      take: 20,
    });

// AFTER — only the final findMany (the one that fetches actual users by eligibleIds):
      ...(query ? { take: 20 } : {}),
    });
```

The exact block to replace (the final `findMany` at ~line 230–251):

```typescript
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: eligibleIds },
        isActive: true,
        ...(query ? {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        tenant: { select: { id: true, name: true, slug: true, brand: { select: { name: true } } } },
      },
      ...(query ? { take: 20 } : {}),
    });
```

Now find `searchUsersInCompany` (~line 402). Replace its `take: 20`:

```typescript
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: ['STORE_ADMIN', 'CASHIER', 'ADMIN'] },
        OR: query
          ? [
              { username: { contains: query } },
              { email: { contains: query } },
              { firstName: { contains: query } },
              { lastName: { contains: query } },
            ]
          : undefined,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        tenantId: true,
        tenant: { select: { id: true, name: true, slug: true } },
        storeAccess: {
          where: { isActive: true },
          select: { tenantId: true, tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
      ...(query ? { take: 20 } : {}),
    });
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd kioskly-api && npx jest --testPathPattern=users.service.spec --no-coverage 2>&1 | tail -20
```

Expected: all tests pass (including the 15 existing ones + 4 new ones = 19 total).

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/users/users.service.ts kioskly-api/src/users/users.service.spec.ts
git commit -m "feat(users): remove take limit on assignable pool and company search when no query"
```

---

### Task 2: Store portal — Rewrite `AssignUserModal.tsx`

**Files:**
- Modify: `kioskly-admin/app/(main)/users/AssignUserModal.tsx`

**Context:** Current component has debounced search: user types → 300ms delay → API call → results appear. New behavior: modal opens → single API call loads all users → filter bar narrows list client-side. The `api.getAssignablePool(storeId)` call (no `q`) already works after Task 1.

- [ ] **Step 1: Replace the component entirely**

Overwrite `kioskly-admin/app/(main)/users/AssignUserModal.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Search, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { AssignableUser } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  primaryColor: string;
  onAssigned: () => void;
}

export default function AssignUserModal({ isOpen, onClose, storeId, primaryColor, onAssigned }: Props) {
  const [allUsers, setAllUsers] = useState<AssignableUser[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<AssignableUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<'CASHIER' | 'STORE_ADMIN'>('CASHIER');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setLoadError(false);
    try {
      const data = await api.getAssignablePool(storeId);
      setAllUsers(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setAllUsers([]);
      setFilter('');
      setSelectedUser(null);
      setSelectedRole('CASHIER');
      setSubmitError(null);
      setLoadError(false);
      return;
    }
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filteredUsers = allUsers.filter(u => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.firstName ?? '').toLowerCase().includes(q) ||
      (u.lastName ?? '').toLowerCase().includes(q)
    );
  });

  const handleConfirm = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.assignUserToStore(storeId, { username: selectedUser.username, role: selectedRole });
      onAssigned();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setSubmitError(apiErr?.response?.data?.message || 'Failed to assign user');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const displayName = (u: AssignableUser) =>
    u.firstName || u.lastName ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.username;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign Existing User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {submitError}
          </div>
        )}

        {selectedUser ? (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{displayName(selectedUser)}</p>
              <p className="text-xs font-mono text-gray-500">{selectedUser.username}</p>
            </div>
            <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter by name or username..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={loadingUsers || loadError}
              />
            </div>

            {loadingUsers && (
              <p className="text-xs text-gray-400 text-center py-4">Loading users...</p>
            )}

            {loadError && (
              <div className="text-center py-4">
                <p className="text-xs text-red-500 mb-2">Failed to load users</p>
                <button
                  onClick={loadUsers}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  Try again
                </button>
              </div>
            )}

            {!loadingUsers && !loadError && (
              <>
                {filteredUsers.length > 0 ? (
                  <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <li
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className="px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-gray-900">{displayName(u)}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-mono">{u.username}</span>
                          {' · '}
                          {u.brandName && <span>{u.brandName} · </span>}
                          <span>{u.primaryStore?.name ?? '—'}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">
                    {filter.trim()
                      ? 'No users match your filter'
                      : 'No assignable users available'}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {selectedUser && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Role in this store</label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'CASHIER' | 'STORE_ADMIN')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASHIER">Cashier</SelectItem>
                <SelectItem value="STORE_ADMIN">Store Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedUser || submitting}
            className="px-4 py-2 text-sm text-black rounded-lg hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? 'Assigning...' : 'Assign User'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioskly-admin && npx tsc --noEmit 2>&1 | grep -i "AssignUserModal\|error" | head -20
```

Expected: no errors referencing `AssignUserModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add kioskly-admin/app/\(main\)/users/AssignUserModal.tsx
git commit -m "feat(store-portal): replace debounced search with load-all + filter in AssignUserModal"
```

---

### Task 3: Platform portal — Update both existing-user flows in `companies/[id]/page.tsx`

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/page.tsx`

**Context:** The platform companies detail page has two "existing user" flows inline (no separate modal component):
1. **Store admin** — when onboarding a new store, "Assign Existing User" tab lets the platform admin pick an existing company user as store admin
2. **Cashier** — "Add Staff" modal with "Assign Existing" tab

Both currently use separate search state + manual "Search" button + `api.searchCompanyUsers(companyId, query)`.

New behavior: both flows share one `allAssignableUsers` list. Loaded once on first "existing" tab activation. Filter applied client-side per-flow.

`api.searchCompanyUsers(companyId, '')` with empty string returns all (after Task 1's backend fix).

- [ ] **Step 1: Add new state variables — remove old ones**

Find the state declarations section (~line 233–243). Replace the old search states:

**Remove these 6 state lines:**
```typescript
  const [cashierExistingSearch, setCashierExistingSearch] = useState('');
  const [cashierExistingResults, setCashierExistingResults] = useState<any[]>([]);
  const [cashierExistingSearching, setCashierExistingSearching] = useState(false);
  // ...
  const [existingUserSearch, setExistingUserSearch] = useState('');
  const [existingUserResults, setExistingUserResults] = useState<any[]>([]);
  const [existingUserSearching, setExistingUserSearching] = useState(false);
```

**Add these 5 new state lines** in their place (keep them near the other cashier/store-admin states):
```typescript
  const [allAssignableUsers, setAllAssignableUsers] = useState<any[]>([]);
  const [assignableLoading, setAssignableLoading] = useState(false);
  const [assignableError, setAssignableError] = useState(false);
  const [existingFilter, setExistingFilter] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
```

- [ ] **Step 2: Add `loadAssignableUsers` function — remove old search handlers**

Find `handleExistingUserSearch` (~line 460) and `handleCashierExistingSearch` (~line 481). Delete both functions entirely. Add this function in their place:

```typescript
  const loadAssignableUsers = async () => {
    if (allAssignableUsers.length > 0) return; // already loaded
    setAssignableLoading(true);
    setAssignableError(false);
    try {
      const results = await api.searchCompanyUsers(companyId, '');
      setAllAssignableUsers(results);
    } catch {
      setAssignableError(true);
    } finally {
      setAssignableLoading(false);
    }
  };
```

- [ ] **Step 3: Update `resetStoreForm` to remove old search state refs**

Find `resetStoreForm` (~line 496). Change:
```typescript
  const resetStoreForm = () => {
    setStoreNameField('');
    setStoreSlugField('');
    setStoreAdminMode('new');
    setStoreAdminFirst('');
    setStoreAdminLast('');
    setStoreAdminEmail('');
    setStoreAdminUsername('');
    setExistingFilter('');
    setSelectedExistingUser(null);
    setStoreError(null);
  };
```

(Remove `setExistingUserSearch(''); setExistingUserResults([]); setExistingUserSearching(false);` — replace with `setExistingFilter('');`)

- [ ] **Step 4: Update `resetCashierForm` to remove old search state refs**

Find `resetCashierForm` (~line 475). Change:
```typescript
  const resetCashierForm = () => {
    setCashierFirstName(''); setCashierLastName(''); setCashierEmail(''); setCashierUsername('');
    setCashierRole('CASHIER');
    setCashierMode('new');
    setCashierFilter('');
    setCashierSelectedUser(null);
    setCashierError(null);
  };
```

(Remove `setCashierExistingSearch(''); setCashierExistingResults([]); setCashierSelectedUser(null);` — replace `setCashierExistingSearch('')` + `setCashierExistingResults([])` with `setCashierFilter('')`)

- [ ] **Step 5: Update the "Assign Existing User" tab button in the store onboard modal**

Find (~line 1363):
```tsx
<button
  type="button"
  onClick={() => setStoreAdminMode('existing')}
  className={...}
>
  Assign Existing User
</button>
```

Change `onClick` to also trigger the load:
```tsx
<button
  type="button"
  onClick={() => { setStoreAdminMode('existing'); loadAssignableUsers(); }}
  className={`flex-1 py-2 font-medium transition ${storeAdminMode === 'existing' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
>
  Assign Existing User
</button>
```

- [ ] **Step 6: Replace the store admin existing-user search JSX (~line 1382)**

Find `{storeAdminMode === 'existing' && (` block. Replace the entire inner section (from the opening `<div className="space-y-3">` to its closing `</div>`) with:

```tsx
            {storeAdminMode === 'existing' && (
              <div className="space-y-3">
                {selectedExistingUser ? (
                  <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selectedExistingUser.firstName} {selectedExistingUser.lastName}</p>
                      <p className="text-xs text-gray-500">@{selectedExistingUser.username} · {selectedExistingUser.email}</p>
                      {(selectedExistingUser.allStores ?? []).length > 0 && (
                        <p className="text-xs text-indigo-600 mt-0.5">
                          Already manages: {selectedExistingUser.allStores.map((s: any) => s.name).join(', ')}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => setSelectedExistingUser(null)} className="text-xs text-gray-400 hover:text-gray-600 ml-3">
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Filter by name, username, or email..."
                      value={existingFilter}
                      onChange={e => setExistingFilter(e.target.value)}
                      disabled={assignableLoading || assignableError}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    {assignableLoading && (
                      <p className="text-xs text-gray-400 text-center py-2">Loading users...</p>
                    )}
                    {assignableError && (
                      <div className="text-center py-2">
                        <p className="text-xs text-red-500 mb-1">Failed to load users</p>
                        <button type="button" onClick={loadAssignableUsers} className="text-xs text-indigo-600 hover:underline">Try again</button>
                      </div>
                    )}
                    {!assignableLoading && !assignableError && (() => {
                      const filtered = allAssignableUsers.filter(u => {
                        if (!existingFilter.trim()) return true;
                        const q = existingFilter.toLowerCase();
                        return u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) ||
                          u.firstName?.toLowerCase().includes(q) || u.lastName?.toLowerCase().includes(q);
                      });
                      return filtered.length > 0 ? (
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                          {filtered.map((u: any) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setSelectedExistingUser(u); setExistingFilter(''); }}
                              className="w-full flex items-start justify-between px-4 py-3 hover:bg-gray-50 text-left"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                                <p className="text-xs text-gray-400">@{u.username} · {u.email}</p>
                                <p className="text-xs text-indigo-500 mt-0.5">
                                  {(u.allStores ?? []).length > 0
                                    ? `Manages: ${u.allStores.map((s: any) => s.name).join(', ')}`
                                    : 'No stores yet'}
                                </p>
                              </div>
                              <span className="text-xs text-indigo-600 font-medium ml-3 shrink-0 mt-0.5">Select</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">
                          {existingFilter.trim() ? 'No users match your filter' : 'No assignable users available'}
                        </p>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
```

- [ ] **Step 7: Update the cashier "Assign Existing" tab button (~line 1511)**

Find:
```tsx
<button
  type="button"
  onClick={() => setCashierMode('existing')}
  className={...}
>
  Assign Existing
</button>
```

Change `onClick`:
```tsx
<button
  type="button"
  onClick={() => { setCashierMode('existing'); loadAssignableUsers(); }}
  className={`flex-1 py-2 font-medium transition ${cashierMode === 'existing' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
>
  Assign Existing
</button>
```

- [ ] **Step 8: Replace the cashier existing-user search JSX (~line 1531)**

Find `{cashierMode === 'existing' && (` block. Replace its inner section with:

```tsx
            {cashierMode === 'existing' && (
              <div className="space-y-3">
                {cashierSelectedUser ? (
                  <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cashierSelectedUser.firstName} {cashierSelectedUser.lastName}</p>
                      <p className="text-xs text-gray-500">@{cashierSelectedUser.username} · {cashierSelectedUser.email}</p>
                    </div>
                    <button type="button" onClick={() => setCashierSelectedUser(null)} className="text-xs text-gray-400 hover:text-gray-600 ml-3">
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Filter by name, username, or email..."
                      value={cashierFilter}
                      onChange={e => setCashierFilter(e.target.value)}
                      disabled={assignableLoading || assignableError}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    {assignableLoading && (
                      <p className="text-xs text-gray-400 text-center py-2">Loading users...</p>
                    )}
                    {assignableError && (
                      <div className="text-center py-2">
                        <p className="text-xs text-red-500 mb-1">Failed to load users</p>
                        <button type="button" onClick={loadAssignableUsers} className="text-xs text-indigo-600 hover:underline">Try again</button>
                      </div>
                    )}
                    {!assignableLoading && !assignableError && (() => {
                      const filtered = allAssignableUsers.filter(u => {
                        if (!cashierFilter.trim()) return true;
                        const q = cashierFilter.toLowerCase();
                        return u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) ||
                          u.firstName?.toLowerCase().includes(q) || u.lastName?.toLowerCase().includes(q);
                      });
                      return filtered.length > 0 ? (
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                          {filtered.map((u: any) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setCashierSelectedUser(u); setCashierFilter(''); }}
                              className="w-full flex items-start justify-between px-4 py-3 hover:bg-gray-50 text-left"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                                <p className="text-xs text-gray-400">@{u.username} · {u.email}</p>
                              </div>
                              <span className="text-xs text-indigo-600 font-medium ml-3 shrink-0 mt-0.5">Select</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">
                          {cashierFilter.trim() ? 'No users match your filter' : 'No assignable users available'}
                        </p>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd kioscify-platform && npx tsc --noEmit 2>&1 | grep "error" | head -20
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/page.tsx"
git commit -m "feat(platform): replace existing-user search with load-all + filter in company store/cashier flows"
```
