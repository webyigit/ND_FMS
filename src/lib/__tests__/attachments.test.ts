import { describe, expect, it } from "vitest";
import { ACCEPT, MAX_BYTES, attachKind, checkFile, missingHint, printable, sizeText, storagePath, withDownload } from "../receipt/attachments";

describe("첨부양식 파일 확인", () => {
  it("형식", () => {
    expect(attachKind("동의서.JPG")).toBe("image");
    expect(attachKind("a.png")).toBe("image");
    expect(attachKind("a.pdf")).toBe("pdf");
    expect(attachKind("a.xlsx")).toBe("excel");
    expect(attachKind("a.pptx")).toBe("ppt");
    expect(attachKind("a.hwpx")).toBe("hwp");
    expect(attachKind("a.exe")).toBeNull();
    expect(attachKind("확장자없음")).toBeNull();
    expect(printable("a.pdf") && printable("a.jpeg") && !printable("a.xlsx")).toBe(true);
    expect(ACCEPT).toContain(".pptx");
  });
  it("크기·빈 파일", () => {
    expect(checkFile({ name: "a.pdf", size: 10 })).toBeNull();
    expect(checkFile({ name: "a.pdf", size: MAX_BYTES })).toBeNull();
    expect(checkFile({ name: "a.pdf", size: MAX_BYTES + 1 })).toMatch("50MB");
    expect(checkFile({ name: "a.pdf", size: 0 })).toMatch("빈 파일");
    expect(checkFile({ name: "a.zip", size: 10 })).toMatch("올릴 수 있어요");
  });
  it("저장소 경로는 영문 키 + 확장자", () => {
    expect(storagePath("개인정보 동의서.PDF", "abc")).toBe("abc.pdf");
    expect(storagePath("이름", "abc")).toBe("abc.bin");
    expect(storagePath("a.png")).toMatch(/^[0-9a-f-]{36}\.png$/);
  });
  it("내려받기 이름은 한 번만 인코딩", () => {
    const u = withDownload("https://x.test/storage/v1/object/sign/b/a.xlsx?token=t", "제출 목록.xlsx");
    expect(u).toBe("https://x.test/storage/v1/object/sign/b/a.xlsx?token=t&download=%EC%A0%9C%EC%B6%9C%20%EB%AA%A9%EB%A1%9D.xlsx");
    expect(new URL(u).searchParams.get("download")).toBe("제출 목록.xlsx");
  });
  it("크기 표시·안내", () => {
    expect(sizeText(null)).toBe("");
    expect(sizeText(100)).toBe("1KB");
    expect(sizeText(2048)).toBe("2KB");
    expect(sizeText(5 * 1024 * 1024)).toBe("5.0MB");
    expect(missingHint('relation "public.receipt_attachment" does not exist')).toMatch("0021");
    expect(missingHint("Bucket not found")).toMatch("0021");
    expect(missingHint("기타 오류")).toBe("기타 오류");
  });
});
