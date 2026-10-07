"use client";
import { useEffect, useState } from "react";
import AuthCard, { authButton } from "@/components/auth/AuthCard";
import { supabaseBrowser } from "@/lib/supabase/client";

type Me = { name: string; status: string; role: string } | null;

// 로그인은 됐지만 승인 전이거나 재정 권한이 없는 회원
export default function Page() {
  const [me, setMe] = useState<Me>(null);
  useEffect(() => {
    const sb = supabaseBrowser();
    sb?.auth.getUser().then(async ({ data }) => {
      if (!data.user) return location.replace("/login");
      const { data: row } = await sb.from("app_user").select("name, status, role").eq("id", data.user.id).maybeSingle();
      setMe(row as Me);
    });
  }, []);
  const logout = async () => { await supabaseBrowser()?.auth.signOut(); location.replace("/login"); };
  const text = !me ? "확인 중…"
    : me.status === "pending" ? `${me.name}님, 가입 신청이 접수됐어요. 관리자가 승인하면 사용할 수 있어요.`
    : me.status === "blocked" ? "접근이 차단된 계정이에요. 관리자에게 문의해 주세요."
    : me.status === "approved" && ["admin", "treasurer"].includes(me.role) ? "승인됐어요. 아래 버튼으로 들어가세요."
    : "재정 화면을 볼 권한이 없어요. 관리자에게 권한을 요청해 주세요.";
  const ready = me?.status === "approved" && ["admin", "treasurer"].includes(me.role);
  return (
    <AuthCard title="승인 대기">
      <p className="mb-4 text-sm text-label">{text}</p>
      {ready ? <a href="/dashboard" className={`${authButton} block text-center`}>들어가기</a>
        : <button onClick={() => location.reload()} className={authButton}>다시 확인</button>}
      <button onClick={logout} className="mt-3 w-full text-xs text-label">로그아웃</button>
    </AuthCard>
  );
}
