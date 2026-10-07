// TODO LIST 저장소. DB 연결 전에는 브라우저(localStorage)에 저장한다.
import { useSyncExternalStore } from "react";

export type Todo = { id: string; date: string; text: string; done: boolean; createdAt: string };

const KEY = "ndfms.todo";
const EVENT = "ndfms-todo-change";
let cache: Todo[] | null = null;

function read(): Todo[] {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
}

function write(next: Todo[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
};
const EMPTY: Todo[] = [];

export const useTodos = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/** 날짜순(같은 날은 입력순), 완료 건은 아래로 */
export const sortTodos = (xs: Todo[]) =>
  [...xs].sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

export const todoActions = {
  add: (date: string, text: string) =>
    write([...read(), { id: crypto.randomUUID(), date, text: text.trim(), done: false, createdAt: new Date().toISOString() }]),
  toggle: (id: string) => write(read().map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
  update: (id: string, patch: Partial<Pick<Todo, "date" | "text">>) => write(read().map((t) => (t.id === id ? { ...t, ...patch } : t))),
  remove: (id: string) => write(read().filter((t) => t.id !== id)),
};

/** 기기 시간대 기준 YYYY-MM-DD */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
