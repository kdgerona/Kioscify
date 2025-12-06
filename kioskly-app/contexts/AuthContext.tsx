import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Reactotron from "../ReactotronConfig";

const TOKEN_KEY = "@kioskly:auth_token";
const USER_KEY = "@kioskly:user";

export interface User {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  role: "ADMIN" | "CASHIER";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string, tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (username: string, password: string, tenantId: string) => {
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
          tenantId,
        };

        console.log("🔵 LOGIN REQUEST:");
        console.log("  URL:", `${apiUrl}/auth/login`);
        console.log("  Body:", JSON.stringify(requestBody, null, 2));

        Reactotron.display({
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

          Reactotron.display({
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

        Reactotron.display({
          name: "LOGIN SUCCESS",
          value: { user: data.user, hasToken: !!data.accessToken },
          preview: `Logged in as ${data.user?.username}`
        });

        // Store token and user data
        await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));

        setToken(data.accessToken);
        setUser(data.user);
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
    setUser(null);
    setToken(null);
    setError(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
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
    }
  }, [logout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        logout,
        loadStoredAuth,
        clearError,
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
