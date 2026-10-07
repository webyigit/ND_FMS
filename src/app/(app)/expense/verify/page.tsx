"use client";
import dynamic from "next/dynamic";

const VerifySheet = dynamic(() => import("./VerifySheet"), { ssr: false });

export default function Page() {
  return <VerifySheet />;
}
