"use client";
import dynamic from "next/dynamic";

const DonationRequests = dynamic(() => import("./DonationRequests"), { ssr: false });

export default function Page() {
  return <DonationRequests />;
}
