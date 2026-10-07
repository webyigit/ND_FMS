// 재정부게시판: 재정부원이 재정 관련 기록을 남기는 일반 게시판.
// DB 연결 시 board_post 표(작성자 이름은 DB가 로그인한 회원 이름으로 채움), 데모 모드는 브라우저(localStorage).
import { listStore, rows, useListStore } from "./work/store";

export type Post = { id: string; title: string; body: string; author: string; pinned: boolean; createdAt: string; updatedAt?: string };

type Row = { id: number; title: string; body: string; author_name: string | null; pinned: boolean; created_at: string; updated_at: string | null };
export const fromPostRow = (r: Row): Post => ({
  id: String(r.id), title: r.title, body: r.body, author: r.author_name ?? "", pinned: r.pinned, createdAt: r.created_at,
  ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
});

const store = listStore<Post>("ndfms.board", async (sb) =>
  (await rows<Row>(sb.from("board_post").select("id, title, body, author_name, pinned, created_at, updated_at")
    .order("created_at", { ascending: false }))).map(fromPostRow));

export const usePostState = () => useListStore(store);
export const usePosts = () => usePostState().items;
/** DB 연결 시 작성자는 로그인한 회원 이름으로 자동 기록 */
export const authorAuto = store.db;

/** 고정 글 먼저, 최신순. 검색어는 제목·내용·작성자에서 찾는다 */
export function listPosts(xs: Post[], q = "") {
  const k = q.trim().toLowerCase();
  return xs
    .filter((p) => !k || `${p.title}\n${p.body}\n${p.author}`.toLowerCase().includes(k))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export const boardActions = {
  save: async (p: Pick<Post, "title" | "body" | "author" | "pinned"> & { id?: string }) => {
    if (!store.db) {
      const xs = store.read(), now = new Date().toISOString();
      if (p.id) return store.write(xs.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id, updatedAt: now } : x)));
      return store.write([{ ...p, id: crypto.randomUUID(), createdAt: now }, ...xs]);
    }
    const row = { title: p.title.trim(), body: p.body, pinned: p.pinned };
    return store.run((sb) => (p.id ? sb.from("board_post").update(row).eq("id", Number(p.id)) : sb.from("board_post").insert(row)));
  },
  remove: async (id: string) => {
    if (!store.db) return store.write(store.read().filter((x) => x.id !== id));
    return store.run((sb) => sb.from("board_post").delete().eq("id", Number(id)));
  },
};
