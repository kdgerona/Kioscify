import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "@kioskly:auth_token";

export const getApiUrl = (): string => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error(
      "API URL is not configured. Please set EXPO_PUBLIC_API_URL in your .env file"
    );
  }
  return apiUrl;
};

export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error("Failed to get auth token:", error);
    return null;
  }
};

export interface ApiRequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

/**
 * Make an authenticated API request
 * @param endpoint - API endpoint (e.g., '/products')
 * @param options - Fetch options with optional requiresAuth flag
 * @returns Response object
 */
export const apiRequest = async (
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> => {
  const { requiresAuth = true, headers = {}, ...restOptions } = options;

  const apiUrl = getApiUrl();
  const url = `${apiUrl}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  // Add authentication token if required
  if (requiresAuth) {
    const token = await getAuthToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...restOptions,
    headers: requestHeaders,
  });

  return response;
};

/**
 * Make an authenticated GET request
 */
export const apiGet = async (
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "GET",
    ...options,
  });
};

/**
 * Make an authenticated POST request
 */
export const apiPost = async (
  endpoint: string,
  data?: any,
  options: ApiRequestOptions = {}
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
};

/**
 * Make an authenticated PUT request
 */
export const apiPut = async (
  endpoint: string,
  data?: any,
  options: ApiRequestOptions = {}
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
};

/**
 * Make an authenticated PATCH request
 */
export const apiPatch = async (
  endpoint: string,
  data?: any,
  options: ApiRequestOptions = {}
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
};

/**
 * Make an authenticated DELETE request
 */
export const apiDelete = async (
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> => {
  return apiRequest(endpoint, {
    method: "DELETE",
    ...options,
  });
};
