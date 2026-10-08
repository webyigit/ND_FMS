"use client";
// 기부금 영수증 A4 출력 서식: 소득세법 시행규칙 [별지 제45호의2서식] <개정 2021. 3. 16.> 앞쪽의 칸 구성·문구·순서를 그대로 재현.
// 기준: 국가법령정보센터 서식(교회가 실제 발급한 영수증 PDF의 원본 서식과 대조). 뒤쪽 작성방법은 출력하지 않음.
/* eslint-disable @next/next/no-img-element -- 직인은 DB의 data URL */
import type { Detail } from "@/lib/receipt/calc";
import type { Church } from "@/lib/receipt/api";
import { won } from "@/lib/format";

export type PaperData = {
  serial_no: string; donor_kind: string | null; donor_name: string | null; donor_rrn: string | null;
  donor_brn: string | null; donor_address: string | null; donation_year: number | null; year: number;
  issued_amount: number | null; issued_at: string | null; detail: Detail | null;
};

// 정부 서식처럼 좌우 바깥선 없이 가로선과 안쪽 세로선만 둔다
const box = "w-full table-fixed border-collapse";
const sec = "border-t-[1.5pt] border-black px-1 pt-[1.2mm] pb-[0.8mm] text-[11pt] font-bold";
const lb = "border-t-[0.5pt] border-black px-1 py-[1.2mm] align-top whitespace-nowrap";
const vl = "border-t-[0.5pt] border-black px-1 py-[1.2mm] align-top font-semibold";
const dot = "!border-dotted";
const sep = "border-l-[0.5pt] border-black";
const ROWS = 6; // 기부내용 칸 수(서식 기본)

