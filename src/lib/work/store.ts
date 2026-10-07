// 목록 저장소 공통: DB가 연결되면 Supabase에서 읽고 쓰고, 아니면(데모) 브라우저(localStorage)에 둔다.
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDbConfigured } from "../supabase/config";
import { supabaseBrowser } from "../supabase/client";
import { dbError } from "../db/weekly";

/** supabase 응답의 error를 throw로 */
export async function rows<T>(r: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await r;
  if (error) throw error;
  return (data ?? []) as T[];
}

export type ListState<T> = { items: T[]; loaded: boolean; error: string | null };
type Res = PromiseLike<{ error: { message: string } | null }>;

export function listStore<T>(key: string, load: (sb: SupabaseClient) => Promise<T[]>) {
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());

  // --- 데모: localStorage ---
  const EVENT = `${key}-change`;
  let cache: T[] | null = null;
  let snap: ListState<T> | null = null;
  const read = (): T[] => {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { cache = []; }
    return cache!;
  };
  const write = (next: T[]) => {
    cache = next; snap = null;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  const localGet = (): ListState<T> => {
    const items = read();
    if (snap?.items !== items) snap = { items, loaded: true, error: null };
    return snap;
  };
  const localSub = (cb: () => void) => {
    const onStorage = (e: StorageEvent) => { if (e.key === key) { cache = null; cb(); } };
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
  };

  // --- DB ---
  let state: ListState<T> = { items: [], loaded: false, error: null };
  let started = false;
  const set = (p: Partial<ListState<T>>) => { state = { ...state, ...p }; emit(); };
  const refresh = async () => {
    const sb = supabaseBrowser();
    if (!sb) return;
    if (!started) {
      started = true;
      // 다른 계정으로 바꿔 로그인하면 다시 읽는다
      sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") void refresh(); });
    }
    try { set({ items: await load(sb), loaded: true, error: null }); }
    catch (e) { set({ loaded: true, error: dbError(e) }); }
  };
  const dbSub = (cb: () => void) => {
    subs.add(cb);
    if (!started) void refresh();
    return () => { subs.delete(cb); };
  };

  return {
    db: isDbConfigured,
    subscribe: isDbConfigured ? dbSub : localSub,
    get: isDbConfigured ? () => state : localGet,
    read, write, refresh,
    /** DB 쓰기 후 다시 읽기. 실패하면 error에 담고 false */
    async run(fn: (sb: SupabaseClient) => Res): Promise<boolean> {
      const sb = supabaseBrowser();
      if (!sb) return false;
      const { error } = await fn(sb);
      if (error) { set({ error: dbError(error) }); return false; }
      await refresh();
      return true;
    },
  };
}

const SERVER: ListState<never> = { items: [], loaded: false, error: null };
export function useListStore<T>(s: ReturnType<typeof listStore<T>>): ListState<T> {
  return useSyncExternalStore(s.subscribe, s.get, () => SERVER as ListState<T>);
}
