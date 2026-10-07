"use client";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { supabaseBrowser } from "@/lib/supabase/client";

const ROLE: Record<string, string> = { admin: "관리자", treasurer: "재정부", viewer: "조회", dept_head: "부서장", pastor: "목회자" };

// 상단바: 로그인한 사람 이름·권한, 로그아웃. 데모 모드면 표시만.
export default function UserMenu() {
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const sb = supabaseBrowser();
  useEffect(() => {
    sb?.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: row } = await sb.from("app_user").select("name, role").eq("id", data.user.id).maybeSingle();
      if (row) setMe(row);
    });
  }, [sb]);
  if (!sb) return <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모 모드</span>;
  const logout = async () => { await sb.auth.signOut(); location.replace("/login"); };
  return (
    <span className="flex items-center gap-3 text-sm">
      {me && <span className="text-heading">{me.name} <span className="text-xs text-muted">{ROLE[me.role] ?? me.role}</span></span>}
      <button onClick={logout} title="로그아웃" aria-label="로그아웃" className="text-label hover:text-primary"><FontAwesomeIcon icon={faRightFromBracket} /></button>
    </span>
  );
}
