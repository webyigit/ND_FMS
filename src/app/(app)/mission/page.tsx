"use client";
import dynamic from "next/dynamic";

const Mission = dynamic(() => import("./Mission"), { ssr: false });

export default function Page() {
  return <Mission />;
}
