"use client";
import dynamic from "next/dynamic";

// 브라우저 임시저장(localStorage)을 쓰므로 클라이언트에서만 렌더링
const Board = dynamic(() => import("./Board"), { ssr: false });

export default function Page() {
  return <Board />;
}
