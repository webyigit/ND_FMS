import MobileShell from "@/components/mobile/MobileShell";
import NoticeList from "@/components/NoticeList";

export const metadata = { title: "공지사항 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="공지사항" nav={[{ href: "/m", label: "홈" }, { href: "/m/budget", label: "예산·지출" }, { href: "/m/expense/new", label: "지출입력" }, { href: "/m/expense", label: "내 신청" }, { href: "/m/notice", label: "공지" }]}>
      <NoticeList channel="dept_head" />
    </MobileShell>
  );
}
