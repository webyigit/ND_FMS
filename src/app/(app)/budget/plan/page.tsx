"use client";
import dynamic from "next/dynamic";

const BudgetPlan = dynamic(() => import("./BudgetPlan"), { ssr: false });

export default function Page() {
  return <BudgetPlan />;
}
