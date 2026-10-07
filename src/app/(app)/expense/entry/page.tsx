"use client";
import dynamic from "next/dynamic";

const ExpenseEntryForm = dynamic(() => import("./ExpenseEntryForm"), { ssr: false });

export default function Page() {
  return <ExpenseEntryForm />;
}
