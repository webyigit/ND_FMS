"use client";
// 화면에서 DB 읽기 공통 훅. 데모 모드(연결값 없음)면 sb=null.
// 온라인에서 읽은 결과는 기기(IndexedDB)에 남기고, 오프라인이면 마지막으로 본 데이터를 stale=true 로 보여준다.
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "../supabase/client";
import { dbError } from "./weekly";
import { cacheGet, cacheSet } from "../offline/cache";
import { hash, isNetworkError } from "../offline/logic";

export type Query<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void; /** 오프라인이라 캐시를 보여주는 중 */ stale: boolean; staleAt: string | null };

/** fn을 deps가 바뀔 때마다 실행. 실패하면 error에 한국어 메시지 */
export function useDbQuery<T>(fn: (sb: SupabaseClient) => Promise<T>, deps: unknown[]): Query<T> {
  const sb = supabaseBrowser();
  const path = usePathname();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; stale: boolean; staleAt: string | null }>({ data: null, error: null, loading: !!sb, stale: false, staleAt: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    // 캐시 키: 화면 경로 + 쿼리 함수 본문 + 조건. 같은 화면의 다른 쿼리가 섞이지 않게
    const key = `q:${path}:${hash(fn.toString())}:${JSON.stringify(deps)}`;
    fn(sb).then(
      (data) => { if (!alive) return; setState({ data, error: null, loading: false, stale: false, staleAt: null }); void cacheSet(key, data); },
      async (e) => {
        if (!alive) return;
        const hit = isNetworkError(e) ? await cacheGet<T>(key) : null;
        if (!alive) return;
        if (hit) setState({ data: hit.data, error: null, loading: false, stale: true, staleAt: hit.at });
        else setState((s) => ({ ...s, error: isNetworkError(e) ? "오프라인이에요. 이 화면은 아직 기기에 저장된 데이터가 없어요." : dbError(e), loading: false }));
      },
    );
    return () => { alive = false; };
    // fn은 매번 새로 만들어지므로 deps로만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** supabase 응답의 error를 throw로 바꾼다: const rows = must(await sb.from(...)) */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}
