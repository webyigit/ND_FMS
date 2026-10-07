"use client";
import dynamic from "next/dynamic";

const Settlement = dynamic(() => import("./Settlement"), { ssr: false });

export default function Page() {
  return <Settlement />;
}
