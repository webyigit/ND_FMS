"use client";
import dynamic from "next/dynamic";

const BudgetRequests = dynamic(() => import("./BudgetRequests"), { ssr: false });

export default function Page() {
  return <BudgetRequests />;
}
