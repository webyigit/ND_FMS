"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const PersonOfferings = dynamic(() => import("./PersonOfferings"), { ssr: false });

export default function Page() {
  return <DbOnly what="개인별 헌금현황"><PersonOfferings /></DbOnly>;
}
