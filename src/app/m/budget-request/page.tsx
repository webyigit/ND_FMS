import MobileShell, { Spec } from "@/components/mobile/MobileShell";

export const metadata = { title: "예산 신청 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="예산 신청" nav={[{ href: "/m", label: "홈" }, { href: "/m/budget", label: "예산·지출" }, { href: "/m/expense/new", label: "지출입력" }, { href: "/m/expense", label: "내 신청" }, { href: "/m/notice", label: "공지" }]}>
      <Spec items={["연도·항목·금액·사유 입력 후 신청"]} />
    </MobileShell>
  );
}
