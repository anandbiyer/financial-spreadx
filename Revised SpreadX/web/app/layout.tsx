import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Financial SpreadX",
  description: "Statement normalisation — extraction + COA spreading",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <div id="app-main">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
