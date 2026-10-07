"use client";
import dynamic from "next/dynamic";

const WeeklyReport = dynamic(() => import("./WeeklyReport"), { ssr: false });

export default function Page() {
  return <WeeklyReport />;
}
