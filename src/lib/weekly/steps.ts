// 매주 업무 순서: 단계 정의와 상태 계산(순수 함수). 완료 기록은 주일(돌아오는 주일) 단위로 DB week_step 에 남긴다.
import { addDays, isSunday, upcomingSunday } from "../income/dates";

export type StepKey = "income" | "income_report" | "bank" | "expense" | "verify" | "report" | "ledger";
export type Step = { key: StepKey; label: string; href: string; done: string };

/** 순서대로. href 는 그 단계를 하는 화면, done 은 완료 처리되는 동작 */
export const STEPS: Step[] = [
  { key: "income", label: "수입입력", href: "/income/entry", done: "수입내역을 모두 입력하고 저장하기" },
  { key: "income_report", label: "금주 수입내역", href: "/income/weekly", done: "출력하기" },
  { key: "bank", label: "은행거래내역입력", href: "/income/bank", done: "거래내역 확인 후 지출입력으로 보내기" },
  { key: "expense", label: "지출입력", href: "/expense/entry?fixed=1", done: "고정지출·지출내역 입력 후 저장하기" },
  { key: "verify", label: "검증", href: "/expense/verify", done: "통장 잔액을 넣고 G − H가 '일치'로 저장하기" },
  { key: "report", label: "금주 수입/지출 내역", href: "/expense/report", done: "출력하기" },
  { key: "ledger", label: "총계원장 확인", href: "/ledger", done: "출력하기" },
];
export const STEP_KEYS = STEPS.map((s) => s.key);
export const isStepKey = (k: string): k is StepKey => (STEP_KEYS as string[]).includes(k);

/** 완료 기록 한 줄 */
export type StepDone = { sunday: string; step: StepKey; doneAt: string };
export type StepStatus = "done" | "missed" | "todo";

/** 이번 주 업무의 기준 주일 = 돌아오는 주일(오늘이 주일이면 오늘) */
export const workSunday = (now = new Date()) => upcomingSunday(now);

/** 완료면 done, 그 주일이 지났는데 미완료면 missed(시행 안 됨), 아니면 todo */
export function stepStatus(done: boolean, sunday: string, today: string): StepStatus {
  if (done) return "done";
  return sunday < today ? "missed" : "todo";
}

export type StepView = Step & { status: StepStatus; doneAt: string | null };

/** 한 주의 단계별 상태 */
export function weekSteps(sunday: string, records: StepDone[], today: string): StepView[] {
  return STEPS.map((s) => {
    const hit = records.find((r) => r.sunday === sunday && r.step === s.key);
    return { ...s, status: stepStatus(!!hit, sunday, today), doneAt: hit?.doneAt ?? null };
  });
}

/** 완료 건수 / 시행 안 된 건수 */
export const stepCounts = (xs: StepView[]) => ({
  done: xs.filter((x) => x.status === "done").length,
  missed: xs.filter((x) => x.status === "missed").length,
  total: xs.length,
});

/** 이전·다음 주일 */
export const prevSunday = (s: string) => addDays(s, -7);
export const nextSunday = (s: string) => addDays(s, 7);
export const asSunday = (s: string, fallback: string) => (isSunday(s) ? s : fallback);

/** 10-18 주일 */
export const shortSunday = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))} 주일`;

export const STATUS_LABEL: Record<StepStatus, string> = { done: "완료", missed: "시행 안 됨", todo: "미완료" };
