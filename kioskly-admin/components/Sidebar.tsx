"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  Package,
  FolderOpen,
  Settings,
  LogOut,
  Store,
  Boxes,
  FileText,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  subItems?: {
    name: string;
    href: string;
    icon: any;
  }[];
}

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Submitted Reports", href: "/submitted-reports", icon: FileText },
  { name: "Inventory", href: "/inventory", icon: Boxes },
  {
    name: "Inventory Reports",
    href: "#",
    icon: ClipboardList,
    subItems: [
      { name: "Reports", href: "/inventory-reports", icon: FileText },
      { name: "Progression", href: "/inventory-progression", icon: TrendingUp },
      { name: "Alerts", href: "/inventory-alerts", icon: AlertTriangle },
    ]
  },
  { name: "Products", href: "/products", icon: Package },
  { name: "Categories", href: "/categories", icon: FolderOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Auto-expand parent menu when submenu item is active
  useEffect(() => {
    navigation.forEach((item) => {
      if (item.subItems) {
        const hasActiveSubItem = item.subItems.some(
          (subItem) => pathname === subItem.href || pathname?.startsWith(subItem.href + "/")
        );
        if (hasActiveSubItem && !expandedItems.includes(item.name)) {
          setExpandedItems((prev) => [...prev, item.name]);
        }
      }
    });
  }, [pathname]);

  const handleLogout = () => {
    api.logout();
  };

  // Get tenant theme colors with fallbacks
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const backgroundColor = tenant?.themeColors?.background || "#ffffff";
  const textColor = tenant?.themeColors?.text || "#1f2937";

  return (
    <div
      className="flex flex-col h-full w-64 border-r shadow-sm"
      style={{
        backgroundColor: backgroundColor,
        color: textColor,
      }}
    >
      <div
        className="p-6 border-b"
        style={{ borderColor: `${primaryColor}20` }}
      >
        <div className="flex items-center space-x-3">
          {tenant?.logoUrl ? (
            <div className="relative w-10 h-10 flex-shrink-0">
              <Image
                src={tenant.logoUrl}
                alt={tenant.name}
                fill
                className="object-contain border-2 border-white rounded-full"
              />
            </div>
          ) : (
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Store className="w-6 h-6" style={{ color: primaryColor }} />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold" style={{ color: textColor }}>
              {tenant?.name || "Kioskly"}
            </h2>
            <p className="text-xs opacity-60">Admin Panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedItems.includes(item.name);
          const isSubItemActive = hasSubItems && item.subItems?.some(
            (subItem) => pathname === subItem.href || pathname?.startsWith(subItem.href + "/")
          );

          const toggleExpanded = () => {
            setExpandedItems((prev) =>
              prev.includes(item.name)
                ? prev.filter((name) => name !== item.name)
                : [...prev, item.name]
            );
          };

          return (
            <div key={item.name}>
              {hasSubItems ? (
                <div>
                  <button
                    onClick={toggleExpanded}
                    className={cn(
                      "flex items-center justify-between w-full px-4 py-3 rounded-lg transition-all duration-200",
                      isSubItemActive ? "shadow-md" : ""
                    )}
                    style={
                      isSubItemActive
                        ? {
                            backgroundColor: "#ffffff",
                            color: "#000000",
                            borderLeft: `3px solid ${primaryColor}`,
                          }
                        : {
                            color: "#000000",
                            opacity: 0.7,
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isSubItemActive) {
                        e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                        e.currentTarget.style.opacity = "1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSubItemActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.opacity = "0.7";
                      }
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-2 space-y-1">
                      {item.subItems?.map((subItem) => {
                        const isSubActive = pathname === subItem.href;
                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            className={cn(
                              "flex items-center space-x-3 px-4 py-2 rounded-lg transition-all duration-200",
                              isSubActive ? "shadow-sm" : ""
                            )}
                            style={
                              isSubActive
                                ? {
                                    backgroundColor: "#ffffff",
                                    color: "#000000",
                                    fontWeight: "600",
                                    borderLeft: `3px solid ${primaryColor}`,
                                  }
                                : {
                                    color: "#000000",
                                    opacity: 0.6,
                                  }
                            }
                            onMouseEnter={(e) => {
                              if (!isSubActive) {
                                e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                                e.currentTarget.style.opacity = "0.8";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSubActive) {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.opacity = "0.6";
                              }
                            }}
                          >
                            <subItem.icon className="w-4 h-4" />
                            <span className="font-medium text-sm">{subItem.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200",
                    isActive ? "shadow-md" : ""
                  )}
                  style={
                    isActive
                      ? {
                          backgroundColor: "#ffffff",
                          color: "#000000",
                          borderLeft: `3px solid ${primaryColor}`,
                        }
                      : {
                          color: "#000000",
                          opacity: 0.7,
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                      e.currentTarget.style.opacity = "1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.opacity = "0.7";
                    }
                  }}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      <div
        className="p-4 border-t"
        style={{ borderColor: `${primaryColor}20` }}
      >
        <button
          onClick={handleLogout}
          className="flex items-center space-x-3 px-4 py-3 rounded-lg w-full transition-all duration-200"
          style={{ color: "#000000", opacity: 0.7 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${primaryColor}10`;
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.opacity = "0.7";
          }}
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
