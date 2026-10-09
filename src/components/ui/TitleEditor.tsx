"use client";
import { useState } from "react";
import { btn, btnPrimary, input } from "@/components/ui/Buttons";
import { dbError } from "@/lib/db/weekly";

// 결재란 직함: 화면에서 바꾸고 app_setting 에 저장
export default function TitleEditor({ titles, onSave, onSaved }: { titles: string[]; onSave: (titles: string[]) => Promise<void>; onSaved: () => void }) {
  const [xs, setXs] = useState(titles);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const changed = xs.join("|") !== titles.join("|");
  const save = async () => {
    const clean = xs.map((x) => x.trim()).filter(Boolean);
    if (!clean.length) return setErr("직함을 하나 이상 넣어 주세요.");
    try { await onSave(clean); setErr(""); setOpen(false); onSaved(); } catch (e) { setErr(dbError(e)); }
  };
  if (!open) return <button className={`${btn} ml-auto`} onClick={() => setOpen(true)}>결재란 직함 바꾸기</button>;
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1">
      {xs.map((x, i) => (
        <span key={i} className="flex items-center">
          <input className={`${input} w-24`} value={x} onChange={(e) => setXs(xs.map((y, j) => (j === i ? e.target.value : y)))} />
          <button className="px-1 text-xs text-danger" title="빼기" onClick={() => setXs(xs.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      {xs.length < 6 && <button className={btn} onClick={() => setXs([...xs, ""])}>칸 추가</button>}
      <button className={btnPrimary} disabled={!changed} onClick={save}>저장</button>
      <button className={btn} onClick={() => { setXs(titles); setOpen(false); setErr(""); }}>취소</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
