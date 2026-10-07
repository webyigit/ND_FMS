// 영수증·증빙 파일을 Google 드라이브에 저장 (서버 전용, Drive REST v3)
// 교회 계정(개인 Gmail)은 공유 드라이브가 없어 서비스 계정 대신 OAuth 갱신 토큰을 쓴다.
// 환경변수: GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN / GOOGLE_DRIVE_ROOT_FOLDER_ID

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TAG = { ndfms: "receipt" }; // 이 앱이 올린 파일만 내려받게 하는 표시

export const driveConfigured = () =>
  !!(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);

let cached: { token: string; until: number } | null = null;
async function token() {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`드라이브 인증 실패 (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return cached.token;
}
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...init.headers } });
  if (!res.ok) throw new Error(`드라이브 오류 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
/** 상위 폴더 아래 이름으로 폴더를 찾고 없으면 만든다 */
async function folder(parent: string, name: string) {
  const query = `'${q(parent)}' in parents and name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = (await (await api(`/files?q=${encodeURIComponent(query)}&fields=files(id)`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const made = await api("/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parent], mimeType: "application/vnd.google-apps.folder" }),
  });
  return ((await made.json()) as { id: string }).id;
}

/** 지출증빙/2026/10 처럼 연·월 폴더에 올린다 */
export async function uploadReceipt(file: Blob, name: string, date: string, meta: Record<string, string>) {
  let parent = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  for (const p of receiptFolder(date)) parent = await folder(parent, p);
  const boundary = `ndfms${crypto.randomUUID()}`;
  const head = JSON.stringify({ name, parents: [parent], appProperties: { ...TAG, ...meta } });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${head}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    file, `\r\n--${boundary}--`,
  ]);
  const res = await api(`${UPLOAD}?uploadType=multipart&fields=id,name,size,webViewLink`, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  return (await res.json()) as { id: string; name: string; size: string; webViewLink: string };
}

/** 이 앱이 올린 증빙만 내려받기 허용 */
export async function downloadReceipt(id: string) {
  const meta = (await (await api(`/files/${encodeURIComponent(id)}?fields=name,mimeType,appProperties`)).json()) as { name: string; mimeType: string; appProperties?: Record<string, string> };
  if (meta.appProperties?.ndfms !== TAG.ndfms) throw new Error("증빙 파일이 아닙니다");
  const res = await api(`/files/${encodeURIComponent(id)}?alt=media`);
  return { name: meta.name, mimeType: meta.mimeType, body: res.body! };
}

// ---- 이름 규칙 (테스트 대상) ----
export const receiptFolder = (date: string) => ["지출증빙", date.slice(0, 4), date.slice(5, 7)];
const clean = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
/** 260104_관리부_주보인쇄_120000원_a1b2.jpg */
export function receiptFileName(r: { date: string; dept?: string; content?: string; amount?: number; ext: string; id?: string }) {
  const parts = [r.date.slice(2).replace(/-/g, ""), clean(r.dept || "미지정"), clean(r.content || "증빙").slice(0, 30)];
  if (r.amount) parts.push(`${r.amount}원`);
  parts.push((r.id ?? crypto.randomUUID()).replace(/-/g, "").slice(0, 4));
  return `${parts.join("_")}.${r.ext.toLowerCase()}`;
}
