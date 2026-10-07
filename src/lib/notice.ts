// 공지사항 저장소. DB 연결 전에는 브라우저(localStorage)에 저장한다.
import { useSyncExternalStore } from "react";

export type Channel = "dept_head" | "member" | "all";
export const CHANNELS: { value: Channel; label: string }[] = [
  { value: "dept_head", label: "부서장" },
  { value: "member", label: "성도" },
  { value: "all", label: "전체" },
];
export type Notice = { id: string; channel: Channel; title: string; body: string; pinned: boolean; createdAt: string };

const KEY = "ndfms.notice";
const EVENT = "ndfms-notice-change";
let cache: Notice[] | null = null;
const read = (): Notice[] => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
};
const write = (next: Notice[]) => {
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
const EMPTY: Notice[] = [];

export const useNotices = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/** 해당 화면(채널)에서 볼 공지: 그 채널 + 전체. 고정 먼저, 최신순 */
export const forChannel = (xs: Notice[], ch: Exclude<Channel, "all">) =>
  xs.filter((n) => n.channel === ch || n.channel === "all")
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

export const noticeActions = {
  save: (n: Omit<Notice, "id" | "createdAt"> & { id?: string }) => {
    const xs = read();
    if (n.id) write(xs.map((x) => (x.id === n.id ? { ...x, ...n, id: x.id } : x)));
    else write([{ ...n, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...xs]);
  },
  remove: (id: string) => write(read().filter((x) => x.id !== id)),
};
