import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Kioscify - Company Portal",
  description: "Manage your brands and stores",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Toaster position="top-center" richColors />
        {children}
      </body>
    </html>
  );
}
