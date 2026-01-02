"use client";

import { X } from "lucide-react";
import { Transaction } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface TransactionListModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  primaryColor: string;
  title?: string;
}

export default function TransactionListModal({
  isOpen,
  onClose,
  transactions,
  primaryColor,
  title = "All Transactions",
}: TransactionListModalProps) {
  if (!isOpen) return null;

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPaymentMethodColor = (method: string) => {
    const colors = {
      CASH: "bg-green-100 text-green-800",
      CARD: "bg-purple-100 text-purple-800",
      GCASH: "bg-blue-100 text-blue-800",
      PAYMAYA: "bg-amber-100 text-amber-800",
      ONLINE: "bg-gray-100 text-gray-800",
      FOODPANDA: "bg-pink-100 text-pink-800",
    };
    return colors[method as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div
          className="px-4 py-3 sm:px-6 sm:py-4 rounded-t-xl flex items-center justify-between text-black"
          style={{ backgroundColor: primaryColor }}
        >
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold">{title}</h2>
            <p className="text-xs sm:text-sm opacity-90 mt-1">
              {transactions.length} transaction(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-black hover:bg-opacity-10 rounded-full p-2 transition flex-shrink-0"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No transactions found
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="border-2 border-gray-200 rounded-lg p-3 sm:p-4 md:p-5 hover:border-gray-300 transition"
                >
                  {/* Transaction Header */}
                  <div className="flex justify-between items-start gap-2 mb-3 sm:mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 break-all">
                        {transaction.transactionId}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1">
                        {formatDateTime(transaction.timestamp)}
                      </p>
                      {transaction.user && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          Cashier: {transaction.user.email}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                        {formatCurrency(transaction.total)}
                      </p>
                      <span
                        className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-bold mt-2 ${getPaymentMethodColor(
                          transaction.paymentMethod
                        )}`}
                      >
                        {transaction.paymentMethod}
                      </span>
                    </div>
                  </div>

                  {/* Items Breakdown */}
                  {transaction.items && transaction.items.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                      <h4 className="text-xs sm:text-sm font-bold text-gray-700 mb-2 sm:mb-3">
                        Items:
                      </h4>
                      <div className="space-y-2">
                        {transaction.items.map((item) => (
                          <div
                            key={item.id}
                            className="border-l-2 border-gray-300 pl-2 sm:pl-3 mb-2 sm:mb-3"
                          >
                            {/* Main product line */}
                            <div className="flex justify-between items-start gap-2 mb-1">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs sm:text-sm font-medium text-gray-800">
                                  {item.quantity}x{" "}
                                  {item.product?.name || "Unknown Product"}
                                  {item.size && (
                                    <span className="text-xs text-gray-600">
                                      {" "}
                                      ({item.size.name})
                                    </span>
                                  )}
                                </p>
                              </div>
                              <p className="text-xs sm:text-sm font-semibold text-gray-800 flex-shrink-0">
                                {formatCurrency(item.subtotal)}
                              </p>
                            </div>

                            {/* Price breakdown */}
                            <div className="ml-2 sm:ml-4 space-y-0.5">
                              {/* Base product price */}
                              <div className="flex justify-between items-center gap-2 text-xs text-gray-600">
                                <span className="truncate">Base price × {item.quantity}</span>
                                <span className="flex-shrink-0">
                                  {formatCurrency(
                                    (item.product?.price || 0) * item.quantity
                                  )}
                                </span>
                              </div>

                              {/* Size modifier */}
                              {item.size && item.size.priceModifier !== 0 && (
                                <div className="flex justify-between items-center gap-2 text-xs text-gray-600">
                                  <span className="truncate">
                                    Size modifier ({item.size.name}) ×{" "}
                                    {item.quantity}
                                  </span>
                                  <span className="flex-shrink-0">
                                    {formatCurrency(
                                      item.size.priceModifier * item.quantity
                                    )}
                                  </span>
                                </div>
                              )}

                              {/* Addons with prices */}
                              {item.addons && item.addons.length > 0 && (
                                <>
                                  {item.addons.map(
                                    (addonItem: any, addonIndex: number) => {
                                      const addon =
                                        addonItem.addon || addonItem;
                                      return (
                                        <div
                                          key={addonIndex}
                                          className="flex justify-between items-center gap-2 text-xs text-gray-600"
                                        >
                                          <span className="truncate">
                                            + {addon.name || "Unknown Addon"} ×{" "}
                                            {item.quantity}
                                          </span>
                                          <span className="flex-shrink-0">
                                            {formatCurrency(
                                              (addon.price || 0) * item.quantity
                                            )}
                                          </span>
                                        </div>
                                      );
                                    }
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-gray-300 mt-2 sm:mt-3 pt-2 sm:pt-3">
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs sm:text-sm font-semibold text-gray-700">
                            Subtotal:
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-gray-900">
                            {formatCurrency(transaction.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment Details */}
                  {transaction.paymentMethod === "CASH" &&
                    transaction.cashReceived && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                        <h4 className="text-xs font-bold text-green-800 mb-1 sm:mb-2">
                          Cash Payment
                        </h4>
                        <div className="space-y-1">
                          <div className="flex justify-between gap-2 text-xs">
                            <span className="text-green-700">
                              Cash Received:
                            </span>
                            <span className="font-semibold text-green-900 flex-shrink-0">
                              {formatCurrency(transaction.cashReceived)}
                            </span>
                          </div>
                          {transaction.change !== null &&
                            transaction.change !== undefined && (
                              <div className="flex justify-between gap-2 text-xs">
                                <span className="text-green-700">Change:</span>
                                <span className="font-semibold text-green-900 flex-shrink-0">
                                  {formatCurrency(transaction.change)}
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                  {transaction.paymentMethod !== "CASH" &&
                    transaction.referenceNumber && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                        <h4 className="text-xs font-bold text-blue-800 mb-1">
                          Reference Number
                        </h4>
                        <p className="text-xs text-blue-700 font-mono break-all">
                          {transaction.referenceNumber}
                        </p>
                      </div>
                    )}

                  {/* Remarks */}
                  {transaction.remarks && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 sm:p-3">
                      <h4 className="text-xs font-bold text-yellow-800 mb-1">
                        Remarks:
                      </h4>
                      <p className="text-xs text-yellow-700 break-words">
                        {transaction.remarks}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {transactions.length > 0 && (
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-t-2 border-gray-200 bg-gray-50 rounded-b-xl">
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-black">
                Total Transactions:
              </span>
              <span className="text-xl sm:text-2xl font-bold text-black">
                {transactions.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
