import {
  toCsv,
  toKeyValueCsv,
  flattenTransactions,
  flattenSubmittedReports,
  flattenSubmittedInventoryReports,
} from './export-csv.util';

describe('export-csv.util', () => {
  describe('toCsv()', () => {
    it('returns an empty string for an empty array', () => {
      expect(toCsv([])).toBe('');
    });

    it('writes a header row and one row per record', () => {
      const csv = toCsv([
        { id: 'a', name: 'Widget', price: 9.99 },
        { id: 'b', name: 'Gadget', price: 4.5 },
      ]);
      const lines = csv.trim().split('\r\n');
      expect(lines[0]).toBe('id,name,price');
      expect(lines[1]).toBe('a,Widget,9.99');
      expect(lines[2]).toBe('b,Gadget,4.5');
    });

    it('unions columns across rows so a field missing on one row still gets an empty cell, not a dropped column', () => {
      const csv = toCsv([
        { id: 'a', name: 'Widget' },
        { id: 'b', name: 'Gadget', notes: 'fragile' },
      ]);
      const lines = csv.trim().split('\r\n');
      expect(lines[0]).toBe('id,name,notes');
      expect(lines[1]).toBe('a,Widget,');
      expect(lines[2]).toBe('b,Gadget,fragile');
    });

    it('quotes and escapes fields containing commas, quotes, or newlines', () => {
      const csv = toCsv([{ id: 'a', notes: 'has, a comma' }, { id: 'b', notes: 'has "quotes"' }, { id: 'c', notes: 'line1\nline2' }]);
      const lines = csv.trim().split('\r\n');
      expect(lines[1]).toBe('a,"has, a comma"');
      expect(lines[2]).toBe('b,"has ""quotes"""');
      expect(lines[3]).toBe('c,"line1\nline2"');
    });

    it('serializes Dates as ISO strings, arrays of primitives as semicolon-joined, null/undefined as empty', () => {
      const date = new Date('2026-01-15T00:00:00.000Z');
      const csv = toCsv([{ id: 'a', createdAt: date, tags: ['x', 'y'], notes: null, other: undefined }]);
      const lines = csv.trim().split('\r\n');
      expect(lines[0]).toBe('id,createdAt,tags,notes,other');
      expect(lines[1]).toBe('a,2026-01-15T00:00:00.000Z,x; y,,');
    });

    it('serializes a nested object (array of objects, or a plain object) as a JSON string cell', () => {
      const csv = toCsv([{ id: 'a', meta: { foo: 'bar' } }]);
      const lines = csv.trim().split('\r\n');
      expect(lines[1]).toBe('a,"{""foo"":""bar""}"');
    });
  });

  describe('toKeyValueCsv()', () => {
    it('writes a field/value pair per row for a single flat record', () => {
      const csv = toKeyValueCsv({ id: 'company-1', name: 'Acme Corp', isActive: true });
      const lines = csv.trim().split('\r\n');
      expect(lines).toEqual(['field,value', 'id,company-1', 'name,Acme Corp', 'isActive,true']);
    });
  });

  describe('flattenTransactions()', () => {
    it('splits into a parent transactions.csv and a linked transaction-items.csv, folding addon names into the item row', () => {
      const { transactionsCsv, itemsCsv } = flattenTransactions([
        {
          transactionId: 'TXN1001',
          total: 100,
          items: [
            {
              productId: 'prod-1',
              quantity: 2,
              sizeId: null,
              preferenceId: null,
              subtotal: 100,
              discountAmount: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              addons: [{ name: 'Extra Cheese' }, { name: 'Bacon' }],
            },
          ],
        },
      ]);

      const txnLines = transactionsCsv.trim().split('\r\n');
      expect(txnLines[0]).toBe('transactionId,total');
      expect(txnLines[1]).toBe('TXN1001,100');

      const itemLines = itemsCsv.trim().split('\r\n');
      const itemHeader = itemLines[0].split(',');
      expect(itemHeader).toEqual(
        expect.arrayContaining(['transactionId', 'productId', 'quantity', 'addonNames']),
      );
      // The link column holds the parent's human-facing receipt code
      // (transactionId), never a raw Mongo id.
      expect(itemHeader).not.toContain('id');
      expect(itemLines[1]).toContain('TXN1001');
      expect(itemLines[1]).toContain('Extra Cheese; Bacon');
    });

    it('produces no item rows for a transaction with an empty items array', () => {
      const { itemsCsv } = flattenTransactions([{ transactionId: 'TXN1001', total: 0, items: [] }]);
      expect(itemsCsv).toBe('');
    });
  });

  describe('flattenSubmittedReports()', () => {
    it('flattens scalar snapshot fields into real columns and formats the breakdowns as human-readable text, not JSON', () => {
      const csv = flattenSubmittedReports([
        {
          id: 'report-1',
          reportDate: '2026-01-15',
          salesSnapshot: {
            totalAmount: 500,
            transactionCount: 10,
            averageTransaction: 50,
            totalItemsSold: 25,
            // Real shape: Record<method, {total, count}> — see
            // ReportsService.buildPaymentMethodBreakdown.
            paymentMethodBreakdown: { CASH: { total: 300, count: 2 }, CARD: { total: 200, count: 1 } },
            // Real shape: an array (ReportsService's productMap), not a
            // dynamic-keyed object.
            salesByProduct: [
              { productName: 'Latte', sizeName: 'Large', quantity: 3, amount: 300 },
              { productName: 'Mango Calamansi', quantity: 2, amount: 200 },
            ],
          },
          expensesSnapshot: {
            totalAmount: 100,
            expenseCount: 2,
            averageExpense: 50,
            categoryBreakdown: { SUPPLIES: { total: 80, count: 1 }, MISCELLANEOUS: { total: 20, count: 1 } },
          },
          summarySnapshot: {
            grossProfit: 400,
            profitMargin: 0.8,
            netRevenue: 400,
          },
        },
      ]);

      const lines = csv.trim().split('\r\n');
      const header = lines[0].split(',');
      expect(header).toEqual(
        expect.arrayContaining([
          'id',
          'reportDate',
          'salesTotalAmount',
          'salesTransactionCount',
          'salesAverageTransaction',
          'salesTotalItemsSold',
          'salesPaymentMethodBreakdown',
          'salesByProduct',
          'expensesTotalAmount',
          'expensesExpenseCount',
          'expensesAverageExpense',
          'expensesCategoryBreakdown',
          'summaryGrossProfit',
          'summaryProfitMargin',
          'summaryNetRevenue',
        ]),
      );
      // No raw "salesSnapshot"/"expensesSnapshot"/"summarySnapshot" column — those composites were unpacked, not kept.
      expect(header).not.toContain('salesSnapshot');
      expect(header).not.toContain('expensesSnapshot');
      expect(header).not.toContain('summarySnapshot');

      // No JSON braces/quotes anywhere in the row — readable "key: value" text instead.
      expect(lines[1]).not.toContain('{');
      expect(lines[1]).toContain('CASH: 300 (2)');
      expect(lines[1]).toContain('CARD: 200 (1)');
      expect(lines[1]).toContain('Latte (Large): qty 3, amount 300');
      expect(lines[1]).toContain('Mango Calamansi: qty 2, amount 200');
      expect(lines[1]).toContain('SUPPLIES: 80 (1)');
    });

    it('renders an empty cell (not "null"/"undefined") when salesByProduct is absent', () => {
      const csv = flattenSubmittedReports([
        {
          id: 'report-1',
          salesSnapshot: {
            totalAmount: 0,
            transactionCount: 0,
            averageTransaction: 0,
            totalItemsSold: 0,
            paymentMethodBreakdown: {},
          },
          expensesSnapshot: { totalAmount: 0, expenseCount: 0, averageExpense: 0, categoryBreakdown: {} },
          summarySnapshot: { grossProfit: 0, profitMargin: 0, netRevenue: 0 },
        },
      ]);
      const lines = csv.trim().split('\r\n');
      expect(lines[1]).not.toContain('null');
      expect(lines[1]).not.toContain('undefined');
    });
  });

  describe('flattenSubmittedInventoryReports()', () => {
    it('splits into a parent reports.csv and a linked item-rows csv, formatting expiration batches', () => {
      const { reportsCsv, itemsCsv } = flattenSubmittedInventoryReports([
        {
          reportDate: '2026-01-15',
          submittedAt: new Date('2026-01-15T14:30:00.000Z'),
          inventorySnapshot: {
            totalItems: 1,
            submittedBy: 'user-1',
            items: [
              {
                inventoryItemId: 'item-1',
                itemName: 'Milk',
                category: 'Dairy',
                unit: 'liters',
                quantity: 10,
                recordDate: new Date('2026-01-15T00:00:00.000Z'),
                expirationBatches: [
                  { quantity: 5, expirationDate: new Date('2026-02-01T00:00:00.000Z') },
                  { quantity: 5, expirationDate: null },
                ],
              },
            ],
          },
        },
      ]);

      const reportLines = reportsCsv.trim().split('\r\n');
      expect(reportLines[0]).toEqual(expect.stringContaining('totalItems'));
      expect(reportLines[0]).toEqual(expect.stringContaining('submittedBy'));
      expect(reportLines[0]).not.toContain('inventorySnapshot');

      const itemLines = itemsCsv.trim().split('\r\n');
      const itemHeader = itemLines[0].split(',');
      expect(itemHeader).toEqual(
        expect.arrayContaining(['reportSubmittedAt', 'itemName', 'expirationBatches']),
      );
      // inventoryItemId dropped — itemName already identifies the item.
      // reportId dropped too — reportSubmittedAt (a real timestamp, not a
      // raw Mongo id) is what links this row back to its parent report.
      expect(itemHeader).not.toContain('inventoryItemId');
      expect(itemHeader).not.toContain('reportId');
      expect(itemLines[1]).toContain('2026-01-15T14:30:00.000Z');
      expect(itemLines[1]).toContain('5@2026-02-01T00:00:00.000Z; 5@none');
    });
  });
});
