"use client";
import dynamic from "next/dynamic";

const ClergyPay = dynamic(() => import("./ClergyPay"), { ssr: false });

export default function Page() {
  return <ClergyPay />;
}
