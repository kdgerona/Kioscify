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
  try {
    const params = new URLSearchParams();
    if (date) params.append("date", date);

    const queryString = params.toString();
    const endpoint = `/reports/daily${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING DAILY REPORT:", endpoint);

    safeReactotron.display({
      name: "FETCH DAILY REPORT",
      value: { endpoint, date },
      preview: "Fetching daily report from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH REPORT ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH REPORT ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch daily report",
        important: true,
      });

      throw new Error(`Failed to fetch daily report: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 DAILY REPORT FETCHED:", data);

    safeReactotron.display({
      name: "DAILY REPORT FETCHED",
      value: data,
      preview: `Report for ${data.date} fetched successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch daily report:", error);
    throw error;
  }
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
