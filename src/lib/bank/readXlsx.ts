import ExcelJS from "exceljs";

/** xlsx 첫 시트를 2차원 값 배열로 읽는다(서버 전용) */
export async function readFirstSheet(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const rows: (string | number | Date | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
        if (o.richText) return o.richText.map((t) => t.text).join("");
        return (o.result ?? o.text ?? null) as string | number | null;
      }
      return (v ?? null) as string | number | Date | null;
    });
    rows.push(vals);
  });
  return rows;
}
