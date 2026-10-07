"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faCloudArrowUp, faFileExcel, faFilePdf, faImage, faTrash } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "@/components/PageHeader";
import { DEPARTMENTS } from "@/lib/demo";
import { readFirstSheet } from "@/lib/bank/readXlsx";
import { ACCEPT, fileKind, parseCsv, parseExpenseSheet, type SheetExpense } from "@/lib/expenseUpload";

const MAX = 20 * 1024 * 1024; // 파일당 20MB
const DRAFT = "ndfms.expense.draft"; // 지출입력 화면 임시저장 키
const won = (n: number) => n.toLocaleString("ko-KR");
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);

type Fields = { date: string; content: string; amount: number; dept: string; item: string; requester: string; memo: string };
type Evidence = Fields & { id: string; kind: "pdf" | "image"; name: string; url: string; size: number; origSize: number; preview: boolean };
type SheetRow = SheetExpense & { id: string; pick: boolean; file: string };

/** 사진은 긴 변 2000px JPEG로 줄여 올린다(폰 사진 5~10MB → 수백KB). HEIC 등 브라우저가 못 여는 형식은 원본 유지 */
async function shrink(f: File): Promise<{ blob: Blob; preview: boolean }> {
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return { blob: blob && blob.size < f.size ? blob : f, preview: true };
  } catch { return { blob: f, preview: false }; }
}

