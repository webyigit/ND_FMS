import MobileShell, { Spec } from "@/components/mobile/MobileShell";
import NoticeList from "@/components/NoticeList";

export const metadata = { title: "부서장 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="부서장" nav={[{ href: "/m", label: "홈" }, { href: "/m/budget", label: "예산·지출" }, { href: "/m/expense/new", label: "지출입력" }, { href: "/m/expense", label: "내 신청" }, { href: "/m/notice", label: "공지" }]}>
      <div className="mb-2 text-sm font-semibold">최근 공지</div>
      <NoticeList channel="dept_head" limit={3} />
      <div className="mt-4"><Spec items={["내 부서 예산·지출·잔액·집행률 요약"]} /></div>
    </MobileShell>
  );
}
