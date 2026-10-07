"use client";
import dynamic from "next/dynamic";

const FixedExpenses = dynamic(() => import("./FixedExpenses"), { ssr: false });

export default function Page() {
  return <FixedExpenses />;
}
