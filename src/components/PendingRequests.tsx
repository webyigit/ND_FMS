"use client";
// 외부 주소(/donation-request, /request, /m)에서 들어온 미처리 신청: 재정 권한으로 들어오면 상단 레이어 팝업으로 띄우고,
// 누르면 그 신청의 처리 화면으로 바로 간다. 팝업을 닫아도 상단 띠는 남는다(처리할 때까지).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faFileInvoice, faInbox, faWallet, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useDbQuery } from "@/lib/db/useDb";
import { useMe } from "@/lib/work/me";
import { CHANGED_EVENT, KIND_LABEL, itemKey, loadPending, readSeen, unseen, writeSeen, type PendingItem, type PendingKind } from "@/lib/requests/pending";

const ICON = { donation: faFileInvoice, expense: faWallet, budget: faInbox } as const;
const COLOR: Record<PendingKind, string> = { donation: "bg-primary-subtle text-primary", expense: "bg-warning-subtle text-warning", budget: "bg-info-subtle text-info" };
const ago = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  return h < 1 ? "방금" : h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
};

export default function PendingRequests() {
  const me = useMe();
  const finance = me.data?.role === "admin" || me.data?.role === "treasurer";
  const path = usePathname();
  const [tick, setTick] = useState(0);
  // 화면을 옮길 때마다, 처리 화면이 신호를 보낼 때마다 다시 읽는다
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(CHANGED_EVENT, on);
    return () => window.removeEventListener(CHANGED_EVENT, on);
  }, []);
  const q = useDbQuery(async (sb) => (finance ? loadPending(sb) : []), [finance, path, tick]);
  const items = useMemo(() => q.data ?? [], [q.data]);
  const [manual, setManual] = useState(false);
  const [seenVer, setSeenVer] = useState(0); // 닫을 때 올려서 다시 계산
  // 이번 세션에서 아직 안 보여준 신청이 있으면 팝업이 자동으로 열린다(새 신청이 들어오면 다시 뜬다)
  const auto = useMemo(() => items.length > 0 && unseen(items, readSeen()).length > 0, [items, seenVer]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!finance || !items.length) return null;

  const open = manual || auto;
  const setOpen = (v: boolean) => { if (v) setManual(true); else { writeSeen([...readSeen(), ...items.map(itemKey)]); setManual(false); setSeenVer((n) => n + 1); } };
  const close = () => setOpen(false);
  const counts = (["donation", "expense", "budget"] as PendingKind[]).map((k) => [k, items.filter((i) => i.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/20 bg-primary-subtle px-4 py-2 text-sm lg:px-6">
        <button onClick={() => setOpen(true)} className="font-semibold text-primary"><FontAwesomeIcon icon={faBell} className="mr-1" />외부 신청 {items.length}건 처리 대기</button>
        {counts.map(([k, n]) => <span key={k} className="text-heading">{KIND_LABEL[k]} {n}건</span>)}
        <button onClick={() => setOpen(true)} className="ml-auto text-xs text-primary underline">목록 보기</button>
      </div>
      {open && <Popup items={items} onClose={close} />}
    </>
  );
}

function Popup({ items, onClose }: { items: PendingItem[]; onClose: () => void }) {
  const router = useRouter();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const go = (i: PendingItem) => { onClose(); router.push(i.href); };
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16 sm:pt-24" onClick={onClose} role="dialog" aria-modal="true" aria-label="처리할 외부 신청">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-base font-semibold text-heading"><FontAwesomeIcon icon={faBell} className="mr-2 text-primary" />처리할 외부 신청 {items.length}건</div>
            <div className="text-xs text-muted">누르면 그 신청의 처리 화면으로 바로 가요. 기부금영수증은 신청자를 찾아 초안을 만들어 두고, 승인하면 번호를 붙여 발행해요.</div>
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded p-1 text-label hover:bg-surface-2"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <ul className="max-h-[60vh] divide-y overflow-auto">
          {items.map((i) => (
            <li key={itemKey(i)}>
              <button onClick={() => go(i)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${COLOR[i.kind]}`}><FontAwesomeIcon icon={ICON[i.kind]} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-heading">{i.title}</span>
                  <span className="block truncate text-xs text-muted">{KIND_LABEL[i.kind]} · {i.sub}</span>
                </span>
                <span className="shrink-0 text-xs text-label">{ago(i.at)}</span>
                <span className="shrink-0 text-sm text-primary">처리 →</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted">
          <span className="space-x-3"><Link href="/requests/donation" onClick={onClose} className="text-primary">기부금영수증 신청 관리</Link><Link href="/requests/expense" onClick={onClose} className="text-primary">지출신청 관리</Link></span>
          <button onClick={onClose} className="rounded border px-3 py-1 text-heading">나중에</button>
        </div>
      </div>
    </div>
  );
}
