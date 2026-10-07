"use client";
import dynamic from "next/dynamic";
import DbOnly from "@/components/ui/DbOnly";

const OfficerRoster = dynamic(() => import("./OfficerRoster"), { ssr: false });

export default function Page() {
  return <DbOnly what="재직명단"><OfficerRoster /></DbOnly>;
}
