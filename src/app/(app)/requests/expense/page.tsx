"use client";
import dynamic from "next/dynamic";

const ExpenseRequests = dynamic(() => import("./ExpenseRequests"), { ssr: false });

export default function Page() {
  return <ExpenseRequests />;
}
