"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const IncomeHistory = dynamic(() => import("./IncomeHistory"), { ssr: false });

export default function Page() {
  return <DbOnly what="과거 수입내역"><IncomeHistory /></DbOnly>;
}
