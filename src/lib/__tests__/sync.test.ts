// 동기화 엔진 통합 테스트: 가짜 IndexedDB + 가짜 Supabase(주간 읽기/저장 함수)로 오프라인 → 재연결 흐름을 돌려 본다
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomeEntry } from "../db/weekly";

const server = { income: new Map<string, IncomeEntry[]>(), saveCalls: [] as { sunday: string; rows: IncomeEntry[] }[], fail: null as null | Error };
const row = (amount: number, name = "가나다", id = "x"): IncomeEntry => ({ id, typeId: 1, channel: "cash", memberId: null, name, amount, memo: "" });

vi.mock("../supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }), onAuthStateChange: () => {} } }),
}));
vi.mock("../db/weekly", async (orig) => {
  const real = await orig<typeof import("../db/weekly")>();
  return {
    ...real,
    loadIncome: async (_sb: unknown, sunday: string) => { if (server.fail) throw server.fail; return server.income.get(sunday) ?? []; },
    saveIncome: async (_sb: unknown, sunday: string, rows: IncomeEntry[]) => {
      if (server.fail) throw server.fail;
      server.saveCalls.push({ sunday, rows });
      server.income.set(sunday, rows.map((r, i) => ({ ...r, id: `db-${i + 1}` })));
      return rows.length;
    },
  };
});

Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
Object.defineProperty(globalThis, "window", { value: { addEventListener: () => {} }, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: { store: {} as Record<string, string>, setItem(k: string, v: string) { this.store[k] = v; }, getItem(k: string) { return this.store[k] ?? null; }, removeItem(k: string) { delete this.store[k]; } }, configurable: true });

const { enqueue, getWeekCache, resolve, setWeekCache, syncNow, clearLocalData } = await import("../offline/sync");
const { storeAll } = await import("../offline/idb");
const { incomeSig } = await import("../db/weekly");
type Item = import("../offline/logic").OutboxItem;
const outbox = () => storeAll<Item>("outbox");
const SUN = "2026-10-04";

beforeEach(async () => {
  await clearLocalData();
  server.income.clear(); server.saveCalls = []; server.fail = null;
  (navigator as { onLine: boolean }).onLine = true;
});

describe("오프라인 입력 → 재연결 동기화", () => {
  it("서버가 그대로면 올리고 대기열에서 지운다 (새 행 id 포함해 캐시 갱신)", async () => {
    const before = [row(1000, "가", "db-1")];
    server.income.set(SUN, before);
    await setWeekCache("income", SUN, { rows: before, serverSig: incomeSig(before) }); // 온라인에서 한 번 읽었음
    (navigator as { onLine: boolean }).onLine = false;
    await enqueue("income", SUN, [row(1000, "가", "db-1"), row(2000, "나")], incomeSig(before));
    expect((await outbox()).length).toBe(1);
    expect((await getWeekCache("income", SUN))?.rows.length).toBe(2); // 오프라인에서 다시 열면 내 입력이 보인다

    (navigator as { onLine: boolean }).onLine = true;
    await syncNow();
    expect(server.saveCalls.length).toBe(1);
    expect(await outbox()).toEqual([]);
    const cached = await getWeekCache("income", SUN);
    expect(cached?.rows.map((r) => r.id)).toEqual(["db-1", "db-2"]);
    expect(cached?.serverSig).toBe(incomeSig(server.income.get(SUN)!));
  });

  it("그 사이 서버가 바뀌었으면 덮어쓰지 않고 충돌로 남긴다 → '내 입력으로' 고르면 올린다", async () => {
    const before = [row(1000, "가", "db-1")];
    server.income.set(SUN, before);
    await enqueue("income", SUN, [row(1000, "가", "db-1"), row(2000, "나")], incomeSig(before));
    server.income.set(SUN, [row(1000, "가", "db-1"), row(3000, "다", "db-2")]); // 다른 PC에서 저장됨
    await syncNow();
    expect(server.saveCalls.length).toBe(0);
    const [it_] = await outbox();
    expect(it_.status).toBe("conflict");
    expect(it_.serverRows?.length).toBe(2);
    expect(it_.reason).toMatch(/다른 곳에서 바뀌었어요/);

    await resolve(it_, "mine");
    await syncNow();
    expect(server.saveCalls.length).toBe(1);
    expect(server.saveCalls[0].rows.map((r) => r.amount)).toEqual([1000, 2000]);
    expect(await outbox()).toEqual([]);
  });

  it("'서버 것 유지'를 고르면 내 입력을 버리고 캐시를 서버 내용으로", async () => {
    server.income.set(SUN, [row(5000, "라", "db-9")]);
    await enqueue("income", SUN, [row(1, "나")], null); // 서버 내용을 못 받은 채 입력
    await syncNow();
    const [it_] = await outbox();
    expect(it_.status).toBe("conflict");
    expect(it_.reason).toMatch(/이미 입력이 있었어요/);
    await resolve(it_, "server");
    expect(await outbox()).toEqual([]);
    expect((await getWeekCache("income", SUN))?.rows.map((r) => r.amount)).toEqual([5000]);
  });

  it("'입력 화면에 불러오기'는 임시저장(localStorage)에 내 입력을 넣고 대기열에서 뺀다", async () => {
    server.income.set(SUN, [row(5000, "라", "db-9")]);
    await enqueue("income", SUN, [row(777, "나")], null);
    await syncNow();
    const [it_] = await outbox();
    await resolve(it_, "edit");
    expect(JSON.parse(localStorage.getItem("ndfms.income.draft")!)[0].amount).toBe(777);
    expect(JSON.parse(localStorage.getItem("ndfms.income.draft.meta")!)).toEqual({ sunday: SUN, savedSig: null });
    expect(await outbox()).toEqual([]);
  });

  it("마감된 주는 덮어쓰기 불가(locked) 충돌, 권한 오류는 error 로 남긴다", async () => {
    await enqueue("income", SUN, [row(1, "나")], null);
    server.fail = new Error("마감된 주입니다: 2026-10-04");
    await syncNow();
    let [it_] = await outbox();
    expect(it_.status).toBe("conflict");
    expect(it_.locked).toBe(true);

    server.fail = new Error("권한이 없습니다");
    await resolve(it_, "mine"); // 다시 시도
    await syncNow();
    [it_] = await outbox();
    expect(it_.status).toBe("error");
    expect(it_.reason).toBe("권한이 없습니다");
  });

  it("아직 오프라인이면(네트워크 오류) 그대로 두고 다음에 다시 시도", async () => {
    await enqueue("income", SUN, [row(1, "나")], null);
    server.fail = new TypeError("Failed to fetch");
    await syncNow();
    const [it_] = await outbox();
    expect(it_.status).toBe("pending");
    expect(it_.attempts).toBe(0);
  });

  it("같은 주일을 오프라인에서 여러 번 저장하면 대기열 항목은 하나, 기준 서명은 처음 것", async () => {
    (navigator as { onLine: boolean }).onLine = false;
    await enqueue("income", SUN, [row(1, "나")], "BASE");
    await enqueue("income", SUN, [row(2, "나")], "OTHER");
    const items = await outbox();
    expect(items.length).toBe(1);
    expect(items[0].baseSig).toBe("BASE");
    expect(items[0].rows[0].amount).toBe(2);
  });

  it("서버가 이미 같은 내용이면 저장 호출 없이 대기열에서 뺀다", async () => {
    const same = [row(1000, "가", "db-1")];
    server.income.set(SUN, same);
    await enqueue("income", SUN, same, "OLD");
    await syncNow();
    expect(server.saveCalls.length).toBe(0);
    expect(await outbox()).toEqual([]);
  });
});
