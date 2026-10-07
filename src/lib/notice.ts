// 공지사항 저장소. DB 연결 시 notice 표(성도 공개는 비로그인도 읽기), 데모 모드는 브라우저(localStorage).
import { listStore, rows, useListStore } from "./work/store";

export type Channel = "dept_head" | "member" | "all";
export const CHANNELS: { value: Channel; label: string }[] = [
  { value: "dept_head", label: "부서장" },
  { value: "member", label: "성도" },
  { value: "all", label: "전체" },
];
export type Notice = { id: string; channel: Channel; title: string; body: string; pinned: boolean; createdAt: string };

type Row = { id: number; channel: Channel; title: string; body: string; pinned: boolean | null; published_at: string | null; created_at: string };
export const fromNoticeRow = (r: Row): Notice => ({
  id: String(r.id), channel: r.channel, title: r.title, body: r.body, pinned: !!r.pinned, createdAt: r.published_at ?? r.created_at,
});

// 읽을 수 있는 범위는 DB 권한이 정한다(비로그인: 성도·전체 채널만)
const store = listStore<Notice>("ndfms.notice", async (sb) =>
  (await rows<Row>(sb.from("notice").select("id, channel, title, body, pinned, published_at, created_at")
    .not("published_at", "is", null).order("published_at", { ascending: false }).limit(200))).map(fromNoticeRow));

export const useNoticeState = () => useListStore(store);
export const useNotices = () => useNoticeState().items;

/** 해당 화면(채널)에서 볼 공지: 그 채널 + 전체. 고정 먼저, 최신순 */
export const forChannel = (xs: Notice[], ch: Exclude<Channel, "all">) =>
  xs.filter((n) => n.channel === ch || n.channel === "all")
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

export const noticeActions = {
  save: async (n: Omit<Notice, "id" | "createdAt"> & { id?: string }) => {
    if (!store.db) {
      const xs = store.read();
      if (n.id) return store.write(xs.map((x) => (x.id === n.id ? { ...x, ...n, id: x.id } : x)));
      return store.write([{ ...n, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...xs]);
    }
    const row = { channel: n.channel, title: n.title.trim(), body: n.body, pinned: n.pinned };
    return store.run((sb) => (n.id ? sb.from("notice").update(row).eq("id", Number(n.id)) : sb.from("notice").insert(row)));
  },
  remove: async (id: string) => {
    if (!store.db) return store.write(store.read().filter((x) => x.id !== id));
    return store.run((sb) => sb.from("notice").delete().eq("id", Number(id)));
  },
};
