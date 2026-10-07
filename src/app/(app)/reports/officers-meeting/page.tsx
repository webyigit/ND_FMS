"use client";
import dynamic from "next/dynamic";

const OfficersReport = dynamic(() => import("./OfficersReport"), { ssr: false });

export default function Page() {
  return <OfficersReport />;
}
