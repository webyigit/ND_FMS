"use client";
import { useEffect } from "react";

/** 폰 폭에서 카드 목록으로 바뀌는 표(.tbl-cards)의 각 칸에 머리글(data-label)을 붙인다.
 *  행이 바뀔 때마다(MutationObserver) 다시 붙이므로 화면 코드는 표에 클래스만 주면 된다. */
export default function MobileTables() {
  useEffect(() => {
    const label = (t: HTMLTableElement) => {
      const headRow = t.tHead?.rows[t.tHead.rows.length - 1];
      const heads: string[] = [];
      if (headRow) for (const th of Array.from(headRow.cells)) { const txt = (th.textContent ?? "").trim(); for (let i = 0; i < (th.colSpan || 1); i++) heads.push(txt); }
      for (const body of Array.from(t.tBodies)) for (const tr of Array.from(body.rows)) {
        let col = 0;
        for (const td of Array.from(tr.cells)) {
          const span = td.colSpan || 1;
          const lbl = span > 1 ? "" : heads[col] ?? "";
          if (td.getAttribute("data-label") !== lbl) td.setAttribute("data-label", lbl);
          const empty = !td.children.length && !(td.textContent ?? "").trim();
          if (empty) td.setAttribute("data-empty", ""); else if (td.hasAttribute("data-empty")) td.removeAttribute("data-empty");
          col += span;
        }
      }
    };
    let raf = 0;
    const run = () => { raf = 0; document.querySelectorAll<HTMLTableElement>("table.tbl-cards").forEach(label); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
