import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { safeReactotron } from "../utils/reactotron";
import { setUnauthorizedHandler } from "../utils/authEvents";

const TOKEN_KEY = "@kioscify:auth_token";
const USER_KEY = "@kioscify:user";

export interface User {
  id: string;
  tenantId?: string;
  brandId?: string;
  companyId?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: "STORE_ADMIN" | "CASHIER" | "ADMIN";
  isFirstLogin?: boolean;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  initializing: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string, storeSlug: string) => Promise<{ mustChangePassword: boolean; stores: any[] }>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  const login = useCallback(
    async (username: string, password: string, storeSlug: string) => {
      setLoading(true);
      setError(null);

      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!apiUrl) {
          throw new Error(
            "API URL is not configured. Please set EXPO_PUBLIC_API_URL in your .env file"
          );
        }

        const requestBody = {
          username,
          password,
          storeSlug,
        };

        console.log("🔵 LOGIN REQUEST:");
        console.log("  URL:", `${apiUrl}/auth/login`);
        console.log("  Body:", JSON.stringify(requestBody, null, 2));

        safeReactotron.display({
          name: "LOGIN REQUEST",
          value: { url: `${apiUrl}/auth/login`, body: requestBody },
          preview: "Attempting login..."
        });

        const response = await fetch(`${apiUrl}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        console.log("🔵 RESPONSE STATUS:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.log("🔴 ERROR RESPONSE:", errorText);

          safeReactotron.display({
            name: "LOGIN ERROR",
            value: { status: response.status, error: errorText },
            preview: "Login failed",
            important: true
          });

          if (response.status === 401) {
            throw new Error("Invalid username or password");
          }
          throw new Error("Login failed. Please try again.");
        }

        const data = await response.json();
        console.log("🟢 LOGIN SUCCESS:", { userId: data.user?.id, role: data.user?.role });

        safeReactotron.display({
          name: "LOGIN SUCCESS",
          value: { user: data.user, hasToken: !!data.accessToken },
          preview: `Logged in as ${data.user?.username}`
        });

        // Store token and user data
        await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));

        // Persist accessible stores for store switcher
        if (data.stores && data.stores.length > 0) {
          await AsyncStorage.setItem("@kioscify:accessible_stores", JSON.stringify(data.stores));
        }

        setToken(data.accessToken);
        setUser(data.user);
        setMustChangePassword(!!data.mustChangePassword);
        return { mustChangePassword: !!data.mustChangePassword, stores: data.stores ?? [] };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      if (apiUrl && storedToken) {
        // Revoke the token server-side (blacklist + end session record).
        // Ignore failures — the token may already be expired/invalid, but
        // the user must still be logged out locally.
        await fetch(`${apiUrl}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${storedToken}` },
        });
      }
    } catch {
      // no-op
    } finally {
      setUser(null);
      setToken(null);
      setError(null);
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
    }
  }, []);

  const loadStoredAuth = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (err) {
      console.error("Failed to load stored auth:", err);
      // Clear invalid stored data
      await logout();
    } finally {
      setInitializing(false);
    }
  }, [logout]);

  // Auto-load stored auth on mount
  React.useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  // Any authenticated request that comes back 401 (expired/invalid token) logs the user out
  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      router.replace("/");
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) throw new Error('API URL not configured');
    const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
    const response = await fetch(`${apiUrl}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${storedToken}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || 'Failed to change password');
    }
    // Update stored user — clear first-login flag
    if (user) {
      const updated = { ...user, isFirstLogin: false, mustChangePassword: false };
      setUser(updated);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        initializing,
        mustChangePassword,
        login,
        logout,
        loadStoredAuth,
        clearError,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
