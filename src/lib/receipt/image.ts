// 직인·간인 이미지: 브라우저에서 줄여 200KB 이하 data URL로 만든다(별도 스토리지 안 씀)
export const MAX_IMAGE_BYTES = 200_000;

/** 긴 변이 max를 넘지 않게 비율 유지 */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const k = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** data URL의 실제 바이트 수(대략) */
export function dataUrlBytes(url: string): number {
  const b64 = url.slice(url.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export const isImageDataUrl = (s: string) => /^data:image\/(png|jpeg|webp);base64,/.test(s);

/** 파일 → PNG data URL(투명 배경 유지). 크면 크기를 줄여 maxBytes 이하로. */
export async function resizeImage(file: File, maxSide = 600, maxBytes = MAX_IMAGE_BYTES): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 올릴 수 있어요");
  const bmp = await createImageBitmap(file);
  let side = maxSide;
  for (let i = 0; i < 8; i++, side = Math.round(side * 0.75)) {
    const { w, h } = fitWithin(bmp.width, bmp.height, side);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const url = c.toDataURL("image/png");
    if (dataUrlBytes(url) <= maxBytes) return url;
  }
  throw new Error("이미지를 200KB 이하로 줄이지 못했어요");
}
