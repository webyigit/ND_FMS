"use client";
import dynamic from "next/dynamic";

const ChurchInfo = dynamic(() => import("./ChurchInfo"), { ssr: false });

export default function Page() {
  return <ChurchInfo />;
}
