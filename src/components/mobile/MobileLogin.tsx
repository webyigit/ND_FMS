"use client";
import { useEffect, useState } from "react";
import AuthCard, { authButton } from "@/components/auth/AuthCard";
import { supabaseBrowser } from "@/lib/supabase/client";
import { safeNext } from "@/lib/supabase/config";
import { AREA_ROLES, areaOf, canEnter } from "@/lib/work/access";

type Me = { name: string; status: string; role: string } | null;

// 부서장 모바일·지출신청 안내: 로그인 전이면 로그인으로, 권한이 없으면 이유를 알려준다
export default function MobileLogin() {
  const sb = supabaseBrowser();
  const [next] = useState(() => safeNext(new URLSearchParams(location.search).get("next"), "/m"));
  const area = areaOf(next) ?? "m";
  const [me, setMe] = useState<Me | "none" | undefined>(undefined);
  useEffect(() => {
    sb?.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setMe("none");
      const { data: row } = await sb.from("app_user").select("name, status, role").eq("id", data.user.id).maybeSingle();
      setMe((row as Me) ?? "none");
    });
  }, [sb]);
  const logout = async () => { await sb?.auth.signOut(); setMe("none"); };
  const title = area === "m" ? "부서장 페이지" : "지출신청";
  const who = area === "m" ? "부서장" : "부서장·목회자";

  if (!sb)
    return (
      <AuthCard title={title}>
        <p className="mb-4 text-sm text-label">DB가 아직 연결되지 않아 데모 모드예요. 로그인 없이 화면만 둘러볼 수 있어요.</p>
        <a href={next} className={`${authButton} block text-center`}>둘러보기</a>
      </AuthCard>
    );
  if (me === undefined) return <AuthCard title={title}><p className="text-sm text-label">확인 중…</p></AuthCard>;
  if (me === "none" || me === null)
    return (
      <AuthCard title={title}>
        <p className="mb-4 text-sm text-label">{who} 전용 화면이에요. 로그인해 주세요. 처음이면 가입 후 재정부에 {who} 권한을 요청해 주세요.</p>
        <a href={`/login?next=${encodeURIComponent(next)}`} className={`${authButton} block text-center`}>로그인</a>
      </AuthCard>
    );

  const ok = canEnter(area, me);
  const text = ok ? `${me.name}님, 들어갈 수 있어요.`
    : me.status === "pending" ? `${me.name}님, 가입 승인을 기다리고 있어요. 재정부가 승인하면 쓸 수 있어요.`
    : me.status === "blocked" ? "접근이 차단된 계정이에요. 재정부에 문의해 주세요."
    : `${me.name}님은 ${who} 권한이 없어요. 재정부에 권한을 요청해 주세요.`;
  return (
    <AuthCard title={title}>
      <p className="mb-4 text-sm text-label">{text}</p>
      {ok ? <a href={next} className={`${authButton} block text-center`}>들어가기</a>
        : <button onClick={() => location.reload()} className={authButton}>다시 확인</button>}
      {!ok && AREA_ROLES.request.includes(me.role) && me.status === "approved" && area === "m" && (
        <a href="/request" className="mt-3 block text-center text-sm text-primary">지출신청하기로 가기</a>
      )}
      <button onClick={logout} className="mt-3 w-full text-xs text-label">다른 계정으로 로그인(로그아웃)</button>
    </AuthCard>
  );
}
