"use client";
import dynamic from "next/dynamic";

const MissionEntry = dynamic(() => import("./MissionEntry"), { ssr: false });

export default function Page() {
  return <MissionEntry />;
}
