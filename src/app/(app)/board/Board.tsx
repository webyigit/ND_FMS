"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPen, faThumbtack } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { authorAuto, boardActions, listPosts, usePostState, type Post } from "@/lib/board";

const AUTHOR = "ndfms.board.author"; // 데모 모드에서 작성자 이름을 기억
const blank = () => ({ title: "", body: "", author: (() => { try { return localStorage.getItem(AUTHOR) ?? ""; } catch { return ""; } })(), pinned: false });
const day = (iso: string) => iso.slice(0, 10);

export default function Board() {
  const st = usePostState();
  const posts = st.items;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<(ReturnType<typeof blank> & { id?: string }) | null>(null);
  const list = listPosts(posts, q);
  const cur = posts.find((p) => p.id === open);

  const save = async () => {
    if (!form || !form.title.trim()) return;
    if (!authorAuto) try { localStorage.setItem(AUTHOR, form.author); } catch {}
    if ((await boardActions.save(form)) !== false) setForm(null);
  };
  const edit = (p: Post) => setForm({ id: p.id, title: p.title, body: p.body, author: p.author, pinned: p.pinned });
  const del = (p: Post) => { if (confirm(`'${p.title}' 글을 삭제할까요?`)) { boardActions.remove(p.id); setOpen(null); } };

  const input = "w-full rounded border px-3 py-2 text-sm";
  return (
    <>
      <PageHeader actions={<>
        {!authorAuto && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모: 이 브라우저에만 저장</span>}
        {!form && <button onClick={() => { setForm(blank()); setOpen(null); }} className="rounded bg-primary px-4 py-1.5 text-sm text-white"><FontAwesomeIcon icon={faPen} /> 글쓰기</button>}
      </>} />
      {st.error && <Notice kind="error">{st.error}</Notice>}

      {form && (
        <div className="mb-6 rounded-lg bg-surface shadow-card p-4 text-sm">
          <div className="mb-2 flex flex-wrap gap-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="제목" className={`${input} min-w-[240px] flex-1`} autoFocus />
            {!authorAuto && <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="작성자" className={`${input} w-32`} />}
          </div>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="재정 관련 기록을 남겨주세요 (회의 내용, 처리 경과, 인수인계 등)" rows={8} className={input} />
          <div className="mt-2 flex items-center gap-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 상단 고정</label>
            <button onClick={() => setForm(null)} className="ml-auto rounded border px-3 py-1.5">취소</button>
            <button onClick={save} disabled={!form.title.trim()} className="rounded bg-primary px-4 py-1.5 text-white disabled:bg-slate-300">{form.id ? "수정" : "등록"}</button>
          </div>
        </div>
      )}

      {cur && !form && (
        <article className="mb-6 rounded-lg bg-surface shadow-card p-5 text-sm">
          <h2 className="text-lg font-bold">{cur.pinned && <FontAwesomeIcon icon={faThumbtack} className="mr-1 text-red-500" />}{cur.title}</h2>
          <div className="mb-4 mt-1 text-xs text-label">{cur.author || "작성자 미상"} · {day(cur.createdAt)}{cur.updatedAt && ` (수정 ${day(cur.updatedAt)})`}</div>
          <div className="whitespace-pre-wrap leading-relaxed">{cur.body}</div>
          <div className="mt-4 flex justify-end gap-2 text-xs">
            <button onClick={() => setOpen(null)} className="rounded border px-3 py-1">목록</button>
            <button onClick={() => edit(cur)} className="rounded border px-3 py-1 text-primary">수정</button>
            <button onClick={() => del(cur)} className="rounded border px-3 py-1 text-red-500">삭제</button>
          </div>
        </article>
      )}

      <div className="mb-2 flex items-center gap-2 rounded border bg-surface px-3 py-1.5 text-sm sm:w-80">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·내용·작성자 검색" className="w-full outline-none" />
      </div>
      <div className="overflow-hidden rounded-lg bg-surface shadow-card text-sm">
        <table className="w-full">
          <thead className="bg-surface-2 text-xs text-label"><tr><th className="w-14 py-2">번호</th><th className="text-left">제목</th><th className="hidden w-28 sm:table-cell">작성자</th><th className="w-24">작성일</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">{q ? "검색 결과가 없어요" : st.loaded ? "아직 글이 없어요. 첫 기록을 남겨보세요." : "불러오는 중…"}</td></tr>}
            {list.map((p) => (
              <tr key={p.id} onClick={() => { setOpen(p.id); setForm(null); }} className={`cursor-pointer border-t hover:bg-surface-2 ${open === p.id ? "bg-primary-subtle" : ""}`}>
                <td className="py-2 text-center text-muted">{p.pinned ? <FontAwesomeIcon icon={faThumbtack} className="text-red-500" /> : posts.length - posts.findIndex((x) => x.id === p.id)}</td>
                <td>{p.title}</td>
                <td className="hidden text-center text-label sm:table-cell">{p.author}</td>
                <td className="text-center text-label">{day(p.createdAt).slice(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
