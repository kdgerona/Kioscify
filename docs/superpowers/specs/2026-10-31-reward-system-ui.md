# Reward System: UI Design Spec

**Date:** 2026-10-31
**Branch:** feature/reward-system
**Status:** Draft, for review
**Plan:** `~/.claude/plans/ui-designer-agent-frontend-greedy-aho.md` (sections 2–5)
**Scope:** Visual and interaction spec only. It contains no production code; the Tailwind snippets are suggestions for the Frontend Developer.

---

## 0. Ground rules (taken from the existing code)

| Concern | Company portal | Store portal | Kiosk |
|---|---|---|---|
| Brand colour | `var(--company-primary, #ea580c)` via `style=` | `primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c"` | same `primaryColor`, plus `textColor` and `backgroundColor` from themeColors |
| Tints | `${primary}18` bg, `${primary}30` border (layout logo chip) | same hex-alpha convention | `${primaryColor}10` / `15` / `40` / `80` |
| Page shell | `p-6 lg:p-8 space-y-6`, `text-2xl font-bold text-gray-900` | `p-4 sm:p-6 lg:p-8`, `text-2xl sm:text-3xl font-bold` | `CheckoutModal` body (`px-6 py-4`, max width 800) |
| Tabs | `border-b` > `nav.flex.gap-1` > `px-4 py-2.5 text-sm font-medium border-b-2`; the active tab is `border-current` with primary colour | `flex space-x-8` > `pb-4 px-2 border-b-2 font-medium` | n/a |
| Cards / tables | `bg-white rounded-lg border border-gray-200 overflow-hidden`; `th` = `px-6 py-3 text-xs font-medium text-gray-500 uppercase` | `bg-white rounded-xl shadow-sm border border-gray-200`; `th` = `px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider` | n/a |
| Badges | `inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200` | `px-3 py-1 rounded-full text-xs font-semibold` | n/a |
| Modals | hand-rolled `fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4` > `bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto`, with a sticky header | same | RN `Modal`, or a view swap inside `CheckoutModal` |
| Reorder | `ChevronUp`/`ChevronDown` icon buttons (menus page) | same | n/a |
| Icons | `lucide-react` | `lucide-react` | text glyphs / `@expo/vector-icons` as already used |

Each portal keeps the conventions of the file next to it. No new UI library and no dialog primitive.

**Shared status badge** (both portals, company badge style):

| Status | Classes | Copy |
|---|---|---|
| DRAFT | `bg-gray-100 text-gray-600 border-gray-200` | Draft |
| ACTIVE | `bg-green-50 text-green-700 border-green-200` | Active |
| PAUSED | `bg-amber-50 text-amber-700 border-amber-200` | Paused |
| ARCHIVED | `bg-gray-50 text-gray-400 border-gray-200 line-through` | Archived |
| Scheduled (ACTIVE, `startsAt` in the future) | `bg-blue-50 text-blue-700 border-blue-200` | Starts {MMM d} |
| Ended (ACTIVE, `endsAt` in the past) | `bg-gray-100 text-gray-500 border-gray-200` | Ended {MMM d} |

**Shared scope badge:** `Company` = `bg-indigo-50 text-indigo-700 border-indigo-200` with a `Building2` icon at w-3; `Store` = `bg-gray-100 text-gray-600 border-gray-200` with a `Store` icon.

**Event-type badge:** CARD_ISSUED `bg-blue-50 text-blue-700` "Card issued" · STAMP_ADDED `bg-sky-50 text-sky-700` "Stamp" · REWARD_REDEEMED `bg-green-50 text-green-700` "Redeemed". A voided row adds `line-through text-gray-400` to the row and a `bg-red-50 text-red-600` "Voided" badge.

### Reward-type registry (frontend, keeps every list type-agnostic)

```ts
// lib/rewards/types.ts (same file copied into both portals)
type RewardTypeMeta = {
  type: 'LOYALTY_CARD' | 'BUY_X_GET_Y' | 'PERCENT_OFF';
  label: string;            // "Loyalty Card"
  description: string;      // shown in the type picker
  icon: LucideIcon;         // Stamp | Gift | Percent
  available: boolean;       // only LOYALTY_CARD is true for now
  summarize(config): string;   // "12 stamps · 3 milestones", used in list rows
  Editor?: ComponentType<RewardEditorProps>; // LoyaltyCardBuilder
};
```
List pages, filters and the "New program" picker read from this registry. A new type later means one registry entry and one Editor; no list page changes.

---

## 1. Loyalty Card Builder (`components/rewards/`, identical in both portals)

### 1.1 Component breakdown

