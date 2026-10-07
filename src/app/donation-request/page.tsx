import MobileShell, { Spec } from "@/components/mobile/MobileShell";

export const metadata = { title: "기부금영수증 신청 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="기부금영수증 신청">
      <Spec items={["이름, 주민번호, 주소, 영수증 발행자명, 가족명단", "본인확인(문자 인증) 후 지난 발행정보 불러오기, 주민번호 마스킹", "캡차·요청 횟수 제한·개인정보 동의", "접수번호만 표시, 재정부 승인 후 발급"]} />
    </MobileShell>
  );
}
