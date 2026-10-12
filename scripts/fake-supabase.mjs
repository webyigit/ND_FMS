// 화면 검증용 가짜 Supabase(auth + PostgREST 흉내). 실DB 없이 관리자 화면을 브라우저로 확인할 때 쓴다. 모든 이름·번호는 가상.
// 사용: node scripts/fake-supabase.mjs  →  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fake npm run build && npx next start
// (next dev는 클라우드 컨테이너에서 하이드레이션이 안 돼 build+start로 확인했다.) 로그인: 아무 이메일·비밀번호.
import http from "node:http";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, aud: "authenticated", role: "authenticated", email: "admin@example.test", exp: 4102444800, iat: 1700000000, session_id: "s1", is_anonymous: false, app_metadata: {}, user_metadata: {} })}.sig`;
const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "admin@example.test", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", identities: [] };
const session = { access_token: JWT, token_type: "bearer", expires_in: 999999, expires_at: 4102444800, refresh_token: "r1", user };

const members = [
  { id: 1, name: "가나다", name_suffix: null, title: "집사", household_id: 10, is_household_head: true, address: "서울시 가상구 가상로 1", phone: "010-1111-2222", rrn_enc: "x", active: true },
  { id: 2, name: "라마바", name_suffix: null, title: null, household_id: 10, is_household_head: false, address: "서울시 가상구 가상로 1", phone: "010-1111-3333", rrn_enc: null, active: true },
  { id: 3, name: "사아자", name_suffix: null, title: "권사", household_id: 20, is_household_head: true, address: "서울시 가상구 가상로 2", phone: "010-5555-6666", rrn_enc: "x", active: true },
  { id: 4, name: "사아자", name_suffix: "B", title: null, household_id: 30, is_household_head: true, address: "서울시 가상구 가상로 3", phone: "010-7777-8888", rrn_enc: "x", active: true },
];
const donorHit = (m) => ({ member_id: m.id, name: m.name + (m.name_suffix ?? ""), title: m.title, household_id: m.household_id, household_label: `가정${m.household_id}`, is_household_head: m.is_household_head, address: m.address, phone: m.phone, rrn_masked: m.rrn_enc ? "900101-1******" : null, family: members.filter((f) => f.household_id === m.household_id && f.id !== m.id).map((f) => f.name + (f.name_suffix ?? "")) });
const db = {
  app_user: [{ id: USER_ID, name: "관리자", status: "approved", role: "admin" }],
  church_info: [{ id: 1, name: "가상교회", pastor: "홍길동", address: "서울시 가상구 가상로 100", reg_no: "123-82-00000", phone: "02-000-0000", seal_image: null, stamp_image: null }],
  member: members,
  v_donation_request: [
    { id: 5, request_no: "D261008-0005", year: 2025, name: "가나다", rrn_masked: "900101-1******", has_rrn: true, phone: "010-1111-2222", address: "서울시 가상구 가상로 1", request_note: "우편으로 부탁드려요", family_names: ["라마바"], is_returning: false, member_id: null, member_name: null, status: "requested", donation_receipt_id: null, serial_no: null, created_at: "2026-10-08T03:00:00Z", review_note: null },
    { id: 6, request_no: "D261008-0006", year: 2025, name: "사아자", rrn_masked: "850505-2******", has_rrn: true, phone: "010-9999-0000", address: "서울시 가상구 가상로 9", request_note: null, family_names: null, is_returning: false, member_id: null, member_name: null, status: "requested", donation_receipt_id: null, serial_no: null, created_at: "2026-10-08T05:00:00Z", review_note: null },
  ],
  v_expense_request: [
    { id: 7, status: "requested", department_id: 1, department: "교육부", expense_item_id: null, item: null, content: "교재 구입", amount: 120000, used_at: "2026-10-05", requested_by: "u2", requester_name: "차카타", requested_at: "2026-10-07T03:00:00Z", reviewed_at: null, review_note: null, expense_id: null, expense_sunday: null, payee_id: null, bank: null, holder: null, account_masked: null, drive_file_id: null },
  ],
  budget_request: [{ id: 2, year: 2027, amount: 500000, reason: "찬양 악보", status: "requested", requester_name: "파하가", requested_at: "2026-10-06T03:00:00Z", review_note: null, department: { name: "찬양부", sort_order: 2 }, expense_item: null }],
  expense_item: [{ id: 11, name: "교재비", sort_order: 1, department: { id: 1, name: "교육부", sort_order: 1 } }],
  donation_receipt_source: [],
  receipt_attachment: [],
  v_income: [
    { id: 101, year: 2025, offering_type: "십일조", type_order: 1, month: 1, member_id: 1, member_name: "가나다", payer_label: "가나다", amount: 300000 },
    { id: 102, year: 2025, offering_type: "십일조", type_order: 1, month: 2, member_id: 1, member_name: "가나다", payer_label: "가나다", amount: 300000 },
    { id: 103, year: 2025, offering_type: "감사헌금", type_order: 3, month: 2, member_id: 2, member_name: "라마바", payer_label: null, amount: 50000 },
    { id: 104, year: 2025, offering_type: "십일조", type_order: 1, month: 3, member_id: 3, member_name: "사아자", payer_label: "사아자", amount: 100000 },
  ],
  v_donation_receipt: [],
  todo: [],
  // 금주 수입내역(/income/weekly) 확인용: 2026-10-04 주일
  offering_type: [
    [3, "십일조", "general", false], [1, "주일헌금", "general", true], [6, "범사감사", "general", false], [5, "기타감사", "general", false],
    [9, "일천번제", "general", false], [11, "기관헌금", "general", false], [13, "이웃사랑", "special", false], [14, "꽃꽂이", "special", false], [15, "해외선교", "separate", false], [16, "네팔선교", "separate", false],
  ].map(([id, name, kind, total_only], i) => ({ id, name, total_only, amount_unit: 1000, has_memo: id === 5, sort_order: i + 1, active: true, fund: { kind } })),
  fixed_expense: [],
  week: [{ sunday: "2026-10-04", closed: false }, { sunday: "2026-09-27", closed: true }],
  app_setting: [],
  // 올해 1/4~9/27 주별 헌금구분 합계(가상). 금주 수입내역 누계·진도율·추이 그래프 확인용
  v_income_week: Array.from({ length: 39 }, (_, w) => new Date(Date.UTC(2026, 0, 4 + w * 7)).toISOString().slice(0, 10)).flatMap((sunday, w) =>
    [[3, 4800000], [1, 700000], [6, 250000], [5, 500000], [9, 150000], [11, 30000], [13, 170000], [14, 50000], [15, 200000]].map(([t, a], i) => ({ sunday, offering_type_id: t, offering_type: "", type_order: i + 1, fund_kind: t >= 15 ? "separate" : t >= 13 ? "special" : "general", amount: a + ((w * 37 + i * 11) % 9) * 10000 }))),
  budget: [[3, 250000000], [1, 36000000], [5, 51500000], [11, 2000000]].map(([offering_type_id, amount]) => ({ year: 2026, offering_type_id, amount })),
};
{
  const types = Object.fromEntries(db.offering_type.map((t) => [t.id, t]));
  const fam = ["가나다", "라마바", "사아자", "차카타", "파하가", "나다라", "마바사", "아자차", "카타파", "하가나"];
  let id = 1000;
  const add = (t, label, amount, extra = {}) => db.v_income.push({ id: ++id, year: 2026, month: 10, sunday: "2026-10-04", offering_type_id: t, offering_type: types[t].name, type_order: types[t].sort_order, fund_kind: types[t].fund.kind, member_id: label ? id : null, member_name: label, payer_label: label, channel: "cash", amount, memo: null, bank_tx_id: null, ...extra });
  for (let i = 0; i < 38; i++) add(3, i % 3 ? fam[i % 10] + "," + fam[(i + 3) % 10] : fam[i % 10] + (i > 9 ? String(i) : ""), (i % 7 + 1) * 50000, i % 5 === 0 ? { channel: "online" } : {});
  add(1, "(총액)", 695000);
  for (let i = 0; i < 9; i++) add(6, fam[i], (i + 1) * 10000);
  add(5, fam[2], 50000, { memo: "가상 감사 내용" }); add(5, fam[4] + "," + fam[5], 100000, { memo: "병원심방감사" });
  add(9, null, 171000, { memo: "주간 합계(개인내역 없음)" });
  ["유치부", "아동부", "중고등부"].forEach((d, i) => add(11, d, (i + 1) * 7000));
  for (let i = 0; i < 6; i++) add(13, fam[i], 10000);
  add(14, fam[1], 100000, { memo: "가상" });
  for (let i = 0; i < 10; i++) add(15, fam[i], 10000 * (1 + (i % 3)));
}
// 과거 수입내역(/income/history) 월 탭 확인용: 9월 가상 수입 몇 건 + 헌금구분별 월 합계 뷰
{
  const types = Object.fromEntries(db.offering_type.map((t) => [t.id, t]));
  [[3, "가나다", 300000], [3, "사아자", 200000], [6, "라마바", 30000], [13, "차카타", 10000]].forEach(([t, label, amount], i) =>
    db.v_income.push({ id: 2000 + i, year: 2026, month: 9, sunday: "2026-09-27", offering_type_id: t, offering_type: types[t].name, type_order: types[t].sort_order, fund_kind: types[t].fund.kind, member_id: i + 1, member_name: label, payer_label: label, channel: "online", amount, memo: null, bank_tx_id: null }));
  const agg = new Map();
  for (const r of db.v_income.filter((x) => x.offering_type_id)) {
    const k = [r.year, r.month, r.offering_type_id, r.channel].join("|");
    const a = agg.get(k) ?? { year: r.year, month: r.month, offering_type_id: r.offering_type_id, offering_type: r.offering_type, type_order: r.type_order, fund_kind: r.fund_kind, channel: r.channel, amount: 0, n: 0 };
    a.amount += r.amount; a.n++; agg.set(k, a);
  }
  db.v_income_type_month = [...agg.values()];
}
// 과거 지출내역(/expense/history) 월 탭 확인용 가상 지출
db.v_expense = [[9, "2026-09-27", "교육부", "교재비", "공과 교재", 120000, "차카타"], [10, "2026-10-04", "찬양부", "악보", "성가 악보", 80000, "파하가"], [10, "2026-10-11", "관리부", "수선비", "전등 교체", 45000, "나다라"]]
  .map(([month, sunday, department, item, content, amount, requester_label], i) => ({ id: 3000 + i, year: 2026, month, sunday, department, item, content, amount, requester_label, memo: null }));
let nextReceipt = 900;

// 이름합치기(개인별 헌금현황 > 이름합치기) 가상 데이터: 홍길동 ↔ 홍길둥·홍길똥 오기입, 김가나 ↔ 김가니(다른 사람)
const nmMembers = [
  { id: 11, full_name: "홍길동", title: "장로", n: 40, total: 4000000, first_sunday: "2024-01-07", last_sunday: "2025-12-28", household_id: 50, household_label: "홍길동 가정" },
  { id: 12, full_name: "홍길둥", title: null, n: 2, total: 200000, first_sunday: "2025-03-02", last_sunday: "2025-03-09", household_id: null, household_label: null },
  { id: 13, full_name: "홍길똥", title: null, n: 1, total: 100000, first_sunday: "2025-04-06", last_sunday: "2025-04-06", household_id: null, household_label: null },
  { id: 14, full_name: "김가나", title: "집사", n: 30, total: 900000, first_sunday: "2024-01-07", last_sunday: "2025-12-28", household_id: null, household_label: null },
  { id: 16, full_name: "성춘향", title: "권사", n: 5, total: 500000, first_sunday: "2026-03-01", last_sunday: "2026-03-29", household_id: 50, household_label: "홍길동 가정" },
  { id: 15, full_name: "김가니", title: "권사", n: 25, total: 750000, first_sunday: "2024-02-04", last_sunday: "2025-12-21", household_id: null, household_label: null },
].map((m) => ({ ...m, name: m.full_name, name_suffix: null, is_group: false, is_anonymous: false, active: true, merged_into: null, merged_into_name: null }));
db.v_member = nmMembers;
db.v_member_income_stat = nmMembers.map(({ id, n, total, first_sunday, last_sunday }) => ({ member_id: id, n, total, first_sunday, last_sunday }));
db.v_name_merge = [];
db.member_not_same = [];
db.v_income_person = nmMembers.map((m) => ({ year: 2026, month: 3, member_id: m.id, member_name: m.full_name, household_id: m.household_id, household_label: m.household_label, payer_label: null, offering_type_id: 1, offering_type: "십일조", type_order: 1, fund_kind: "general", amount: m.total, n: m.n }));
let nextMerge = 1;
const resolvePerson = () => db.v_income_person.forEach((r) => {
  r.raw_id ??= r.member_id;
  const src = nmMembers.find((m) => m.id === r.raw_id);
  const into = src.merged_into ? nmMembers.find((m) => m.id === src.merged_into) : src;
  r.member_id = into.id; r.member_name = into.full_name;
});

// 해외선교 입력(/mission/entry) 확인용: 2026-10-11 주일 일반 수입·지출 + 해외선교 몫. 주간 저장 RPC는 그 주일 행을 통째로 바꾼다
db.expense_item.push(...["선교사 후원", "선교회 후원", "노회 선교", "네팔 구호"].map((name, i) => ({ id: 64 + i, name, sort_order: i + 1, department: { id: 13, name: "해외선교", sort_order: 13 } })));
db.income = [[3, "가나다", 300000], [15, "가나다", 20000], [15, "라마바", 10000], [16, "사아자", 50000]]
  .map(([t, label, amount], i) => ({ id: 5000 + i, sunday: "2026-10-11", offering_type_id: t, member_id: null, payer_label: label, channel: "cash", amount, memo: null, bank_tx_id: null }));
const expRow = (id, dept, item, content, amount) => ({ id, sunday: "2026-10-11", content, amount, requester_label: null, memo: null, source: "직접", bank_tx_id: null, expense_item: { name: item, department: { name: dept } }, receipt_file: null });
db.expense = [expRow(6000, "교육부", "교재비", "공과 교재", 120000), expRow(6001, "해외선교", "네팔 구호", "네팔 구호 송금", 500000)];
let nextRow = 7000;
const saveWeek = (table, sunday, rows, toRow) => {
  db[table] = [...db[table].filter((r) => r.sunday !== sunday), ...rows.map((r) => ({ ...toRow(r), id: r.id ?? ++nextRow, sunday, bank_tx_id: null }))];
  return rows.length;
};

function parseFilters(sp) {
  const f = [];
  for (const [k, v] of sp) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const m = v.match(/^(eq|neq|in|is|ilike|like|gte|lte|gt|lt)\.(.*)$/s);
    if (!m) continue;
    f.push({ col: k.split(".").pop(), op: m[1], val: m[2] });
  }
  return f;
}
const test = (row, { col, op, val }) => {
  const x = row[col];
  switch (op) {
    case "eq": return String(x) === val;
    case "neq": return String(x) !== val;
    case "is": return val === "null" ? x == null : String(x) === val;
    case "in": return val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
    case "ilike": case "like": return new RegExp("^" + val.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*") + "$", "i").test(String(x ?? ""));
    case "gte": return x >= val; case "lte": return x <= val; case "gt": return x > val; case "lt": return x < val;
  }
  return true;
};
const rpc = {
  save_week_income: ({ p_sunday, p_rows }) => saveWeek("income", p_sunday, p_rows, (r) => ({ offering_type_id: r.offering_type_id, member_id: r.member_id, payer_label: r.payer_label, channel: r.channel, amount: r.amount, memo: r.memo })),
  save_week_expense: ({ p_sunday, p_rows }) => saveWeek("expense", p_sunday, p_rows, (r) => ({ content: r.content, amount: r.amount, requester_label: r.requester || null, memo: r.memo, source: r.source, expense_item: { name: r.item, department: { name: r.dept } }, receipt_file: null })),
  log_event: () => null,
  receipt_donor_search: ({ p_q }) => members.filter((m) => m.name.includes(p_q.trim())).map(donorHit),
  issue_donation_receipts: ({ p_rows }) => p_rows.map((r) => {
    const id = ++nextReceipt;
    const row = { id, year: r.donation_year, donation_year: r.donation_year, serial_no: `${r.donation_year}-PN${String(id - 899).padStart(3, "0")}-1008`, donor_kind: r.donor_kind, member_id: r.member_id, donor_name: r.donor_name, donor_rrn_masked: "900101-1******", rrn_front: "900101", has_rrn: true, donor_address: r.donor_address, donor_brn: null, donor_rep_name: null, total_amount: r.total_amount, issued_amount: r.issued_amount, adjustment_amount: r.adjustment_amount, adjustment_reason: null, split_group: null, split_ratio: null, status: "issued", reissue_of_id: null, detail: r.detail, memo: r.memo, form_id: null, issued_at: "2026-10-08", request_id: r.request_id };
    db.v_donation_receipt.push(row);
    if (r.request_id) { const q = db.v_donation_request.find((x) => x.id === r.request_id); if (q) { q.status = "done"; q.serial_no = row.serial_no; } }
    return row;
  }),
  approve_expense_request: ({ p_id }) => { const r = db.v_expense_request.find((x) => x.id === p_id); r.status = "approved"; r.expense_sunday = "2026-10-05"; return 1; },
  reject_expense_request: ({ p_id, p_note }) => { const r = db.v_expense_request.find((x) => x.id === p_id); r.status = "rejected"; r.review_note = p_note; return null; },
  review_budget_request: ({ p_id, p_approve }) => { const r = db.budget_request.find((x) => x.id === p_id); r.status = p_approve ? "approved" : "rejected"; return null; },
  expense_request_account: () => "000-0000-0000",
  merge_members: ({ p_into, p_ids }) => {
    const t = nmMembers.find((m) => m.id === p_into);
    let n = 0;
    for (const id of p_ids) {
      if (id === p_into) continue;
      const m = nmMembers.find((x) => x.id === id);
      m.merged_into = p_into; m.merged_into_name = t.full_name; m.active = false; n++;
      db.v_name_merge.unshift({ id: nextMerge++, member_id: id, member_name: m.full_name, member_title: m.title, into_id: p_into, into_name: t.full_name, merged_at: "2026-10-09T05:30:00Z", merged_by_name: "관리자" });
    }
    resolvePerson();
    return n;
  },
  unmerge_member: ({ p_member }) => {
    const m = nmMembers.find((x) => x.id === p_member);
    m.merged_into = null; m.merged_into_name = null; m.active = true;
    db.v_name_merge = db.v_name_merge.filter((r) => r.member_id !== p_member);
    resolvePerson();
    return null;
  },
  mark_not_same: ({ p_a, p_b, p_on }) => {
    const a = Math.min(p_a, p_b), b = Math.max(p_a, p_b);
    db.member_not_same = db.member_not_same.filter((r) => !(r.a === a && r.b === b));
    if (p_on) db.member_not_same.push({ a, b });
    return null;
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let body = ""; for await (const c of req) body += c;
  const json = (code, data, extra = {}) => { res.writeHead(code, { ...cors, "Content-Type": "application/json", ...extra }); res.end(JSON.stringify(data)); };
  const p = url.pathname;
  console.log(req.method, p + url.search);
  if (p.startsWith("/auth/v1/token")) return json(200, session);
  if (p === "/auth/v1/user") return json(200, user);
  if (p === "/auth/v1/logout") return json(204, {});
  if (p.startsWith("/auth/v1/")) return json(200, {});
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.slice("/rest/v1/rpc/".length);
    if (!rpc[fn]) return json(404, { message: `rpc ${fn} 없음`, code: "42883" });
    return json(200, rpc[fn](body ? JSON.parse(body) : {}));
  }
  if (p.startsWith("/rest/v1/")) {
    const table = p.slice("/rest/v1/".length);
    const rows = db[table];
    if (!rows) return json(404, { message: `relation ${table} 없음`, code: "42P01" });
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (req.method === "PATCH" || req.method === "DELETE") { const hit = rows.filter((r) => parseFilters(url.searchParams).every((f) => test(r, f))); if (req.method === "PATCH") hit.forEach((r) => Object.assign(r, JSON.parse(body))); return json(200, hit); }
    if (req.method === "POST") { const r = JSON.parse(body); rows.push(r); return json(201, single ? r : [r]); }
    let out = rows.filter((r) => parseFilters(url.searchParams).every((f) => test(r, f)));
    const order = url.searchParams.get("order");
    if (order) { const [col, dir] = order.split(",")[0].split("."); out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1)); }
    const limit = Number(url.searchParams.get("limit")); if (limit) out = out.slice(0, limit);
    if (single) return out.length ? json(200, out[0]) : json(406, { code: "PGRST116", message: "0 rows", details: "", hint: null });
    return json(200, out, { "Content-Range": `0-${out.length}/${out.length}` });
  }
  json(404, { message: "없음" });
});
server.listen(54321, "127.0.0.1", () => console.log("fake supabase on 54321"));
