"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { CHANNELS, noticeActions, useNotices, type Channel, type Notice } from "@/lib/notice";

const blank = { channel: "all" as Channel, title: "", body: "", pinned: false };
const label = (c: Channel) => CHANNELS.find((x) => x.value === c)?.label;
const WHERE: Record<Channel, string> = { dept_head: "부서장 모바일(/m/notice)", member: "성도 공지(/notice)", all: "부서장 모바일 + 성도 공지" };

export default function NoticeAdmin() {
  const notices = useNotices();
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [filter, setFilter] = useState<Channel | "">("");

  const save = () => {
    if (!form.title.trim()) return;
    noticeActions.save(form);
    setForm(blank);
  };
  const edit = (n: Notice) => setForm({ id: n.id, channel: n.channel, title: n.title, body: n.body, pinned: n.pinned });
  const list = notices.filter((n) => !filter || n.channel === filter);

  return (
    <>
      <PageHeader actions={<span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">DB 연결 전 브라우저에만 저장</span>} />
      <div className="mb-6 rounded-lg bg-surface shadow-card p-4 text-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-label">게재 채널</span>
          {CHANNELS.map((c) => (
            <label key={c.value} className="flex items-center gap-1">
              <input type="radio" name="channel" checked={form.channel === c.value} onChange={() => setForm({ ...form, channel: c.value })} /> {c.label}
            </label>
          ))}
          <span className="text-xs text-muted">→ {WHERE[form.channel]}에 표시</span>
          <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 상단 고정</label>
        </div>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="제목" className="mb-2 w-full rounded border px-2 py-1.5" />
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="내용" rows={5} className="w-full rounded border px-2 py-1.5" />
        <div className="mt-2 flex justify-end gap-2">
          {form.id && <button onClick={() => setForm(blank)} className="rounded border px-3 py-1.5">취소</button>}
          <button onClick={save} className="rounded bg-primary px-4 py-1.5 text-white">{form.id ? "수정" : "게재"}</button>
        </div>
      </div>

      <div className="mb-2 flex gap-2 text-sm">
        {[{ value: "", label: "전체 보기" }, ...CHANNELS].map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value as Channel | "")} className={`rounded-full border px-3 py-1 ${filter === c.value ? "bg-primary text-white" : ""}`}>{c.label}</button>
        ))}
      </div>
      <table className="w-full rounded-lg bg-surface shadow-card text-sm">
        <thead className="bg-surface-2 text-xs text-label"><tr><th className="w-20 py-2">채널</th><th className="text-left">제목</th><th className="w-28">게재일</th><th className="w-24" /></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">공지사항이 없어요</td></tr>}
          {list.map((n) => (
            <tr key={n.id} className="border-t">
              <td className="py-2 text-center"><span className="rounded bg-surface-2 px-2 py-0.5 text-xs">{label(n.channel)}</span></td>
              <td>{n.pinned && <span className="mr-1 text-xs text-red-600">[고정]</span>}{n.title}</td>
              <td className="text-center text-label">{n.createdAt.slice(0, 10)}</td>
              <td className="text-center text-xs">
                <button onClick={() => edit(n)} className="text-primary">수정</button>{" "}
                <button onClick={() => noticeActions.remove(n.id)} className="text-red-500">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
