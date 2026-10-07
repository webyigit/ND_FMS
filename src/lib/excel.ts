// 엑셀 저장 공통: 시트별 2차원 배열을 xlsx로 내려받는다(exceljs, MIT)
import ExcelJS from "exceljs";

export type Sheet = { name: string; rows: (string | number | null | undefined)[][]; widths?: number[]; header?: number };

export async function buildXlsx(sheets: Sheet[]) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    s.rows.forEach((r) => ws.addRow(r.map((v) => v ?? "")));
    const header = s.header ?? 1;
    for (let i = 1; i <= header; i++) ws.getRow(i).font = { bold: true };
    ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === "number") c.numFmt = "#,##0"; }));
    (s.widths ?? []).forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }
  return wb.xlsx.writeBuffer();
}

export async function downloadXlsx(file: string, sheets: Sheet[]) {
  const buf = await buildXlsx(sheets);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
