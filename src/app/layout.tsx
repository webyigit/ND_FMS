import type { Metadata } from "next";
// 한글 글꼴 Pretendard(OFL, 무료): 쓰는 글자 묶음만 내려받는 dynamic subset, 자체 호스팅
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
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
