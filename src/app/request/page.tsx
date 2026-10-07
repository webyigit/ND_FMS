import MobileShell, { Spec } from "@/components/mobile/MobileShell";

export const metadata = { title: "지출신청 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="지출신청">
      <Spec items={["부서장: 자기 부서 선택", "목회자: 부서 선택 없이 지출만 신청", "내용·금액·사용일·영수증 사진·송금 계좌"]} />
    </MobileShell>
  );
}
