import MobileShell from "@/components/mobile/MobileShell";
import NoticeList from "@/components/NoticeList";

export const metadata = { title: "공지사항 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="공지사항" nav="dept" account>
      <NoticeList channel="dept_head" />
    </MobileShell>
  );
}
