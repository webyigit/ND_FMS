"use client";
import dynamic from "next/dynamic";

// 브라우저 임시저장(localStorage)과 오늘 날짜를 쓰므로 클라이언트에서만 렌더링
const IncomeEntryForm = dynamic(() => import("./IncomeEntryForm"), { ssr: false });

export default function Page() {
  return <IncomeEntryForm />;
}
