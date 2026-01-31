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
  Menu,
  X,
  PanelLeftOpen,
  PanelRightOpen,
  Ruler,
  Sparkles,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import * as Popover from "@radix-ui/react-popover";

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
  { name: "Expenses", href: "/expenses", icon: Wallet },
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
    ],
  },
  { name: "Products", href: "/products", icon: Package },
  { name: "Categories", href: "/categories", icon: FolderOpen },
  { name: "Sizes", href: "/sizes", icon: Ruler },
  { name: "Addons", href: "/addons", icon: Sparkles },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); // For desktop minimized state

  // Auto-expand parent menu when submenu item is active
  useEffect(() => {
    navigation.forEach((item) => {
      if (item.subItems) {
        const hasActiveSubItem = item.subItems.some(
          (subItem) =>
            pathname === subItem.href ||
            pathname?.startsWith(subItem.href + "/")
        );
        if (hasActiveSubItem && !expandedItems.includes(item.name)) {
          setExpandedItems((prev) => [...prev, item.name]);
        }
      }
    });
  }, [pathname]);

  // Close mobile menu when route changes (only on small screens)
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsMobileMenuOpen(false);
    }
  }, [pathname]);

  const handleLogout = () => {
    api.logout();
  };

  // Get tenant theme colors with fallbacks
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const backgroundColor = tenant?.themeColors?.background || "#ffffff";
  const textColor = tenant?.themeColors?.text || "#1f2937";

  return (
    <>
      {/* Mobile Menu Toggle - Only visible on mobile when closed */}
      {!isMobileMenuOpen && (
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg shadow-lg transition-colors hover:opacity-80"
          style={{
            backgroundColor: backgroundColor,
            color: textColor,
          }}
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "flex flex-col h-full border-r shadow-sm transition-all duration-300 ease-in-out",
          // Mobile: fixed with slide animation
          "fixed lg:relative inset-y-0 left-0 z-40",
          "lg:transform-none",
          // Mobile slide behavior
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
          // Desktop width behavior
          isCollapsed ? "lg:w-20" : "lg:w-64",
          // Mobile always full width when open
          "w-64"
        )}
        style={{
          backgroundColor: backgroundColor,
          color: textColor,
        }}
      >
        {/* Mobile Close Button */}
        {isMobileMenuOpen && (
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden absolute top-4 right-4 z-50 p-2 rounded-lg transition-colors hover:bg-gray-100"
            style={{
              color: textColor,
            }}
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        {/* Desktop Toggle Button - Above logo */}
        <div
          className={cn(
            "hidden lg:flex items-center border-b",
            isCollapsed ? "justify-center p-2" : "justify-end px-4 py-2"
          )}
          style={{ borderColor: `${primaryColor}20` }}
        >
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg transition-all duration-200 hover:bg-gray-100"
            style={{
              color: textColor,
            }}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelRightOpen className="w-5 h-5" />
            ) : (
              <PanelLeftOpen className="w-5 h-5" />
            )}
          </button>
        </div>

        <div
          className={cn(
            "px-6 py-3 border-b transition-all duration-300",
            isCollapsed && "lg:p-3",
            {
              "pt-14": isMobileMenuOpen,
            }
          )}
          style={{ borderColor: `${primaryColor}20` }}
        >
          <div
            className={cn(
              "flex items-center",
              isCollapsed
                ? "lg:justify-center lg:flex-col lg:space-x-0"
                : "space-x-3"
            )}
          >
            {tenant?.logoUrl ? (
              <div
                className={cn(
                  "relative flex-shrink-0",
                  isCollapsed ? "lg:w-8 lg:h-8" : "w-10 h-10"
                )}
              >
                <Image
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  fill
                  className="object-contain border-2 border-white rounded-full"
                />
              </div>
            ) : (
              <div
                className={cn("p-2 rounded-lg", isCollapsed && "lg:p-1")}
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Store
                  className={cn(isCollapsed ? "lg:w-5 lg:h-5" : "w-6 h-6")}
                  style={{ color: primaryColor }}
                />
              </div>
            )}
            {!isCollapsed && (
              <div className="lg:block">
                <h2 className="text-xl font-bold" style={{ color: textColor }}>
                  {tenant?.name || "Kioskly"}
                </h2>
                <p className="text-xs opacity-60">Admin Panel</p>
              </div>
            )}
          </div>
        </div>

        <nav
          className={cn(
            "flex-1 p-4 space-y-2 overflow-y-auto",
            isCollapsed && "lg:p-2"
          )}
        >
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedItems.includes(item.name);
            const isSubItemActive =
              hasSubItems &&
              item.subItems?.some(
                (subItem) =>
                  pathname === subItem.href ||
                  pathname?.startsWith(subItem.href + "/")
              );

            const toggleExpanded = (e: React.MouseEvent) => {
              e.preventDefault();
              if (!isCollapsed) {
                setExpandedItems((prev) =>
                  prev.includes(item.name)
                    ? prev.filter((name) => name !== item.name)
                    : [...prev, item.name]
                );
              }
            };

            return (
              <div key={item.name}>
                {hasSubItems ? (
                  <div>
                    {isCollapsed ? (
                      // Popover for collapsed sidebar
                      <Popover.Root>
                        <Popover.Trigger asChild>
                          <button
                            className={cn(
                              "flex items-center w-full rounded-lg transition-all duration-200",
                              "lg:justify-center lg:px-2 lg:py-3",
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
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.opacity = "0.7";
                              }
                            }}
                            title={item.name}
                          >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            side="right"
                            sideOffset={8}
                            className="z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                          >
                            <div className="space-y-1">
                              <div className="px-3 py-2 text-sm font-semibold text-gray-900 border-b border-gray-100">
                                {item.name}
                              </div>
                              {item.subItems?.map((subItem) => {
                                const isSubActive = pathname === subItem.href;
                                return (
                                  <Link
                                    key={subItem.name}
                                    href={subItem.href}
                                    className={cn(
                                      "flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-200 text-sm",
                                      isSubActive
                                        ? "bg-gray-100 font-semibold"
                                        : "hover:bg-gray-50"
                                    )}
                                    style={{
                                      color: "#000000",
                                    }}
                                  >
                                    <subItem.icon className="w-4 h-4" />
                                    <span>{subItem.name}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    ) : (
                      // Regular button for expanded sidebar
                      <>
                        <button
                          onClick={toggleExpanded}
                          className={cn(
                            "flex items-center w-full rounded-lg transition-all duration-200",
                            "justify-between px-4 py-3",
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
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                              e.currentTarget.style.opacity = "0.7";
                            }
                          }}
                        >
                          <div className="flex items-center space-x-3">
                            <item.icon className="w-5 h-5 flex-shrink-0" />
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
                                      e.currentTarget.style.backgroundColor =
                                        "transparent";
                                      e.currentTarget.style.opacity = "0.6";
                                    }
                                  }}
                                >
                                  <subItem.icon className="w-4 h-4" />
                                  <span className="font-medium text-sm">
                                    {subItem.name}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-lg transition-all duration-200",
                      isCollapsed
                        ? "lg:justify-center lg:px-2 lg:py-3"
                        : "space-x-3 px-4 py-3",
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
                    title={isCollapsed ? item.name : undefined}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && (
                      <span className="font-medium">{item.name}</span>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        <div
          className={cn("p-4 border-t", isCollapsed && "lg:p-2")}
          style={{ borderColor: `${primaryColor}20` }}
        >
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center rounded-lg w-full transition-all duration-200",
              isCollapsed
                ? "lg:justify-center lg:px-2 lg:py-3"
                : "space-x-3 px-4 py-3"
            )}
            style={{ color: "#000000", opacity: 0.7 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${primaryColor}10`;
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.opacity = "0.7";
            }}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </div>
    </>
  );
}
