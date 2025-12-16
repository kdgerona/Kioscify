'use client';

import { X, Receipt } from 'lucide-react';
import { Expense } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface ExpenseListModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: Expense[];
  primaryColor: string;
}

export default function ExpenseListModal({
  isOpen,
  onClose,
  expenses,
  primaryColor,
}: ExpenseListModalProps) {
  if (!isOpen) return null;

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      SUPPLIES: 'bg-yellow-100 text-yellow-800',
      UTILITIES: 'bg-purple-100 text-purple-800',
      RENT: 'bg-red-100 text-red-800',
      SALARIES: 'bg-blue-100 text-blue-800',
      MARKETING: 'bg-pink-100 text-pink-800',
      MAINTENANCE: 'bg-orange-100 text-orange-800',
      TRANSPORTATION: 'bg-emerald-100 text-emerald-800',
      MISCELLANEOUS: 'bg-gray-100 text-gray-800',
    };
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div
          className="px-6 py-4 rounded-t-xl flex items-center justify-between text-black"
          style={{ backgroundColor: primaryColor }}
        >
          <div>
            <h2 className="text-2xl font-bold">All Expenses</h2>
            <p className="text-sm opacity-90 mt-1">
              {expenses.length} expense(s) • Total: {formatCurrency(totalExpenses)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-black hover:bg-opacity-10 rounded-full p-2 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {expenses.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No expenses found
            </div>
          ) : (
            <div className="space-y-4">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="border-2 border-red-200 bg-red-50 rounded-lg p-5 hover:border-red-300 transition"
                >
                  {/* Expense Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">
                        {expense.description}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDateTime(expense.date)}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getCategoryColor(
                            expense.category
                          )}`}
                        >
                          {expense.category}
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-2xl font-bold text-red-600">
                        {formatCurrency(expense.amount)}
                      </p>
                    </div>
                  </div>

                  {/* User Info */}
                  {expense.user && (
                    <div className="bg-white rounded-lg p-3 border border-red-200 mb-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <span className="font-semibold mr-2">Recorded by:</span>
                        <span>{expense.user.email}</span>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {expense.notes && (
                    <div className="bg-white rounded-lg p-3 border border-gray-200 mb-3">
                      <h4 className="text-xs font-bold text-gray-700 mb-1">Notes:</h4>
                      <p className="text-sm text-gray-600">{expense.notes}</p>
                    </div>
                  )}

                  {/* Receipt Indicator */}
                  {expense.receipt && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center">
                      <Receipt className="w-4 h-4 text-blue-600 mr-2" />
                      <span className="text-xs font-semibold text-blue-700">
                        Receipt attached
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {expenses.length > 0 && (
          <div className="px-6 py-4 border-t-2 border-red-200 bg-red-50 rounded-b-xl">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-gray-800">
                Total Expenses:
              </span>
              <span className="text-2xl font-bold text-red-600">
                {formatCurrency(totalExpenses)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
