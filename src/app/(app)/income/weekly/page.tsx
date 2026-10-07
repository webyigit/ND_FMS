"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const WeeklyIncome = dynamic(() => import("./WeeklyIncome"), { ssr: false });

export default function Page() {
  return <DbOnly what="금주 수입내역"><WeeklyIncome /></DbOnly>;
}
