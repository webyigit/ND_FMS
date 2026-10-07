"use client";
// 지난 발행 기록 팝업: 같은 교인 또는 같은 이름으로 발행된 영수증 → 기부자 정보 이어쓰기(주민번호는 서버에서만)
import { btn, card } from "@/components/ui/Buttons";
import Notice from "@/components/ui/Notice";
import { must, useDbQuery } from "@/lib/db/useDb";
import { won } from "@/lib/format";
import { RECEIPT_COLS, type ReceiptView } from "@/lib/receipt/api";
import { STATUS_LABEL } from "@/lib/receipt/ledger";

export default function PastPopup({ name, memberId, onUse, onClose }: { name: string; memberId: number | null; onUse: (r: ReceiptView) => void; onClose: () => void }) {
  const q = useDbQuery(async (sb) => {
    const nm = `"${name.trim().replace(/"/g, "")}"`;
    const filter = memberId ? `member_id.eq.${memberId},donor_name.eq.${nm}` : `donor_name.eq.${nm}`;
    return must(await sb.from("v_donation_receipt").select(RECEIPT_COLS).or(filter).order("year", { ascending: false }).order("id", { ascending: false }).limit(30)) as ReceiptView[];
  }, [name, memberId]);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className={`${card} max-h-[80vh] w-full max-w-3xl overflow-auto p-4`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{name} 지난 발행 기록</h2>
          <button onClick={onClose} className={btn}>닫기</button>
        </div>
        {q.error && <Notice kind="error">{q.error}</Notice>}
        {q.loading && <div className="text-sm text-muted">불러오는 중…</div>}
        {q.data && !q.data.length && <div className="text-sm text-muted">지난 발행 기록이 없어요.</div>}
        {!!q.data?.length && (
          <table className="w-full text-sm">
            <thead className="text-xs text-label"><tr><th className="text-left">발행번호</th><th className="text-left">성명</th><th>주민번호</th><th className="text-left">주소</th><th className="text-right">금액</th><th>상태</th><th /></tr></thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap py-1.5 font-mono text-xs">{r.serial_no}</td>
                  <td>{r.donor_name}</td>
                  <td className="whitespace-nowrap text-center text-xs">{(r.donor_kind === "CP" ? r.donor_brn : r.donor_rrn_masked) ?? "-"}</td>
                  <td className="max-w-[220px] truncate text-xs">{r.donor_address}</td>
                  <td className="text-right">{won(r.issued_amount)}</td>
                  <td className="text-center text-xs">{STATUS_LABEL[r.status]?.[0]}</td>
                  <td className="text-right"><button onClick={() => onUse(r)} className="text-xs text-primary">이 정보 쓰기</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted">이 정보 쓰기: 성명·주소·구분을 채우고, 주민번호는 화면에 꺼내지 않고 그 영수증의 것을 그대로 써요.</p>
      </div>
    </div>
  );
}
