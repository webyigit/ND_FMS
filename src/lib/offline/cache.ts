"use client";
// 읽기 캐시: 온라인에서 읽은 결과를 기기에 두고, 오프라인이면 그걸 보여준다 (사용자별)
import { kvDel, kvGet, kvKeys, kvSet } from "./idb";
import { cacheKey } from "./logic";
import { supabaseBrowser } from "../supabase/client";

export type Cached<T> = { data: T; at: string };

let uidCache: string | null = null;
let watching = false;
/** 로그인한 사용자 id (세션 저장소에서, 네트워크 없이). 없으면 "anon" */
export async function currentUid(): Promise<string> {
  if (uidCache) return uidCache;
  const sb = supabaseBrowser();
  if (!sb) return "demo";
  try {
    const { data } = await sb.auth.getSession();
    uidCache = data.session?.user.id ?? null;
    if (!watching) { watching = true; sb.auth.onAuthStateChange((_e, s) => { uidCache = s?.user.id ?? null; }); }
  } catch {}
  return uidCache ?? "anon";
}

export async function cacheGet<T>(name: string): Promise<Cached<T> | null> {
  try { return (await kvGet<Cached<T>>(cacheKey(await currentUid(), name))) ?? null; } catch { return null; }
}
export async function cacheSet<T>(name: string, data: T): Promise<void> {
  try { await kvSet(cacheKey(await currentUid(), name), { data, at: new Date().toISOString() } satisfies Cached<T>); } catch {}
}
export async function cacheDel(name: string): Promise<void> {
  try { await kvDel(cacheKey(await currentUid(), name)); } catch {}
}
/** 캐시 항목 수 (설정·확인용) */
export async function cacheCount(): Promise<number> {
  try { return (await kvKeys()).length; } catch { return 0; }
}
