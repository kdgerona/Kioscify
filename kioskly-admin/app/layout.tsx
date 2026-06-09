import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TenantProvider } from "@/contexts/TenantContext";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Kioscify - Store Management Portal",
  description: "Manage your store operations, view transactions, and generate reports",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Toaster position="top-center" richColors />
        <TenantProvider>
          {children}
        </TenantProvider>
      </body>
    </html>
  );
}
