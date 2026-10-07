"use client";
import { useMemo, useState } from "react";
import { btn, btnPrimary, card, input } from "@/components/ui/Buttons";
import { must, useDbQuery } from "@/lib/db/useDb";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ALIAS_KINDS, matchMember, normalizePhone, normalizeRrn, type AliasKind, type MemberRow } from "@/lib/settings/members";

type Props = {
  member: MemberRow | null; members: MemberRow[];
  onClose: () => void; onSaved: (text: string, id?: number) => void; onError: (e: unknown) => void;
};
type Alias = { id: number; alias: string; kind: AliasKind };

const FIELDS: [keyof Form, string, string?][] = [
  ["title", "직분", "집사, 권사…"], ["district", "교구"], ["zone", "구역"],
  ["service_dept", "봉사부서"], ["service_role", "직책"], ["phone", "휴대폰", "010-0000-0000"],
];
type Form = {
  name: string; name_suffix: string; title: string; district: string; zone: string; service_dept: string; service_role: string;
  phone: string; address: string; display_rank: string; is_group: boolean; is_anonymous: boolean; exclude_from_receipt: boolean; active: boolean;
};
const s = (v: string | null) => v ?? "";
const toForm = (m: MemberRow | null): Form => ({
  name: s(m?.name ?? null), name_suffix: s(m?.name_suffix ?? null), title: s(m?.title ?? null), district: s(m?.district ?? null),
  zone: s(m?.zone ?? null), service_dept: s(m?.service_dept ?? null), service_role: s(m?.service_role ?? null), phone: s(m?.phone ?? null),
  address: s(m?.address ?? null), display_rank: m?.display_rank != null ? String(m.display_rank) : "",
  is_group: !!m?.is_group, is_anonymous: !!m?.is_anonymous, exclude_from_receipt: !!m?.exclude_from_receipt, active: m?.active ?? true,
});

