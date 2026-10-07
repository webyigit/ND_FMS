"use client";
import dynamic from "next/dynamic";

// 오늘 날짜(기부 연도)·브라우저 저장소를 쓰므로 클라이언트에서만 렌더링
const RequestForm = dynamic(() => import("./RequestForm"), {
  ssr: false,
  loading: () => <div className="rounded-lg bg-surface p-4 text-sm text-muted shadow-card">불러오는 중…</div>,
});

export default function FormLoader() {
  return <RequestForm />;
}
