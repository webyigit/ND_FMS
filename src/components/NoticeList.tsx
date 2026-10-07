"use client";
import { useState } from "react";
import { forChannel, useNoticeState, type Channel } from "@/lib/notice";

// 채널 화면(부서장 모바일·성도 페이지)에 보여주는 공지 목록
export default function NoticeList({ channel, limit }: { channel: Exclude<Channel, "all">; limit?: number }) {
  const st = useNoticeState();
  const list = forChannel(st.items, channel).slice(0, limit);
  const [open, setOpen] = useState<string | null>(null);
  if (st.error) return <div className="rounded-lg bg-danger-subtle p-4 text-center text-sm text-danger">공지를 불러오지 못했어요</div>;
  if (!list.length) return <div className="rounded-lg bg-surface p-4 text-center text-sm text-muted">{st.loaded ? "공지사항이 없어요" : "불러오는 중…"}</div>;
  return (
    <ul className="divide-y rounded-lg bg-surface shadow-card text-sm">
      {list.map((n) => (
        <li key={n.id}>
          <button onClick={() => setOpen(open === n.id ? null : n.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            {n.pinned && <span className="rounded bg-danger-subtle px-1.5 text-xs text-danger">고정</span>}
            <span className="flex-1 font-medium text-heading">{n.title}</span>
            <span className="text-xs text-muted">{n.createdAt.slice(0, 10)}</span>
          </button>
          {open === n.id && <p className="whitespace-pre-wrap px-4 pb-4 text-label">{n.body}</p>}
        </li>
      ))}
    </ul>
  );
}
