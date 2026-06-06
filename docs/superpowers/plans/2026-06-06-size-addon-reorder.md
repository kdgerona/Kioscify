# Size & Addon Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow sizes and add-ons to be reordered in the company portal (same up/down chevron pattern as categories), with the order reflected in the mobile app.

**Architecture:** Add a `sequenceNo` field to the `Size` and `Addon` Prisma models, update their services to sort by it, extend the company portal with a reusable `ReorderRow` component and a generic `reorderItem` helper, and patch the `formatProduct` method so embedded sizes/addons in product responses are also sorted. No mobile app code changes are needed — it reads from the same API.

**Tech Stack:** NestJS + Prisma (MongoDB), Next.js 15 App Router, TypeScript

---

## File Map

| File | Change |
|---|---|
| `kioskly-api/prisma/schema.prisma` | Add `sequenceNo Int @default(0)` to `Size` and `Addon` models |
| `kioskly-api/src/sizes/dto/update-size.dto.ts` | Add `sequenceNo?: number` field |
| `kioskly-api/src/addons/dto/update-addon.dto.ts` | Add `sequenceNo?: number` field |
| `kioskly-api/src/sizes/sizes.service.ts` | Change `orderBy` from `name` to `sequenceNo` |
| `kioskly-api/src/addons/addons.service.ts` | Change `orderBy` from `name` to `sequenceNo` |
| `kioskly-api/src/products/products.service.ts` | Sort embedded sizes/addons by `sequenceNo` in `formatProduct` |
| `kioscify-company/types/index.ts` | Add `sequenceNo?: number` to `Size` and `Addon` interfaces |
| `kioscify-company/lib/api.ts` | Add `sequenceNo` to `updateSize` and `updateAddon` payload types |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Add `ReorderRow` component, `reorderItem` helper, replace `CRUDRow` in Sizes/Add-ons tabs |

---

### Task 1: Add `sequenceNo` to Size and Addon schema models

**Files:**
- Modify: `kioskly-api/prisma/schema.prisma`

- [ ] **Step 1: Add `sequenceNo` to the `Size` model**

  In `schema.prisma`, the `Size` model starts at line 211. Add `sequenceNo Int @default(0)` after the `tombstone` line (currently line 220):

  ```prisma
  model Size {
    id            String   @id @map("_id")
    tenantId      String?  @db.ObjectId
    brandId       String?  @db.ObjectId
    name           String
    priceModifier  Float
    foodpandaPrice Float?
    grabPrice      Float?
    volume         String?
    tombstone     Int      @default(0)
    sequenceNo    Int      @default(0)
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt

    tenant           Tenant?          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    brand            Brand?           @relation(fields: [brandId], references: [id], onDelete: Cascade)
    productSizes     ProductSize[]
    transactionItems TransactionItem[]

    @@unique([tenantId, name])
    @@map("sizes")
  }
  ```

- [ ] **Step 2: Add `sequenceNo` to the `Addon` model**

  The `Addon` model starts at line 233. Add `sequenceNo Int @default(0)` after the `tombstone` line:

  ```prisma
  model Addon {
    id        String   @id @map("_id")
    tenantId  String?  @db.ObjectId
    brandId   String?  @db.ObjectId
    name           String
    price          Float
    foodpandaPrice Float?
    grabPrice      Float?
    tombstone Int      @default(0)
    sequenceNo    Int      @default(0)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    tenant                Tenant?                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    brand                 Brand?                 @relation(fields: [brandId], references: [id], onDelete: Cascade)
    productAddons         ProductAddon[]
    transactionItemAddons TransactionItemAddon[]

    @@unique([tenantId, name])
    @@map("addons")
  }
  ```

