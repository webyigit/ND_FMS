"use client";
import dynamic from "next/dynamic";

const TodoBoard = dynamic(() => import("./TodoBoard"), { ssr: false });

export default function Page() {
  return <TodoBoard />;
}
