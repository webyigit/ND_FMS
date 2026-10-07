import { driveConfigured, receiptFileName, uploadReceipt } from "@/lib/drive";
import { fileKind } from "@/lib/expenseUpload";

const MAX = 20 * 1024 * 1024;

// 지출증빙 업로드 → Google 드라이브 지출증빙/연/월 폴더
// TODO(인증): 관리자 세션 확인은 로그인(Supabase) 연결 후 추가 [확인 필요]
export async function POST(req: Request) {
  if (!driveConfigured()) return Response.json({ error: "드라이브 연결 설정이 아직 없어요." }, { status: 503 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  const kind = fileKind(file.name, file.type);
  if (kind !== "image" && kind !== "pdf") return Response.json({ error: "사진·PDF만 저장해요." }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "20MB를 넘어요." }, { status: 413 });

  const s = (k: string) => String(form.get(k) ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s("date")) ? s("date") : new Date().toISOString().slice(0, 10);
  const ext = file.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "bin";
  const name = receiptFileName({ date, dept: s("dept"), content: s("content"), amount: Number(s("amount")) || 0, ext });
  try {
    const r = await uploadReceipt(file, name, date, { date, dept: s("dept").slice(0, 50), item: s("item").slice(0, 50) });
    return Response.json({ id: r.id, name: r.name, size: Number(r.size), link: r.webViewLink });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
