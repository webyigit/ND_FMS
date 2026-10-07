"use client";
import dynamic from "next/dynamic";

const ReceiptList = dynamic(() => import("../_parts/ReceiptList"), { ssr: false });

export default function Page() {
  return <ReceiptList mode="past" />;
}
