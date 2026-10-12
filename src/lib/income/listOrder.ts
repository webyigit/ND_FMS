// 명단순서 편집(수입입력 > 명단순서): 직분 순서와 앞에 오는 명단을 고치고, 바뀐 교인만 저장한다 (순수 함수)
import type { Member } from "../demo";
import { listRank } from "../offeringOrder";

export type OrderState = {
  titles: string[];
  /** 교인별 직분(편집 중) */
  title: Record<number, string>;
  /** 직분과 상관없이 앞에 두는 교인(개별 지정) */
  pinned: number[];
  /** 화면에서 정한 순서(교인 id). 없는 교인은 같은 묶음 안에서 가나다 */
  order: number[];
};
export type FrontRow = { id: number; name: string; title: string; group: number };
export type OrderChange = { id: number; title: string; rank: number | null };

export function initOrder(members: Member[], titles: string[]): OrderState {
  const ranked = members
    .map((m) => ({ m, r: listRank(m, titles) }))
    .filter((x) => x.r != null)
    .sort((a, b) => a.r! - b.r! || a.m.name.localeCompare(b.m.name, "ko"));
  return {
    titles: [...titles],
    title: Object.fromEntries(members.map((m) => [m.id, m.title ?? ""])),
    pinned: members.filter((m) => m.rank != null && !titles.includes(m.title ?? "")).map((m) => m.id),
    order: ranked.map((x) => x.m.id),
  };
}

/** 앞에 오는 명단: 지정 직분 묶음(직분 순서대로) → 개별 지정 묶음. 나머지는 가나다라 목록에 없다 */
export function frontRows(s: OrderState, members: Member[]): FrontRow[] {
  const pos = new Map(s.order.map((id, i) => [id, i]));
  const pinned = new Set(s.pinned);
  return members
    .map((m) => {
      const title = s.title[m.id] ?? "";
      const t = s.titles.indexOf(title);
      return { id: m.id, name: m.name, title, group: title && t >= 0 ? t : pinned.has(m.id) ? s.titles.length : -1 };
    })
    .filter((r) => r.group >= 0)
    .sort((a, b) => a.group - b.group || (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity) || a.name.localeCompare(b.name, "ko"));
}

/** 같은 묶음 안에서 한 칸 위(-1)/아래(+1) */
export function moveMember(s: OrderState, members: Member[], id: number, dir: -1 | 1): OrderState {
  const rows = frontRows(s, members);
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length || rows[j].group !== rows[i].group) return s;
  const ids = rows.map((r) => r.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...s, order: ids };
}

export function moveTitle(s: OrderState, i: number, dir: -1 | 1): OrderState {
  const j = i + dir;
  if (j < 0 || j >= s.titles.length) return s;
  const titles = [...s.titles];
  [titles[i], titles[j]] = [titles[j], titles[i]];
  return { ...s, titles };
}

/** 교인을 앞 명단에 넣는다. 직분이 비면 개별 지정. 묶음 맨 뒤로 */
export function addMember(s: OrderState, id: number, title: string): OrderState {
  const pinned = s.pinned.filter((x) => x !== id);
  return {
    ...s,
    title: { ...s.title, [id]: title },
    pinned: title && s.titles.includes(title) ? pinned : [...pinned, id],
    order: [...s.order.filter((x) => x !== id), id],
  };
}

/** 앞 명단에서 뺀다. 지정 직분이면 직분도 비운다(그래야 가나다로 내려감) */
export function removeMember(s: OrderState, id: number): OrderState {
  const t = s.title[id] ?? "";
  return {
    ...s,
    title: s.titles.includes(t) ? { ...s.title, [id]: "" } : s.title,
    pinned: s.pinned.filter((x) => x !== id),
    order: s.order.filter((x) => x !== id),
  };
}

/** 저장할 변경: 앞 명단은 화면 순서대로 1,2,3…, 나머지는 순서 해제. 원래와 같은 교인은 뺀다 */
export function orderChanges(s: OrderState, members: Member[]): OrderChange[] {
  const rank = new Map(frontRows(s, members).map((r, i) => [r.id, i + 1]));
  return members
    .map((m) => ({ id: m.id, title: s.title[m.id] ?? "", rank: rank.get(m.id) ?? null, m }))
    .filter((x) => x.title !== (x.m.title ?? "") || x.rank !== (x.m.rank ?? null))
    .map(({ id, title, rank }) => ({ id, title, rank }));
}
