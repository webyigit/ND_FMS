"use client";
import dynamic from "next/dynamic";

// 오늘 날짜·차트(브라우저 전용)를 쓰므로 클라이언트에서만 렌더링
const Dashboard = dynamic(() => import("./Dashboard"), { ssr: false });

export default function Page() {
  return <Dashboard />;
}
