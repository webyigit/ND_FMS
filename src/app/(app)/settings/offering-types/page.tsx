"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const OfferingTypeAdmin = dynamic(() => import("./OfferingTypeAdmin"), { ssr: false });

export default function Page() {
  return <DbOnly what="헌금구분"><OfferingTypeAdmin /></DbOnly>;
}
