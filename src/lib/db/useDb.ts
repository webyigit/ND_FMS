"use client";
// 화면에서 DB 읽기 공통 훅. 데모 모드(연결값 없음)면 sb=null.
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { dbError } from "@/lib/db/weekly";

export type Query<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** fn을 deps가 바뀔 때마다 실행. 실패하면 error에 한국어 메시지 */
export function useDbQuery<T>(fn: (sb: SupabaseClient) => Promise<T>, deps: unknown[]): Query<T> {
  const sb = supabaseBrowser();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!sb });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    fn(sb).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState((s) => ({ ...s, error: dbError(e), loading: false })),
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
