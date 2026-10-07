import Todo from "@/components/Todo";

export default function Page() {
  return <Todo spec={["A 통장잔액 + B 입금예정 = C 실잔액", "D 해외선교 미입금 잔액, E = C − D", "F 장부잔액, G = E − F, H 기준잉여금, 일치/부족 판정"]} />;
}
