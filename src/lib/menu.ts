import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faGaugeHigh, faHandHoldingDollar, faWallet, faEarthAsia, faFileInvoice, faCalculator, faGear, faInbox, faListCheck, faBullhorn, faFileLines } from "@fortawesome/free-solid-svg-icons";

// 요구사항정의 메뉴 구조 (아이콘: Font Awesome)
export type MenuItem = { href: string; label: string };
export type MenuGroup = { label: string; icon: IconDefinition; items: MenuItem[] };

export const MENU: MenuGroup[] = [
  { label: "대시보드", icon: faGaugeHigh, items: [{ href: "/dashboard", label: "대시보드" }] },
  { label: "TODO LIST", icon: faListCheck, items: [{ href: "/todo", label: "TODO LIST" }] },
  { label: "공지사항", icon: faBullhorn, items: [{ href: "/notices", label: "공지사항" }] },
  {
    label: "수입관리", icon: faHandHoldingDollar,
    items: [
      { href: "/income/entry", label: "수입입력" },
      { href: "/income/bank", label: "은행거래내역" },
      { href: "/income/weekly", label: "금주 수입내역" },
      { href: "/income/person", label: "개인별 헌금현황" },
      { href: "/income/history", label: "과거 수입내역" },
    ],
  },
  {
    label: "지출관리", icon: faWallet,
    items: [
      { href: "/expense/entry", label: "지출입력" },
      { href: "/expense/upload", label: "지출증빙 올리기" },
      { href: "/expense/department", label: "부서별 지출내역" },
      { href: "/expense/verify", label: "검증시트" },
      { href: "/expense/report", label: "금주 수입/지출 리포트" },
      { href: "/expense/fixed", label: "고정지출관리" },
      { href: "/expense/accounts", label: "은행계좌관리" },
      { href: "/expense/clergy-pay", label: "교역자급여내역" },
      { href: "/expense/history", label: "과거 지출내역" },
    ],
  },
  { label: "해외선교", icon: faEarthAsia, items: [{ href: "/mission", label: "해외선교" }] },
  {
    label: "기부금영수증", icon: faFileInvoice,
    items: [
      { href: "/receipt/issue", label: "영수증 발행" },
      { href: "/receipt/status", label: "발행현황" },
      { href: "/receipt/past", label: "지난 발행내역" },
      { href: "/receipt/form", label: "양식관리" },
      { href: "/receipt/church", label: "발행자(교회) 정보" },
    ],
  },
  {
    label: "신청관리", icon: faInbox,
    items: [
      { href: "/requests/expense", label: "지출신청" },
      { href: "/requests/budget", label: "예산신청" },
      { href: "/requests/donation", label: "기부금영수증 신청" },
    ],
  },
  {
    label: "예산결산", icon: faCalculator,
    items: [
      { href: "/budget/settlement", label: "당해 결산" },
      { href: "/budget/plan", label: "내년도 예산" },
      { href: "/budget/report", label: "예결산 리포트" },
    ],
  },
  {
    label: "보고서", icon: faFileLines,
    items: [{ href: "/reports/officers-meeting", label: "재직회보고서" }],
  },
  {
    label: "설정", icon: faGear,
    items: [
      { href: "/settings/users", label: "회원설정" },
      { href: "/settings/officers", label: "재직명단" },
      { href: "/settings/members", label: "교인명단" },
      { href: "/settings/offering-types", label: "헌금구분" },
      { href: "/settings/audit", label: "시스템 사용내역" },
    ],
  },
];

export const findMenu = (path: string) => {
  for (const g of MENU) for (const i of g.items) if (path.startsWith(i.href)) return { group: g, item: i };
  return null;
};
