"use client";
import dynamic from "next/dynamic";

const Ledger = dynamic(() => import("./Ledger"), { ssr: false });

export default function Page() {
  return <Ledger />;
}
