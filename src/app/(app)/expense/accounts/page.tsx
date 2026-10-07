"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const AccountAdmin = dynamic(() => import("./AccountAdmin"), { ssr: false });

export default function Page() {
  return <DbOnly what="은행계좌관리"><AccountAdmin /></DbOnly>;
}
