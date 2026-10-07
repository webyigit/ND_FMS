"use client";
import dynamic from "next/dynamic";

const NoticeAdmin = dynamic(() => import("./NoticeAdmin"), { ssr: false });

export default function Page() {
  return <NoticeAdmin />;
}