| Component | Props | Notes |
|---|---|---|
| `ProgramHeaderForm` | `value: {name, description, status, startsAt, endsAt}`, `onChange`, `readOnly`, `errors` | Top card on the Card tab |
| `LoyaltyCardBuilder` | `config: {slots: Slot[]}`, `onChange(config)`, `catalog: {productNames: string[], categoryNames: string[], sizeNames: string[]}`, `readOnly?: boolean`, `errors?: Record<slotKey, string[]>`, `primaryColor: string` | Owns the selected-slot state |
| `CardCanvas` | `slots`, `selectedKey`, `onSelect`, `onAddSlot(row, kind)`, `onAddRow`, `readOnly`, `errors` | Draws the grid |
| `SlotTile` | `slot`, `selected`, `hasError`, `readOnly`, `onClick` | Circle or cloud |
| `SlotEditorPanel` | `slot`, `rowSlots`, `catalog`, `onChange(slot)`, `onMove(dir)`, `onDelete`, `readOnly` | Right-hand panel |
| `NamePicker` | `label`, `options: string[]`, `value: string[]`, `onChange`, `placeholder`, `allowCustom = true` | Multi-select with chips; stores **names** |
| `BuilderSaveBar` | `dirty`, `saving`, `issueCount`, `onSave`, `onDiscard`, `onJumpToIssue` | Sticky at the bottom |

`Slot = {key, kind: 'STAMP'|'MILESTONE', label, row, position, condition?, reward?}`. The builder generates `key` (`s_` + 6 random chars). It is never shown, never edited and never reused, because events reference it.

### 1.2 Layout (desktop ≥1024px: two columns; below that the panel stacks under the canvas)

