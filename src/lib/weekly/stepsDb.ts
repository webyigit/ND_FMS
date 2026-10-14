"use client";
// 단계 완료 기록 읽기·쓰기. DB(week_step)에 남겨 기기 간 공유. 데모 모드면 브라우저에만.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "../supabase/client";
import { isStepKey, type StepDone, type StepKey } from "./steps";

const KEY = "ndfms.weekly.steps"; // 데모 모드 저장소
export const STEP_EVENT = "ndfms:step"; // 완료 처리 후 사이드바가 다시 읽도록

const loadLocal = (): StepDone[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const saveLocal = (xs: StepDone[]) => { try { localStorage.setItem(KEY, JSON.stringify(xs)); } catch {} };
const notify = () => { try { window.dispatchEvent(new CustomEvent(STEP_EVENT)); } catch {} };

type Row = { sunday: string; step: string; done_at: string };

/** from~to 주일의 완료 기록 */
export async function loadSteps(from: string, to: string, sb: SupabaseClient | null = supabaseBrowser()): Promise<StepDone[]> {
  if (!sb) return loadLocal().filter((r) => r.sunday >= from && r.sunday <= to);
  const { data, error } = await sb.from("week_step").select("sunday, step, done_at").gte("sunday", from).lte("sunday", to);
  if (error) throw error;
  return ((data ?? []) as Row[]).filter((r) => isStepKey(r.step)).map((r) => ({ sunday: r.sunday, step: r.step as StepKey, doneAt: r.done_at }));
}

/** 단계 완료(또는 취소). 실패해도 화면 흐름을 막지 않도록 오류는 돌려만 준다 */
export async function markStep(sunday: string, step: StepKey, done = true, sb: SupabaseClient | null = supabaseBrowser()): Promise<string | null> {
  try {
    if (!sb) {
      const xs = loadLocal().filter((r) => !(r.sunday === sunday && r.step === step));
      if (done) xs.push({ sunday, step, doneAt: new Date().toISOString() });
      saveLocal(xs);
    } else {
      const { error } = await sb.rpc("set_week_step", { p_sunday: sunday, p_step: step, p_done: done });
      if (error) throw error;
    }
    notify();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : (e as { message?: string })?.message ?? "알 수 없는 오류";
  }
}
