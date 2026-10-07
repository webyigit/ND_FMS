"use client";
// 기부금 영수증 A4 출력 서식. 소득세법 시행규칙 별지 제45호의2의 항목 구성만 맞춤 [확인 필요: 정부 양식 원본과 칸 배치]
/* eslint-disable @next/next/no-img-element -- 직인은 DB의 data URL */
import { receiptLines, type Detail } from "@/lib/receipt/calc";
import type { Church } from "@/lib/receipt/api";
import { won } from "@/lib/format";

export type PaperData = {
  serial_no: string; donor_kind: string | null; donor_name: string | null; donor_rrn: string | null;
  donor_brn: string | null; donor_address: string | null; donation_year: number | null; year: number;
  issued_amount: number | null; issued_at: string | null; detail: Detail | null;
};

const th = "border border-black bg-[#f3f3f3] px-2 py-1 text-center font-medium";
const td = "border border-black px-2 py-1";

const dateKo = (d: string | null) => {
  if (!d) return "        년      월      일";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${y}년 ${Number(m)}월 ${Number(dd)}일`;
};

export default function ReceiptPaper({ r, church, sample }: { r: PaperData; church: Church | null; sample?: boolean }) {
  const year = r.donation_year ?? r.year;
  const lines = receiptLines(year, r.detail, r.issued_amount ?? 0);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const cp = r.donor_kind === "CP";
  return (
    <div className="receipt-paper relative mx-auto bg-white p-[10mm] text-[11px] leading-snug text-black shadow-card print:p-0 print:shadow-none"
      style={{ width: "210mm", minHeight: "287mm", breakAfter: "page" }}>
      {sample && <div className="no-print absolute right-3 top-3 rounded bg-warning-subtle px-2 py-0.5 text-xs text-warning">견본(가상 값)</div>}
      {church?.stamp_image && <img src={church.stamp_image} alt="간인" className="absolute right-[6mm] top-[40mm] h-[18mm] w-[18mm] object-contain opacity-90" />}
      <div className="flex justify-between text-[10px]">
        <span>■ 소득세법 시행규칙 [별지 제45호의2서식] <span className="no-print text-warning">[확인 필요: 개정일]</span></span>
        <span>(앞쪽)</span>
      </div>
      <h2 className="my-3 text-center text-[22px] font-bold tracking-[0.5em] text-black">기부금 영수증</h2>
      <div className="mb-1 text-[11px]">일련번호 <b>{r.serial_no}</b></div>

      <div className="mt-2 font-semibold">① 기부자</div>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={`${th} w-[22%]`}>성명(법인명)</th><td className={`${td} w-[28%]`}>{r.donor_name}</td>
            <th className={`${th} w-[22%]`}>{cp ? "사업자등록번호" : "주민등록번호"}</th><td className={td}>{cp ? r.donor_brn : r.donor_rrn}</td>
          </tr>
          <tr><th className={th}>주소(소재지)</th><td className={td} colSpan={3}>{r.donor_address}</td></tr>
        </tbody>
      </table>

      <div className="mt-3 font-semibold">② 기부금 단체</div>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={`${th} w-[22%]`}>단체명</th><td className={`${td} w-[28%]`}>{church?.name}</td>
            <th className={`${th} w-[22%]`}>사업자등록번호(고유번호)</th><td className={td}>{church?.reg_no}</td>
          </tr>
          <tr><th className={th}>소재지</th><td className={td} colSpan={3}>{church?.address}</td></tr>
          <tr>
            <th className={th}>기부금공제대상 기부금단체 근거법령</th>
            <td className={td} colSpan={3}>소득세법 시행령 제80조 제1항 제5호 <span className="no-print text-warning">[확인 필요]</span></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 font-semibold">③ 기부금 모집처(언론기관 등)</div>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={`${th} w-[22%]`}>단체명</th><td className={`${td} w-[28%]`}>&nbsp;</td>
            <th className={`${th} w-[22%]`}>사업자등록번호</th><td className={td}>&nbsp;</td>
          </tr>
          <tr><th className={th}>소재지</th><td className={td} colSpan={3}>&nbsp;</td></tr>
        </tbody>
      </table>

      <div className="mt-3 font-semibold">④ 기부내용</div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th} rowSpan={2}>유형</th><th className={th} rowSpan={2}>코드</th><th className={th} rowSpan={2}>구분<br />(금전 또는 현물)</th>
            <th className={th} rowSpan={2}>연월일</th><th className={th} colSpan={3}>내용</th><th className={th} rowSpan={2}>금액</th>
          </tr>
          <tr><th className={th}>품명</th><th className={th}>수량</th><th className={th}>단가</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.date}>
              <td className={`${td} text-center`}>종교단체</td><td className={`${td} text-center`}>41</td><td className={`${td} text-center`}>금전</td>
              <td className={`${td} text-center`}>{l.date}</td><td className={`${td} text-center`}>{l.content}</td><td className={td} /><td className={td} />
              <td className={`${td} text-right`}>{won(l.amount)}</td>
            </tr>
          ))}
          <tr><th className={th} colSpan={7}>합계</th><td className={`${td} text-right font-semibold`}>{won(total)}</td></tr>
        </tbody>
      </table>

      <p className="mt-5 text-[11px]">
        「소득세법」 제34조, 「조세특례제한법」 제58조·제76조·제88조의4 및 「법인세법」 제24조에 따른 기부금을 위와 같이 기부하였음을 증명하여 주시기 바랍니다.
        <span className="no-print text-warning"> [확인 필요: 문구]</span>
      </p>
      <div className="mt-2 text-right">{dateKo(r.issued_at)}</div>
      <div className="mt-1 text-right">신청인 <span className="inline-block min-w-[30mm] text-center">{r.donor_name}</span> (서명 또는 인)</div>

      <p className="mt-6 text-center text-[12px]">위와 같이 기부금을 기부받았음을 증명합니다.</p>
      <div className="mt-2 text-right">{dateKo(r.issued_at)}</div>
      <div className="relative mt-2 text-right">
        기부금 수령인 <span className="inline-block min-w-[40mm] text-center font-semibold">{church?.name}</span> (서명 또는 인)
        {church?.seal_image && <img src={church.seal_image} alt="직인" className="absolute -top-[8mm] right-[2mm] h-[24mm] w-[24mm] object-contain" />}
      </div>
      {church?.pastor && <div className="mt-1 text-right text-[10px]">대표자 {church.pastor}</div>}
    </div>
  );
}
