"use client";
// 오프라인 대기열(outbox) 동기화 엔진.
// - 수입·지출 입력을 오프라인에서 저장하면 여기 쌓이고, 연결이 돌아오면 순서대로 올린다.
// - 올리기 전에 서버 내용을 다시 읽어, 입력을 시작했을 때와 달라졌으면 덮어쓰지 않고 '충돌'로 둔다.
// - 마감된 주·권한 없음 같은 서버 거절은 그대로 보여 준다. 저장은 기존 RPC(RLS·감사로그 그대로)로만 한다.
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "../supabase/client";
import { dbError, expenseSig, incomeSig, loadExpense, loadIncome, saveExpense, saveIncome, type ExpenseRow, type IncomeEntry } from "../db/weekly";
import { storeAll, storeDel, storePut, deleteDatabase } from "./idb";
import { cacheGet, cacheSet, currentUid } from "./cache";
import { DRAFT_KEYS, decide, isClosedWeekError, isNetworkError, mergeQueued, type Kind, type OutboxItem } from "./logic";

export type WeekCache = { rows: IncomeEntry[] | ExpenseRow[]; serverSig: string | null };
const weekKey = (kind: Kind, sunday: string) => `week:${kind}:${sunday}`;
const sigOf = (kind: Kind, rows: IncomeEntry[] | ExpenseRow[]) => (kind === "income" ? incomeSig(rows as IncomeEntry[]) : expenseSig(rows as ExpenseRow[]));
const loadWeek = (sb: SupabaseClient, kind: Kind, sunday: string) => (kind === "income" ? loadIncome(sb, sunday) : loadExpense(sb, sunday));
const saveWeek = (sb: SupabaseClient, kind: Kind, sunday: string, rows: IncomeEntry[] | ExpenseRow[]) =>
  kind === "income" ? saveIncome(sb, sunday, rows as IncomeEntry[]) : saveExpense(sb, sunday, rows as ExpenseRow[]);

/** 주일 입력 캐시: 서버에서 읽은 것(serverSig = 그 서명) 또는 대기열에 넣은 것(serverSig 는 기준 서명 유지) */
export const getWeekCache = async (kind: Kind, sunday: string) => (await cacheGet<WeekCache>(weekKey(kind, sunday)))?.data ?? null;
export const setWeekCache = (kind: Kind, sunday: string, w: WeekCache) => cacheSet(weekKey(kind, sunday), w);

// ----- 상태 (화면 구독용) -----
export type SyncState = { online: boolean; syncing: boolean; items: OutboxItem[]; lastSyncedAt: string | null; message: string | null };
let state: SyncState = { online: true, syncing: false, items: [], lastSyncedAt: null, message: null };
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const SERVER_SNAP: SyncState = { online: true, syncing: false, items: [], lastSyncedAt: null, message: null };

export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_SNAP);
}
export const pendingOf = (s: SyncState) => s.items.filter((i) => i.status === "pending");
export const stuckOf = (s: SyncState) => s.items.filter((i) => i.status !== "pending");

let started = false;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!started) { started = true; start(); }
  return () => { subs.delete(cb); };
}

function start() {
  if (typeof window === "undefined") return;
  set({ online: navigator.onLine });
  window.addEventListener("online", () => { set({ online: true }); void syncNow(); });
  window.addEventListener("offline", () => set({ online: false }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });
  void refreshItems().then(() => syncNow());
}

async function refreshItems() {
  try {
    const uid = await currentUid();
    const all = await storeAll<OutboxItem>("outbox");
    set({ items: all.filter((i) => i.uid === uid).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)) });
  } catch { set({ items: [] }); }
}

