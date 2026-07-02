import { apiGet, getApiUrl, getAuthToken } from "../utils/api";
import { notifyUnauthorized } from "../utils/authEvents";

export type TimeLogEventType = "TIME_IN" | "TIME_OUT";

export interface TimeLogStatusResponse {
  lastEventType: TimeLogEventType | null;
}

export interface StaffTimeLogResponse {
  id: string;
  eventType: TimeLogEventType;
  latitude: number;
  longitude: number;
  photoUrl: string;
  userId: string;
  tenantId: string;
  createdAt: string;
}

/** Extract a readable message from a JSON (or non-JSON) error response body. */
async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => null);
  if (data && typeof data.message === "string") return data.message;
  if (data && Array.isArray(data.message) && data.message.length > 0) {
    return data.message.join(", ");
  }
  return fallback;
}

/**
 * Get the logged-in user's current clock-in/out state, used to decide whether
 * the next action should be "Time In" or "Time Out".
 */
export const getTimeLogStatus = async (): Promise<TimeLogStatusResponse> => {
  const response = await apiGet("/staff-time-logs/status");
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to load clock-in status"));
  }
  return response.json();
};

/**
 * Submit a clock-in/out event with a selfie photo.
 *
 * Uses `fetch` directly rather than `apiPost` from utils/api.ts: `apiRequest`
 * always forces a `Content-Type: application/json` header, which would break
 * the multipart boundary fetch generates for FormData bodies. Auth-token
 * attachment and the 401 -> notifyUnauthorized() behavior are kept consistent
 * with `apiRequest` by mirroring them here.
 */
export const submitTimeLog = async (
  eventType: TimeLogEventType,
  photoUri: string,
  latitude: number,
  longitude: number,
): Promise<StaffTimeLogResponse> => {
  const apiUrl = getApiUrl();
  const token = await getAuthToken();

  const formData = new FormData();
  formData.append("eventType", eventType);
  formData.append("latitude", String(latitude));
  formData.append("longitude", String(longitude));
  // React Native's FormData accepts this { uri, name, type } shape in place of a Blob.
  formData.append("photo", {
    uri: photoUri,
    name: `selfie-${Date.now()}.jpg`,
    type: "image/jpeg",
  } as unknown as Blob);

  const response = await fetch(`${apiUrl}/staff-time-logs`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Deliberately no Content-Type — fetch sets the multipart boundary automatically.
    },
    body: formData,
  });

  if (response.status === 401) {
    notifyUnauthorized();
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to submit time log"));
  }

  return response.json();
};
