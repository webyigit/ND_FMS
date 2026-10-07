"use client";
import dynamic from "next/dynamic";

const FormAdmin = dynamic(() => import("./FormAdmin"), { ssr: false });

export default function Page() {
  return <FormAdmin />;
}
