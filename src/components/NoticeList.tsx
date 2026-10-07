"use client";
import { useState } from "react";
import { forChannel, useNotices, type Channel } from "@/lib/notice";

// 채널 화면(부서장 모바일·성도 페이지)에 보여주는 공지 목록
export default function NoticeList({ channel, limit }: { channel: Exclude<Channel, "all">; limit?: number }) {
  const list = forChannel(useNotices(), channel).slice(0, limit);
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return <div className="rounded-lg bg-white p-4 text-center text-sm text-slate-400">공지사항이 없어요</div>;
  return (
    <ul className="divide-y rounded-lg border border-slate-200 bg-white text-sm">
      {list.map((n) => (
        <li key={n.id}>
          <button onClick={() => setOpen(open === n.id ? null : n.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            {n.pinned && <span className="rounded bg-red-100 px-1.5 text-xs text-red-600">고정</span>}
            <span className="flex-1 font-medium">{n.title}</span>
            <span className="text-xs text-slate-400">{n.createdAt.slice(0, 10)}</span>
          </button>
          {open === n.id && <p className="whitespace-pre-wrap px-4 pb-4 text-slate-600">{n.body}</p>}
        </li>
      ))}
    </ul>
  );
}
