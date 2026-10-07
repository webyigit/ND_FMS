"use client";
// 발행자(교회) 정보: 교회명·담임목사·주소·고유번호, 직인·간인 이미지(200KB 이하 data URL로 DB 저장)
/* eslint-disable @next/next/no-img-element -- data URL 미리보기 */
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { loadChurch, type Church } from "@/lib/receipt/api";
import { dataUrlBytes, resizeImage } from "@/lib/receipt/image";
import { supabaseBrowser } from "@/lib/supabase/client";

const EMPTY: Church = { name: "", pastor: "", address: "", reg_no: "", phone: "", seal_image: null, stamp_image: null };
const FIELDS: [keyof Church, string, string][] = [
  ["name", "교회명(단체명)", "예: 가나다교회"],
  ["pastor", "담임목사(대표자)", ""],
  ["reg_no", "고유번호(사업자등록번호)", "000-00-00000"],
  ["phone", "전화번호", ""],
  ["address", "소재지(주소)", ""],
];

export default function ChurchInfo() {
  return <DbOnly what="발행자(교회) 정보"><Editor /></DbOnly>;
}

function Editor() {
  const q = useDbQuery(loadChurch, []);
  if (q.error) return <><PageHeader /><Notice kind="error">불러오지 못했어요: {q.error}</Notice></>;
  if (q.loading) return <><PageHeader /><div className="text-sm text-muted">불러오는 중…</div></>;
  return <Form initial={{ ...EMPTY, ...(q.data ?? {}) }} />;
}

function Form({ initial }: { initial: Church }) {
  const sb = supabaseBrowser();
  const [c, setC] = useState<Church>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(c) !== saved;

  const upload = async (key: "seal_image" | "stamp_image", f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    try { const url = await resizeImage(f); setC((x) => ({ ...x, [key]: url })); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "이미지를 읽지 못했어요" }); }
  };

  const save = async () => {
    if (!sb) return;
    setBusy(true); setMsg(null);
    try {
      const row = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
      must(await sb.from("church_info").upsert({ id: 1, ...row, updated_at: new Date().toISOString() }).select("id"));
      setSaved(JSON.stringify(c));
      setMsg({ ok: true, text: "저장했어요. 영수증 출력에 바로 쓰여요." });
    } catch (e) { setMsg({ ok: false, text: `저장하지 못했어요: ${dbError(e)}` }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader actions={<button onClick={save} disabled={busy || !dirty} className={btnPrimary}>{busy ? "저장 중…" : dirty ? "저장" : "저장됨"}</button>} />
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={`${card} grid gap-3 p-4 md:grid-cols-2`}>
          {FIELDS.map(([k, label, ph]) => (
            <label key={k} className={`text-xs text-label ${k === "address" ? "md:col-span-2" : ""}`}>{label}
              <input value={(c[k] as string) ?? ""} placeholder={ph} onChange={(e) => setC({ ...c, [k]: e.target.value })} className={`${input} mt-1 w-full`} />
            </label>
          ))}
          <p className="text-xs text-muted md:col-span-2">영수증의 &lsquo;기부금 단체&rsquo; 칸에 들어가요. 근거법령 문구는 서식에 고정돼 있어요 [확인 필요].</p>
        </div>
        <div className={`${card} space-y-4 p-4`}>
          {([["seal_image", "직인", "영수증 기부금 수령인 옆에 찍혀요"], ["stamp_image", "간인", "영수증 오른쪽 여백에 찍혀요 [확인 필요: 위치]"]] as const).map(([k, label, hint]) => (
            <div key={k}>
              <div className="mb-1 text-xs text-label">{label} <span className="text-muted">· {hint}</span></div>
              <div className="flex items-center gap-3">
                <div className="flex h-24 w-24 items-center justify-center rounded border bg-surface-2">
                  {c[k] ? <img src={c[k]!} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">없음</span>}
                </div>
                <div className="space-y-1 text-xs">
                  <label className={`${btn} inline-block cursor-pointer`}>이미지 올리기
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { upload(k, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {c[k] && <div className="text-muted">{Math.round(dataUrlBytes(c[k]!) / 1024)}KB · <button onClick={() => setC({ ...c, [k]: null })} className="text-danger">지우기</button></div>}
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">배경이 투명한 PNG가 좋아요. 올리면 자동으로 줄여서(200KB 이하) DB에 저장해요.</p>
        </div>
      </div>
    </>
  );
}
