"use client";

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
} from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Products", href: "/products", icon: Package },
  { name: "Categories", href: "/categories", icon: FolderOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();

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
          return (
            <Link
              key={item.name}
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
                      color: textColor,
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
          style={{ color: textColor, opacity: 0.7 }}
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
