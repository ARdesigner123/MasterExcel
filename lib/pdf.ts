import { emptyRow, type Field, type Row } from "./types";
import { hasLetters, headerCurrency, mapHeader, parsePrice, SKIP_LINE_RE } from "./columns";

type Item = { str: string; x: number; y: number; w: number; h: number };
type Cell = { text: string; x0: number; x1: number };
type HeaderCol = { field: Field | null; label: string; x0: number; x1: number };

/** Group text fragments on one page into lines (by y) and cells (by horizontal gaps). */
export function itemsToLines(items: Item[]): Cell[][] {
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const tol = Math.max(2, (it.h || 10) * 0.45);
    if (last && Math.abs(last[0].y - it.y) <= tol) last.push(it);
    else lines.push([it]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const it of line) {
      const prev = cells[cells.length - 1];
      const gap = prev ? it.x - prev.x1 : Infinity;
      // A normal space is ~0.25-0.35 of the font size; column gaps are much wider.
      if (prev && gap < Math.max(3, (it.h || 10) * 0.9)) {
        prev.text += (gap > (it.h || 10) * 0.1 && !prev.text.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
        prev.x1 = Math.max(prev.x1, it.x + it.w);
      } else {
        cells.push({ text: it.str, x0: it.x, x1: it.x + it.w });
      }
    }
    return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text);
  });
}

function detectHeader(cells: Cell[]): HeaderCol[] | null {
  if (cells.length < 2) return null;
  const cols = cells.map((c) => ({ field: mapHeader(c.text), label: c.text, x0: c.x0, x1: c.x1 }));
  const fields = new Set(cols.map((c) => c.field).filter(Boolean));
  const looksLikeData = cells.some((c) => parsePrice(c.text)?.explicit);
  if (looksLikeData) return null;
  if (fields.has("price") && (fields.has("name") || fields.has("sku"))) return cols;
  return null;
}

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function rowFromHeader(cells: Cell[], header: HeaderCol[], file: string, location: string): Row | null {
  const buckets = new Map<number, string[]>();
  for (const c of cells) {
    let best = -1;
    let bestScore = -Infinity;
    header.forEach((h, i) => {
      const ov = overlap(c.x0, c.x1, h.x0, h.x1);
      const dist = Math.abs((c.x0 + c.x1) / 2 - (h.x0 + h.x1) / 2);
      const score = ov > 0 ? 1e6 + ov : -dist;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) buckets.set(best, [...(buckets.get(best) || []), c.text]);
  }
  const row = emptyRow(file, location);
  const details: string[] = [];
  const seen = new Set<Field>();
  buckets.forEach((texts, i) => {
    const h = header[i];
    const text = texts.join(" ");
    if (h.field && !seen.has(h.field) && h.field !== "details" && h.field !== "file" && h.field !== "location") {
      seen.add(h.field);
      if (h.field === "price") {
        const p = parsePrice(text);
        if (p) { row.price = p.value; row.currency ||= p.currency || headerCurrency(h.label); } else details.push(`${h.label}: ${text}`);
      } else {
        (row[h.field] as string) = text;
      }
    } else {
      details.push(`${h.label}: ${text}`);
    }
  });
  row.details = details.join("; ");
  if (!hasLetters(row.name) || SKIP_LINE_RE.test(row.name)) return null;
  if (row.price === null && !row.sku) return null;
  return row;
}

/** Fallback for PDFs without a recognisable header row: a line with a price and some text = a product. */
function rowFromHeuristic(cells: Cell[], file: string, location: string): Row | null {
  const lineText = cells.map((c) => c.text).join(" ");
  if (SKIP_LINE_RE.test(lineText)) return null;
  let priceIdx = -1;
  for (let i = cells.length - 1; i >= 0; i--) {
    const p = parsePrice(cells[i].text);
    if (p?.explicit) { priceIdx = i; break; }
  }
  if (priceIdx < 0) return null;
  const price = parsePrice(cells[priceIdx].text)!;
  const textCells = cells.filter((c, i) => i !== priceIdx && hasLetters(c.text));
  if (!textCells.length) return null;
  const row = emptyRow(file, location);
  // A short token mixing letters & digits (e.g. "AB-1234") at the start is probably a code.
  if (textCells.length > 1 && /^[A-Z0-9][A-Z0-9\-./]{2,19}$/i.test(textCells[0].text) && /\d/.test(textCells[0].text)) {
    row.sku = textCells.shift()!.text;
  }
  row.name = textCells.shift()!.text;
  const rest = cells.filter((c, i) => i !== priceIdx && !hasLetters(c.text)).map((c) => c.text);
  row.details = [...textCells.map((c) => c.text), ...rest].join("; ");
  row.price = price.value;
  row.currency = price.currency;
  return row;
}

export function linesToRows(pages: Cell[][][], file: string): Row[] {
  const rows: Row[] = [];
  let header: HeaderCol[] | null = null; // headers usually repeat per page, but carry over in case they don't
  pages.forEach((lines, p) => {
    const location = `Page ${p + 1}`;
    for (const cells of lines) {
      const h = detectHeader(cells);
      if (h) { header = h; continue; }
      const row = header ? rowFromHeader(cells, header, file, location) ?? rowFromHeuristic(cells, file, location) : rowFromHeuristic(cells, file, location);
      if (row) rows.push(row);
    }
  });
  return rows;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

export async function parsePdf(file: File): Promise<{ rows: Row[]; pages: number; textFound: boolean }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: Cell[][][] = [];
  let textFound = false;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      if (it.str.trim()) textFound = true;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) });
    }
    pages.push(itemsToLines(items));
    page.cleanup();
  }
  await doc.destroy();
  return { rows: linesToRows(pages, file.name), pages: doc.numPages, textFound };
}
