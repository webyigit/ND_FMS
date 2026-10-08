"use client";
// 발행된 영수증 보기·출력. 주민번호는 기본 마스킹, 출력할 때만 전체 표시(사용내역 기록).
// 첨부양식: 그림은 영수증마다 뒤에 붙여 함께 출력, 그 밖의 파일은 열기·내려받기.
/* eslint-disable @next/next/no-img-element -- 저장소 임시 주소 그림 */
import { Fragment, useState } from "react";
import { useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { fullRrn, loadChurch, loadReceipts, type ReceiptView } from "@/lib/receipt/api";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, btnPrimary } from "@/components/ui/Buttons";
import Notice from "@/components/ui/Notice";
import { attachKind, attachmentUrl, loadAttachments, openAttachment, type Attachment } from "@/lib/receipt/attachments";
import type { SupabaseClient } from "@supabase/supabase-js";
import ReceiptPaper from "./ReceiptPaper";

type Attached = Attachment & { url: string | null };
/** 출력 화면에 보일 첨부양식. 그림은 1시간짜리 주소를 미리 받는다. 저장소가 없으면(마이그레이션 전) 빈 목록 */
async function loadAttached(s: SupabaseClient): Promise<Attached[]> {
  try {
    const list = await loadAttachments(s, true);
    return await Promise.all(list.map(async (a) => ({ ...a, url: attachKind(a.file_name) === "image" ? await attachmentUrl(s, a, false, 3600) : null })));
  } catch { return []; }
}

export default function ReceiptPreview({ ids, onClose }: { ids: number[]; onClose?: () => void }) {
  const sb = supabaseBrowser();
  const key = ids.join(",");
  const q = useDbQuery(async (s) => ({ church: await loadChurch(s), rows: await loadReceipts(s, ids), attached: await loadAttached(s) }), [key]);
  const [skip, setSkip] = useState<Record<number, boolean>>({}); // 출력에서 뺄 그림
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
  const { church, rows, attached } = q.data;
  const shown = Object.keys(full).length > 0;
  const images = attached.filter((a) => a.url && !skip[a.id]);
  const open = (a: Attachment, download: boolean) => sb && openAttachment(sb, a, download).catch((e) => setErr(dbError(e)));
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {onClose && <button onClick={onClose} className={btn}>← 목록</button>}
        <button onClick={() => (shown ? setFull({}) : showFull())} className={btn}>{shown ? "주민번호 가리기" : "주민번호 전체 표시(출력용)"}</button>
        <button onClick={() => window.print()} className={btnPrimary}>출력·PDF</button>
        <span className="text-xs text-muted">A4 세로 · 전체 표시는 사용내역에 남아요</span>
      </div>
      {attached.length > 0 && (
        <div className="no-print mb-3 rounded border bg-surface px-3 py-2 text-sm">
          <div className="mb-1 text-xs text-label">함께 낼 첨부양식</div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {attached.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                {a.url ? (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!skip[a.id]} onChange={(e) => setSkip({ ...skip, [a.id]: !e.target.checked })} />
                    <span className="text-heading">{a.name}</span><span className="text-xs text-muted">(영수증 뒤에 함께 출력)</span>
                  </label>
                ) : <span className="text-heading">{a.name}</span>}
                <button onClick={() => open(a, false)} className="text-xs text-primary">열기</button>
                <button onClick={() => open(a, true)} className="text-xs text-primary">내려받기</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!church?.name && <Notice kind="warn">발행자(교회) 정보가 비어 있어요. 기부금영수증 &gt; 발행자(교회) 정보에서 채워 주세요.</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      <div className="space-y-6 overflow-x-auto print:space-y-0">
        {rows.map((r: ReceiptView) => (
          <Fragment key={r.id}>
            <ReceiptPaper church={church} r={{ ...r, donor_rrn: full[r.id] || r.donor_rrn_masked }} />
            {images.map((a) => (
              <div key={a.id} className="mx-auto flex min-h-[297mm] w-[210mm] break-after-page items-start justify-center bg-white p-[12mm] shadow-card last:break-after-auto print:min-h-0 print:w-auto print:p-0 print:shadow-none">
                <img src={a.url!} alt={a.name} className="max-h-[270mm] max-w-full object-contain" />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
