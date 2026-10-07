"use client";
import dynamic from "next/dynamic";

const DeptExpense = dynamic(() => import("./DeptExpense"), { ssr: false });

export default function Page() {
  return <DeptExpense />;
}
