import { downloadReceipt, driveConfigured } from "@/lib/drive";

// 관리자 내려받기 (드라이브 파일을 서버가 대신 받아 전달)
// 인증: DB 연결 시 src/proxy.ts 가 승인된 관리자·재정부만 통과시킨다
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!driveConfigured()) return new Response("드라이브 연결 설정이 아직 없어요.", { status: 503 });
  const { id } = await params;
  if (!/^[\w-]{10,}$/.test(id)) return new Response("잘못된 파일", { status: 400 });
  try {
    const f = await downloadReceipt(id);
    return new Response(f.body, {
      headers: { "Content-Type": f.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("파일을 찾지 못했어요.", { status: 404 });
  }
}
