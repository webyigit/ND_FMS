import MobileShell, { Spec } from "@/components/mobile/MobileShell";

export const metadata = { title: "지출 입력 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="지출 입력" nav={[{ href: "/m", label: "홈" }, { href: "/m/budget", label: "예산·지출" }, { href: "/m/expense/new", label: "지출입력" }, { href: "/m/expense", label: "내 신청" }, { href: "/m/notice", label: "공지" }]}>
      <Spec items={["영수증 사진 촬영·업로드", "AI 인식으로 일자·업체·금액·품목 자동 입력, 수정 가능", "송금받을 계좌 선택 후 신청"]} />
    </MobileShell>
  );
}