export default function ExpenseUpload() {
  const [docs, setDocs] = useState<Evidence[]>([]);
  const [sheet, setSheet] = useState<SheetRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);

  const today = new Date().toISOString().slice(0, 10);
  const blankF = (): Fields => ({ date: today, content: "", amount: 0, dept: "", item: "", requester: "", memo: "" });

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const notes: { ok: boolean; text: string }[] = [];
    for (const f of Array.from(list)) {
      const k = fileKind(f.name, f.type);
      if (k === "unsupported") { notes.push({ ok: false, text: `${f.name}: 받을 수 없는 형식이에요. 구형 .xls는 엑셀에서 .xlsx로 다시 저장해 주세요.` }); continue; }
      if (f.size > MAX) { notes.push({ ok: false, text: `${f.name}: 20MB를 넘어요.` }); continue; }
      if (k === "excel" || k === "csv") {
        try {
          const rows = k === "excel" ? await readFirstSheet(await f.arrayBuffer()) : parseCsv(new TextDecoder().decode(await f.arrayBuffer()));
          const r = parseExpenseSheet(rows, f.name);
          if (r.format === "인식불가") { notes.push({ ok: false, text: `${f.name}: '내용'과 '금액' 열을 찾지 못했어요. 첫 시트 제목 줄을 확인해 주세요.` }); continue; }
          setSheet((xs) => [...xs, ...r.rows.map((x) => ({ ...x, id: crypto.randomUUID(), pick: true, file: f.name, date: x.date || today }))]);
          notes.push({ ok: true, text: `${f.name}: ${r.format === "농협" ? "농협 거래내역 출금" : "지출"} ${r.rows.length}건을 읽었어요${r.skipped ? ` (합계·0원 ${r.skipped}줄 제외)` : ""}.` });
        } catch { notes.push({ ok: false, text: `${f.name}: 파일을 열지 못했어요. 암호가 걸려 있으면 풀고 올려주세요.` }); }
        continue;
      }
      const { blob, preview } = k === "image" ? await shrink(f) : { blob: f as Blob, preview: true };
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setDocs((xs) => [...xs, { ...blankF(), id: crypto.randomUUID(), kind: k, name: f.name, url, size: blob.size, origSize: f.size, preview }]);
      notes.push({ ok: true, text: `${f.name}: 올렸어요${blob.size < f.size ? ` (${size(f.size)} → ${size(blob.size)})` : ""}. 내용·금액을 확인해 주세요.` });
    }
    setMsg(notes);
  };

  const setDoc = (id: string, p: Partial<Evidence>) => setDocs((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const setRow = (id: string, p: Partial<SheetRow>) => setSheet((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const ready = [...docs.filter((d) => d.amount > 0), ...sheet.filter((r) => r.pick)];
  const send = () => {
    let draft: unknown[] = [];
    try { draft = JSON.parse(localStorage.getItem(DRAFT) ?? "[]"); } catch {}
    const add = ready.map((r) => ({
      id: crypto.randomUUID(), content: r.content, amount: r.amount, dept: r.dept, item: r.item, requester: r.requester,
      memo: [r.memo, "kind" in r ? `증빙:${r.name}` : `엑셀:${r.file}`].filter(Boolean).join(" · "),
      source: "kind" in r ? "증빙" : "엑셀",
    }));
    try { localStorage.setItem(DRAFT, JSON.stringify([...draft, ...add])); } catch {}
    setDocs((xs) => xs.filter((d) => !(d.amount > 0)));
    setSheet((xs) => xs.filter((r) => !r.pick));
    setMsg([{ ok: true, text: `지출입력에 ${add.length}건을 넣었어요.` }]);
  };

  const input = "w-full rounded border px-2 py-1.5 text-sm";
  const deptSel = (v: string, on: (d: string) => void) => (
    <select className={input} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">부서</option>{Object.keys(DEPARTMENTS).map((d) => <option key={d}>{d}</option>)}
      {v && !DEPARTMENTS[v] && <option value={v}>{v} (확인 필요)</option>}
    </select>
  );
  const itemSel = (d: string, v: string, on: (i: string) => void) => (
    <select className={input} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">항목</option>{(DEPARTMENTS[d] ?? []).map((i) => <option key={i}>{i}</option>)}
      {v && !(DEPARTMENTS[d] ?? []).includes(v) && <option value={v}>{v} (확인 필요)</option>}
    </select>
  );

  return (
    <>
      <PageHeader actions={<span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">서버 저장은 DB 연결 후 · 지금은 이 화면에서만 보관</span>} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        className={`mb-4 rounded-lg border-2 border-dashed bg-white p-6 text-center ${drag ? "border-blue-500 bg-blue-50" : "border-slate-300"}`}
      >
        <FontAwesomeIcon icon={faCloudArrowUp} className="mb-2 text-3xl text-slate-400" />
        <div className="mb-1 font-semibold">지출 증빙이나 지출내역 파일을 올려주세요</div>
        <div className="mb-4 text-xs text-slate-500">영수증 PDF · 사진(JPG, PNG, HEIC) · 엑셀(.xlsx) · CSV · 파일당 20MB · 여러 개 한 번에 가능</div>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          <label className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-white"><FontAwesomeIcon icon={faCloudArrowUp} /> 파일 선택
            <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} /></label>
          <label className="cursor-pointer rounded border px-4 py-2"><FontAwesomeIcon icon={faCamera} /> 사진 촬영
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} /></label>
          <label className="cursor-pointer rounded border px-4 py-2"><FontAwesomeIcon icon={faFileExcel} className="text-emerald-600" /> 엑셀·CSV
            <input type="file" multiple accept=".xlsx,.csv" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} /></label>
        </div>
        <div className="mt-3 text-xs text-slate-400">PC에서는 끌어다 놓아도 돼요. 폰에서는 &lsquo;사진 촬영&rsquo;을 누르면 카메라가 바로 열려요.</div>
      </div>

      {msg.length > 0 && (
        <div className="mb-4 space-y-1">{msg.map((m, i) => <div key={i} className={`rounded px-3 py-2 text-sm ${m.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{m.text}</div>)}</div>
      )}

      {docs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">영수증·증빙 {docs.length}건 <span className="font-normal text-slate-400">· 자동 인식(AI)은 키 설정 후 [확인 필요], 지금은 직접 입력</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {docs.map((d) => (
              <div key={d.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <a href={d.url} target="_blank" rel="noreferrer" className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-50" title="크게 보기">
                  {d.kind === "image" && d.preview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={d.url} alt={d.name} className="h-full w-full object-cover" />
                    : <FontAwesomeIcon icon={d.kind === "pdf" ? faFilePdf : faImage} className={`text-3xl ${d.kind === "pdf" ? "text-red-500" : "text-slate-400"}`} />}
                </a>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">{d.name} · {size(d.size)}</span>
                    <button onClick={() => setDocs((xs) => xs.filter((x) => x.id !== d.id))} className="text-red-500" aria-label="삭제"><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                  <div className="flex gap-1.5">
                    <input type="date" className={input} value={d.date} onChange={(e) => setDoc(d.id, { date: e.target.value })} />
                    <input className={`${input} text-right`} inputMode="numeric" placeholder="금액" value={d.amount ? won(d.amount) : ""} onChange={(e) => setDoc(d.id, { amount: Number(e.target.value.replace(/\D/g, "")) })} />
                  </div>
                  <input className={input} placeholder="내용 (예: 주보 인쇄)" value={d.content} onChange={(e) => setDoc(d.id, { content: e.target.value })} />
                  <div className="flex gap-1.5">{deptSel(d.dept, (v) => setDoc(d.id, { dept: v, item: "" }))}{itemSel(d.dept, d.item, (v) => setDoc(d.id, { item: v }))}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sheet.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>엑셀에서 읽은 지출 {sheet.length}건 <span className="font-normal text-slate-400">· 넣을 줄만 체크</span></span>
            <button onClick={() => setSheet([])} className="text-xs font-normal text-slate-500">모두 지우기</button>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="w-8 py-2"><input type="checkbox" checked={sheet.every((r) => r.pick)} onChange={(e) => setSheet((xs) => xs.map((x) => ({ ...x, pick: e.target.checked })))} /></th>
                  <th className="w-36">일자</th><th className="min-w-[200px] text-left">내용</th><th className="w-28 text-right">금액</th><th className="w-36">부서</th><th className="w-40">항목</th><th className="w-24">청구자</th><th className="text-left">파일</th></tr>
              </thead>
              <tbody>
                {sheet.map((r) => (
                  <tr key={r.id} className={`border-t ${r.pick ? "" : "text-slate-400"}`}>
                    <td className="text-center"><input type="checkbox" checked={r.pick} onChange={(e) => setRow(r.id, { pick: e.target.checked })} /></td>
                    <td className="px-1 py-1"><input type="date" className={input} value={r.date} onChange={(e) => setRow(r.id, { date: e.target.value })} /></td>
                    <td className="px-1"><input className={input} value={r.content} onChange={(e) => setRow(r.id, { content: e.target.value })} /></td>
                    <td className="px-2 text-right">{won(r.amount)}</td>
                    <td className="px-1">{deptSel(r.dept, (v) => setRow(r.id, { dept: v, item: "" }))}</td>
                    <td className="px-1">{itemSel(r.dept, r.item, (v) => setRow(r.id, { item: v }))}</td>
                    <td className="px-2 text-center">{r.requester}</td>
                    <td className="truncate px-2 text-xs text-slate-400">{r.file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(docs.length > 0 || sheet.length > 0) && (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow">
          <span>보낼 지출 <b>{ready.length}건</b> · {won(ready.reduce((s, r) => s + r.amount, 0))}원</span>
          <span className="text-xs text-slate-400">증빙은 금액을 넣은 것만 보내요</span>
          <div className="ml-auto flex gap-2">
            <Link href="/expense/entry" className="rounded border px-3 py-1.5">지출입력 보기</Link>
            <button onClick={send} disabled={!ready.length} className="rounded bg-blue-600 px-4 py-1.5 text-white disabled:bg-slate-300">지출입력으로 보내기</button>
          </div>
        </div>
      )}
    </>
  );
}
