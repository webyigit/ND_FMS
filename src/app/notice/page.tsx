import MobileShell from "@/components/mobile/MobileShell";
import NoticeList from "@/components/NoticeList";

export const metadata = { title: "공지사항 · 재정부" };

// 성도용 공개 공지 페이지(로그인 없음)
export default function Page() {
  return (
    <MobileShell title="재정부 공지사항" nav={[{ href: "/notice", label: "공지" }, { href: "/donation-request", label: "기부금영수증 신청" }]}>
      <NoticeList channel="member" />
    </MobileShell>
  );
}