// 교인 추가·수정 패널 (기존 교인이면 가족·별칭도)
export default function MemberForm({ member, members, onClose, onSaved, onError }: Props) {
  const sb = supabaseBrowser()!;
  const [f, setF] = useState<Form>(() => toForm(member));
  const [rrn, setRrn] = useState(""); // 새로 입력할 때만 저장
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const rrnBad = rrn !== "" && !normalizeRrn(rrn);

  const run = async (fn: () => Promise<unknown>, text: string, id?: number) => {
    setBusy(true);
    try { await fn(); onSaved(text, id); } catch (e) { onError(e); } finally { setBusy(false); }
  };

  const save = async () => {
    if (!f.name.trim() || rrnBad) return;
    setBusy(true);
    try {
      const id = must(await sb.rpc("save_member", { p: { ...f, id: member?.id ?? null, phone: f.phone && normalizePhone(f.phone), rrn: rrn ? normalizeRrn(rrn) : null } })) as number;
      setRrn("");
      onSaved(`${f.name}${f.name_suffix.toUpperCase()} 님을 저장했어요.`, Number(id));
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const clearRrn = () => member && confirm("저장된 주민번호를 지울까요?") &&
    run(async () => must(await sb.rpc("set_member_rrn", { p_member_id: member.id, p_rrn: null })), "주민번호를 지웠어요.");

  return (
    <div className={`${card} self-start p-4 text-sm`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-heading">{member ? `${member.full_name} 수정` : "새 교인"}</h2>
        <button onClick={onClose} className="text-muted" aria-label="닫기">닫기</button>
      </div>
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <label className="text-xs text-label">이름 *
          <input value={f.name} onChange={(e) => set("name", e.target.value)} className={`${input} mt-1 w-full`} />
        </label>
        <label className="text-xs text-label" title="같은 이름이 있을 때 A, B로 구분">동명이인
          <input value={f.name_suffix} maxLength={2} onChange={(e) => set("name_suffix", e.target.value.toUpperCase())} placeholder="A/B" className={`${input} mt-1 w-full`} />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {FIELDS.map(([k, l, ph]) => (
          <label key={k} className="text-xs text-label">{l}
            <input value={f[k] as string} placeholder={ph} onChange={(e) => set(k, e.target.value)} className={`${input} mt-1 w-full`} />
          </label>
        ))}
      </div>
      <label className="mt-2 block text-xs text-label">주소
        <input value={f.address} onChange={(e) => set("address", e.target.value)} className={`${input} mt-1 w-full`} />
      </label>
      <div className="mt-2 grid grid-cols-[1fr_110px] gap-2">
        <label className="text-xs text-label">주민번호 {member?.has_rrn && <span className="text-muted">(저장됨: {member.rrn_mask})</span>}
          <input value={rrn} onChange={(e) => setRrn(e.target.value.replace(/[^\d-]/g, ""))} autoComplete="off" inputMode="numeric"
            placeholder={member?.has_rrn ? "바꿀 때만 입력" : "900101-1234567"} className={`${input} mt-1 w-full ${rrnBad ? "border-danger" : ""}`} />
        </label>
        <label className="text-xs text-label" title="비우면 가나다순">헌금명단 순서
          <input value={f.display_rank} inputMode="numeric" onChange={(e) => set("display_rank", e.target.value.replace(/\D/g, ""))} placeholder="비우면 가나다" className={`${input} mt-1 w-full`} />
        </label>
      </div>
      {rrnBad && <p className="mt-1 text-xs text-danger">주민번호 13자리를 확인해 주세요.</p>}
      {member?.has_rrn && <button onClick={clearRrn} disabled={busy} className="mt-1 text-xs text-danger">저장된 주민번호 지우기</button>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {([["is_group", "단체(여전도회 등)"], ["is_anonymous", "무명"], ["exclude_from_receipt", "기부금영수증 제외"], ["active", "사용 중"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className={btn}>취소</button>
        <button onClick={save} disabled={busy || !f.name.trim() || rrnBad} className={btnPrimary}>{busy ? "저장 중…" : "저장"}</button>
      </div>

      {member && <Family member={member} members={members} run={run} />}
      {member && <Aliases member={member} onError={onError} />}
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, text: string) => Promise<void>;

// 가족: 같은 household로 묶고, 세대주(기부금영수증 발행 당사자)를 정한다
function Family({ member, members, run }: { member: MemberRow; members: MemberRow[]; run: Run }) {
  const sb = supabaseBrowser()!;
  const [q, setQ] = useState("");
  const family = member.household_id ? members.filter((m) => m.household_id === member.household_id) : [];
  const found = useMemo(() => (q.trim().length >= 1
    ? members.filter((m) => m.active && m.id !== member.id && m.household_id !== member.household_id && matchMember(m, q)).slice(0, 6) : []), [q, members, member]);
  const add = (m: MemberRow) => {
    setQ("");
    // 이 교인에게 가족이 있으면 그 가족으로, 없으면 새 가족(이 교인이 세대주)
    run(async () => must(await sb.rpc("join_family", { p_member: m.id, p_with: member.id })), `${m.full_name} 님을 가족에 넣었어요.`);
  };

  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-2 font-semibold text-heading">가족 {member.household_label && <span className="text-xs font-normal text-muted">{member.household_label}</span>}</div>
      {family.length > 0 && !family.some((m) => m.is_household_head) && <p className="mb-2 text-xs text-warning">세대주가 없어요. 기부금영수증 발행 당사자를 정해 주세요.</p>}
      <ul className="mb-2 space-y-1">
        {family.map((m) => (
          <li key={m.id} className="flex items-center justify-between">
            <span>{m.full_name} <span className="text-xs text-muted">{m.title}</span>
              {m.is_household_head && <span className="ml-1 rounded bg-info-subtle px-1 text-xs text-info">세대주</span>}</span>
            <span className="space-x-2 text-xs">
              {!m.is_household_head && <button className="text-primary" onClick={() => run(async () => must(await sb.rpc("set_household_head", { p_member: m.id })), `${m.full_name} 님을 세대주로 정했어요.`)}>세대주로</button>}
              <button className="text-danger" onClick={() => confirm(`${m.full_name} 님을 가족에서 뺄까요?`) && run(async () => must(await sb.rpc("leave_family", { p_member: m.id })), `${m.full_name} 님을 가족에서 뺐어요.`)}>빼기</button>
            </span>
          </li>
        ))}
        {!family.length && <li className="text-xs text-muted">묶인 가족이 없어요.</li>}
      </ul>
      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="가족 추가: 이름 검색" className={`${input} w-full`} />
        {found.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded border bg-surface shadow">
            {found.map((m) => (
              <li key={m.id}><button onClick={() => add(m)} className="w-full px-2 py-1 text-left hover:bg-surface-2">
                {m.full_name} <span className="text-xs text-muted">{m.title} {m.household_label && `· ${m.household_label}에서 옮김`}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// 별칭: 은행 적요에 찍히는 다른 표기(줄임·오타·공동명의·법인)를 이 교인에 연결
function Aliases({ member, onError }: { member: MemberRow; onError: (e: unknown) => void }) {
  const sb = supabaseBrowser()!;
  const q = useDbQuery(async (sb) => must(await sb.from("member_alias").select("id, alias, kind").eq("member_id", member.id).order("id")) as Alias[], [member.id]);
  const [alias, setAlias] = useState("");
  const [kind, setKind] = useState<AliasKind>("name");
  const add = async () => {
    if (!alias.trim()) return;
    const { error } = await sb.from("member_alias").insert({ member_id: member.id, alias: alias.trim(), kind });
    if (error) return onError(error.code === "23505" ? { message: "이미 있는 별칭이에요." } : error);
    setAlias(""); q.reload();
  };
  const remove = async (a: Alias) => {
    const { error } = await sb.from("member_alias").delete().eq("id", a.id);
    if (error) onError(error); else q.reload();
  };
  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-1 font-semibold text-heading">별칭 <span className="text-xs font-normal text-muted">은행 적요 매칭용</span></div>
      <ul className="mb-2 flex flex-wrap gap-1">
        {(q.data ?? []).map((a) => (
          <li key={a.id} className="rounded bg-surface-2 px-2 py-0.5 text-xs">
            {a.alias} <span className="text-muted">{ALIAS_KINDS.find((k) => k.value === a.kind)?.label}</span>
            <button onClick={() => remove(a)} className="ml-1 text-danger" aria-label="별칭 삭제">×</button>
          </li>
        ))}
        {q.data && !q.data.length && <li className="text-xs text-muted">없어요.</li>}
      </ul>
      <div className="flex gap-2">
        <input value={alias} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="예: 가나다라마(공동명의)" className={`${input} min-w-0 flex-1`} />
        <select value={kind} onChange={(e) => setKind(e.target.value as AliasKind)} className={input}>
          {ALIAS_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <button onClick={add} className={btn}>추가</button>
      </div>
    </div>
  );
}
