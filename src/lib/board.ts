// 재정부게시판: 재정부원이 재정 관련 기록을 남기는 일반 게시판. DB 연결 전에는 브라우저(localStorage)에 저장한다.
import { useSyncExternalStore } from "react";

export type Post = { id: string; title: string; body: string; author: string; pinned: boolean; createdAt: string; updatedAt?: string };

const KEY = "ndfms.board";
const EVENT = "ndfms-board-change";
let cache: Post[] | null = null;
const read = (): Post[] => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
};
const write = (next: Post[]) => {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new Event(EVENT));
};
const subscribe = (cb: () => void) => {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
};
const EMPTY: Post[] = [];
export const usePosts = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/** 고정 글 먼저, 최신순. 검색어는 제목·내용·작성자에서 찾는다 */
export function listPosts(xs: Post[], q = "") {
  const k = q.trim().toLowerCase();
  return xs
    .filter((p) => !k || `${p.title}\n${p.body}\n${p.author}`.toLowerCase().includes(k))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export const boardActions = {
  save: (p: Pick<Post, "title" | "body" | "author" | "pinned"> & { id?: string }) => {
    const xs = read(), now = new Date().toISOString();
    if (p.id) write(xs.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id, updatedAt: now } : x)));
    else write([{ ...p, id: crypto.randomUUID(), createdAt: now }, ...xs]);
  },
  remove: (id: string) => write(read().filter((x) => x.id !== id)),
};
