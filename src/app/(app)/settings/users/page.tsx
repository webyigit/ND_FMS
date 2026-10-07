"use client";
import dynamic from "next/dynamic";

const UserAdmin = dynamic(() => import("./UserAdmin"), { ssr: false });

export default function Page() {
  return <UserAdmin />;
}
