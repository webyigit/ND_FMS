"use client";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearLocalData, pendingOf, useSync } from "@/lib/offline/sync";

const ROLE: Record<string, string> = { admin: "관리자", treasurer: "재정부", viewer: "조회", dept_head: "부서장", pastor: "목회자" };

// 상단바: 로그인한 사람 이름·권한, 로그아웃. 데모 모드면 표시만.
export default function UserMenu() {
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const sb = supabaseBrowser();
  const sync = useSync();
  useEffect(() => {
    sb?.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: row } = await sb.from("app_user").select("name, role").eq("id", data.user.id).maybeSingle();
      if (row) setMe(row);
    });
  }, [sb]);
  if (!sb) return <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모 모드</span>;
  // 로그아웃: 실데이터가 기기에 남으므로 캐시·대기열 삭제를 고르게 한다 (공용 PC면 지우는 쪽)
  const logout = async () => {
    const pending = pendingOf(sync).length;
    const wipe = confirm(`이 기기에 저장된 재정 데이터(오프라인 캐시·입력 대기열)도 함께 지울까요?${pending ? `\n\n아직 올리지 않은 입력 ${pending}건이 있어요. 지우면 사라집니다.` : ""}\n\n확인 = 지우고 로그아웃, 취소 = 남기고 로그아웃`);
    if (wipe) await clearLocalData();
    await sb.auth.signOut();
    location.replace("/login");
  };
  return (
    <span className="flex items-center gap-3 text-sm">
      {me && <span className="text-heading">{me.name} <span className="text-xs text-muted">{ROLE[me.role] ?? me.role}</span></span>}
      <button onClick={logout} title="로그아웃" aria-label="로그아웃" className="text-label hover:text-primary"><FontAwesomeIcon icon={faRightFromBracket} /></button>
    </span>
  );
}
