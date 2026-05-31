import { apiGet, apiPost } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";

interface PaymentMethodBreakdown {
  [method: string]: {
    total: number;
    count: number;
  };
}

interface ExpenseCategoryBreakdown {
  [category: string]: {
    total: number;
    count: number;
  };
}

export interface DailyReportResponse {
  date: string;
  period: {
    start: string;
    end: string;
  };
  sales: {
    totalAmount: number;
    transactionCount: number;
    averageTransaction: number;
    totalItemsSold: number;
    paymentMethodBreakdown: PaymentMethodBreakdown;
  };
  expenses: {
    totalAmount: number;
    expenseCount: number;
    averageExpense: number;
    categoryBreakdown: ExpenseCategoryBreakdown;
  };
  summary: {
    grossProfit: number;
    profitMargin: number;
    netRevenue: number;
  };
}

/**
 * Fetch daily report for a specific date
 * @param date - Optional date (defaults to today if not provided)
 * @returns Daily report with sales, expenses, and summary
 */
export const getDailyReport = async (
  date?: string
): Promise<DailyReportResponse> => {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  const queryString = params.toString();
  const endpoint = `/reports/daily${queryString ? `?${queryString}` : ""}`;

  const response = await apiGet(endpoint);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

export interface SubmitReportData {
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  salesSnapshot: {
    totalAmount: number;
    transactionCount: number;
    averageTransaction: number;
    totalItemsSold: number;
    paymentMethodBreakdown: PaymentMethodBreakdown;
  };
  expensesSnapshot: {
    totalAmount: number;
    expenseCount: number;
    averageExpense: number;
    categoryBreakdown: ExpenseCategoryBreakdown;
  };
  summarySnapshot: {
    grossProfit: number;
    profitMargin: number;
    netRevenue: number;
  };
  transactionIds: string[];
  expenseIds: string[];
  notes?: string;
}

/**
 * Submit a daily report to the backend
 */
export const submitReport = async (
  data: SubmitReportData
): Promise<any> => {
  try {
    console.log("🔵 SUBMITTING REPORT:", data);

    safeReactotron.display({
      name: "SUBMIT REPORT",
      value: data,
      preview: `Submitting report for ${data.reportDate}`,
    });

    const response = await apiPost("/submitted-reports", data);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 SUBMIT REPORT ERROR:", errorText);

      safeReactotron.display({
        name: "SUBMIT REPORT ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to submit report",
        important: true,
      });

      throw new Error(`Failed to submit report: ${errorText}`);
    }

    const result = await response.json();
    console.log("🟢 REPORT SUBMITTED:", result);

    safeReactotron.display({
      name: "REPORT SUBMITTED",
      value: result,
      preview: "Report submitted successfully",
    });

    return result;
  } catch (error) {
    console.error("Failed to submit report:", error);
    throw error;
  }
};

export interface DailyReportStats {
  totalReports: number;
  reportsThisMonth: number;
  lastSubmission: {
    date: string;
    submittedAt: string;
  } | null;
}

/**
 * Get daily report statistics including last submission
 * @returns Daily report statistics
 */
export const getDailyReportStats = async (): Promise<DailyReportStats | null> => {
  try {
    const response = await apiGet("/submitted-reports/stats");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    // Supplementary data — silently return null when offline or on any error.
    return null;
  }
};
