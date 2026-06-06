# Assign User List Modal Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the search-on-type pattern in "Assign Existing User" modals with a load-all-upfront + client-side-filter pattern, applied to the store portal and platform portal.

**Architecture:** On modal open, fetch all assignable users in a single API call. Store the full list in state and filter it client-side as the user types. No debounce, no per-keystroke API calls.

**Tech Stack:** Next.js 15, React, Tailwind CSS, NestJS + Prisma (backend)

---

## Portals in Scope

| Portal | Package | What changes |
|---|---|---|
| Store portal | `kioskly-admin` | `AssignUserModal.tsx` |
| Platform portal | `kioscify-platform` | `companies/[id]/page.tsx` — Store Admin + Cashier existing-user flows |
| Company portal | `kioscify-company` | **No changes** — company admins manage users within their company only |

---

## UI/UX Pattern (both portals)

1. Modal opens → single API call fires immediately to fetch all assignable users
2. While loading: spinner/skeleton in the list area
3. Once loaded: full list rendered with a **filter bar** at top (`Filter by name or username...`)
4. Typing filters the list client-side — instant, no debounce, no network calls
5. Selecting a user → summary card replaces the list; role picker appears; Confirm submits

### Empty States
- Filter text with no matches → "No users match your filter"
- List is empty on load → "No assignable users available"
- Load error → "Failed to load users, please try again" with a retry button

---

## Backend Changes

### `GET /users/stores/:storeId/assignable-pool` (`kioskly-api`)

**Current behavior:** Always applies name/username text filter and `take: 20`.

**New behavior:**
- When `q` is **absent**: skip the text filter, remove the `take` limit, return all eligible users
- When `q` is **present**: existing behavior unchanged (backwards compatible)

No other backend endpoints require modification.

### Platform portal

No backend changes. `GET /users/company/:companyId/all` already returns all users in a company. The frontend uses `storeUsers` from that response as the assignable pool (same set that `searchCompanyUsers` previously searched through).

---

## Frontend Changes

### Store portal — `kioskly-admin/app/(main)/users/AssignUserModal.tsx`

**State changes:**
- Remove: `query` state, debounce ref, per-keystroke API call logic
- Add: `allUsers: AssignableUser[]` (full list from API), `filter: string` (client-side input)
- `filteredUsers` = `allUsers` filtered by `filter` (name or username contains match, case-insensitive)

**On modal open:**
- Call `api.getAssignablePool(storeId)` (no `q` param)
- Store result in `allUsers`
- Show spinner while loading

**Filter input:**
- Replaces the old search input
- No async side effects — pure client-side filtering

**Retry on error:**
- Show error message + "Try again" button that re-fires the load call

### Store portal — `kioskly-admin/lib/api.ts`

- `getAssignablePool(storeId, q?)` — make `q` optional; omit from request params when not provided

### Platform portal — `kioscify-platform/app/(main)/companies/[id]/page.tsx`

Both the **Store Admin existing-user** and **Cashier existing-user** modal tabs get the same treatment:

**Remove:**
- `handleExistingUserSearch`, `handleCashierExistingSearch` functions
- Manual "Search" buttons
- `existingUserSearch`, `existingUserResults`, `existingUserSearching` states
- `cashierExistingSearch`, `cashierExistingResults`, `cashierExistingSearching` states

**Add:**
- `allAssignableUsers: User[]` — loaded once when the modal's "existing" tab is activated
- `existingFilter: string` and `cashierFilter: string` — client-side filter strings
- `assignableLoading: boolean` — spinner while loading
- `assignableError: string | null` — error + retry UI

**On "existing" tab activate:**
- If `allAssignableUsers` is empty (not yet loaded), call `api.getCompanyAllUsers(companyId)`, take `storeUsers` as the pool
- Cache in state so switching tabs doesn't re-fetch

**Filter inputs:**
- Replace the old search inputs with filter inputs
- No API calls on type — pure client-side filtering

---

## What Does Not Change

- The role picker (CASHIER / STORE_ADMIN) — unchanged
- The selected-user summary card — unchanged
- The assign submission logic (`api.assignUserToStore`) — unchanged
- The platform's "create new user" tab — unchanged
- Company portal — not touched
