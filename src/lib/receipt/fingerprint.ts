// 공개 신청 횟수 제한용 브라우저 지문 해시(개인 식별 목적 아님). IP는 클라이언트에서 얻을 수 없다. [확인 필요]
const KEY = "ndfms.dr.id";

export async function browserHash(): Promise<string> {
  let id = "";
  try {
    id = localStorage.getItem(KEY) ?? "";
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
  } catch {}
  const parts = [id, navigator.userAgent, navigator.language, `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone, String(navigator.hardwareConcurrency ?? "")];
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}
