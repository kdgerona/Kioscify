import {
  buildIdNameMap,
  buildUserDisplayNameMap,
  enrichCatalogRow,
  enrichProduct,
  enrichTransactions,
  enrichExpenses,
  enrichInventoryRecords,
  enrichInventoryItems,
  enrichSubmittedReports,
  enrichSubmittedInventoryReportsTop,
  enrichStaffTimeLogs,
  filterActive,
} from './export-enrichment.util';

describe('export-enrichment.util', () => {
  describe('buildIdNameMap()', () => {
    it('maps id -> name', () => {
      const map = buildIdNameMap([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]);
      expect(map.get('a')).toBe('Alpha');
      expect(map.get('b')).toBe('Beta');
    });
  });

  describe('buildUserDisplayNameMap()', () => {
    it('prefers "First Last" when both are set', () => {
      const map = buildUserDisplayNameMap([
        { id: 'u1', username: 'jdoe', firstName: 'Jane', lastName: 'Doe' },
      ]);
      expect(map.get('u1')).toBe('Jane Doe');
    });

    it('falls back to username when first/last are absent or blank', () => {
      const map = buildUserDisplayNameMap([
        { id: 'u1', username: 'jdoe', firstName: '', lastName: '' },
        { id: 'u2', username: 'asmith' },
      ]);
      expect(map.get('u1')).toBe('jdoe');
      expect(map.get('u2')).toBe('asmith');
    });
  });

  describe('filterActive()', () => {
    it('drops rows with tombstone === 1 and keeps everything else', () => {
      const result = filterActive([
        { id: 'a', tombstone: 0 },
        { id: 'b', tombstone: 1 },
        { id: 'c' }, // tombstone absent — treated as active
      ]);
      expect(result.map((r) => r.id)).toEqual(['a', 'c']);
    });
  });

  describe('enrichCatalogRow()', () => {
    it('replaces menuId with a resolved menuName and drops id/tombstone', () => {
      const menuNames = buildIdNameMap([{ id: 'menu-1', name: 'Main Menu' }]);
      const result = enrichCatalogRow(
        { id: 'cat-1', name: 'Drinks', menuId: 'menu-1', tombstone: 0 },
        menuNames,
      );
      expect(result).toEqual({ name: 'Drinks', menuName: 'Main Menu' });
      expect('menuId' in result).toBe(false);
      expect('id' in result).toBe(false);
      expect('tombstone' in result).toBe(false);
    });

    it('resolves to an empty string when menuId is missing/unresolvable rather than throwing', () => {
      const result = enrichCatalogRow({ id: 'cat-1', menuId: undefined }, new Map());
      expect(result.menuName).toBe('');
    });
  });

  describe('enrichProduct()', () => {
    it('replaces both menuId and categoryId with resolved names and drops id/tombstone', () => {
      const menuNames = buildIdNameMap([{ id: 'menu-1', name: 'Main Menu' }]);
      const categoryNames = buildIdNameMap([{ id: 'cat-1', name: 'Drinks' }]);
      const result = enrichProduct(
        { id: 'prod-1', name: 'Latte', menuId: 'menu-1', categoryId: 'cat-1', tombstone: 0 },
        menuNames,
        categoryNames,
      );
      expect(result).toEqual({
        name: 'Latte',
        menuName: 'Main Menu',
        categoryName: 'Drinks',
      });
      expect('id' in result).toBe(false);
      expect('tombstone' in result).toBe(false);
    });
  });

  describe('enrichTransactions()', () => {
    const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
    const productNames = buildIdNameMap([{ id: 'prod-1', name: 'Latte' }]);
    const sizeNames = buildIdNameMap([{ id: 'size-1', name: 'Large' }]);
    const preferenceNames = buildIdNameMap([{ id: 'pref-1', name: 'Oat milk' }]);
    const addonNames = buildIdNameMap([{ id: 'addon-1', name: 'Extra shot' }]);

    it('drops tenantId, resolves userId to submittedBy, and resolves void requester/reviewer', () => {
      const [result] = enrichTransactions(
        [
          {
            id: 'txn-1',
            tenantId: 'store-1',
            userId: 'user-1',
            voidRequestedBy: 'user-1',
            voidReviewedBy: null,
          },
        ],
        userNames,
        productNames,
        sizeNames,
        preferenceNames,
        addonNames,
      );
      expect('tenantId' in result).toBe(false);
      expect('userId' in result).toBe(false);
      expect(result.submittedBy).toBe('Jane Doe');
      expect(result.voidRequestedBy).toBe('Jane Doe');
      expect(result.voidReviewedBy).toBe('');
    });

    it('resolves each item\'s productId/sizeId/preferenceId and folds addonIds into named addon rows', () => {
      const [result] = enrichTransactions(
        [
          {
            id: 'txn-1',
            userId: 'user-1',
            items: [
              {
                productId: 'prod-1',
                sizeId: 'size-1',
                preferenceId: 'pref-1',
                addons: [{ addonId: 'addon-1' }],
              },
            ],
          },
        ],
        userNames,
        productNames,
        sizeNames,
        preferenceNames,
        addonNames,
      );
      expect(result.items[0]).toEqual({
        productName: 'Latte',
        sizeName: 'Large',
        preferenceName: 'Oat milk',
        addons: [{ name: 'Extra shot' }],
      });
      expect('productId' in result.items[0]).toBe(false);
    });

    it('falls back to an empty preference/size name when null, without crashing', () => {
      const [result] = enrichTransactions(
        [{ id: 'txn-1', userId: 'user-1', items: [{ productId: 'prod-1', sizeId: null, preferenceId: null }] }],
        userNames,
        productNames,
        sizeNames,
        preferenceNames,
        addonNames,
      );
      expect(result.items[0].sizeName).toBe('');
      expect(result.items[0].preferenceName).toBe('');
    });
  });

  describe('enrichExpenses()', () => {
    it('drops tenantId and resolves userId/voidRequestedBy/voidReviewedBy', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const [result] = enrichExpenses(
        [{ tenantId: 'store-1', userId: 'user-1', voidRequestedBy: null, voidReviewedBy: null }],
        userNames,
      );
      expect('tenantId' in result).toBe(false);
      expect(result.submittedBy).toBe('Jane Doe');
    });

    it('drops the receipt photo filename — same "no pictures" rule as attendance', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const [result] = enrichExpenses(
        [{ userId: 'user-1', receipt: 'receipt-12345.jpg' }],
        userNames,
      );
      expect('receipt' in result).toBe(false);
    });
  });

  describe('enrichInventoryRecords()', () => {
    it('drops tenantId and resolves userId + inventoryItemId', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const itemNames = buildIdNameMap([{ id: 'item-1', name: 'Milk' }]);
      const [result] = enrichInventoryRecords(
        [{ tenantId: 'store-1', userId: 'user-1', inventoryItemId: 'item-1' }],
        userNames,
        itemNames,
      );
      expect('tenantId' in result).toBe(false);
      expect('inventoryItemId' in result).toBe(false);
      expect(result.submittedBy).toBe('Jane Doe');
      expect(result.itemName).toBe('Milk');
    });
  });

  describe('enrichInventoryItems()', () => {
    it('replaces categoryId with categoryName and inventorySetupId with inventorySetupName', () => {
      const categoryNames = buildIdNameMap([{ id: 'cat-1', name: 'Dairy' }]);
      const inventorySetupNames = buildIdNameMap([{ id: 'setup-1', name: 'Main Kitchen' }]);
      const [result] = enrichInventoryItems(
        [{ categoryId: 'cat-1', inventorySetupId: 'setup-1' }],
        categoryNames,
        inventorySetupNames,
      );
      expect(result.categoryName).toBe('Dairy');
      expect(result.inventorySetupName).toBe('Main Kitchen');
      expect('categoryId' in result).toBe(false);
      expect('inventorySetupId' in result).toBe(false);
    });
  });

  describe('enrichSubmittedReports()', () => {
    it('drops tenantId, resolves userId to submittedBy, and resolves transactionIds/expenseIds to readable refs', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const transactionRefNames = buildIdNameMap([{ id: 'txn-1', name: 'TXN1001' }]);
      const expenseRefNames = buildIdNameMap([{ id: 'exp-1', name: 'Ice' }]);
      const [result] = enrichSubmittedReports(
        [
          {
            tenantId: 'store-1',
            userId: 'user-1',
            transactionIds: ['txn-1'],
            expenseIds: ['exp-1'],
          },
        ],
        userNames,
        transactionRefNames,
        expenseRefNames,
      );
      expect('tenantId' in result).toBe(false);
      expect('transactionIds' in result).toBe(false);
      expect('expenseIds' in result).toBe(false);
      expect(result.submittedBy).toBe('Jane Doe');
      expect(result.transactions).toEqual(['TXN1001']);
      expect(result.expenses).toEqual(['Ice']);
    });

    it('falls back to the raw id for a reference that could not be resolved (e.g. a hard-deleted record)', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const [result] = enrichSubmittedReports(
        [{ userId: 'user-1', transactionIds: ['missing-txn'], expenseIds: [] }],
        userNames,
        new Map(),
        new Map(),
      );
      expect(result.transactions).toEqual(['missing-txn']);
      expect(result.expenses).toEqual([]);
    });
  });

  describe('enrichStaffTimeLogs()', () => {
    it('resolves userId to staffName and never touches a photoUrl field (the caller never selects it)', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const [result] = enrichStaffTimeLogs(
        [{ id: 'log-1', userId: 'user-1', eventType: 'TIME_IN', latitude: 14.6, longitude: 121.0 }],
        userNames,
      );
      expect(result.staffName).toBe('Jane Doe');
      expect('userId' in result).toBe(false);
      expect('photoUrl' in result).toBe(false);
      expect(result.eventType).toBe('TIME_IN');
    });
  });

  describe('enrichSubmittedInventoryReportsTop()', () => {
    it('drops tenantId and resolves the top-level userId to submittedByUser (distinct from inventorySnapshot.submittedBy)', () => {
      const userNames = buildIdNameMap([{ id: 'user-1', name: 'Jane Doe' }]);
      const [result] = enrichSubmittedInventoryReportsTop(
        [{ tenantId: 'store-1', userId: 'user-1' }],
        userNames,
      );
      expect('tenantId' in result).toBe(false);
      expect(result.submittedByUser).toBe('Jane Doe');
    });
  });
});
