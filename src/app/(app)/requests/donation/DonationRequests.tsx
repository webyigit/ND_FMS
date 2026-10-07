"use client";
// 신청관리 > 기부금영수증 신청: 목록(주민번호 마스킹) → 교인 연결·헌금 합산 확인 → 영수증 발행으로 / 반려
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DbOnly from "@/components/ui/DbOnly";
import Notice from "@/components/ui/Notice";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { dbError } from "@/lib/db/weekly";
import { won } from "@/lib/format";
import { aggregateIncome } from "@/lib/receipt/calc";
import { familyOf, loadFamilyIncome, searchDonors, type DonorHit } from "@/lib/receipt/api";
import { supabaseBrowser } from "@/lib/supabase/client";

type Req = {
  id: number; request_no: string; year: number; name: string; rrn_masked: string | null; has_rrn: boolean; phone: string | null;
  address: string | null; request_note: string | null; family_names: string[] | null; is_returning: boolean;
  member_id: number | null; member_name: string | null; status: string; donation_receipt_id: number | null; serial_no: string | null;
  created_at: string; review_note: string | null;
};
const STATUS: Record<string, [string, string]> = {
  requested: ["신청", "bg-warning-subtle text-warning"],
  approved: ["승인", "bg-info-subtle text-info"],
  rejected: ["반려", "bg-danger-subtle text-danger"],
  done: ["발행 완료", "bg-success-subtle text-success"],
};

export default function DonationRequests() {
  return <DbOnly what="기부금영수증 신청 관리"><List /></DbOnly>;
}

