// 기부금영수증 첨부 양식: 영수증과 함께 출력·제출하는 양식 파일 (Supabase Storage 비공개 버킷 + receipt_attachment 목록)
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "receipt-attachments";
export const MAX_BYTES = 50 * 1024 * 1024; // Supabase 무료 플랜 파일당 상한
export type AttachKind = "image" | "pdf" | "excel" | "ppt" | "word" | "hwp";
const EXT: Record<string, AttachKind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image",
  pdf: "pdf", xlsx: "excel", xls: "excel", csv: "excel", pptx: "ppt", ppt: "ppt",
  docx: "word", doc: "word", hwp: "hwp", hwpx: "hwp",
};
export const ACCEPT = Object.keys(EXT).map((e) => `.${e}`).join(",");
export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
export const attachKind = (name: string): AttachKind | null => EXT[extOf(name)] ?? null;
/** 브라우저에서 바로 열어 출력할 수 있는 형식(그림·PDF) */
export const printable = (name: string) => ["image", "pdf"].includes(attachKind(name) ?? "");

/** 올리기 전 확인: 문제가 있으면 한국어 안내, 없으면 null */
export function checkFile(f: { name: string; size: number }): string | null {
  if (!attachKind(f.name)) return "그림(JPG·PNG), PDF, 엑셀, PPT, 워드, 한글 파일만 올릴 수 있어요.";
  if (f.size <= 0) return "빈 파일이에요.";
  if (f.size > MAX_BYTES) return "50MB를 넘는 파일은 올릴 수 없어요.";
  return null;
}

/** 저장소 경로: 한글 파일명은 저장소 키로 못 쓰므로 영문 키 + 원래 확장자 */
export const storagePath = (name: string, id: string = crypto.randomUUID()) => `${id}.${extOf(name) || "bin"}`;

export const sizeText = (b: number | null) =>
  b == null ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;

export type Attachment = {
  id: number; name: string; memo: string | null; file_name: string; storage_path: string;
  mime_type: string | null; size_bytes: number | null; active: boolean; sort_order: number; created_at: string;
};
const COLS = "id, name, memo, file_name, storage_path, mime_type, size_bytes, active, sort_order, created_at";

export async function loadAttachments(sb: SupabaseClient, onlyActive = false): Promise<Attachment[]> {
  let q = sb.from("receipt_attachment").select(COLS).order("sort_order").order("id");
  if (onlyActive) q = q.eq("active", true);
  const r = await q;
  if (r.error) throw r.error;
  return (r.data ?? []) as Attachment[];
}

/** 파일을 저장소에 올리고 목록에 추가. 목록 추가가 실패하면 올린 파일을 지운다. */
export async function addAttachment(sb: SupabaseClient, file: File, name: string, memo: string) {
  const bad = checkFile(file);
  if (bad) throw new Error(bad);
  const path = storagePath(file.name);
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw up.error;
  const r = await sb.from("receipt_attachment").insert({
    name: name.trim() || file.name.replace(/\.[^.]+$/, ""), memo: memo.trim() || null,
    file_name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size,
  });
  if (r.error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw r.error;
  }
}

/** 저장소 파일을 지우고 목록에서 뺀다 */
export async function removeAttachment(sb: SupabaseClient, a: Pick<Attachment, "id" | "storage_path">) {
  const rm = await sb.storage.from(BUCKET).remove([a.storage_path]);
  if (rm.error) throw rm.error;
  const r = await sb.from("receipt_attachment").delete().eq("id", a.id);
  if (r.error) throw r.error;
}

/** 서명 주소에 내려받기 이름을 붙인다. supabase-js의 download 옵션은 한글 이름을 두 번 인코딩해서 직접 붙인다. */
export const withDownload = (signedUrl: string, fileName: string) =>
  `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;

/** 잠깐(기본 10분) 쓰는 열기 주소. download=true면 원래 파일명으로 내려받기 */
export async function attachmentUrl(sb: SupabaseClient, a: Pick<Attachment, "storage_path" | "file_name">, download = false, seconds = 600) {
  const r = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, seconds);
  if (r.error) throw r.error;
  return download ? withDownload(r.data.signedUrl, a.file_name) : r.data.signedUrl;
}

/** 테이블·버킷이 아직 없을 때(마이그레이션 0021 전) 알아보기 쉬운 안내 */
export const missingHint = (e: string) =>
  /receipt_attachment|bucket not found/i.test(e) ? "첨부양식 저장소가 아직 DB에 없어요. 마이그레이션 0021을 적용해 주세요." : e;

/**
 * 클릭 즉시 새 창을 열어 두고 주소는 나중에 채운다(비동기 뒤 window.open은 팝업 차단됨).
 * download면 새 창 없이 현재 창에서 내려받기(첨부 응답이라 화면은 그대로).
 */
export async function openAttachment(sb: SupabaseClient, a: Pick<Attachment, "storage_path" | "file_name">, download = false) {
  const w = download ? null : window.open("", "_blank");
  try {
    const url = await attachmentUrl(sb, a, download);
    if (download) window.location.assign(url);
    else if (w) { w.opener = null; w.location.href = url; }
    else window.open(url, "_blank", "noopener");
  } catch (e) {
    w?.close();
    throw e;
  }
}
