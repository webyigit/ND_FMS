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

// 원본 워크북의 부서 → 항목(원본구조분석 기준)
export const DEPARTMENTS: Record<string, string[]> = {
  예배부: ["부활절행사", "어린이주일행사", "어버이주일행사", "추수감사절행사", "성탄절행사", "임직및은퇴식행사", "오후예배행사"],
  봉사부: ["일반접대", "주일식사", "교회김장"],
  장년교육부: ["교역자훈련비", "제직회수련회", "항존직수련회", "평신도훈련비", "구역장·권찰수련회", "남선교회연합회체육대회"],
  교회학교부: ["유치부 전도사 사례비", "아동부 전도사 사례비", "중고등부 전도사 사례비", "교사대학", "유치부 교육비", "아동부 교육비", "중고등부 교육비", "청년공동체 교육비", "각부 공과금", "교회학교운영"],
  전도부: ["부교역자사례비", "심방비", "전도비"],
  이웃사랑선교부: ["국내선교비"],
  관리부: ["주보발행비", "인쇄비", "광고비", "사무용품비", "소모품비", "비품수리비", "교회당유지비", "공공요금"],
  차량관리부: ["차량보험료", "차량정비·검사료", "자동차세등", "유류비"],
  사회복지부: ["경로잔치", "전교인신년친목회", "경조비"],
  음악부: ["지휘자사례비", "반주자사례비", "남성중창단", "찬양대", "음악부운영비", "악기구입비", "챔버팀운영"],
  재정부: ["원로목사사례비", "담임목사사례비", "목양비", "총회연금지원금", "노회상회비", "대출이자", "예비비"],
  특별사역팀: ["새신자양육팀", "주일예배찬양팀", "성찬팀", "홈페이지운영"],
};

export type FixedExpense = { weekOfMonth: number; content: string; amount: number; dept: string; item: string };
export const FIXED_EXPENSES: FixedExpense[] = [
  { weekOfMonth: 1, content: "담임목사 사례비", amount: 1000000, dept: "재정부", item: "담임목사사례비" },
  { weekOfMonth: 1, content: "전기요금", amount: 300000, dept: "관리부", item: "공공요금" },
  { weekOfMonth: 2, content: "지휘자 사례비", amount: 200000, dept: "음악부", item: "지휘자사례비" },
  { weekOfMonth: 4, content: "차량 유류비", amount: 150000, dept: "차량관리부", item: "유류비" },
];

/** 그 달의 몇째 주일인지 */
export const weekOfMonth = (sunday: string) => Math.ceil(Number(sunday.slice(8, 10)) / 7);

// 교역자급여내역용 가상 데이터(실명·실금액 아님)
export const CLERGY_TITLES = ["원로목사", "담임목사", "부목사", "전도사"] as const;
export type ClergyPay = { year: number; month: number; name: string; title: (typeof CLERGY_TITLES)[number]; item: string; amount: number; paidAt: string };

export const CLERGY_PAY: ClergyPay[] = (() => {
  const people: { name: string; title: ClergyPay["title"]; items: [string, number][] }[] = [
    { name: "가원로", title: "원로목사", items: [["원로목사사례비", 1000000]] },
    { name: "나담임", title: "담임목사", items: [["담임목사사례비", 3000000], ["목양비", 300000]] },
    { name: "다부목", title: "부목사", items: [["부교역자사례비", 2000000]] },
    { name: "라전도", title: "전도사", items: [["아동부 전도사 사례비", 800000]] },
    { name: "마전도", title: "전도사", items: [["중고등부 전도사 사례비", 800000]] },
  ];
  const out: ClergyPay[] = [];
  for (const year of [2025, 2026])
    for (let month = 1; month <= 12; month++) {
      if (year === 2026 && month > 9) break;
      for (const p of people)
        for (const [item, amount] of p.items)
          out.push({ year, month, name: p.name, title: p.title, item, amount, paidAt: `${year}-${String(month).padStart(2, "0")}-05` });
    }
  return out;
})();
