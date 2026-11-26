import type ExcelJSType from "exceljs";
import { emptyRow, MASTER_COLUMNS, type Field, type Row } from "./types";
import { hasLetters, headerCurrency, mapHeader, parsePrice, SKIP_LINE_RE } from "./columns";

let excelPromise: Promise<typeof ExcelJSType> | null = null;
function loadExcel() {
  excelPromise ??= import("exceljs").then((m) => (m.default ?? m) as typeof ExcelJSType);
  return excelPromise;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellText(o.result); // formula
    if ("richText" in o && Array.isArray(o.richText)) return o.richText.map((r: { text: string }) => r.text).join("");
    if ("text" in o) return cellText(o.text); // hyperlink
    if ("error" in o) return "";
    return "";
  }
  return String(v).trim();
}

/** Turn a grid of strings (one sheet / one CSV) into rows, auto-detecting the header row. */
export function gridToRows(grid: string[][], file: string, location: string): Row[] {
  let headerIdx = -1;
  let fields: (Field | null)[] = [];
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const f = grid[r].map((c) => mapHeader(c));
    const set = new Set(f.filter(Boolean));
    if ((set.has("name") || set.has("sku")) && (set.has("price") || set.size >= 2)) { headerIdx = r; fields = f; break; }
  }
  if (headerIdx < 0) {
    // No obvious header: use the first non-empty row as header and guess the name column.
    headerIdx = grid.findIndex((r) => r.some((c) => c));
    if (headerIdx < 0) return [];
    fields = grid[headerIdx].map((c) => mapHeader(c));
  }
  const headers = grid[headerIdx];
  // Only the first column per field is used; duplicates go into "details".
  const used = new Set<Field>();
  fields = fields.map((f) => {
    if (!f || f === "details" || used.has(f)) return null;
    used.add(f);
    return f;
  });
  const hasNameCol = fields.includes("name");

  const rows: Row[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells.some((c) => c)) continue;
    const row = emptyRow(file, location);
    const details: string[] = [];
    cells.forEach((text, c) => {
      if (!text) return;
      const f = fields[c];
      if (f === "price") {
        const p = parsePrice(text);
        if (p) { row.price = p.value; row.currency ||= p.currency || headerCurrency(headers[c] || ""); } else details.push(`${headers[c] || "Price"}: ${text}`);
      } else if (f) {
        (row[f] as string) = text;
      } else if (!hasNameCol && !row.name && hasLetters(text) && !parsePrice(text)) {
        row.name = text;
      } else {
        details.push(headers[c] ? `${headers[c]}: ${text}` : text);
      }
    });
    if (!row.details) row.details = details.join("; ");
    else if (details.length) row.details += "; " + details.join("; ");
    if (!row.name && !row.sku) continue;
    if (SKIP_LINE_RE.test(row.name) && row.price !== null && !row.sku) continue;
    rows.push(row);
  }
  // Re-importing a master file: keep its original source/location columns.
  return rows.map((row) => ({ ...row, file: row.file || file, location: row.location || location }));
}

export async function parseExcel(file: File): Promise<Row[]> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const rows: Row[] = [];
  const sheets = wb.worksheets.filter((ws) => ws.state === "visible" || !ws.state);
  for (const ws of sheets) {
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const vals = (r.values as unknown[]).slice(1).map(cellText);
      grid[n - 1] = vals;
    });
    for (let i = 0; i < grid.length; i++) grid[i] ??= [];
    rows.push(...gridToRows(grid, file.name, sheets.length > 1 ? `Sheet: ${ws.name}` : ""));
  }
  return rows;
}

/** Minimal RFC-4180 CSV parser (handles quotes, commas and newlines inside quotes). */
export function parseCsvText(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur.trim()); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim()); out.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur.trim()); out.push(row); }
  return out;
}

export async function parseCsv(file: File): Promise<Row[]> {
  return gridToRows(parseCsvText((await file.text()).replace(/^﻿/, "")), file.name, "");
}

export async function buildMasterWorkbook(rows: Row[]): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet("Master", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = MASTER_COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
  for (const r of rows) {
    ws.addRow(Object.fromEntries(MASTER_COLUMNS.map((c) => [c.field, r[c.field] ?? ""])));
  }
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.getColumn("price").numFmt = "#,##0.00";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: MASTER_COLUMNS.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
