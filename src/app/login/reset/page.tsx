"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard, { authButton, authInput } from "@/components/auth/AuthCard";
import { supabaseBrowser } from "@/lib/supabase/client";

// 재설정 메일 링크로 들어온 뒤 새 비밀번호 저장
export default function Page() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setMsg("비밀번호는 8자 이상으로 해 주세요.");
    const { error } = (await supabaseBrowser()?.auth.updateUser({ password })) ?? { error: new Error("DB 미연결") };
    if (error) return setMsg(`저장하지 못했어요: ${error.message}`);
    router.replace("/dashboard");
  };
  return (
    <AuthCard title="새 비밀번호">
      <form onSubmit={save} className="space-y-3">
        <label className="block text-xs text-label">새 비밀번호<input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInput} /></label>
        {msg && <div className="rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{msg}</div>}
        <button className={authButton}>저장</button>
      </form>
    </AuthCard>
  );
}
