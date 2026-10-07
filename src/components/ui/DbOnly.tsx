"use client";
import PageHeader from "@/components/PageHeader";
import Notice from "./Notice";
import { supabaseBrowser } from "@/lib/supabase/client";

// DB가 있어야 쓰는 화면: 데모 모드면 안내만 보여준다
export default function DbOnly({ children, what }: { children: React.ReactNode; what?: string }) {
  if (supabaseBrowser()) return <>{children}</>;
  return (
    <>
      <PageHeader />
      <Notice kind="warn">데모 모드예요. DB를 연결하면 {what ?? "이 화면"}을 쓸 수 있어요.</Notice>
    </>
  );
}
