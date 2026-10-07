"use client";
import dynamic from "next/dynamic";

const BudgetReport = dynamic(() => import("./BudgetReport"), { ssr: false });

export default function Page() {
  return <BudgetReport />;
}
