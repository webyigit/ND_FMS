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

// ===== 댓글 =====
// DB 연결 시 board_comment 표(작성자는 DB가 로그인한 회원으로 채움). 수정은 본인만, 삭제는 본인·관리자(DB 권한).
export type Comment = { id: string; postId: string; body: string; author: string; authorId?: string; createdAt: string; updatedAt?: string };

type CommentRow = { id: number; post_id: number; body: string; author_id: string | null; author_name: string | null; created_at: string; updated_at: string | null };
export const fromCommentRow = (r: CommentRow): Comment => ({
  id: String(r.id), postId: String(r.post_id), body: r.body, author: r.author_name ?? "", createdAt: r.created_at,
  ...(r.author_id ? { authorId: r.author_id } : {}),
  ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
});

const comments = listStore<Comment>("ndfms.board.comments", async (sb) =>
  (await rows<CommentRow>(sb.from("board_comment").select("id, post_id, body, author_id, author_name, created_at, updated_at")
    .order("created_at", { ascending: true }))).map(fromCommentRow));

export const useCommentState = () => useListStore(comments);

/** 글 하나의 댓글, 오래된 순 */
export const commentsOf = (xs: Comment[], postId: string) =>
  xs.filter((c) => c.postId === postId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** 글별 댓글 수 */
export function commentCounts(xs: Comment[]) {
  const m = new Map<string, number>();
  for (const c of xs) m.set(c.postId, (m.get(c.postId) ?? 0) + 1);
  return m;
}

export const commentActions = {
  add: async (postId: string, body: string, author = "") => {
    const text = body.trim();
    if (!text) return false;
    if (!comments.db) {
      comments.write([...comments.read(), { id: crypto.randomUUID(), postId, body: text, author, createdAt: new Date().toISOString() }]);
      return true;
    }
    return comments.run((sb) => sb.from("board_comment").insert({ post_id: Number(postId), body: text }));
  },
  edit: async (id: string, body: string) => {
    const text = body.trim();
    if (!text) return false;
    if (!comments.db) {
      comments.write(comments.read().map((c) => (c.id === id ? { ...c, body: text, updatedAt: new Date().toISOString() } : c)));
      return true;
    }
    return comments.run((sb) => sb.from("board_comment").update({ body: text }).eq("id", Number(id)));
  },
  remove: async (id: string) => {
    if (!comments.db) { comments.write(comments.read().filter((c) => c.id !== id)); return true; }
    return comments.run((sb) => sb.from("board_comment").delete().eq("id", Number(id)));
  },
  /** 데모 모드에서 글을 지우면 댓글도 지운다(DB는 on delete cascade) */
  removeOfPost: (postId: string) => {
    if (!comments.db) comments.write(comments.read().filter((c) => c.postId !== postId));
    else void comments.refresh();
  },
};