function List() {
  const [status, setStatus] = useState("requested");
  const [sel, setSel] = useState<number | null>(null);
  const q = useDbQuery(async (sb) => {
    let query = sb.from("v_donation_request").select("*").order("created_at", { ascending: false }).limit(300);
    if (status) query = query.eq("status", status);
    return must(await query) as Req[];
  }, [status]);
  const cur = q.data?.find((r) => r.id === sel) ?? null;

  return (
    <>
      <PageHeader actions={
        <select value={status} onChange={(e) => { setStatus(e.target.value); setSel(null); }} className={input}>
          <option value="">전체</option>
          {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>} />
      {q.error && <Notice kind="error">불러오지 못했어요: {q.error}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr><th className="px-3 py-2 text-left">접수번호</th><th className="text-left">성명</th><th>주민번호</th><th>휴대폰</th><th>연도</th><th>교인</th><th>상태</th><th>신청일</th></tr>
            </thead>
            <tbody>
              {q.loading && <tr><td colSpan={8} className="px-3 py-4 text-center text-muted">불러오는 중…</td></tr>}
              {q.data && !q.data.length && <tr><td colSpan={8} className="px-3 py-4 text-center text-muted">신청이 없어요.</td></tr>}
              {q.data?.map((r) => (
                <tr key={r.id} onClick={() => setSel(r.id)} className={`cursor-pointer border-t hover:bg-surface-2 ${sel === r.id ? "bg-primary-subtle" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.request_no}</td>
                  <td className="text-heading">{r.name}{r.is_returning && <span className="text-xs text-muted"> (재신청)</span>}</td>
                  <td className="whitespace-nowrap text-center text-xs">{r.rrn_masked ?? "-"}</td>
                  <td className="whitespace-nowrap text-center text-xs">{r.phone}</td>
                  <td className="text-center text-xs">{r.year}</td>
                  <td className="text-center text-xs">{r.member_name ?? <span className="text-warning">미연결</span>}</td>
                  <td className="text-center"><span className={`rounded px-2 py-0.5 text-xs ${STATUS[r.status]?.[1]}`}>{STATUS[r.status]?.[0] ?? r.status}</span></td>
                  <td className="whitespace-nowrap text-center text-xs">{r.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cur ? <Detail key={cur.id} r={cur} onChanged={q.reload} /> : <div className={`${card} p-4 text-sm text-muted`}>목록에서 신청을 고르세요.</div>}
      </div>
      <p className="mt-3 text-xs text-muted">공개 페이지(/donation-request)에서 들어온 신청이에요. 주민번호는 가려서 보이고, 발행할 때 서버에서 그대로 옮겨요. 보관기간 [확인 필요].</p>
    </>
  );
}

function Detail({ r, onChanged }: { r: Req; onChanged: () => void }) {
  const sb = supabaseBrowser()!;
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hits, setHits] = useState<DonorHit[] | null>(null);
  const [reason, setReason] = useState("");

  const sum = useDbQuery(async (s) => {
    if (!r.member_id) return null;
    const fam = await familyOf(s, r.member_id);
    const rows = await loadFamilyIncome(s, fam.map((f) => f.id), r.year);
    return { fam, agg: aggregateIncome(rows) };
  }, [r.member_id, r.year]);
  const agg = sum.data?.agg;
  const open = r.status === "requested" || r.status === "approved";

  const patch = async (p: Record<string, unknown>, ok: string) => {
    setMsg(null);
    try {
      const rows = must(await sb.from("donation_request").update(p).eq("id", r.id).select("id"));
      if (!(rows as unknown[]).length) throw new Error("권한이 없어요");
      setMsg({ ok: true, text: ok }); onChanged();
    } catch (e) { setMsg({ ok: false, text: dbError(e) }); }
  };
  const findMember = async () => {
    try { setHits(await searchDonors(sb, r.name)); } catch (e) { setMsg({ ok: false, text: dbError(e) }); }
  };
  const reject = async () => {
    if (!reason.trim()) return setMsg({ ok: false, text: "반려 사유를 적어 주세요." });
    const { data } = await sb.auth.getUser();
    patch({ status: "rejected", review_note: reason.trim(), reviewed_by: data.user?.id ?? null, reviewed_at: new Date().toISOString() }, "반려했어요.");
  };
  const goIssue = () => {
    const p = new URLSearchParams({ request: String(r.id), year: String(r.year) });
    if (r.member_id) p.set("member", String(r.member_id));
    router.push(`/receipt/issue?${p}`);
  };
  const info = useMemo(() => [
    ["접수번호", r.request_no], ["성명", r.name], ["주민번호", r.rrn_masked ?? "없음"], ["휴대폰", r.phone],
    ["주소", r.address], ["기부 연도", `${r.year}년`], ["가족명단", r.family_names?.join(", ")], ["요청사항", r.request_note],
    ["구분", r.is_returning ? "이전 신청자(성명+휴대폰 일치로 지난 정보 사용)" : "처음 신청"],
  ] as const, [r]);

  return (
    <div className={`${card} space-y-4 p-4 text-sm`}>
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1">
        {info.map(([k, v]) => <Fragment key={k}><dt className="text-xs text-label">{k}</dt><dd className="text-heading">{v || "-"}</dd></Fragment>)}
        {r.review_note && <><dt className="text-xs text-label">검토 메모</dt><dd>{r.review_note}</dd></>}
        {r.serial_no && <><dt className="text-xs text-label">발행번호</dt><dd className="font-mono">{r.serial_no}</dd></>}
      </dl>

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-label">연결된 교인</span>
          {open && <button onClick={findMember} className={btn}>{r.member_id ? "다른 교인" : "교인 찾기"}</button>}
        </div>
        <div className="text-heading">{r.member_name ?? <span className="text-warning">연결 안 됨 · 성명+휴대폰이 교인정보와 하나로 맞지 않았어요</span>}</div>
        {hits && (
          <ul className="mt-2 rounded border">
            {!hits.length && <li className="px-3 py-2 text-muted">같은 이름의 교인이 없어요.</li>}
            {hits.map((h) => (
              <li key={h.member_id} className="flex items-center justify-between border-t px-3 py-1.5 first:border-0">
                <span>{h.name} <span className="text-xs text-muted">{h.phone ?? ""} · {h.family.length ? `가족 ${h.family.join(", ")}` : ""}</span></span>
                <button onClick={() => { setHits(null); patch({ member_id: h.member_id }, `${h.name}님과 연결했어요.`); }} className="text-xs text-primary">연결</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {r.member_id && (
        <div className="border-t pt-3">
          <div className="mb-1 text-xs text-label">{r.year}년 가족 합산 헌금 {sum.data && `· ${sum.data.fam.map((f) => f.name).join(", ")}`}</div>
          {sum.error && <Notice kind="error">{sum.error}</Notice>}
          {sum.loading && <div className="text-muted">불러오는 중…</div>}
          {agg && (
            <table className="w-full">
              <tbody>
                {agg.types.map((t) => <tr key={t.name} className="border-t"><td className="py-1">{t.name}</td><td className="text-right">{won(t.amount)}</td></tr>)}
                <tr className="border-t font-semibold"><td className="py-1">합계</td><td className="text-right">{won(agg.total)}원</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t pt-3">
          <button onClick={goIssue} className={`${btnPrimary} w-full py-2`}>영수증 발행으로 →</button>
          <div className="flex gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="반려 사유" className={`${input} flex-1`} />
            <button onClick={reject} className={`${btn} text-danger`}>반려</button>
          </div>
        </div>
      )}
    </div>
  );
}
