// 교인명단: 검색·정렬·주민번호 형식·엑셀 일괄 등록/내려받기 (순수 함수)
import { sortForList } from "../offeringOrder";

export type MemberRow = {
  id: number; name: string; name_suffix: string | null; full_name: string;
  title: string | null; display_rank: number | null; district: string | null; zone: string | null;
  service_dept: string | null; service_role: string | null; phone: string | null; address: string | null;
  is_group: boolean; is_anonymous: boolean; exclude_from_receipt: boolean; active: boolean;
  household_id: number | null; household_label: string | null; is_household_head: boolean;
  has_rrn: boolean; rrn_mask: string | null;
};

export const ALIAS_KINDS = [
  { value: "name", label: "이름 표기" },
  { value: "typo", label: "오타" },
  { value: "joint", label: "공동명의·가족" },
  { value: "corporate", label: "법인 표기" },
] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number]["value"];

/** 이름·직분·교구·구역 어디에든 들어 있으면 (띄어쓰기 무시) */
export function matchMember(m: Pick<MemberRow, "full_name" | "title" | "district" | "zone">, q: string) {
  const k = q.replace(/\s/g, "");
  if (!k) return true;
  return [m.full_name, m.title, m.district, m.zone].some((v) => (v ?? "").replace(/\s/g, "").includes(k));
}

/** 헌금명단 순서: 노출순서 먼저, 나머지 가나다 (offeringOrder 규칙) */
export const sortMembers = <T extends Pick<MemberRow, "full_name" | "display_rank">>(xs: T[]) =>
  sortForList(xs.map((x) => ({ ...x, name: x.full_name, displayRank: x.display_rank }))) as unknown as T[];

/** 주민번호: 숫자 13자리면 900101-1234567 형식, 아니면 null */
export function normalizeRrn(s: string) {
  const d = s.replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 6)}-${d.slice(6)}` : null;
}

/** 휴대폰: 숫자만 남겨 010-0000-0000 형식(형식이 다르면 입력값 그대로) */
export function normalizePhone(s: string) {
  const d = s.replace(/\D/g, "");
  if (/^01\d{8,9}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return s.trim();
}

// ===== 엑셀 일괄 등록 =====
export type ImportRow = { name: string; name_suffix: string; title: string; district: string; zone: string; phone: string };
export type ImportPreview = ImportRow & { status: "new" | "exists" | "dup" | "empty" };

const HEAD: Record<keyof ImportRow, string[]> = {
  name: ["이름", "성명", "교인명"],
  name_suffix: ["접미사", "동명이인"],
  title: ["직분"],
  district: ["교구"],
  zone: ["구역"],
  phone: ["휴대폰", "휴대전화", "전화", "연락처"],
};
const cell = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** 머리글 행(이름 칸이 있는 첫 행)을 찾아 열을 맞춘다. 머리글이 없으면 null */
export function parseMemberSheet(rows: unknown[][]): ImportRow[] | null {
  const hi = rows.findIndex((r) => r.some((v) => HEAD.name.includes(cell(v).replace(/\s/g, ""))));
  if (hi < 0) return null;
  const head = rows[hi].map((v) => cell(v).replace(/\s/g, ""));
  const col = Object.fromEntries(
    (Object.keys(HEAD) as (keyof ImportRow)[]).map((k) => [k, head.findIndex((h) => HEAD[k].some((w) => h.startsWith(w)))]),
  ) as Record<keyof ImportRow, number>;
  return rows.slice(hi + 1)
    .map((r) => {
      const get = (k: keyof ImportRow) => (col[k] >= 0 ? cell(r[col[k]]) : "");
      // "홍길동A" 처럼 붙여 쓴 접미사는 따로 떼지 않는다(실제 이름일 수 있음) [확인 필요]
      return { name: get("name"), name_suffix: get("name_suffix").toUpperCase(), title: get("title"), district: get("district"), zone: get("zone"), phone: get("phone") && normalizePhone(get("phone")) };
    })
    .filter((r) => Object.values(r).some(Boolean));
}

/** 미리보기 상태: 새로 등록 / 이미 있음 / 파일 안 중복 / 이름 없음 */
export function previewImport(rows: ImportRow[], existing: string[]): ImportPreview[] {
  const have = new Set(existing);
  const seen = new Set<string>();
  return rows.map((r) => {
    const key = r.name + r.name_suffix;
    const status = !r.name ? "empty" : have.has(key) ? "exists" : seen.has(key) ? "dup" : "new";
    seen.add(key);
    return { ...r, status };
  });
}

export const IMPORT_TEMPLATE = [["이름", "직분", "교구", "구역", "휴대폰"], ["가나다", "집사", "1교구", "1구역", "010-0000-0000"]];

// ===== 엑셀 내려받기 (주민번호는 마스킹 값만) =====
export const EXPORT_HEAD = ["이름", "직분", "교구", "구역", "봉사부서", "직책", "휴대폰", "주소", "주민번호", "가족", "세대주", "노출순서", "단체", "무명", "영수증 제외", "상태"];
export function exportRows(xs: MemberRow[]) {
  const yn = (b: boolean) => (b ? "O" : "");
  return [EXPORT_HEAD, ...xs.map((m) => [
    m.full_name, m.title, m.district, m.zone, m.service_dept, m.service_role, m.phone, m.address,
    m.rrn_mask, m.household_label, yn(m.is_household_head), m.display_rank, yn(m.is_group), yn(m.is_anonymous),
    yn(m.exclude_from_receipt), m.active ? "" : "비활성",
  ])];
}
