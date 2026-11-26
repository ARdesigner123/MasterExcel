# Product Master

A small web app that combines many **PDF** and **Excel/CSV** price lists into one **master Excel file**, with search by product name or code.

- Drag in lots of files at once (PDF, `.xlsx`, `.xlsm`, `.csv`)
- Products, codes, prices, currency and unit are pulled out automatically
- **Review step**: fix or untick wrong rows before they go into the master
- Search the master by name or SKU, sort columns, edit or delete rows
- **Download master Excel** (formatted, with filters) or just the search results
- Uploading the same file again **replaces** its old rows, so nothing gets duplicated
- To continue later on another computer, upload the master `.xlsx` you downloaded

Everything runs **in the browser**. Files are never uploaded to a server, so there are no file-size limits from Vercel and the price lists stay private. The current master list is also saved in the browser (localStorage), so it's still there after a refresh. Still, **download the master Excel regularly**: clearing browser data deletes the copy saved in the browser.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push this repo to GitHub.
2. On https://vercel.com/new, import the repo. Vercel detects Next.js automatically, so you don't need to change any settings.
3. Click **Deploy**.

Or, using the CLI: `npx vercel` (preview) and `npx vercel --prod`.

## How extraction works

| Source | How |
| --- | --- |
| Excel / CSV | Finds the header row (within the first 25 rows) and maps columns by name, e.g. *Description / Product / Item* → Name, *Code / SKU / Item No* → SKU, *Price / Unit Price / Cost / RRP* → Price. Extra columns go into **Details**. Every visible sheet is read. |
| PDF (table with header) | Rebuilds the text lines and columns from their positions on the page, finds a header row containing a price column, and assigns each value to the nearest header. |
| PDF (no header) | Any line with a price (`$12.50`, `RM 1,250.00`, `12.50 SGD`…) and some text is treated as a product. Lines like *Total / Subtotal / Tax* are skipped. |

To add more header words (e.g. other languages), edit the rules in `lib/columns.ts`.

### Limitations

- **Scanned PDFs** (pictures of paper) have no text layer, so they need OCR first. The app shows an error for these files.
- Old **`.xls`** files: open them in Excel and save as `.xlsx`.
- PDF layouts vary a lot. Always look over the review table, and if a supplier's format keeps parsing badly, tune `lib/pdf.ts`. Using an AI model for extraction is a possible upgrade.

## Project layout

```
app/page.tsx            Main page (upload, review, master table, search)
components/RowsTable.tsx Editable table
lib/pdf.ts              PDF text → rows (uses pdfjs-dist)
lib/excel.ts            Excel/CSV → rows, and master Excel export (uses exceljs)
lib/columns.ts          Header-name mapping and price parsing
lib/storage.ts          Saves the master list in the browser
scripts/copy-pdf-worker.mjs  Copies the PDF.js worker into /public on install
```
