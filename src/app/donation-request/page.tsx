import MobileShell, { Spec } from "@/components/mobile/MobileShell";
import NoticeList from "@/components/NoticeList";

export const metadata = { title: "기부금영수증 신청 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="기부금영수증 신청" nav={[{ href: "/notice", label: "공지" }, { href: "/donation-request", label: "기부금영수증 신청" }]}>
      <div className="mb-4"><NoticeList channel="member" limit={2} /></div>
      <Spec items={["성명, 주민등록번호, 휴대폰번호, 도로명주소, 요청사항(종이 신청서와 같은 항목)", "이전 신청자는 성명+휴대폰번호만 입력", "본인확인(문자 인증) 후 지난 발행정보 불러오기, 주민번호 마스킹", "캡차·요청 횟수 제한·개인정보 동의", "접수번호만 표시, 재정부 승인 후 발급"]} />
    </MobileShell>
  );
}
