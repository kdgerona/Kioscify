import { apiGet, apiPost } from "../utils/api";
import type { DailyReportResponse, SubmitReportData } from "./reportService";

export type ShiftReportResponse = DailyReportResponse;

export interface ShiftReportStats {
  totalReports: number;
  reportsThisMonth: number;
  lastSubmission: {
    date: string;
    submittedAt: string;
  } | null;
}

export const getShiftReport = async (
  date?: string
): Promise<ShiftReportResponse> => {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  const queryString = params.toString();
  const endpoint = `/reports/user-shift${queryString ? `?${queryString}` : ""}`;
  const response = await apiGet(endpoint);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

export const submitShiftReport = async (
  data: SubmitReportData
): Promise<any> => {
  const response = await apiPost("/user-shift-reports", data);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to submit shift report: ${errorText}`);
  }
  return response.json();
};

export const getShiftReportStats = async (): Promise<ShiftReportStats | null> => {
  try {
    const response = await apiGet("/user-shift-reports/stats");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    return null;
  }
};

export const getTodayShiftCount = async (): Promise<number> => {
  try {
    const response = await apiGet("/user-shift-reports/today-count");
    if (!response.ok) return 0;
    const data = await response.json();
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
};
