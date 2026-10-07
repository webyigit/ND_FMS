"use client";
import dynamic from "next/dynamic";

// 주소창 값(신청·수정·재발행)을 브라우저에서 읽으므로 클라이언트에서만 렌더링
const IssueForm = dynamic(() => import("./IssueForm"), { ssr: false });

export default function Page() {
  return <IssueForm />;
}
