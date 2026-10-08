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
};
let nextReceipt = 900;

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
