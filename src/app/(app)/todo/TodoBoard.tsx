"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/PageHeader";
import Notice from "@/components/ui/Notice";
import { isDbConfigured } from "@/lib/supabase/config";
import { localDate as today, sortTodos, todoActions, useTodoState } from "@/lib/todo";

export default function TodoBoard() {
  const st = useTodoState();
  const todos = sortTodos(st.items);
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(true);

  const add = () => {
    if (!text.trim()) return;
    todoActions.add(date, text);
    setText("");
  };
  const list = todos.filter((t) => showDone || !t.done);
  const pending = todos.filter((t) => !t.done).length;

  return (
    <>
      <PageHeader actions={!isDbConfigured && <span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모: 이 브라우저에만 저장</span>} />
      {st.error && <Notice kind="error">{st.error}</Notice>}
      <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-surface shadow-card p-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
          placeholder="할 일 입력 후 Enter" className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" />
        <button onClick={add} className="rounded bg-primary px-4 py-1.5 text-sm text-white">추가</button>
      </div>
      <div className="mb-2 flex items-center justify-between text-sm text-label">
        <span>전체 {todos.length}건 · 미완료 {pending}건</span>
        <label className="flex items-center gap-1"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 완료 항목 보기</label>
      </div>
      <ul className="divide-y rounded-lg bg-surface shadow-card text-sm">
        {list.length === 0 && <li className="px-4 py-6 text-center text-muted">{st.loaded ? "할 일이 없어요" : "불러오는 중…"}</li>}
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <input type="checkbox" checked={t.done} onChange={() => todoActions.toggle(t.id)} className="h-4 w-4" />
            <span className={`w-24 shrink-0 ${!t.done && t.date < today() ? "font-semibold text-red-600" : "text-label"}`}>{t.date}</span>
            <span className={`flex-1 ${t.done ? "text-muted line-through" : ""}`}>{t.text}</span>
            <button onClick={() => todoActions.remove(t.id)} aria-label="삭제" className="text-muted hover:text-red-500"><FontAwesomeIcon icon={faTrashCan} /></button>
          </li>
        ))}
      </ul>
    </>
  );
}