const dateKo = (d: string | null) => {
  if (!d) return "년      월      일";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${y}년 ${Number(m)}월 ${Number(dd)}일`;
};

export default function ReceiptPaper({ r, church, sample }: { r: PaperData; church: Church | null; sample?: boolean }) {
  const year = r.donation_year ?? r.year;
  const cp = r.donor_kind === "CP";
  // 금전 기부는 연간 한 줄(교회 발급 관행: "YYYY년도(연간)"), 내용(품명·수량·단가)은 현물일 때만 적는다
  const lines = [{ code: "41", kind: "금전", date: `${year}년도(연간)`, amount: r.issued_amount ?? 0 }];
  const blanks = Math.max(0, ROWS - lines.length);
  const receiver = [church?.name, church?.pastor].filter(Boolean).join(" ");
  return (
    <div className="receipt-paper relative mx-auto bg-white px-[15mm] py-[12mm] text-[9.5pt] leading-snug text-black shadow-card break-after-page last:break-after-auto min-h-[297mm] print:min-h-0 print:w-auto print:p-0 print:shadow-none"
      style={{ width: "210mm", fontFamily: "'Batang','바탕','Nanum Myeongjo',serif" }}>
      {sample && <div className="no-print absolute right-3 top-3 rounded bg-warning-subtle px-2 py-0.5 text-xs text-warning">견본(가상 값)</div>}
      {church?.stamp_image && <img src={church.stamp_image} alt="간인" className="absolute right-[10mm] top-[2mm] h-[16mm] w-[16mm] object-contain opacity-90 print:-top-[8mm] print:right-0" />}

      <div className="text-[8pt]">■ 소득세법 시행규칙 [별지 제45호의2서식] &lt;개정 2021. 3. 16.&gt;</div>
      <div className="relative mt-[2mm] flex items-center">
        <table className="border-collapse text-[9pt]">
          <tbody>
            <tr>
              <td className="border-[0.5pt] border-black px-[3mm] py-[1.2mm]">일련번호</td>
              <td className="min-w-[24mm] border-[0.5pt] border-black px-[3mm] py-[1.2mm] text-center font-semibold">{r.serial_no}</td>
            </tr>
          </tbody>
        </table>
        <h2 className="absolute left-1/2 -translate-x-1/2 text-[20pt] font-bold tracking-[0.6em] text-black">기부금 영수증</h2>
      </div>

      {/* ❶ 기부자 */}
      <table className={`${box} mt-[5mm]`}>
        <colgroup><col className="w-[21%]" /><col className="w-[29%]" /><col className="w-[21%]" /><col /></colgroup>
        <tbody>
          <tr><td colSpan={4} className={sec}>❶ 기부자</td></tr>
          <tr>
            <td className={lb}>성명(법인명)</td><td className={vl}>{r.donor_name}</td>
            <td className={`${lb} ${sep}`}>주민등록번호<br />(사업자등록번호)</td><td className={vl}>{cp ? r.donor_brn : r.donor_rrn}</td>
          </tr>
          <tr>
            <td className={`${lb} border-b-[0.5pt] pb-[6mm]`}>주소(소재지)</td>
            <td colSpan={3} className={`${vl} border-b-[0.5pt]`}>{r.donor_address}</td>
          </tr>
        </tbody>
      </table>

      {/* ❷ 기부금 단체 */}
      <table className={`${box} mt-[3mm]`}>
        <colgroup><col className="w-[16%]" /><col className="w-[44%]" /><col className="w-[24%]" /><col /></colgroup>
        <tbody>
          <tr><td colSpan={4} className={sec}>❷ 기부금 단체</td></tr>
          <tr>
            <td className={lb}>단 체 명</td><td className={vl}>{church?.name}</td>
            <td className={`${lb} ${sep}`}>사업자등록번호(고유번호)</td><td className={vl}>{church?.reg_no}</td>
          </tr>
          <tr>
            <td className={`${lb} ${dot}`}>(지점명)</td><td className={`${vl} ${dot}`} />
            <td className={`${lb} ${sep} ${dot}`} colSpan={2}>(지점 사업자등록번호 등)</td>
          </tr>
          <tr>
            <td className={lb}>소 재 지</td><td className={vl}>{church?.address}</td>
            <td className={`${lb} ${sep}`} rowSpan={2}>기부금공제대상<br />기부금단체 근거법령</td><td className={vl} rowSpan={2} />
          </tr>
          <tr><td className={`${lb} ${dot}`}>(지점 소재지)</td><td className={`${vl} ${dot}`} /></tr>
          <tr>
            <td colSpan={4} className="border-y-[0.5pt] border-black px-1 py-[0.8mm] text-[8.5pt]">
              * 기부금 단체의 지점(분사무소)이 기부받은 경우, 지점명 등을 추가로 기재할 수 있습니다.
            </td>
          </tr>
        </tbody>
      </table>

      {/* ❸ 기부금 모집처 */}
      <table className={box}>
        <colgroup><col className="w-[16%]" /><col className="w-[34%]" /><col className="w-[16%]" /><col /></colgroup>
        <tbody>
          <tr><td colSpan={4} className={`${sec} !border-t-[0.5pt]`}>❸ 기부금 모집처(언론기관 등)</td></tr>
          <tr>
            <td className={`${lb} pb-[4mm]`}>단 체 명</td><td className={vl} />
            <td className={`${lb} ${sep}`}>사업자등록번호</td><td className={vl} />
          </tr>
          <tr><td className={`${lb} border-b-[0.5pt] pb-[6mm]`}>소 재 지</td><td colSpan={3} className={`${vl} border-b-[0.5pt]`} /></tr>
        </tbody>
      </table>

      {/* ❹ 기부내용 */}
      <table className={`${box} mt-[3mm] text-center`}>
        <colgroup>
          <col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[19%]" />
          <col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col />
        </colgroup>
        <tbody>
          <tr><td colSpan={7} className={`${sec} text-left`}>❹ 기부내용</td></tr>
          <tr>
            <td rowSpan={2} className="border-t-[0.5pt] border-black">코 드</td>
            <td rowSpan={2} className={`border-t-[0.5pt] border-black ${sep}`}>구 분<br /><span className="text-[7.5pt]">(금전 또는<br />현물)</span></td>
            <td rowSpan={2} className={`border-t-[0.5pt] border-black ${sep}`}>연월일</td>
            <td colSpan={3} className={`border-t-[0.5pt] border-black py-[1.2mm] ${sep}`}>내 용</td>
            <td rowSpan={2} className={`border-t-[0.5pt] border-black ${sep}`}>금 액</td>
          </tr>
          <tr>
            <td className={`border-t-[0.5pt] border-black py-[1.2mm] ${sep}`}>품명</td>
            <td className={`border-t-[0.5pt] border-black ${sep}`}>수량</td>
            <td className={`border-t-[0.5pt] border-black ${sep}`}>단가</td>
          </tr>
          {lines.map((l, i) => (
            <tr key={i} className="h-[8mm] font-semibold">
              <td className="border-t-[0.5pt] border-black">{l.code}</td>
              <td className={`border-t-[0.5pt] border-black ${sep}`}>{l.kind}</td>
              <td className={`border-t-[0.5pt] border-black ${sep}`}>{l.date}</td>
              <td className={`border-t-[0.5pt] border-black ${sep}`} /><td className={`border-t-[0.5pt] border-black ${sep}`} /><td className={`border-t-[0.5pt] border-black ${sep}`} />
              <td className={`border-t-[0.5pt] border-black px-2 text-right ${sep}`}>{won(l.amount)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`b${i}`} className="h-[8mm]">
              <td className="border-t-[0.5pt] border-black" />
              {Array.from({ length: 6 }, (_, j) => <td key={j} className={`border-t-[0.5pt] border-black ${sep}`} />)}
            </tr>
          ))}
          <tr><td colSpan={7} className="border-t-[0.5pt] border-black" /></tr>
        </tbody>
      </table>

      <p className="mt-[5mm] indent-[12mm] text-[10pt] leading-relaxed">
        「소득세법」 제34조, 「조세특례제한법」 제76조ㆍ제88조의4 및 「법인세법」 제24조에 따른 기부금을 위와 같이 기부하였음을 증명하여 주시기 바랍니다.
      </p>
      <div className="mt-[4mm] text-right">{dateKo(r.issued_at)}</div>
      <div className="mt-[6mm] flex items-baseline justify-end gap-[10mm] pb-[4mm]">
        <span className="text-[10.5pt]">신청인</span>
        <span className="min-w-[60mm] text-right">{r.donor_name} <span className="text-[9pt]">(서명 또는 인)</span></span>
      </div>

      <div className="border-t-[0.5pt] border-black pt-[3mm]">
        <p className="indent-[12mm] text-[10pt]">위와 같이 기부금을 기부받았음을 증명합니다.</p>
        <div className="mt-[4mm] text-right">{dateKo(r.issued_at)}</div>
        <div className="relative mt-[6mm] flex items-baseline justify-end gap-[10mm] pb-[3mm]">
          <span className="text-[10.5pt]">기부금 수령인</span>
          <span className="min-w-[80mm] text-right font-semibold">{receiver} <span className="text-[9pt] font-normal">(서명 또는 인)</span></span>
          {church?.seal_image && <img src={church.seal_image} alt="직인" className="absolute -top-[9mm] right-[1mm] h-[24mm] w-[24mm] object-contain" />}
        </div>
      </div>
      <div className="border-t-[3pt] border-double border-black" />
    </div>
  );
}