- [ ] **Step 3: Regenerate the Prisma client**

  Run from `kioskly-api/`:
  ```bash
  npm run prisma:generate
  ```
  Expected: `Generated Prisma Client` — no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add kioskly-api/prisma/schema.prisma
  git commit -m "feat(schema): add sequenceNo to Size and Addon models"
  ```

---

### Task 2: Update DTOs to accept `sequenceNo`

**Files:**
- Modify: `kioskly-api/src/sizes/dto/update-size.dto.ts`
- Modify: `kioskly-api/src/addons/dto/update-addon.dto.ts`

- [ ] **Step 1: Update `UpdateSizeDto`**

  Replace the contents of `kioskly-api/src/sizes/dto/update-size.dto.ts` with:

  ```typescript
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
  import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';

  export class UpdateSizeDto {
    @ApiProperty({ example: 'Regular', required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ example: 0, required: false })
    @IsNumber()
    @IsOptional()
    priceModifier?: number;

    @ApiPropertyOptional({ example: 10 })
    @IsNumber()
    @IsOptional()
    foodpandaPrice?: number;

    @ApiPropertyOptional({ example: 10 })
    @IsNumber()
    @IsOptional()
    grabPrice?: number;

    @ApiProperty({ example: '16oz', required: false })
    @IsString()
    @IsOptional()
    volume?: string;

    @ApiProperty({ example: 1, required: false })
    @IsInt()
    @IsOptional()
    sequenceNo?: number;
  }
  ```

- [ ] **Step 2: Update `UpdateAddonDto`**

  Replace the contents of `kioskly-api/src/addons/dto/update-addon.dto.ts` with:

  ```typescript
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
  import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';

  export class UpdateAddonDto {
    @ApiProperty({ example: 'Nata De Coco', required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ example: 10, required: false })
    @IsNumber()
    @IsOptional()
    price?: number;

    @ApiPropertyOptional({ example: 12 })
    @IsNumber()
    @IsOptional()
    foodpandaPrice?: number;

    @ApiPropertyOptional({ example: 12 })
    @IsNumber()
    @IsOptional()
    grabPrice?: number;

    @ApiProperty({ example: 1, required: false })
    @IsInt()
    @IsOptional()
    sequenceNo?: number;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add kioskly-api/src/sizes/dto/update-size.dto.ts kioskly-api/src/addons/dto/update-addon.dto.ts
  git commit -m "feat(sizes,addons): add sequenceNo to update DTOs"
  ```

---

### Task 3: Sort by `sequenceNo` in services + `formatProduct`

**Files:**
- Modify: `kioskly-api/src/sizes/sizes.service.ts`
- Modify: `kioskly-api/src/addons/addons.service.ts`
- Modify: `kioskly-api/src/products/products.service.ts`

- [ ] **Step 1: Update `SizesService.findAll` orderBy**

  In `kioskly-api/src/sizes/sizes.service.ts`, find the `findAll` method. Change:
  ```typescript
  orderBy: { name: 'asc' },
  ```
  to:
  ```typescript
  orderBy: { sequenceNo: 'asc' },
  ```

- [ ] **Step 2: Update `AddonsService.findAll` orderBy**

  In `kioskly-api/src/addons/addons.service.ts`, find the `findAll` method. Change:
  ```typescript
  orderBy: { name: 'asc' },
  ```
  to:
  ```typescript
  orderBy: { sequenceNo: 'asc' },
  ```

- [ ] **Step 3: Sort sizes/addons in `formatProduct`**

  In `kioskly-api/src/products/products.service.ts`, find the `formatProduct` private method. The current lines mapping sizes and addons:

  ```typescript
  sizes: product.productSizes?.map((ps) => ps.size) || [],
  addons: product.productAddons?.map((pa) => pa.addon) || [],
  ```

  Replace with:

  ```typescript
  sizes: (product.productSizes?.map((ps) => ps.size) || [])
    .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
  addons: (product.productAddons?.map((pa) => pa.addon) || [])
    .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
  ```

- [ ] **Step 4: Restart the API and verify it starts without errors**

  Run from `kioskly-api/`:
  ```bash
  npm run start:dev
  ```
  Expected: NestJS boots, Prisma connects, no TypeScript compile errors.

- [ ] **Step 5: Commit**

  ```bash
  git add kioskly-api/src/sizes/sizes.service.ts kioskly-api/src/addons/addons.service.ts kioskly-api/src/products/products.service.ts
  git commit -m "feat(sizes,addons): sort by sequenceNo in findAll and formatProduct"
  ```

---

### Task 4: Update company portal types and API client

**Files:**
- Modify: `kioscify-company/types/index.ts`
- Modify: `kioscify-company/lib/api.ts`

- [ ] **Step 1: Add `sequenceNo` to `Size` and `Addon` interfaces**

  In `kioscify-company/types/index.ts`, the `Size` interface starts at line 99. Add `sequenceNo?: number` after `updatedAt`:

  The `Size` interface should become:
  ```typescript
  export interface Size {
    id: string;
    name: string;
    priceModifier: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId?: string;
    tenantId?: string;
    sequenceNo?: number;
    createdAt: string;
    updatedAt: string;
  }
  ```

  The `Addon` interface (starting at line 111) should become:
  ```typescript
  export interface Addon {
    id: string;
    name: string;
    price: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId?: string;
    tenantId?: string;
    sequenceNo?: number;
    createdAt: string;
    updatedAt: string;
  }
  ```

- [ ] **Step 2: Update `updateSize` payload type in `api.ts`**

  In `kioscify-company/lib/api.ts` at line 279, replace the `updateSize` method signature:

  ```typescript
  async updateSize(id: string, payload: Partial<{ name: string; priceModifier: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number }>): Promise<Size> {
    const { data } = await this.client.patch<Size>(`/sizes/${id}`, payload);
    return data;
  }
  ```

- [ ] **Step 3: Update `updateAddon` payload type in `api.ts`**

  In `kioscify-company/lib/api.ts` at line 309, replace the `updateAddon` method signature:

  ```typescript
  async updateAddon(id: string, payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number }>): Promise<Addon> {
    const { data } = await this.client.patch<Addon>(`/addons/${id}`, payload);
    return data;
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add kioscify-company/types/index.ts kioscify-company/lib/api.ts
  git commit -m "feat(company): add sequenceNo to Size and Addon types and API client"
  ```

---

### Task 5: Add reorder UI to company portal Sizes and Add-ons tabs

**Files:**
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx`

- [ ] **Step 1: Add the `ReorderRow` component**

  In `kioscify-company/app/(main)/brands/[brandId]/page.tsx`, after the closing `}` of the `CategoryRow` component (around line 118), add this new component:

  ```typescript
  // ─── Generic row with sequence reorder controls ───────────────────────────

  function ReorderRow({
    label,
    sublabel,
    index,
    total,
    onMoveUp,
    onMoveDown,
    onEdit,
    onDelete,
  }: {
    label: string;
    sublabel?: string;
    index: number;
    total: number;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onEdit: () => void;
    onDelete: () => void;
  }) {
    return (
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-400 font-mono w-5 text-center leading-none">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          {sublabel && <p className="text-xs text-gray-400 truncate">{sublabel}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Add the generic `reorderItem` helper**

  In `BrandDetailPage`, after the `reorderCategory` function (around line 282), add:

  ```typescript
  const reorderItem = async <T extends { id: string; sequenceNo?: number }>(
    list: T[],
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    index: number,
    direction: 'up' | 'down',
    updateFn: (id: string, sequenceNo: number) => Promise<T>,
  ) => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const reordered = [...list];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const stamped = reordered.map((item, i) => ({ ...item, sequenceNo: i }));

    setList(stamped);
    await Promise.all([
      updateFn(stamped[index].id, index),
      updateFn(stamped[swapIndex].id, swapIndex),
    ]);
  };
  ```

- [ ] **Step 3: Replace `CRUDRow` with `ReorderRow` in the Sizes tab**

  In the Sizes tab section (around line 534–557), replace:

  ```typescript
  sizes.map(size => (
    <CRUDRow
      key={size.id}
      label={size.name}
      sublabel={`Price modifier: +$${size.priceModifier.toFixed(2)}`}
      onEdit={() => setModal({ type: 'sizes', mode: 'edit', item: size })}
      onDelete={async () => {
        if (!confirm(`Delete "${size.name}"?`)) return;
        await api.deleteSize(size.id);
        setSizes(prev => prev.filter(s => s.id !== size.id));
      }}
    />
  ))
  ```

  with:

  ```typescript
  sizes.map((size, i) => (
    <ReorderRow
      key={size.id}
      label={size.name}
      sublabel={`Price modifier: +₱${size.priceModifier.toFixed(2)}`}
      index={i}
      total={sizes.length}
      onMoveUp={() => reorderItem(sizes, setSizes, i, 'up', (id, seq) => api.updateSize(id, { sequenceNo: seq }))}
      onMoveDown={() => reorderItem(sizes, setSizes, i, 'down', (id, seq) => api.updateSize(id, { sequenceNo: seq }))}
      onEdit={() => setModal({ type: 'sizes', mode: 'edit', item: size })}
      onDelete={async () => {
        if (!confirm(`Delete "${size.name}"?`)) return;
        await api.deleteSize(size.id);
        setSizes(prev => prev.filter(s => s.id !== size.id));
      }}
    />
  ))
  ```

- [ ] **Step 4: Replace `CRUDRow` with `ReorderRow` in the Add-ons tab**

  In the Add-ons tab section (around line 560–583), replace:

  ```typescript
  addons.map(addon => (
    <CRUDRow
      key={addon.id}
      label={addon.name}
      sublabel={`$${addon.price.toFixed(2)}`}
      onEdit={() => setModal({ type: 'addons', mode: 'edit', item: addon })}
      onDelete={async () => {
        if (!confirm(`Delete "${addon.name}"?`)) return;
        await api.deleteAddon(addon.id);
        setAddons(prev => prev.filter(a => a.id !== addon.id));
      }}
    />
  ))
  ```

  with:

  ```typescript
  addons.map((addon, i) => (
    <ReorderRow
      key={addon.id}
      label={addon.name}
      sublabel={`₱${addon.price.toFixed(2)}`}
      index={i}
      total={addons.length}
      onMoveUp={() => reorderItem(addons, setAddons, i, 'up', (id, seq) => api.updateAddon(id, { sequenceNo: seq }))}
      onMoveDown={() => reorderItem(addons, setAddons, i, 'down', (id, seq) => api.updateAddon(id, { sequenceNo: seq }))}
      onEdit={() => setModal({ type: 'addons', mode: 'edit', item: addon })}
      onDelete={async () => {
        if (!confirm(`Delete "${addon.name}"?`)) return;
        await api.deleteAddon(addon.id);
        setAddons(prev => prev.filter(a => a.id !== addon.id));
      }}
    />
  ))
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  Run from `kioscify-company/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add kioscify-company/app/(main)/brands/\[brandId\]/page.tsx
  git commit -m "feat(company): add reorder controls to Sizes and Add-ons tabs"
  ```
