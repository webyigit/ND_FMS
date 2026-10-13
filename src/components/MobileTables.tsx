"use client";
import { useEffect } from "react";

/** 폰 폭에서 카드 목록으로 바뀌는 표(.tbl-cards)의 각 칸에 머리글(data-label)을 붙인다.
 *  머리글이 여러 줄(colSpan·rowSpan)이면 위에서 아래로 이어 붙이고, 본문의 rowSpan 칸은 자리(열)를 맞춰 센다.
 *  행이 바뀔 때마다(MutationObserver) 다시 붙이므로 화면 코드는 표에 클래스만 주면 된다. */
export default function MobileTables() {
  useEffect(() => {
    /** 행 목록을 열 기준 격자로 펼친다: grid[r][c] = 그 자리에 있는 칸(또는 위 행에서 rowSpan으로 내려온 칸) */
    const layout = (rows: HTMLTableRowElement[]) => {
      const grid: HTMLTableCellElement[][] = rows.map(() => []);
      rows.forEach((tr, r) => {
        let c = 0;
        for (const cell of Array.from(tr.cells)) {
          while (grid[r][c]) c++;
          const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
          for (let i = 0; i < rs && r + i < rows.length; i++) for (let j = 0; j < cs; j++) grid[r + i][c + j] = cell;
          c += cs;
        }
      });
      return grid;
    };
    const label = (t: HTMLTableElement) => {
      // 머리글: thead 안에서 th로만 된 행들
      const headRows = t.tHead ? Array.from(t.tHead.rows).filter((tr) => tr.cells.length && Array.from(tr.cells).every((c) => c.tagName === "TH") && !(tr.cells.length === 1 && tr.cells[0].colSpan > 1)) : []; // 제목 한 칸짜리 행은 뺀다
      const hg = layout(headRows);
      const heads: string[] = [];
      const width = Math.max(0, ...hg.map((r) => r.length));
      for (let c = 0; c < width; c++) {
        const parts: string[] = [];
        for (const row of hg) { const txt = (row[c]?.textContent ?? "").trim(); if (txt && parts[parts.length - 1] !== txt) parts.push(txt); }
        heads.push(parts.join(" "));
      }
      for (const body of [...Array.from(t.tBodies), ...(t.tFoot ? [t.tFoot] : [])]) {
        const rows = Array.from(body.rows);
        const grid = layout(rows);
        rows.forEach((tr, r) => {
          for (const td of Array.from(tr.cells)) {
            const col = grid[r].indexOf(td);
            const lbl = (td.colSpan || 1) > 1 ? "" : heads[col] ?? "";
            if (td.getAttribute("data-label") !== lbl) td.setAttribute("data-label", lbl);
            const txt = (td.textContent ?? "").trim();
            const empty = !td.children.length && (!txt || txt === "-"); // 빈 칸·"-"(값 없음)은 카드에서 숨긴다
            if (empty) td.setAttribute("data-empty", ""); else if (td.hasAttribute("data-empty")) td.removeAttribute("data-empty");
          }
        });
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
