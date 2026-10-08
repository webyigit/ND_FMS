"use client";
// 상단바: 온라인/오프라인, 올리기 대기 건수, 충돌 목록. 충돌은 덮어쓰지 않고 사용자가 고른다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp, faTriangleExclamation, faWifi, faXmark } from "@fortawesome/free-solid-svg-icons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pendingOf, resolve, stuckOf, syncNow, useSync } from "@/lib/offline/sync";
import { KIND_LABEL, summarize, type OutboxItem } from "@/lib/offline/logic";
import { won } from "@/lib/format";

export default function SyncStatus() {
  const s = useSync();
  const [open, setOpen] = useState(false);
  if (!supabaseBrowser()) return null;
  const pending = pendingOf(s);
  const stuck = stuckOf(s);
  const chip = "flex items-center gap-1.5 rounded px-2 py-1 text-xs";
  return (
    <span className="flex items-center gap-2">
      {!s.online && <span className={`${chip} bg-warning-subtle text-warning`} title="연결이 끊겨 마지막으로 본 데이터를 보여줘요. 입력은 기기에 저장되고 연결되면 올라가요"><FontAwesomeIcon icon={faWifi} /> 오프라인</span>}
      {pending.length > 0 && (
        <button onClick={() => void syncNow()} className={`${chip} bg-info-subtle text-info`} title={s.online ? "지금 올리기" : "연결되면 자동으로 올려요"}>
          <FontAwesomeIcon icon={faCloudArrowUp} /> {s.syncing ? "올리는 중…" : `올릴 입력 ${pending.length}건`}
        </button>
      )}
      {stuck.length > 0 && (
        <button onClick={() => setOpen(true)} className={`${chip} bg-danger-subtle text-danger`}><FontAwesomeIcon icon={faTriangleExclamation} /> 확인 필요 {stuck.length}건</button>
      )}
      {open && <ConflictList items={stuck} onClose={() => setOpen(false)} />}
    </span>
  );
}

function ConflictList({ items, onClose }: { items: OutboxItem[]; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const act = async (it: OutboxItem, how: "mine" | "server" | "edit") => {
    const ask = how === "mine" ? "서버 내용을 내 입력으로 덮어쓸까요? 서버에만 있던 행은 지워집니다." : how === "server" ? "내 입력을 버리고 서버 내용을 유지할까요?" : null;
    if (ask && !confirm(ask)) return;
    setBusy(it.id!);
    try { await resolve(it, how); } finally { setBusy(null); }
    if (how === "edit") { onClose(); router.push(it.kind === "income" ? "/income/entry" : "/expense/entry"); }
    if (items.length <= 1) onClose();
  };
  const btn = "rounded border px-2 py-1 text-xs disabled:opacity-50";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-20" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-surface p-4 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <b className="text-heading">올리지 못한 입력</b>
          <button onClick={onClose} aria-label="닫기" className="text-label"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <p className="mb-3 text-xs text-muted">오프라인에서 한 입력을 올리려는데 서버 내용이 달라졌거나 서버가 거절했어요. 덮어쓰지 않고 두었으니 어떻게 할지 골라 주세요.</p>
        <ul className="space-y-3">
          {items.map((it) => {
            const mine = summarize(it.rows);
            const srv = it.serverRows ? summarize(it.serverRows) : null;
            return (
              <li key={it.id} className="rounded border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b>{it.sunday} 주일 {KIND_LABEL[it.kind]}</b>
                  <span className="text-xs text-muted">기기에 저장 {it.updatedAt.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="mt-1 text-danger">{it.reason}</div>
                <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <div>내 입력: {mine.count}건 · {won(mine.total)}원</div>
                  {srv && <div>서버: {srv.count}건 · {won(srv.total)}원</div>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={busy === it.id} onClick={() => act(it, "edit")} className={`${btn} border-primary text-primary`}>입력 화면에 불러와 직접 맞추기</button>
                  {!it.locked && <button disabled={busy === it.id} onClick={() => act(it, "mine")} className={btn}>내 입력으로 저장(서버 덮어쓰기)</button>}
                  <button disabled={busy === it.id} onClick={() => act(it, "server")} className={`${btn} text-danger`}>내 입력 버리기</button>
                </div>
                {it.locked && <div className="mt-2 text-xs text-muted">마감된 주는 덮어쓸 수 없어요. 관리자가 마감을 풀어야 올릴 수 있어요.</div>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
