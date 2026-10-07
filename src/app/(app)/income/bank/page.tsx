"use client";
import dynamic from "next/dynamic";

const BankImport = dynamic(() => import("./BankImport"), { ssr: false });

export default function Page() {
  return <BankImport />;
}
