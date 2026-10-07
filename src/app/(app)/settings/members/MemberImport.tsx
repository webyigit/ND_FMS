"use client";
import { useState } from "react";
import { btn, btnPrimary, card } from "@/components/ui/Buttons";
import { dbError } from "@/lib/db/weekly";
import { readFirstSheet } from "@/lib/bank/readXlsx";
import { downloadXlsx } from "@/lib/excel";
import { fileName } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { IMPORT_TEMPLATE, parseMemberSheet, previewImport, type ImportPreview } from "@/lib/settings/members";

const STATUS: Record<ImportPreview["status"], [string, string]> = {
  new: ["등록", "bg-success-subtle text-success"],
  exists: ["이미 있음", "bg-surface-2 text-muted"],
  dup: ["파일 안 중복", "bg-warning-subtle text-warning"],
  empty: ["이름 없음", "bg-danger-subtle text-danger"],
};

// 엑셀 일괄 등록: 이름·직분·교구·구역·휴대폰 열을 읽어 미리보기 후 등록(이관 대비)
export default function MemberImport({ existing, onDone }: { existing: string[]; onDone: (text: string) => void }) {
  const sb = supabaseBrowser()!;
  const [rows, setRows] = useState<ImportPreview[] | null>(null);
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fresh = rows?.filter((r) => r.status === "new") ?? [];

  const read = async (f: File | undefined) => {
    if (!f) return;
    setErr(""); setRows(null); setFile(f.name);
    try {
      const parsed = parseMemberSheet(await readFirstSheet(await f.arrayBuffer()));
      if (!parsed) return setErr("'이름' 머리글을 찾지 못했어요. 첫 시트에 이름·직분·교구·구역·휴대폰 머리글을 넣어 주세요.");
      setRows(previewImport(parsed, existing));
    } catch (e) { setErr(`파일을 읽지 못했어요: ${dbError(e)}`); }
  };

  const submit = async () => {
    setBusy(true); setErr("");
    const { data, error } = await sb.rpc("import_members", { p_rows: fresh.map((r) => ({ name: r.name, name_suffix: r.name_suffix, title: r.title, district: r.district, zone: r.zone, phone: r.phone })) });
    setBusy(false);
    if (error) return setErr(dbError(error));
    const r = data as { added: number; skipped: string[] };
    onDone(`${r.added}명을 등록했어요.${r.skipped.length ? ` 이미 있어 건너뜀: ${r.skipped.join(", ")}` : ""}`);
  };

  return (
    <div className={`${card} mb-4 p-4 text-sm`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-heading">엑셀 일괄 등록</span>
        <input type="file" accept=".xlsx" onChange={(e) => read(e.target.files?.[0])} className="text-xs" />
        <button className={btn} onClick={() => downloadXlsx(fileName("교인명단_등록양식", "xlsx"), [{ name: "교인명단", rows: IMPORT_TEMPLATE, widths: [12, 10, 10, 10, 16] }])}>양식 내려받기</button>
        <span className="text-xs text-muted">같은 이름이 이미 있으면 건너뛰어요. 동명이인은 &apos;접미사&apos; 열(A/B)을 넣어 주세요.</span>
      </div>
      {err && <div className="mb-2 rounded bg-danger-subtle px-3 py-2 text-danger">{err}</div>}
      {rows && (
        <>
          <div className="max-h-80 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-label">
                <tr><th className="px-2 py-1 text-left">이름</th><th className="text-left">직분</th><th className="text-left">교구</th><th className="text-left">구역</th><th className="text-left">휴대폰</th><th>처리</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{r.name}{r.name_suffix}</td><td>{r.title}</td><td>{r.district}</td><td>{r.zone}</td><td>{r.phone}</td>
                    <td className="text-center"><span className={`rounded px-1 ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="text-muted">{file} · {rows.length}행 중 {fresh.length}명 등록</span>
            <button className={btnPrimary} disabled={busy || !fresh.length} onClick={submit}>{busy ? "등록 중…" : `${fresh.length}명 등록`}</button>
          </div>
        </>
      )}
    </div>
  );
}