```
┌ Program ───────────────────────────────────────────────────────────────────────┐
│ Name* [Blue Bear Cloud Club          ]  Status [Active ▾]  Starts [📅] Ends [📅] │
│ Description [15 stamps, 3 milestones. A sky full of rewards.               ]   │
└────────────────────────────────────────────────────────────────────────────────┘
┌ Card ─────────────────────────────────────────────┐ ┌ Slot 2 · Row 1 ─────────┐
│  Row 1  (○)(●)(○)(○)  ☁ CLOUD BREAK      [+]       │ │ Type  (•)Stamp ( )Milestone │
│  Row 2  (○)(○)(○)(○)  ☁ CLOUD NINE       [+]       │ │ Label [Any drink ₱49+ ]  │
│  Row 3  (○)(○)(○)(○)  ☁ ABOVE THE CLOUDS [+]       │ │ Condition [Item price ▾] │
│  [+ Add row]                                        │ │ Min price ₱ [49.00]     │
│  12 stamps · 3 milestones                           │ │ Categories (optional)    │
└─────────────────────────────────────────────────────┘ │ [Drinks ×] [+ add]       │
                                                        │ Position [‹] 2 of 5 [›]  │
                                                        │ [🗑 Remove slot]          │
                                                        └──────────────────────────┘
┌───────────────── sticky save bar (only while dirty) ────────────────────────────┐
│ ⚠ 2 issues to fix                               [Discard]  [Save changes]         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- Wrapper: `grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start`
- Canvas card: `bg-white rounded-lg border border-gray-200 p-6`. The inner "paper" area is `rounded-2xl p-5 space-y-4` with `style={{ backgroundColor: \`${primary}14\` }}`. It is a soft brand tint, a nod to the sky-blue card without hard-coding blue.
- Row: `flex items-center gap-3 overflow-x-auto pb-1`. The left gutter label is `w-14 shrink-0 text-xs font-medium text-gray-500` ("Row 1"). A row-delete `Trash2` (w-3.5, `text-gray-300 hover:text-red-600`) appears on hover only when the row is empty or at the end.
- Panel: `bg-white rounded-lg border border-gray-200 lg:sticky lg:top-6`, with header `px-5 py-4 border-b` and body `p-5 space-y-4`.

### 1.3 Slot tiles

| Element | Classes |
|---|---|
| Stamp circle | `relative w-24 h-24 shrink-0 rounded-full bg-white border-2 flex flex-col items-center justify-center text-center px-2 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`, border colour `${primary}60` |
| Stamp text | label `text-[11px] leading-tight font-semibold text-gray-800 line-clamp-3`; condition hint below it `text-[10px] text-gray-500` (e.g. "₱49+", "3 products", "₱98+ total") |
| Milestone cloud | `relative w-44 h-24 shrink-0 rounded-[2.5rem] bg-white border-2 border-dashed flex flex-col items-center justify-center px-4 text-center`, with a `Cloud` icon at `w-4 h-4` above the label. Label `text-xs font-extrabold uppercase tracking-wide` in primary colour; reward hint `text-[11px] text-gray-600` ("50% off 1 item") |
| Selected | `ring-2 ring-offset-2` with `--tw-ring-color: primary` (set via style), plus `shadow-md` |
| Error | `ring-2 ring-red-500 ring-offset-2`, plus a red dot at the top right: `absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white` |
| Empty label | italic `text-gray-400` "Untitled" |
| Add-slot button (end of row) | `w-12 h-12 shrink-0 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center`, `Plus` icon. Clicking opens a 2-item popover: "Stamp circle" / "Milestone reward" |
| Add row | `inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:bg-white` "Add row" |

Each tile is a `<button>` with `aria-label="Row 1, slot 2: Stamp, Any drink ₱49+"` and `aria-pressed={selected}`. Arrow keys move the selection inside the canvas and Enter focuses the panel.

**Reorder:** use the existing chevron pattern in the panel: `[‹] 2 of 5 [›]` (`ChevronLeft` / `ChevronRight`, `p-1.5 rounded border border-gray-200 disabled:opacity-40`). A "Row" select moves the slot to another row, appended at the end. No drag-and-drop in v1. `position` is renumbered 0…n-1 on every change.

**Limits:** 8 slots per row and 6 rows. Once a limit is reached, the add button is disabled with `title="A row holds up to 8 slots"`.

### 1.4 Slot editor panel: fields

Header: "Slot {position+1} · Row {row+1}", with the kind badge to the right.

1. **Type**: segmented control `inline-flex rounded-lg border border-gray-200 p-0.5`. Each option is `px-3 py-1.5 text-sm rounded-md`; the active one is `bg-gray-900 text-white`. Options: "Stamp" / "Milestone". Switching kind clears `condition`/`reward`, after an inline confirmation if either is filled ("Switching type clears this slot's condition. Continue?").
2. **Label*** (`max 40`): input `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:border-transparent outline-none`. Helper text: "Printed text on the card, shown to cashiers."
3. **STAMP → "Stamp when…"** select:

| Option copy | `condition.type` | Extra fields |
|---|---|---|
| An item costs at least… | ITEM_MIN_PRICE | `₱ [minPrice]` (number, step 0.01, >0) + optional Categories `NamePicker` |
| A specific product is bought | ITEM_PRODUCT_NAMES | Products `NamePicker` (≥1) |
| An item from a category is bought | ITEM_CATEGORY_NAMES | Categories `NamePicker` (≥1) |
| The order total reaches… | TRANSACTION_MIN_TOTAL | `₱ [minTotal]` (>0) |

   Helper under the price field: "Uses the item's price before discounts and add-ons." (Confirm this against the API handler's "effective base price".)

4. **MILESTONE → "Reward"** select:

| Option copy | `reward.type` | Extra fields |
|---|---|---|
| Percent off one item | PERCENT_OFF_ITEM | `[percent] %` (1–100) |
| One free item | FREE_ITEM | none |
| Amount off one item | AMOUNT_OFF_ITEM | `₱ [amount]` (>0) |

   Optional filters for all three, in a collapsible "Limit to…" block (`text-sm font-medium text-gray-700`, with a `ChevronDown`): Categories `NamePicker`, Sizes `NamePicker`. Live preview line: `bg-green-50 text-green-700 text-xs rounded-lg px-3 py-2`, e.g. "Cashier can take 50% off one Drinks item (Regular)."

5. **Position** (reorder, see 1.3) and **Remove slot**: `text-sm text-red-600 hover:text-red-700 inline-flex items-center gap-1.5`, using the standard `confirm()` the portals already use: "Remove “Cloud Break”? Past redemptions keep their record."

**`NamePicker`:** the trigger is a box `min-h-[38px] w-full flex flex-wrap gap-1.5 px-2 py-1.5 border border-gray-300 rounded-lg`. Chips are `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700` with an `X` w-3. The dropdown (`absolute z-20 mt-1 w-full bg-white rounded-lg border shadow-lg max-h-60 overflow-y-auto`) has a search input and checkbox rows. Options are the **distinct names (case-insensitive) across all of the brand's menus**, sorted A–Z. When the typed text has no match, the last row reads `+ Add “{text}” anyway` and adds a chip with an amber style (`bg-amber-50 text-amber-700 border border-amber-200`) and `title="Not in any current menu. It will match once a product with this name exists."`. The same amber style marks saved names that no longer exist in the menus, so renamed products are easy to spot.

### 1.5 Empty, loading, read-only and validation states

- **Empty card** (new program): the canvas shows a centred block `py-12 text-center`. Icon `Stamp` w-10 `text-gray-300`. Title "Design your card" (`font-semibold text-gray-900`). Body "Add stamp circles and milestone rewards in rows, just like the printed card." (`text-sm text-gray-500`). Two buttons: primary "Start with 3 rows of 4 stamps + a reward" (fills 3×(4 STAMP + 1 MILESTONE) with blank labels) and outline "Start blank" (adds row 1 with one circle).
- **No slot selected:** panel body `text-sm text-gray-400 text-center py-10` "Select a circle or cloud to edit it."
- **Loading:** a skeleton matching the brand page: `animate-pulse` with 3 rows of `w-24 h-24 rounded-full bg-gray-200` × 4 + `w-44 h-24 rounded-[2.5rem] bg-gray-200`.
- **Catalog failed to load:** `NamePicker` shows `bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded` "Couldn't load the menu. You can still type names." Custom entries stay enabled.
- **Live program warning:** when status is ACTIVE and events exist, a banner above the canvas reads `bg-blue-50 border border-blue-200 text-blue-800 text-sm p-3 rounded-lg`: "This card is live. Changes apply to new sales only; past stamps and redemptions keep their original labels."
- **Read-only** (`readOnly`): no add or remove buttons, no save bar, inputs rendered as plain text (`text-sm text-gray-900`). Tiles stay clickable so the panel can show the definition as a `dl` (`grid grid-cols-[110px_1fr] gap-y-2 text-sm`, `dt text-gray-500`). Banner: `bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm p-3 rounded-lg` "Managed by {companyName}. Contact your company admin to change this program."

**Validation** (client-side; the API runs the same checks and its 400 messages are shown verbatim in the save bar):

| Rule | Message (inline under the field) |
|---|---|
| Name required, ≤60 | "Give the program a name." |
| `endsAt` ≥ `startsAt` | "End date must be after the start date." |
| Slot label required, ≤40 | "Add the text printed on this slot." |
| Stamp has a condition | "Choose when this stamp is earned." |
| Price/total > 0 | "Enter an amount above ₱0." |
| Names list ≥1 | "Pick at least one product." / "…one category." |
| Percent 1–100, amount > 0 | "Enter 1–100%." / "Enter an amount above ₱0." |
| Setting ACTIVE needs ≥1 stamp | Status select error: "Add at least one stamp before activating." |

Invalid slots get the error ring and dot. The save bar shows "⚠ {n} issues to fix" (`text-sm text-red-600 font-medium`, clickable, selects the first invalid slot) and **Save stays enabled**. Saving with issues runs the validation and focuses the first issue; DRAFT programs may be saved incomplete, while ACTIVE/PAUSED ones must be valid.

**Save bar:** `sticky bottom-0 -mx-6 lg:-mx-8 px-6 lg:px-8 py-3 bg-white/95 backdrop-blur border-t flex items-center justify-between`. Buttons: "Discard" (`px-3 py-2 text-sm text-gray-600 hover:text-gray-900`) and "Save changes" (`px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-90 disabled:opacity-60`, primary bg, "Saving…" with a spinner while busy). Navigating away while dirty triggers a `beforeunload` prompt.

---

## 2. Company portal (`kioscify-company`)

Nav: add `{ href: '/rewards', label: 'Rewards', icon: Gift, section: 'rewards' }` between Analytics and Users. Extend `PrivilegeSection` with `'rewards'`. Users with `read` access only get `readOnly` everywhere.

### 2.1 Rewards list: `app/(main)/rewards/page.tsx`

```
Rewards                                                         [+ New program]
Loyalty cards and promos for your brands' stores.

[Brand: All brands ▾] [Type: All types ▾] [Status: All ▾]   [🔍 Search programs   ]

┌──────────────────────────────────────────────────────────────────────────────┐
│ PROGRAM                 BRAND       TYPE           STATUS   STORES   UPDATED  ⋯ │
│ Blue Bear Cloud Club    Blue Bear   🎫 Loyalty Card [Active] 4 of 9   Oct 31   ⋯ │
│ 12 stamps · 3 milestones                                                       │
│ Holiday Card (draft)    Blue Bear   🎫 Loyalty Card [Draft]  0 of 9   Oct 30   ⋯ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Filters row: `flex flex-wrap items-center gap-3`, using the portal's `Select` (`SelectTrigger className="w-44 h-9 text-sm"`) and a search input (`pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64`). The Type filter options come from the registry; unavailable types are hidden.
- Table in the brand-page style. The row is clickable (`hover:bg-gray-50 cursor-pointer`) and goes to the detail page. Program cell: name `text-sm font-medium text-gray-900`, with `registry.summarize(config)` below it in `text-xs text-gray-400`. Stores cell: "4 of 9" `text-sm text-gray-700`; when 0 and ACTIVE, an amber "Not live" badge with `title="No stores enrolled"`.
- Row ⋯ actions (`MoreHorizontal`, write privilege only): Pause/Activate, Archive (with confirm), Duplicate ("Copy of …", DRAFT, no stores).
- **Empty (no programs):** card `py-16 text-center`, icon `Gift` w-12 `text-gray-300`, "No reward programs yet", "Create a loyalty card that matches the paper cards your stores hand out.", plus a primary "New program" button.
- **Empty (filters):** "No programs match these filters." with a "Clear filters" text button.
- **Loading:** the brand page spinner. **Error:** the existing `bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm` box, with "Retry".

### 2.2 New program modal (hand-rolled, `max-w-lg`)

Step 1, **"Choose a reward type"**: `grid grid-cols-1 sm:grid-cols-2 gap-3` of type cards.

```
┌ New program ──────────────────────────── × ┐
│ Choose a reward type                        │
│ ┌──────────────────┐ ┌──────────────────┐   │
│ │ 🎫 Loyalty Card   │ │ 🎁 Buy X Get Y    │   │
│ │ Stamp circles and │ │ Coming soon       │   │
│ │ milestone rewards │ │                   │   │
│ └──────────────────┘ └──────────────────┘   │
│ ┌──────────────────┐                        │
│ │ % Percent off     │                        │
│ │ Coming soon       │                        │
│ └──────────────────┘                        │
│                         [Cancel]  [Next →]  │
└─────────────────────────────────────────────┘
```
Type card: `text-left p-4 rounded-xl border-2 transition`. Selected: primary border plus a `${primary}0d` bg. Unavailable: `opacity-50 cursor-not-allowed`, with a "Coming soon" pill `text-[10px] uppercase font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded`.

Step 2, **"Program details"**: Brand* (Select, preset to the list's brand filter if one is set), Name* (placeholder "e.g. Blue Bear Cloud Club"), Description (textarea, 2 rows). Footer: "← Back" and "Create draft". On success, route to `/rewards/{id}?tab=card` with the empty-card state. Errors appear inline above the footer in the red box style.

### 2.3 Program detail: `app/(main)/rewards/[programId]/page.tsx`

Header (brand page pattern): `ChevronLeft` back to `/rewards`, then `h1` name + status badge, and a subline `text-sm text-gray-500` "{Brand} · Loyalty Card · Updated {date}". Header actions on the right: the status quick action ("Activate" / "Pause"; primary for Activate, outline for Pause).

Tabs: **Card** · **Stores ({n})** · **Activity**. The active tab syncs to `?tab=`.

**Card tab:** `ProgramHeaderForm` + `LoyaltyCardBuilder` (section 1). The catalog comes from the brand's menus (products, categories) and sizes.

**Stores tab:**
```
Choose which stores run this program. Stores not checked won't see it on the kiosk.
[🔍 Search stores        ]                        4 of 9 selected   [Select all]
┌──────────────────────────────────────────────────────────────────────────┐
│ [■]  STORE NAME            SLUG                 STATUS                    │
│ [✓]  Blue Bear SM North    bb-sm-north          Active                    │
│ [ ]  Blue Bear Trinoma     bb-trinoma           Active                    │
│ [✓]  Blue Bear Pop-up      bb-popup             Suspended  (muted)        │
└──────────────────────────────────────────────────────────────────────────┘
─── sticky save bar: "2 unsaved changes"           [Discard] [Save stores] ───
```
- The header checkbox is tri-state (all / some / none) and applies to the **filtered** rows. "Select all" / "Clear" text buttons sit next to it (`text-sm font-medium` primary colour).
- Checkbox: `w-4 h-4 rounded border-gray-300` with `accent-color: primary` (style). The whole row toggles on click.
- Banner when the program isn't ACTIVE: `bg-amber-50 border-amber-200 text-amber-800` "This program is {Draft}. Enrolled stores will see it once you activate it."
- Empty: "This brand has no stores yet." Search with no match: "No stores match “{q}”."
- Save calls `PUT /rewards/programs/:id/stores`, then shows the toast/inline message "Stores updated." (match the brand page's success style).

**Activity tab:**
```
[Store: All ▾]  [📅 Oct 1 – Oct 31 ▾]  [Include voided ☐]
┌ Cards issued ┐ ┌ Stamps ┐ ┌ Redemptions ┐ ┌ Reward discount ┐
│ 128          │ │ 904    │ │ 61          │ │ ₱3,415.50        │
└──────────────┘ └────────┘ └─────────────┘ └──────────────────┘
By store
│ STORE         CARDS  STAMPS  REDEMPTIONS  DISCOUNT    LAST ACTIVITY │
│ SM North        52     380        24      ₱1,380.00   Oct 31, 4:12 PM│
By slot (collapsible)   │ SLOT        KIND       COUNT │
Recent events (paginated, 20/page)
│ DATE/TIME  STORE  EVENT  SLOT  ITEM  DISCOUNT  CASHIER  TXN │
```
- Tiles: `grid grid-cols-2 lg:grid-cols-4 gap-4`. Each tile is `bg-white rounded-lg border border-gray-200 p-5`, with label `text-xs font-medium text-gray-500 uppercase` and value `text-2xl font-bold text-gray-900 mt-1 tabular-nums`. Loading: `h-8 w-20 bg-gray-200 rounded animate-pulse`.
- The default date range is the current month, using the existing date-range picker.
- Numbers are right-aligned with `tabular-nums`; currency is `₱{n.toLocaleString('en-PH',{minimumFractionDigits:2})}`.
- Events table: the same columns as the store portal (3.1) plus Store. The TXN column shows the transaction number in `font-mono text-xs`; company users can't open store transactions, so it isn't a link.
- Empty: "No activity in this period." When there are 0 enrolled stores: "Enroll stores on the Stores tab to start collecting activity." with a link.

---

## 3. Store portal (`kioskly-admin`): `app/(main)/rewards/page.tsx`

Sidebar: `{ name: "Rewards", href: "/rewards", icon: Gift, section: "rewards" }` after Sales Reports. Page title "Rewards", subtitle "Loyalty card stamps and rewards recorded at this store." Tabs use the store tab style: **Activity** · **Programs**.

### 3.1 Activity tab

Filter card (transactions page pattern, `bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-200 mb-6`):
```
[Program: All programs ▾] [Event: All ▾] [📅 Date range ▾] [⟳]
```
Event options: Card issued / Stamp / Redeemed. Type options come from the registry and the Type filter is hidden while only one type exists. Program options are grouped "Company programs" / "Store programs".

Tiles (same as 2.3, `rounded-xl shadow-sm`): **Cards issued**, **Stamps given**, **Rewards redeemed**, **Reward discounts** (₱, `text-green-700`).

Table (`th` = `px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider`):

| Column | Content |
|---|---|
| Date & time | `MMM d, h:mm a`, `text-sm text-gray-600 whitespace-nowrap` |
| Program | name + scope badge |
| Event | event-type badge |
| Slot | snapshot `slotLabel`, or "—" (`text-gray-400`) for CARD_ISSUED |
| Item | `productName`, or "—" |
| Discount | `-₱20.00` `text-red-600 font-medium` for redemptions, otherwise "—" |
| Cashier | user name |
| Transaction | `Receipt` icon + number `font-mono text-sm`, linking to the transaction detail (opens the existing detail modal/route) |

Pagination: `usePagination` + `components/ui/pagination.tsx`, exactly as on transactions. Busy overlay: the existing `absolute inset-0 bg-white/50` spinner. Empty: `Gift` icon w-12 `text-gray-400` with "No reward activity yet". When no programs are active, add the helper "Programs appear on the kiosk once they're active."

Transaction detail (existing view): add a "Rewards" section listing lines such as `🎫 Blue Bear Cloud Club: New card · 2 stamps (Any drink ₱49+, Blue Bear Cloud Latte) · Cloud Break −₱44.50 on Blue Bear Cloud Latte`.

### 3.2 Programs tab

```
Store programs are yours to edit. Company programs are set up by {Company}.   [+ New program]
┌──────────────────────────────────────────────────────────────────────────┐
│ PROGRAM               SOURCE      TYPE           STATUS     DATES          │
│ Blue Bear Cloud Club  [Company]   Loyalty Card   [Active]   Until Dec 31   │
│ Suki Card             [Store]     Loyalty Card   [Draft]    —              │
└──────────────────────────────────────────────────────────────────────────┘
```
- Company rows open the builder with `readOnly`. Store rows open it in editable mode; there is no Stores tab, and the brand is fixed to the store's brand.
- Detail route: `app/(main)/rewards/[programId]/page.tsx` with Card + Activity tabs (Activity pre-filtered to this program).
- "New program" uses the same two-step modal without the Brand field.
- Empty: "No programs yet. Create one for this store, or ask your company admin to enroll this store in theirs."

---

## 4. Kiosk: `RewardsPanel` (Expo, NativeWind + themeColors)

### 4.1 Where it lives

`CheckoutModal` today receives only `totalAmount`. Reward state has to live in `home.tsx`, because redemptions change cart items' `itemDiscount`. New props:

```ts
// CheckoutModal additions
rewardPrograms?: ActiveRewardProgram[];        // from GET /rewards/active (cached)
cart: CartItem[];                               // for eligibility
rewardSelections: RewardSelections;             // owned by home.tsx
onRewardSelectionsChange(next: RewardSelections): void;
onApplyRedemption(orderId: string, discount: ItemDiscount, meta: {programId, slotKey}): void;
onRemoveRedemption(orderId: string): void;

type RewardSelections = Record<programId, {
  issued: boolean;
  stamps: { slotKey: string; itemIndex?: number }[];
  redemption?: { slotKey: string; orderId: string; itemIndex: number; discountAmount: number };
}>;
```

**Navigation:** the panel is a **view swap inside `CheckoutModal`** (it replaces the ScrollView content, and the header shows "←  Loyalty Card"). A nested RN `Modal` is avoided because it is unreliable on Android tablets. The panel is reachable only before a payment method is picked, like the Discount section.

### 4.2 Entry point in checkout (below the Total box, above Discount)

```
┌──────────────────────────────────────────────────────────────┐
│ 🎫  Loyalty Card                                   (3)   ›   │
│     New card · 2 stamps · Cloud Break                         │
└──────────────────────────────────────────────────────────────┘
```
- Hidden when `rewardPrograms` is empty.
- Container: `TouchableOpacity className="flex-row items-center rounded-lg border-2 px-4 py-3 mb-4"` with `style={{ borderColor: \`${primaryColor}40\`, backgroundColor: \`${primaryColor}08\`, minHeight: 64 }}`.
- Title `text-base font-bold` (`textColor`). Subline `text-sm text-gray-500` lists the summary chips joined with " · ", or "Tap to stamp or redeem" when nothing is selected.
- Count badge = issued (1) + stamps + redemptions: `min-w-[28px] h-7 px-2 rounded-full items-center justify-center`, primary bg, white `text-sm font-bold`. Hidden at 0.
- Phone (`isPhone`): same layout with `py-2.5` and `text-sm` title.

### 4.3 Panel layout (tablet, modal width ≤800)

```
← Loyalty Card                                                       ×
┌ Blue Bear Cloud Club ──────────────────────────── Company ┐
│ New card issued                                  [  ◯━ ]  │  ← Switch, 48px row
│ Tap the circles you stamped. Highlighted ones match this order.│
│                                                             │
│  (✓)  (◉)  (◉)  ( )    ☁ CLOUD BREAK      [Redeem]          │
│  ₱49+ ₱49+ ₱49+ ₱49+      50% off 1 item                    │
│  ( )  (◉)  ( )  (◉)    ☁ CLOUD NINE       [Redeem]          │
│  ( )  ( )  ( )  ( )    ☁ ABOVE THE CLOUDS [Redeem]          │
│                                                             │
│  ◉ matches order   ✓ stamped   ( ) not in this order        │
└─────────────────────────────────────────────────────────────┘
┌ Suki Card ─────────────────────────────────────── Store ─┐ …
└──────────────────────────────────────────────────────────┘
                                 [ Done · 1 card, 2 stamps ]   ← full-width, 56px
```

- Program section: `View className="rounded-xl border border-gray-200 p-4 mb-4"`. Header row: name `text-lg font-bold` (`textColor`) and a scope pill (`px-2 py-0.5 rounded-full text-xs font-semibold`; Company = `bg-indigo-50 text-indigo-700`, Store = `bg-gray-100 text-gray-600`).
- **New card issued** row: `flex-row items-center justify-between py-2`, `minHeight: 48`. RN `Switch` with `trackColor={{ true: primaryColor }}`. Copy: "New card issued". Helper when on: "Hand the customer a new card." (`text-xs text-gray-500`).
- Grid row: `flex-row items-center mb-3` with `gap: 12` (style). Circles **88×88 on tablet** and **64×64 on phone**; clouds **150×88** / **110×64**. The touch target is always ≥64.

| State | Circle style |
|---|---|
| Eligible (matches this order, not ticked) | white bg, `borderWidth: 3`, `borderColor: primaryColor`, `backgroundColor: \`${primaryColor}10\``; label `text-xs font-semibold` (`textColor`) |
| Ticked | `backgroundColor: primaryColor`, white ✓ (`text-3xl font-bold`), small label under the tile (`text-[11px] text-gray-600`, 2-line clamp) |
| Ineligible | `borderWidth: 2`, `borderColor: "#e5e7eb"`, `opacity: 0.4`, `disabled` |
| Used up (eligible but all matching units already assigned) | same as ineligible + caption "No more items" |
| Pressed | `activeOpacity={0.7}` + `transform: [{ scale: 0.96 }]` |

Labels inside circles use `numberOfLines={3}` with `adjustsFontSizeToFit` (`text-[11px]`/`text-[10px]` on phone). `accessibilityRole="checkbox"`, `accessibilityState={{ checked, disabled }}`, `accessibilityLabel="Any drink ₱49 and up, matches this order"`.

**Eligibility rules (UI side; the API is the authority):**
- Item conditions are evaluated per cart **unit**, using `getEffectiveProductPrice` before discounts. Each unit can back **one** item-based stamp. Ticking a circle auto-assigns the first unused matching cart unit (`itemIndex`); unticking frees it. Assignment is greedy and the most restrictive condition goes first (product names > category > min price), so the cashier never has to choose. (Confirm the one-unit-one-stamp rule against `loyalty-card.handler.ts`.)
- TRANSACTION_MIN_TOTAL uses the cart total after item discounts and before the order discount, the same number shown as Subtotal. It needs no item. (Must match the API.)
- No upper limit on stamps per transaction beyond item availability.

### 4.4 Milestone redemption flow

Cloud tile: `rounded-full` (radius 44), `borderWidth: 2`, `borderStyle: "dashed"`, `borderColor: \`${primaryColor}80\``. It shows the label (`text-sm font-extrabold uppercase`, primary colour) and the reward hint (`text-xs text-gray-600`). To its right is a **Redeem** button: `px-4 rounded-lg`, `minHeight: 48`, primary bg, white `font-bold`.

Only one redemption per program per transaction (the paper card has a single cloud per row). Once a milestone is redeemed, the other clouds' buttons show disabled with the caption "1 reward per order".

Tapping **Redeem** swaps to the item-picker step inside the same section:

```
Cloud Break · 50% off 1 item                                 [Cancel]
Choose the item to discount
┌─────────────────────────────────────────────────────────────┐
│ Blue Bear Cloud Latte · Large            ₱89.00   →  −₱44.50 │  ← 64px row
│ Matcha Cloud Latte · Regular             ₱69.00   →  −₱34.50 │
│ Cookie (not a drink)                      ₱45.00   Not eligible│ (dimmed)
│ Ube Cheese Cloud Latte                    ₱79.00   Has a discount│ (dimmed)
└─────────────────────────────────────────────────────────────┘
┌ Preview ─────────────────────────────────────────────────────┐
│ Discount: −₱44.50          New line total: ₱44.50            │  (green box)
└──────────────────────────────────────────────────────────────┘
                         [Cancel]   [ Apply reward ]
```
- Item rows: `flex-row items-center justify-between px-4 rounded-lg border mb-2`, `minHeight: 64`. Selected: `borderColor: primaryColor`, `backgroundColor: \`${primaryColor}10\``, `borderWidth: 2`.
- Ineligible rows (`opacity: 0.4`, `disabled`) show the reason on the right in `text-xs text-gray-500`: "Not eligible" (fails the category/size filter), or **"Has a discount: remove it first"** when `item.itemDiscount` is set by hand (the plan's block rule).
- The discount covers **one unit** of the line: PERCENT = `unitPrice × pct`, FREE = `unitPrice`, AMOUNT = `min(amount, unitPrice)`, using the same rounding as `utils/discount.ts`.
- Preview box: reuse `ItemDiscountModal`'s green preview (`#f0fdf4` bg, `#15803d` text): "Discount: −₱44.50" / "New line total: ₱44.50".
- Buttons: Cancel (outline, `flex: 1`) and **Apply reward** (primary, `flex: 2`, `minHeight: 52`, disabled grey `#d1d5db` until an item is selected), matching `ItemDiscountModal`.
- After Apply, the cloud turns solid: `backgroundColor: "#16a34a"`, white label, ✓, caption "On {productName}". The Redeem button becomes **Undo** (outline, red text `text-red-600`), which calls `onRemoveRedemption`.
- Cart line in `home.tsx`: the item shows the reward discount in the existing red discount style, with the label "Reward: Cloud Break". Its manual-discount button is disabled while the reward is applied, so the two discount sources can't stack.
- **No eligible items:** the Redeem button is disabled and the caption reads "No item in this order qualifies."

### 4.5 Summary back in checkout, and after the sale

- Summary chips on the entry card (4.2) are short phrases: "New card", "{n} stamps" ("1 stamp"), "{milestone label}". When more than one program has selections, the program name prefixes each group ("Blue Bear: New card · 2 stamps").
- Done button: full width, `minHeight: 56`, primary bg, copy "Done · {summary}", or "Done" when nothing is selected. Back (←) behaves the same; selections persist until checkout completes or the cart is cleared.
- Total box: redemptions are already inside the item lines, so the Total/Subtotal numbers just update. Under Subtotal, add a line "incl. reward discounts −₱44.50" (`text-sm text-green-700`) when any redemption exists.
- **`TransactionSummary` (post-sale):** a "Loyalty Card" block after the payment lines, `border-t pt-3 mt-3`, one line per program:
  - "Blue Bear Cloud Club"
  - "  • New card issued"
  - "  • Stamped: Any drink ₱49+, Blue Bear Cloud Latte"
  - "  • Cloud Break: −₱44.50 on Blue Bear Cloud Latte"
  - Footer hint for the cashier: "Stamp the paper card: 2 circles." (`text-sm font-semibold` primary colour)

### 4.6 Kiosk states

| State | UI |
|---|---|
| Programs loading (first launch, no cache) | Entry card shows an `ActivityIndicator` + "Loading rewards…", disabled |
| Fetch failed, cache present | Normal, with a small `text-xs text-amber-600` "Offline: using saved programs" on the entry card |
| Fetch failed, no cache | Entry card hidden (never block a sale) |
| Program ended mid-shift (cached, `endsAt` passed) | Section hidden on open; selections for it are dropped with a one-line notice "{name} has ended." |
| Cart changed after stamping (item removed) | Re-run eligibility on open; drop stamps whose `itemIndex` no longer matches; drop a redemption whose item is gone and remove its discount; notice `text-sm text-amber-700` "Some stamps were cleared because the order changed." |
| Payment method already chosen | Entry card read-only (no chevron, `opacity-60`); go back to change |
| Sale fails/offline | No special UI; `rewards` rides in the queued payload |

---

## 5. Copy deck (quick reference)

| Key | Copy |
|---|---|
| Nav | Rewards |
| List subtitle (company) | Loyalty cards and promos for your brands' stores. |
| New program CTA | New program |
| Type picker title | Choose a reward type |
| Loyalty Card description | Stamp circles and milestone rewards, like your paper card. |
| Coming soon | Coming soon |
| Stores tab helper | Choose which stores run this program. Stores not checked won't see it on the kiosk. |
| Not live badge | Not live |
| Read-only banner | Managed by {company}. Contact your company admin to change this program. |
| Kiosk entry | Loyalty Card / Tap to stamp or redeem |
| Kiosk toggle | New card issued |
| Kiosk grid helper | Tap the circles you stamped. Highlighted ones match this order. |
| Kiosk block reason | Has a discount: remove it first |
| Kiosk apply | Apply reward |
| Post-sale hint | Stamp the paper card: {n} circles. |

## 6. Decided rules (2026-10-31)

1. One cart unit backs at most one item-based stamp. Stamps pointing at an item can't exceed its quantity.
2. TRANSACTION_MIN_TOTAL compares against the transaction's final `total`, after all discounts, including reward redemptions.
3. Only one redemption per program per transaction. The API enforces this as well as the UI.
4. ITEM_MIN_PRICE compares against the item's base effective product price at the store (price-tier aware), before size modifiers and add-ons. Helper copy should say "Base price of ₱X or more".