/** 입력 화면이 오프라인(또는 전송 실패) 때 호출: 대기열에 넣고, 그 주일 캐시를 내 입력으로 바꾼다 */
export async function enqueue(kind: Kind, sunday: string, rows: IncomeEntry[] | ExpenseRow[], baseSig: string | null): Promise<void> {
  const uid = await currentUid();
  const all = await storeAll<OutboxItem>("outbox");
  const existing = all.find((i) => i.uid === uid && i.kind === kind && i.sunday === sunday);
  const item = mergeQueued(existing, { uid, kind, sunday, rows, baseSig: existing ? existing.baseSig : baseSig });
  await storePut("outbox", item);
  await setWeekCache(kind, sunday, { rows, serverSig: item.baseSig });
  await refreshItems();
  if (navigator.onLine) void syncNow();
}

let running: Promise<void> | null = null;
/** 대기열을 지금 올린다. 이미 올리는 중이면 그 작업을 기다린다 */
export function syncNow(): Promise<void> {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run() {
  const sb = supabaseBrowser();
  if (!sb || typeof navigator === "undefined" || !navigator.onLine) return;
  await refreshItems();
  const todo = pendingOf(state);
  if (!todo.length) return;
  set({ syncing: true, message: null });
  try {
    for (const item of todo) {
      const ok = await push(sb, item);
      if (!ok) break; // 네트워크가 끊겼으면 나머지는 다음에
    }
    set({ lastSyncedAt: new Date().toISOString() });
  } finally {
    set({ syncing: false });
    await refreshItems();
  }
}

/** 한 항목을 올린다. false = 네트워크가 끊겨 중단 */
async function push(sb: SupabaseClient, item: OutboxItem): Promise<boolean> {
  const mineSig = sigOf(item.kind, item.rows);
  try {
    const server = await loadWeek(sb, item.kind, item.sunday);
    const serverSig = sigOf(item.kind, server);
    const d = decide(item, mineSig, serverSig, server.length);
    if (d.action === "conflict") {
      await storePut("outbox", { ...item, status: "conflict", reason: d.reason, serverRows: server, attempts: item.attempts + 1 });
      return true;
    }
    if (d.action === "save") {
      await saveWeek(sb, item.kind, item.sunday, item.rows);
      const after = await loadWeek(sb, item.kind, item.sunday); // 새 행의 DB id 를 받아 둔다
      await setWeekCache(item.kind, item.sunday, { rows: after, serverSig: sigOf(item.kind, after) });
    } else {
      await setWeekCache(item.kind, item.sunday, { rows: server, serverSig });
    }
    await storeDel("outbox", item.id!);
    return true;
  } catch (e) {
    if (isNetworkError(e)) { set({ online: false }); return false; }
    const locked = isClosedWeekError(e);
    await storePut("outbox", { ...item, status: locked ? "conflict" : "error", locked, reason: dbError(e), attempts: item.attempts + 1 });
    return true;
  }
}

/** 충돌·오류 항목 처리: mine = 내 입력으로 저장(서버 덮어쓰기), server = 서버 것 유지(내 입력 버림), edit = 내 입력을 입력 화면에 불러와 직접 맞추기 */
export async function resolve(item: OutboxItem, how: "mine" | "server" | "edit"): Promise<void> {
  if (how === "server") {
    await storeDel("outbox", item.id!);
    if (item.serverRows) await setWeekCache(item.kind, item.sunday, { rows: item.serverRows, serverSig: sigOf(item.kind, item.serverRows) });
  } else if (how === "mine") {
    await storePut("outbox", { ...item, status: "pending", force: true, reason: undefined, locked: undefined });
  } else {
    const k = DRAFT_KEYS[item.kind];
    try {
      localStorage.setItem(k.draft, JSON.stringify(item.rows));
      localStorage.setItem(k.meta, JSON.stringify({ sunday: item.sunday, savedSig: null }));
    } catch {}
    await storeDel("outbox", item.id!);
  }
  await refreshItems();
  if (how === "mine") void syncNow();
}

/** 로그아웃 때: 기기에 남은 캐시·대기열·오프라인 페이지를 모두 지운다 */
export async function clearLocalData(): Promise<void> {
  await deleteDatabase();
  try { Object.keys(localStorage).filter((k) => k.startsWith("ndfms.")).forEach((k) => localStorage.removeItem(k)); } catch {}
  try { if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch {}
  set({ items: [] });
}
