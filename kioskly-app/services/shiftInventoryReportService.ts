import { apiPost } from "../utils/api";
import type {
  InventoryItemSnapshot,
} from "./submittedInventoryReportService";

export type { InventoryItemSnapshot };

export interface ShiftInventoryReportPayload {
  reportDate: string;
  inventorySnapshot: {
    items: InventoryItemSnapshot[];
    totalItems: number;
    submittedBy: string;
  };
  notes?: string;
  submittedAt?: string;
  clientId?: string;
}

export const submitShiftInventoryReport = async (
  data: ShiftInventoryReportPayload
): Promise<any> => {
  const response = await apiPost("/user-shift-inventory-reports", data);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to submit shift inventory report: ${errorText}`);
  }
  return response.json();
};
