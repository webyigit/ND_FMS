"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import Notice from "@/components/ui/Notice";
import { authorAuto, commentActions, commentsOf, useCommentState, type Comment } from "@/lib/board";
import { useMe } from "@/lib/work/me";

const AUTHOR = "ndfms.board.author"; // 데모 모드: 글쓰기와 같은 작성자 이름을 쓴다
const two = (n: number) => String(n).padStart(2, "0");
/** 작성 시각을 보는 사람 시간대(한국)로: 26-10-08 00:37 */
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${two(d.getFullYear() % 100)}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

export default function Comments({ postId }: { postId: string }) {
  const st = useCommentState();
  const me = useMe().data;
  const list = commentsOf(st.items, postId);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 데모 모드는 모두 수정·삭제 가능. DB 연결 시 수정은 본인, 삭제는 본인·관리자(화면은 DB 권한과 같게 보여 준다)
  const mine = (c: Comment) => !authorAuto || (!!me && c.authorId === me.id);
  const canDelete = (c: Comment) => mine(c) || me?.role === "admin";

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    let author = "";
    if (!authorAuto) try { author = localStorage.getItem(AUTHOR) ?? ""; } catch {}
    if (await commentActions.add(postId, text, author)) setText("");
    setBusy(false);
  };
  const saveEdit = async () => {
    if (!editing || !editing.body.trim()) return;
    if (await commentActions.edit(editing.id, editing.body)) setEditing(null);
  };
  const del = (c: Comment) => { if (confirm("댓글을 삭제할까요?")) void commentActions.remove(c.id); };

  return (
    <section className="mt-5 border-t pt-4">
      <h3 className="mb-2 text-sm font-semibold text-heading"><FontAwesomeIcon icon={faComment} className="mr-1 text-label" /> 댓글 {list.length}</h3>
      {st.error && <Notice kind="error">{st.error}</Notice>}
      <ul className="mb-3 space-y-2">
        {list.map((c) => (
          <li key={c.id} className="rounded bg-surface-2 px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-xs text-label">
              <span className="font-medium text-heading">{c.author || "작성자 미상"}</span>
              <span>{stamp(c.createdAt)}{c.updatedAt && " (수정됨)"}</span>
              {editing?.id !== c.id && (
                <span className="ml-auto flex gap-2">
                  {mine(c) && <button onClick={() => setEditing({ id: c.id, body: c.body })} className="text-primary">수정</button>}
                  {canDelete(c) && <button onClick={() => del(c)} className="text-red-500">삭제</button>}
                </span>
              )}
            </div>
            {editing?.id === c.id ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={2} className="w-full rounded border px-2 py-1 text-sm" autoFocus />
                <div className="flex shrink-0 gap-1 self-end">
                  <button onClick={() => setEditing(null)} className="rounded border px-3 py-1 text-xs">취소</button>
                  <button onClick={saveEdit} disabled={!editing.body.trim()} className="rounded bg-primary px-3 py-1 text-xs text-white disabled:bg-slate-300">저장</button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{c.body}</div>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-muted">{st.loaded ? "첫 댓글을 남겨보세요." : "불러오는 중…"}</li>}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글을 입력하세요 (Ctrl+Enter로 등록)" rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void add(); } }}
          className="w-full rounded border px-3 py-2 text-sm" />
        <button onClick={add} disabled={!text.trim() || busy} className="shrink-0 self-end rounded bg-primary px-4 py-1.5 text-sm text-white disabled:bg-slate-300">등록</button>
      </div>
    </section>
  );
}
