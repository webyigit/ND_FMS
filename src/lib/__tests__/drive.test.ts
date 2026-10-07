import { describe, it, expect, vi, beforeEach } from "vitest";

describe("드라이브 업로드·다운로드 (fetch 모의)", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, { GOOGLE_DRIVE_CLIENT_ID: "c", GOOGLE_DRIVE_CLIENT_SECRET: "s", GOOGLE_DRIVE_REFRESH_TOKEN: "r", GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT" });
  });
  it("연/월 폴더를 만들고 multipart로 올린다", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return Response.json({ access_token: "T", expires_in: 3600 });
      if (url.includes("/files?q=")) return Response.json({ files: url.includes(encodeURIComponent("지출증빙")) ? [{ id: "F0" }] : [] });
      if (url.includes("/files?fields=id")) return Response.json({ id: `F${++n}` });
      if (url.includes("uploadType=multipart")) return Response.json({ id: "FILE", name: "x.jpg", size: "3", webViewLink: "https://drive" });
      return new Response("?", { status: 500 });
    }));
    const { uploadReceipt } = await import("../drive");
    const r = await uploadReceipt(new Blob(["abc"], { type: "image/jpeg" }), "x.jpg", "2026-10-04", { dept: "관리부" });
    expect(r.id).toBe("FILE");
    const up = calls.find((c) => c.url.includes("uploadType=multipart"))!;
    const body = await new Response(up.init!.body as Blob).text();
    expect(body).toContain('"parents":["F2"]'); // 지출증빙(F0) > 2026(F1) > 10(F2)
    expect(body).toContain('"ndfms":"receipt"');
    expect(body).toContain("abc");
    expect((up.init!.headers as Record<string, string>).Authorization).toBe("Bearer T");
  });
  it("앱이 올린 파일이 아니면 내려받기 거부", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "T", expires_in: 3600 });
      return Response.json({ name: "other.pdf", mimeType: "application/pdf", appProperties: {} });
    }));
    const { downloadReceipt } = await import("../drive");
    await expect(downloadReceipt("abcdefghijkl")).rejects.toThrow("증빙 파일이 아닙니다");
  });
});
