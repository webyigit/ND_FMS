"use client";
import dynamic from "next/dynamic";

const ExpenseHistory = dynamic(() => import("./ExpenseHistory"), { ssr: false });

export default function Page() {
  return <ExpenseHistory />;
}
