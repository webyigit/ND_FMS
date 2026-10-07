"use client";
// 발행된 영수증 보기·출력. 주민번호는 기본 마스킹, 출력할 때만 전체 표시(사용내역 기록).
import { useState } from "react";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { fullRrn, loadChurch, loadReceipts, type ReceiptView } from "@/lib/receipt/api";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, btnPrimary } from "@/components/ui/Buttons";
import Notice from "@/components/ui/Notice";
import ReceiptPaper from "./ReceiptPaper";

export default function ReceiptPreview({ ids, onClose }: { ids: number[]; onClose?: () => void }) {
  const sb = supabaseBrowser();
  const key = ids.join(",");
  const q = useDbQuery(async (s) => ({ church: await loadChurch(s), rows: await loadReceipts(s, ids) }), [key]);
  // 다른 영수증으로 바뀌면 전체 표시는 자동으로 풀린다
  const [fullState, setFullState] = useState<{ key: string; map: Record<number, string> }>({ key: "", map: {} });
  const full = fullState.key === key ? fullState.map : {};
  const setFull = (map: Record<number, string>) => setFullState({ key, map });
  const [err, setErr] = useState("");

  const showFull = async () => {
    if (!sb || !q.data) return;
    setErr("");
    try {
      const out: Record<number, string> = {};
      for (const r of q.data.rows) if (r.has_rrn && r.donor_kind !== "CP") out[r.id] = (await fullRrn(sb, r.id)) ?? "";
      setFull(out);
    } catch (e) { setErr(dbError(e)); }
  };

  if (q.error) return <Notice kind="error">불러오지 못했어요: {q.error}</Notice>;
  if (!q.data) return <div className="text-sm text-muted">불러오는 중…</div>;
  const { church, rows } = q.data;
  const shown = Object.keys(full).length > 0;
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {onClose && <button onClick={onClose} className={btn}>← 목록</button>}
        <button onClick={() => (shown ? setFull({}) : showFull())} className={btn}>{shown ? "주민번호 가리기" : "주민번호 전체 표시(출력용)"}</button>
        <button onClick={() => window.print()} className={btnPrimary}>출력·PDF</button>
        <span className="text-xs text-muted">A4 세로 · 전체 표시는 사용내역에 남아요</span>
      </div>
      {!church?.name && <Notice kind="warn">발행자(교회) 정보가 비어 있어요. 기부금영수증 &gt; 발행자(교회) 정보에서 채워 주세요.</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      <div className="space-y-6 overflow-x-auto print:space-y-0">
        {rows.map((r: ReceiptView) => (
          <ReceiptPaper key={r.id} church={church} r={{ ...r, donor_rrn: full[r.id] || r.donor_rrn_masked }} />
        ))}
      </div>
    </div>
  );
}
