import MobileShell, { Spec } from "@/components/mobile/MobileShell";

export const metadata = { title: "내 신청 내역 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="내 신청 내역" nav={[{ href: "/m", label: "홈" }, { href: "/m/budget", label: "예산·지출" }, { href: "/m/expense/new", label: "지출입력" }, { href: "/m/expense", label: "내 신청" }, { href: "/m/notice", label: "공지" }]}>
      <Spec items={["신청 조회, 승인 전 건 수정·삭제"]} />
    </MobileShell>
  );
}
