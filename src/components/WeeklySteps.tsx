"use client";
// 매주 업무 순서: 모든 화면 하단의 업무 흐름 바(2026-11-26 개편, 기본은 한 줄 흐름 · 펼치면 단계별 완료 버튼). 이번 주(돌아오는 주일) 단계를 순서대로, 완료/미완료/시행 안 됨을 단계마다 보여준다.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarCheck, faChevronLeft, faChevronRight, faCircleCheck, faCircleExclamation, faCircle, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { kstDate, sundayOf } from "@/lib/income/dates";
import { STATUS_LABEL, nextSunday, prevSunday, shortSunday, stepCounts, weekSteps, type StepDone, type StepKey } from "@/lib/weekly/steps";
import { STEP_EVENT, loadSteps, markStep } from "@/lib/weekly/stepsDb";
import { STEPS_DETAIL_KEY, useMenuOpen } from "@/lib/menuState";

const ICON = { done: faCircleCheck, missed: faCircleExclamation, todo: faCircle } as const;
const COLOR = { done: "text-success", missed: "text-danger", todo: "text-muted" } as const;

export default function WeeklySteps() {
  const { isOn, toggleOn } = useMenuOpen();
  const open = isOn(STEPS_DETAIL_KEY);
  const onToggle = () => toggleOn(STEPS_DETAIL_KEY);
  const path = usePathname();
  // 오늘(한국 날짜)은 브라우저에서만 읽는다(서버 미리 그리기 때는 빈 값 → 아래에서 머리글만)
  const today = useSyncExternalStore(() => () => {}, () => kstDate(new Date().toISOString()), () => "");
  const current = today ? sundayOf(today, "next") : ""; // 이번 주 = 돌아오는 주일
  const [picked, setPicked] = useState<string | null>(null);
  const sunday = picked ?? current;
  const setSunday = (s: string) => setPicked(s === current ? null : s);
  const [records, setRecords] = useState<StepDone[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<StepKey | null>(null);

  const reload = useCallback(() => {
    if (!sunday) return;
    loadSteps(prevSunday(sunday), nextSunday(sunday)).then((xs) => { setRecords(xs); setErr(null); }, (e) => setErr(e instanceof Error ? e.message : "불러오지 못했어요"));
  }, [sunday]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    window.addEventListener(STEP_EVENT, reload);
    return () => window.removeEventListener(STEP_EVENT, reload);
  }, [reload]);

  const steps = useMemo(() => (sunday ? weekSteps(sunday, records, today) : []), [sunday, records, today]);
  const lastWeek = useMemo(() => (sunday ? stepCounts(weekSteps(prevSunday(sunday), records, today)) : { done: 0, missed: 0, total: 0 }), [sunday, records, today]);
  const counts = stepCounts(steps);
  const isCurrent = sunday === current;

  // 완료 표시를 손으로 되돌리거나(잘못 눌렀을 때) 직접 완료 처리
  const toggle = async (key: StepKey, done: boolean) => {
    if (!confirm(done ? "이 단계를 완료로 표시할까요?" : "완료 표시를 취소할까요?")) return;
    setBusy(key);
    const e = await markStep(sunday, key, done);
    setBusy(null);
    if (e) setErr(e);
  };

  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const dot = (st: string, active: boolean) => (st === "done" ? "bg-success" : st === "missed" ? "bg-danger" : active ? "bg-primary" : "bg-secondary");
  return (
    <section className="no-print sticky bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur lg:px-8" aria-label="매주 업무 순서">
      {open && today && (
        <>
          <ol className="-mx-1 mb-2 flex snap-x gap-2 overflow-x-auto px-1 pb-1 pt-1 lg:grid lg:grid-cols-7 lg:overflow-visible">
            {steps.map((s, i) => {
              const active = path === s.href.split("?")[0];
              return (
                <li key={s.key} className={`flex min-w-[150px] shrink-0 snap-start flex-col gap-1 rounded-xl border px-2.5 py-2 lg:min-w-0 ${active ? "border-primary bg-primary-subtle" : s.status === "missed" ? "border-danger/30 bg-danger-subtle" : s.status === "done" ? "border-success/30 bg-success-subtle" : "border-line bg-surface-2/60"}`}>
                  <Link href={s.href} className="flex min-w-0 items-center gap-2 text-sm font-medium text-heading hover:text-primary" title={`완료 조건: ${s.done}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${dot(s.status, active)}`}>{i + 1}</span>
                    <span className="truncate">{s.label}</span>
                  </Link>
                  <button type="button" onClick={() => toggle(s.key, s.status !== "done")} disabled={busy === s.key}
                    title={s.doneAt ? `완료 ${s.doneAt.slice(0, 16).replace("T", " ")} · 누르면 취소` : "누르면 완료로 표시"}
                    className={`flex items-center gap-1 self-start whitespace-nowrap pl-7 text-[11px] ${COLOR[s.status]}`}>
                    <FontAwesomeIcon icon={ICON[s.status]} className="w-3" />{STATUS_LABEL[s.status]}
                  </button>
                </li>
              );
            })}
          </ol>
          {isCurrent && lastWeek.missed > 0 && (
            <button type="button" onClick={() => setSunday(prevSunday(sunday))} className="mb-2 rounded-full bg-danger-subtle px-3 py-1 text-left text-xs text-danger">
              지난 주({shortSunday(prevSunday(sunday))}) 시행 안 된 단계 {lastWeek.missed}건
            </button>
          )}
        </>
      )}
      <div className="flex items-center gap-x-3">
        <button type="button" onClick={onToggle} aria-expanded={open} title={open ? "단계 상세 닫기" : "단계별 완료 표시 펼치기"}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap py-1 text-xs font-semibold text-heading hover:text-primary">
          <FontAwesomeIcon icon={faCalendarCheck} className="w-3.5 text-primary" /><span className="hidden sm:inline">매주 업무 흐름</span>
          <FontAwesomeIcon icon={faChevronRight} className={`w-2.5 text-label transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
        </button>
        {today && (
          <span className="flex shrink-0 items-center text-xs text-heading">
            <button type="button" onClick={() => setSunday(prevSunday(sunday))} aria-label="지난 주" className="px-1 py-1 text-label hover:text-primary"><FontAwesomeIcon icon={faChevronLeft} /></button>
            <span className="whitespace-nowrap font-semibold">{shortSunday(sunday)}{isCurrent && <span className="ml-1 hidden font-normal text-muted sm:inline">(이번 주)</span>}</span>
            <button type="button" onClick={() => setSunday(nextSunday(sunday))} aria-label="다음 주" className="px-1 py-1 text-label hover:text-primary"><FontAwesomeIcon icon={faChevronRight} /></button>
            {!isCurrent && <button type="button" onClick={() => setSunday(current)} title="이번 주로" className="px-1 py-1 text-label hover:text-primary"><FontAwesomeIcon icon={faRotateRight} /></button>}
          </span>
        )}
        {/* 한 줄 흐름: 단계 칩 → 화살표. 좁은 화면은 가로로 밀어서 본다 */}
        {today && (
          <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
            {steps.map((s, i) => {
              const active = path === s.href.split("?")[0];
              return (
                <li key={s.key} className="flex shrink-0 items-center gap-1">
                  {i > 0 && <span aria-hidden className="text-[10px] text-muted">→</span>}
                  <Link href={s.href} title={`${STATUS_LABEL[s.status]} · 완료 조건: ${s.done}`}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] ${active ? "border-primary bg-primary-subtle font-semibold text-primary" : s.status === "missed" ? "border-danger/30 text-danger" : s.status === "done" ? "border-success/30 text-success" : "border-line bg-surface-2 text-heading hover:text-primary"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dot(s.status, active)}`} />{s.label}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        {today && (
          <span className="flex shrink-0 items-center gap-2 text-xs">
            <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 md:block"><span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></span>
            <span className={`whitespace-nowrap font-semibold ${counts.done === counts.total ? "text-success" : counts.missed ? "text-danger" : "text-label"}`}>{counts.done}/{counts.total}</span>
          </span>
        )}
      </div>
      {err && <div className="pt-1 text-xs text-danger">{err}</div>}
    </section>
  );
}
