"use client";
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { readFirstSheet } from "@/lib/bank/readXlsx";
import { isNonghyupFile, parseNonghyupRows, type BankTx } from "@/lib/bank/nonghyup";
import { classifyDeposit, DEFAULT_KEYWORDS } from "@/lib/classify";
import { MEMBERS, OFFERING_TYPES } from "@/lib/demo";

const BANKS = ["농협"]; // 다른 은행 양식은 [확인 필요]
const KEY_DRAFT = "ndfms.income.draft";
const won = (n: number) => n.toLocaleString("ko-KR");

const keywords = OFFERING_TYPES.map((t) => ({ offeringTypeId: t.id, keywords: DEFAULT_KEYWORDS[t.name] ?? [t.name] }));

type Row = BankTx & { key: string; typeId: number | null; memberIds: number[] };

export default function BankImport() {
  const [bank, setBank] = useState(BANKS[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [depositOnly, setDepositOnly] = useState(true);

  const onFile = async (f: File) => {
    setError(""); setMsg("");
    try {
      if (bank === "농협" && !isNonghyupFile(f.name)) setMsg("파일명이 '농협_'으로 시작하지 않지만 그대로 읽어볼게요.");
      const tx = parseNonghyupRows(await readFirstSheet(await f.arrayBuffer()));
      setRows(tx.map((t, i) => {
        const c = classifyDeposit(t.description, keywords, MEMBERS);
        return { ...t, key: `${t.txAt}-${i}`, typeId: c.offeringTypeId, memberIds: c.memberIds };
      }));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const view = useMemo(() => rows.filter((r) => !depositOnly || r.deposit > 0), [rows, depositOnly]);
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const save = () => {
    const picked = rows.filter((r) => selected.has(r.key) && r.deposit > 0);
    if (picked.some((r) => !r.typeId)) return setError("헌금구분이 비어 있는 거래가 있어요.");
    let draft: unknown[] = [];
    try { draft = JSON.parse(localStorage.getItem(KEY_DRAFT) ?? "[]"); } catch {}
    const add = picked.map((r) => {
      const m = MEMBERS.filter((x) => r.memberIds.includes(x.id));
      return {
        id: crypto.randomUUID(), typeId: r.typeId, channel: "online", memberId: m.length === 1 ? m[0].id : null,
        name: m.length ? m.map((x) => x.name).join(",") : r.description, amount: r.deposit, memo: "",
      };
    });
    try { localStorage.setItem(KEY_DRAFT, JSON.stringify([...draft, ...add])); } catch {}
    setMsg(`${add.length}건을 금주 수입입력에 넣었어요.`);
    setSelected(new Set());
  };

  return (
    <>
      <PageHeader actions={<span className="rounded bg-warning-subtle px-2 py-1 text-xs text-warning">데모 · 업로드 파일은 서버로 보내지 않고 브라우저에서만 읽어요</span>} />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-surface shadow-card p-4 text-sm">
        <label className="text-xs text-label">은행
          <select value={bank} onChange={(e) => setBank(e.target.value)} className="mt-1 block rounded border px-2 py-1.5 text-sm text-heading">
            {BANKS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label className="text-xs text-label">거래내역 엑셀(.xlsx)
          <input type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="mt-1 block text-sm text-heading" />
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={depositOnly} onChange={(e) => setDepositOnly(e.target.checked)} /> 입금만 보기</label>
        <button onClick={save} disabled={!selected.size} className="ml-auto rounded bg-primary px-4 py-1.5 text-white disabled:bg-slate-300">
          선택 {selected.size}건 금주 수입에 저장
        </button>
      </div>
      {error && <div className="mb-3 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</div>}
      {msg && <div className="mb-3 rounded bg-success-subtle px-3 py-2 text-sm text-success">{msg}</div>}

      {view.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-label">
              <tr>
                <th className="w-8 px-2 py-2"><input type="checkbox" checked={view.every((r) => selected.has(r.key))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(view.filter((r) => r.deposit > 0).map((r) => r.key)) : new Set())} /></th>
                <th className="px-2 text-left">거래일시</th><th className="px-2 text-right">입금</th><th className="px-2 text-right">출금</th>
                <th className="px-2 text-left">거래내용</th><th className="px-2 text-left">거래기록사항</th>
                <th className="px-2 text-left">헌금구분(자동)</th><th className="px-2 text-left">헌금자(자동)</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="px-2 py-1.5 text-center">{r.deposit > 0 && <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />}</td>
                  <td className="px-2 whitespace-nowrap">{r.txAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-2 text-right">{r.deposit ? won(r.deposit) : ""}</td>
                  <td className="px-2 text-right">{r.withdraw ? won(r.withdraw) : ""}</td>
                  <td className="px-2">{r.txType}</td>
                  <td className="px-2">{r.description}</td>
                  <td className="px-2">
                    {r.deposit > 0 && (
                      <select value={r.typeId ?? ""} onChange={(e) => setRows((xs) => xs.map((x) => x.key === r.key ? { ...x, typeId: Number(e.target.value) || null } : x))}
                        className={`rounded border px-1 py-0.5 ${r.typeId ? "" : "border-red-400"}`}>
                        <option value="">선택</option>
                        {OFFERING_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-2">{MEMBERS.filter((m) => r.memberIds.includes(m.id)).map((m) => m.name).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
