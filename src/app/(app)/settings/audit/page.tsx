"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const AuditLog = dynamic(() => import("./AuditLog"), { ssr: false });

export default function Page() {
  return <DbOnly what="시스템 사용내역"><AuditLog /></DbOnly>;
}
