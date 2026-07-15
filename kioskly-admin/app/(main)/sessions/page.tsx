"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import { hasPrivilege } from "@/lib/privileges";
import { formatRole } from "@/lib/utils";
import type { UserSession, SessionStatus } from "@/types";
import { Clock, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Debounce hook — mirrors the pattern used in transactions/expenses pages
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  ACTIVE: "Active",
  ENDED: "Ended",
  EXPIRED: "Expired",
};

const STATUS_CLASS: Record<SessionStatus, string> = {
  ACTIVE: "text-green-600 font-medium",
  ENDED: "text-gray-400 font-medium",
  EXPIRED: "text-amber-600 font-medium",
};

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "—";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Safari\//.test(userAgent)
        ? "Safari"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : "Unknown browser";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

export default function SessionsPage() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor = "#1f2937";

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<SessionStatus | "">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (!hasPrivilege("users", "read")) {
      router.replace("/dashboard");
    }
  }, [router]);

  const fetchSessions = useCallback(async () => {
    if (!tenant?.id) return;
    setIsFiltering(true);
    try {
      const result = await api.getStoreSessions(tenant.id, {
        search: debouncedSearchTerm || undefined,
        status: status || undefined,
        page,
        limit: 20,
      });
      setSessions(result.data);
      setTotalPages(result.pagination.totalPages);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setIsFiltering(false);
      setInitialLoading(false);
    }
  }, [tenant?.id, debouncedSearchTerm, status, page]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">Login history for this store&apos;s Admins and Cashiers</p>
      </div>

      <div className="mb-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, username, or email"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Select
          value={status || "all"}
          onValueChange={(v) => { setStatus(v === "all" ? "" : (v as SessionStatus)); setPage(1); }}
        >
          <SelectTrigger className="w-[160px]" style={{ color: textColor }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': textColor } as React.CSSProperties}>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ENDED">Ended</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {initialLoading ? (
        <div className="text-center py-12 text-gray-500">Loading sessions...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative">
          {isFiltering && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Login Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Logout Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <p>{session.user.firstName} {session.user.lastName}</p>
                      <p className="text-xs font-mono text-gray-400">{session.user.username}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatRole(session.user.role)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      <Clock className="h-3.5 w-3.5 inline mr-1.5 text-gray-400" />
                      {new Date(session.loginAt).toLocaleString("en-US", { timeZone: "Asia/Manila" })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {session.loggedOutAt ? new Date(session.loggedOutAt).toLocaleString("en-US", { timeZone: "Asia/Manila" }) : "—"}
                    </td>
                    <td className={`px-6 py-4 text-sm ${STATUS_CLASS[session.status]}`}>
                      {STATUS_LABEL[session.status]}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-500">{session.ipAddress ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{describeDevice(session.userAgent)}</td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No sessions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
