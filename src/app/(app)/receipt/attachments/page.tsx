"use client";
import dynamic from "next/dynamic";

const AttachmentAdmin = dynamic(() => import("./AttachmentAdmin"), { ssr: false });

export default function Page() {
  return <AttachmentAdmin />;
}
