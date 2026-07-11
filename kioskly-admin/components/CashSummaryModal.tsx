'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Expense } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface CashSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashSales: number;
  expenses: Expense[];
  title?: string;
}

export default function CashSummaryModal({
  isOpen,
  onClose,
  cashSales,
  expenses,
  title = 'Cash Summary',
}: CashSummaryModalProps) {
  if (!isOpen) return null;

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netCash = cashSales - totalExpenses;

  // Portaled to document.body — an in-place fixed overlay nested this deep
  // in the layout tree renders short at the top edge (see kioscify-company's
  // brands/[brandId]/page.tsx Modal for the investigation notes).
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          <div className="bg-green-50 rounded-xl border-2 border-green-200 overflow-hidden">
            {/* Cash Sales */}
            <div className="flex justify-between items-center p-4 border-b-2 border-green-200">
              <p className="text-sm sm:text-base font-semibold text-green-800">Cash Sales</p>
              <p className="text-lg sm:text-xl font-bold text-green-900">{formatCurrency(cashSales)}</p>
            </div>

            {/* Expenses */}
            <div className="p-4">
              <p className="text-xs sm:text-sm font-bold text-red-700 mb-2">Deducted Expenses</p>
              <div className="space-y-2">
                {expenses.length > 0 ? (
                  expenses.map((expense) => (
                    <div key={expense.id} className="flex justify-between items-center bg-white p-2 sm:p-3 rounded-lg">
                      <div className="flex-1 mr-2 min-w-0">
                        <p className="text-xs sm:text-sm text-red-600 truncate">{expense.description}</p>
                        <p className="text-xs text-gray-400">{expense.category}</p>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-red-600 flex-shrink-0">
                        -{formatCurrency(expense.amount)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between items-center bg-white p-2 sm:p-3 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-400 italic">No expenses</p>
                    <p className="text-xs sm:text-sm font-semibold text-gray-400">-{formatCurrency(0)}</p>
                  </div>
                )}
              </div>

              {expenses.length > 0 && (
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-green-200">
                  <p className="text-xs sm:text-sm text-red-700 font-semibold">Total Expenses</p>
                  <p className="text-xs sm:text-sm font-bold text-red-600">-{formatCurrency(totalExpenses)}</p>
                </div>
              )}
            </div>

            {/* Net Cash */}
            <div className="flex justify-between items-center p-4 border-t-2 border-green-200 bg-green-100">
              <p className="text-sm sm:text-base font-semibold text-green-800">Net Cash</p>
              <p className={`text-lg sm:text-xl font-bold ${netCash >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {formatCurrency(netCash)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
