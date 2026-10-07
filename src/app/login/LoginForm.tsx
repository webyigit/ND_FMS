"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard, { authButton, authInput } from "@/components/auth/AuthCard";
import { supabaseBrowser } from "@/lib/supabase/client";
import { safeNext } from "@/lib/supabase/config";

type Mode = "login" | "signup" | "reset";
const KAKAO = process.env.NEXT_PUBLIC_AUTH_KAKAO === "on"; // Supabase에 카카오 제공자를 켠 뒤 on

// 이메일·비밀번호 로그인 / 가입(관리자 승인 후 사용) / 비밀번호 재설정 메일
export default function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    params.get("error") ? { ok: false, text: "로그인 연결이 만료됐어요. 다시 시도해 주세요." } : null,
  );
  const sb = supabaseBrowser();
  const callback = (to: string) => `${location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  if (!sb)
    return (
      <AuthCard title="로그인">
        <p className="mb-4 text-sm text-label">DB가 아직 연결되지 않아 데모 모드로 열려 있어요. 로그인 없이 둘러볼 수 있어요.</p>
        <a href="/dashboard" className={`${authButton} block text-center`}>데모로 들어가기</a>
      </AuthCard>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return setMsg({ ok: false, text: "이메일 또는 비밀번호가 맞지 않아요." });
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) return setMsg({ ok: false, text: "비밀번호는 8자 이상으로 해 주세요." });
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { name: name.trim(), phone: phone.trim() }, emailRedirectTo: callback("/pending") },
        });
        if (error) return setMsg({ ok: false, text: `가입하지 못했어요: ${error.message}` });
        if (data.session) { router.replace("/pending"); router.refresh(); }
        else setMsg({ ok: true, text: "확인 메일을 보냈어요. 메일의 링크를 누른 뒤 관리자 승인을 기다려 주세요." });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: callback("/login/reset") });
        if (error) return setMsg({ ok: false, text: `메일을 보내지 못했어요: ${error.message}` });
        setMsg({ ok: true, text: "비밀번호 재설정 메일을 보냈어요." });
      }
    } finally {
      setBusy(false);
    }
  };

  const kakao = () => sb.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: callback(next) } });
  const title = { login: "로그인", signup: "회원가입", reset: "비밀번호 찾기" }[mode];

  return (
    <AuthCard title={title}>
      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <>
            <label className="block text-xs text-label">이름<input required value={name} onChange={(e) => setName(e.target.value)} className={authInput} /></label>
            <label className="block text-xs text-label">휴대폰 (선택)<input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={authInput} /></label>
          </>
        )}
        <label className="block text-xs text-label">이메일<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} /></label>
        {mode !== "reset" && (
          <label className="block text-xs text-label">비밀번호
            <input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} />
          </label>
        )}
        {msg && <div className={`rounded px-3 py-2 text-sm ${msg.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{msg.text}</div>}
        <button disabled={busy} className={authButton}>{busy ? "처리 중…" : { login: "로그인", signup: "가입 신청", reset: "재설정 메일 보내기" }[mode]}</button>
      </form>
      {KAKAO && mode === "login" && (
        <button onClick={kakao} className="mt-3 w-full rounded bg-[#FEE500] py-2 text-sm font-medium text-[#191919]">카카오로 로그인</button>
      )}
      <div className="mt-4 flex justify-between text-xs text-label">
        {mode === "login" ? (
          <>
            <button onClick={() => { setMode("signup"); setMsg(null); }}>회원가입</button>
            <button onClick={() => { setMode("reset"); setMsg(null); }}>비밀번호 찾기</button>
          </>
        ) : (
          <button onClick={() => { setMode("login"); setMsg(null); }}>로그인으로 돌아가기</button>
        )}
      </div>
      {mode === "signup" && <p className="mt-3 text-xs text-muted">가입 후 관리자가 승인해야 사용할 수 있어요.</p>}
    </AuthCard>
  );
}
