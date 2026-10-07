"use client";
import dynamic from "next/dynamic";

// 파일·카메라·오늘 날짜를 쓰므로 클라이언트에서만 렌더링
const ExpenseUpload = dynamic(() => import("./ExpenseUpload"), { ssr: false });

export default function Page() {
  return <ExpenseUpload />;
}
