import MobileShell, { Spec } from "@/components/mobile/MobileShell";

export const metadata = { title: "부서장 로그인 · 재정관리시스템" };

export default function Page() {
  return (
    <MobileShell title="부서장 로그인">
      <Spec items={["소셜·SMS 로그인", "부서장 권한이 없으면 접속 차단"]} />
    </MobileShell>
  );
}
