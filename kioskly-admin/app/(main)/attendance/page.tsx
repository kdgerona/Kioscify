"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { hasPrivilege } from "@/lib/privileges";
import { api } from "@/lib/api";
import { formatDateTime, formatUserName } from "@/lib/utils";
import { Clock, X, RefreshCw, LogIn, LogOut, ImageOff } from "lucide-react";
import type { StaffTimeLog, TimeLogEventType, User } from "@/types";
import { useTenant } from "@/contexts/TenantContext";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EVENT_TYPE_LABEL: Record<TimeLogEventType, string> = {
  TIME_IN: "Time In",
  TIME_OUT: "Time Out",
};

const EVENT_TYPE_CLASS: Record<TimeLogEventType, string> = {
  TIME_IN: "bg-green-100 text-green-800",
  TIME_OUT: "bg-gray-200 text-gray-700",
};

function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export default function AttendancePage() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const primaryColor =
    brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const activeTabColor = "#1f2937";

  useEffect(() => {
    if (!hasPrivilege("users", "read")) router.replace("/dashboard");
  }, [router]);

  const [logs, setLogs] = useState<StaffTimeLog[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);

  const [filterUserId, setFilterUserId] = useState<string>("ALL");
  const [filterEventType, setFilterEventType] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const clearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setPage(1);
  };

  // Load staff list for the filter dropdown
  useEffect(() => {
    if (!tenant?.id) return;
    api
      .getStoreUsers(tenant.id)
      .then(setStaff)
      .catch((error) => console.error("Failed to load staff list:", error));
  }, [tenant?.id]);

  const loadLogs = useCallback(
    async (isInitial = false) => {
      if (!tenant?.id) return;
      try {
        if (isInitial) {
          setInitialLoading(true);
        } else {
          setIsFiltering(true);
        }

        const params: {
          userId?: string;
          startDate?: string;
          endDate?: string;
          page?: number;
          limit?: number;
        } = { page, limit: 50 };

        if (filterUserId !== "ALL") {
          params.userId = filterUserId;
        }
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          params.startDate = start.toISOString();
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          params.endDate = end.toISOString();
        }

        // The backend doesn't support filtering by eventType (only userId/date
        // range), so it's applied client-side over the fetched page. Pagination
        // (page/totalPages) reflects the unfiltered server-side result set.
        const result = await api.getStaffTimeLogs(tenant.id, params);
        const filtered =
          filterEventType === "ALL"
            ? result.data
            : result.data.filter((log) => log.eventType === filterEventType);
        setLogs(filtered);
        setTotalPages(result.pagination.totalPages);
      } catch (error) {
        console.error("Failed to load staff time logs:", error);
      } finally {
        setInitialLoading(false);
        setIsFiltering(false);
      }
    },
    [tenant?.id, filterUserId, filterEventType, startDate, endDate, page]
  );

  useEffect(() => {
    const isInitial = isFirstLoad.current;
    isFirstLoad.current = false;
    loadLogs(isInitial);
  }, [loadLogs]);

  const handleFilterUserId = (value: string) => {
    setFilterUserId(value);
    setPage(1);
  };

  const handleFilterEventType = (value: string) => {
    setFilterEventType(value);
    setPage(1);
  };

  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    setPage(1);
  };

  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
    setPage(1);
  };

  if (initialLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Attendance
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          Staff clock-in and clock-out history
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-200 mb-6">
        <div className="space-y-4">
          {/* Date pickers row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <DatePicker
                date={startDate}
                onDateChange={handleStartDateChange}
                placeholder="Start date"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DatePicker
                  date={endDate}
                  onDateChange={handleEndDateChange}
                  placeholder="End date"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={clearDates}
                  className="flex items-center justify-center text-gray-600 hover:text-gray-900 p-2 rounded-lg border border-gray-300 hover:border-gray-400 transition flex-shrink-0"
                  title="Clear dates"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Filters row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Staff member filter */}
            <Select value={filterUserId} onValueChange={handleFilterUserId}>
              <SelectTrigger style={{ color: activeTabColor }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={
                  {
                    "--select-hover-bg": `${primaryColor}20`,
                    "--select-hover-text": activeTabColor,
                  } as React.CSSProperties
                }
              >
                <SelectItem value="ALL">All Staff</SelectItem>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {formatUserName(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Event type filter */}
            <Select value={filterEventType} onValueChange={handleFilterEventType}>
              <SelectTrigger style={{ color: activeTabColor }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={
                  {
                    "--select-hover-bg": `${primaryColor}20`,
                    "--select-hover-text": activeTabColor,
                  } as React.CSSProperties
                }
              >
                <SelectItem value="ALL">All Events</SelectItem>
                <SelectItem value="TIME_IN">Time In</SelectItem>
                <SelectItem value="TIME_OUT">Time Out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={() => loadLogs(false)}
              className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition flex items-center justify-center"
              title="Refresh attendance records"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
        {isFiltering && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2"
              style={{ borderBottomColor: primaryColor }}
            ></div>
          </div>
        )}
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Staff
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Coordinates
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Selfie
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatUserName(log.user)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${EVENT_TYPE_CLASS[log.eventType]}`}
                      >
                        {log.eventType === "TIME_IN" ? (
                          <LogIn className="w-3.5 h-3.5" />
                        ) : (
                          <LogOut className="w-3.5 h-3.5" />
                        )}
                        {EVENT_TYPE_LABEL[log.eventType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {formatCoordinates(log.latitude, log.longitude)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.photoUrl ? (
                        <button
                          onClick={() => setLightboxUrl(log.photoUrl)}
                          className="block w-12 h-12 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80 transition"
                          title="View selfie"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={log.photoUrl}
                            alt={`${formatUserName(log.user)} selfie`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-12 h-12 rounded-lg border border-gray-200 flex items-center justify-center text-gray-300">
                          <ImageOff className="w-5 h-5" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No attendance records found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Photo Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">Selfie</h2>
              <button
                onClick={() => setLightboxUrl(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Staff selfie"
              className="w-full h-auto rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
