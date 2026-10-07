"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const MemberAdmin = dynamic(() => import("./MemberAdmin"), { ssr: false });

export default function Page() {
  return <DbOnly what="교인명단"><MemberAdmin /></DbOnly>;
}
