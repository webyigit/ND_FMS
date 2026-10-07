// TODO LIST 저장소. DB 연결 시 todo 표(본인 것만), 데모 모드는 브라우저(localStorage).
import { listStore, rows, useListStore } from "./work/store";

export type Todo = { id: string; date: string; text: string; done: boolean; createdAt: string };

type Row = { id: string; due_date: string; content: string; done: boolean; created_at: string };
export const fromTodoRow = (r: Row): Todo => ({ id: r.id, date: r.due_date, text: r.content, done: r.done, createdAt: r.created_at });

const store = listStore<Todo>("ndfms.todo", async (sb) =>
  (await rows<Row>(sb.from("todo").select("id, due_date, content, done, created_at").order("due_date"))).map(fromTodoRow));

export const useTodoState = () => useListStore(store);
export const useTodos = () => useTodoState().items;

/** 날짜순(같은 날은 입력순), 완료 건은 아래로 */
export const sortTodos = (xs: Todo[]) =>
  [...xs].sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

const find = (id: string) => store.get().items.find((t) => t.id === id);

export const todoActions = {
  add: async (date: string, text: string) => {
    if (!store.db) return store.write([...store.read(), { id: crypto.randomUUID(), date, text: text.trim(), done: false, createdAt: new Date().toISOString() }]);
    await store.run((sb) => sb.from("todo").insert({ due_date: date, content: text.trim() }));
  },
  toggle: async (id: string) => {
    if (!store.db) return store.write(store.read().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    const done = !find(id)?.done;
    await store.run((sb) => sb.from("todo").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id));
  },
  update: async (id: string, patch: Partial<Pick<Todo, "date" | "text">>) => {
    if (!store.db) return store.write(store.read().map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await store.run((sb) => sb.from("todo").update({
      ...(patch.date ? { due_date: patch.date } : {}), ...(patch.text ? { content: patch.text.trim() } : {}),
    }).eq("id", id));
  },
  remove: async (id: string) => {
    if (!store.db) return store.write(store.read().filter((t) => t.id !== id));
    await store.run((sb) => sb.from("todo").delete().eq("id", id));
  },
};

/** 기기 시간대 기준 YYYY-MM-DD */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
