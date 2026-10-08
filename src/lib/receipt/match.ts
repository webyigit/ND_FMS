// 기부금영수증 신청자 ↔ 교인 자동 매칭. 성명으로 찾은 후보를 휴대폰·가족명단으로 좁힌다.
import type { DonorHit } from "./api";

export type RequestHint = { name: string; phone?: string | null; family_names?: string[] | null };
export type Match = {
  /** 한 명으로 확정된 교인 */ auto: DonorHit | null;
  /** 골라야 하는 후보(확정 못 했을 때). 점수 높은 순 */ candidates: DonorHit[];
  /** 확정 근거(화면 안내용) */ reason: "name_phone" | "name_family" | "name_only" | null;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const core = (s: string) => s.replace(/\s+/g, "").replace(/[A-Za-z0-9()]+$/, ""); // 이름 뒤 구분 접미(A, B, (부))는 뺀다

export function rankCandidates(hits: DonorHit[], req: RequestHint): Match {
  if (!hits.length) return { auto: null, candidates: [], reason: null };
  const ph = digits(req.phone);
  const fam = (req.family_names ?? []).map((n) => n.replace(/\s+/g, "")).filter(Boolean);
  const nm = req.name.replace(/\s+/g, "");

  const scored = hits.map((h) => {
    let score = 0;
    const exact = h.name === nm || core(h.name) === nm;
    if (exact) score += 2;
    const phoneOk = ph.length >= 10 && digits(h.phone) === ph;
    if (phoneOk) score += 10;
    const famOk = fam.length > 0 && fam.some((f) => h.family.some((x) => x === f || core(x) === f));
    if (famOk) score += 5;
    return { h, score, phoneOk, famOk, exact };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const tie = scored.filter((s) => s.score === top.score).length > 1;
  if (top.phoneOk && !tie) return { auto: top.h, candidates: [], reason: "name_phone" };
  if (top.famOk && !tie) return { auto: top.h, candidates: [], reason: "name_family" };
  const exacts = scored.filter((s) => s.exact);
  if (exacts.length === 1 && hits.length === 1) return { auto: exacts[0].h, candidates: [], reason: "name_only" };
  return { auto: null, candidates: scored.map((s) => s.h), reason: null };
}
