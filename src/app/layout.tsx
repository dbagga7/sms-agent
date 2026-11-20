import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadBooker",
  description: "AI appointment scheduling for home service businesses",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
