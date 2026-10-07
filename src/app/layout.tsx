import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "재정관리시스템",
  description: "ND_FMS 재정관리시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
