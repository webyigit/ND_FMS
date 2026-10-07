// Supabase 연결 전 화면 확인용 가상 데이터(실명 아님)
export type OfferingType = { id: number; fund: "일반" | "특별" | "별도"; name: string; totalOnly?: boolean; unit?: number; hasMemo?: boolean };
export type Member = { id: number; name: string; title?: string; displayRank?: number };

export const OFFERING_TYPES: OfferingType[] = [
  { id: 1, fund: "일반", name: "십일조", unit: 1000 },
  { id: 2, fund: "일반", name: "주일헌금", totalOnly: true },
  { id: 3, fund: "일반", name: "범사감사", unit: 1000 },
  { id: 4, fund: "일반", name: "기타감사", unit: 1000, hasMemo: true },
  { id: 5, fund: "일반", name: "일천번제", unit: 1000 },
  { id: 6, fund: "일반", name: "신년감사", unit: 1000 },
  { id: 7, fund: "일반", name: "기관헌금" },
  { id: 8, fund: "일반", name: "부활절", unit: 1000 },
  { id: 9, fund: "일반", name: "맥추감사절", unit: 1000 },
  { id: 10, fund: "일반", name: "추수감사절", unit: 1000 },
  { id: 11, fund: "일반", name: "성탄절", unit: 1000 },
  { id: 12, fund: "특별", name: "이웃사랑", unit: 1000 },
  { id: 13, fund: "특별", name: "꽃꽂이", unit: 1000, hasMemo: true },
  { id: 14, fund: "특별", name: "건축", unit: 1000, hasMemo: true },
  { id: 15, fund: "별도", name: "해외선교", unit: 1000 },
  { id: 16, fund: "별도", name: "네팔선교", unit: 1000 },
];

const SURNAMES = "김이박최정강조윤장임";
const GIVEN = ["민준", "서연", "도윤", "하은", "시우", "지유", "예준", "수아", "주원", "지호", "하준", "서윤"];
export const MEMBERS: Member[] = [
  { id: 1, name: "가원로", title: "원로목사", displayRank: 1 },
  { id: 2, name: "나담임", title: "담임목사", displayRank: 2 },
  ...Array.from({ length: 60 }, (_, i) => ({
    id: i + 3,
    name: SURNAMES[i % SURNAMES.length] + GIVEN[i % GIVEN.length] + (i >= 12 ? String.fromCharCode(65 + Math.floor(i / 12) - 1) : ""),
  })),
];

/** 직전 주일(오늘이 주일이면 오늘) */
export function currentSunday(d = new Date()) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s.toISOString().slice(0, 10);
}
