import MobileShell from "@/components/mobile/MobileShell";
import NoticeList from "@/components/NoticeList";
import FormLoader from "./FormLoader";

export const metadata = { title: "기부금영수증 신청 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="기부금영수증 신청" nav={[{ href: "/notice", label: "공지" }, { href: "/donation-request", label: "기부금영수증 신청" }]}>
      <div className="mb-4"><NoticeList channel="member" limit={2} /></div>
      <FormLoader />
    </MobileShell>
  );
}
