"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RowsTable from "@/components/RowsTable";
import type { Field, Row } from "@/lib/types";
import { loadMaster, saveMaster } from "@/lib/storage";

type FileStatus = { name: string; state: "working" | "done" | "error"; message: string };

const ACCEPT = ".pdf,.xlsx,.xlsm,.csv";

function applyEdit(rows: Row[], id: string, field: Field, value: string): Row[] {
  return rows.map((r) => {
    if (r.id !== id) return r;
    if (field === "price") {
      const n = Number(value.replace(/[^0-9.\-]/g, ""));
      return { ...r, price: value.trim() === "" || !Number.isFinite(n) ? null : n };
    }
    return { ...r, [field]: value };
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [master, setMaster] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState<Row[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ field: Field; dir: 1 | -1 } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMaster(loadMaster());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) setSaveFailed(!saveMaster(master));
  }, [master, loaded]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    setStatuses((s) => [...list.map((f) => ({ name: f.name, state: "working" as const, message: "Reading…" })), ...s]);
    const setStatus = (name: string, state: FileStatus["state"], message: string) =>
      setStatuses((s) => s.map((x) => (x.name === name && x.state === "working" ? { ...x, state, message } : x)));

    for (const file of list) {
      const ext = file.name.toLowerCase().split(".").pop();
      try {
        let rows: Row[] = [];
        if (ext === "pdf") {
          const { parsePdf } = await import("@/lib/pdf");
          const res = await parsePdf(file);
          rows = res.rows;
          if (!res.textFound) throw new Error("No text found — this looks like a scanned PDF (image only). It needs OCR first.");
          setStatus(file.name, "done", `${rows.length} product rows found on ${res.pages} page(s)`);
        } else if (ext === "xlsx" || ext === "xlsm") {
          const { parseExcel } = await import("@/lib/excel");
          rows = await parseExcel(file);
          setStatus(file.name, "done", `${rows.length} rows found`);
        } else if (ext === "csv") {
          const { parseCsv } = await import("@/lib/excel");
          rows = await parseCsv(file);
          setStatus(file.name, "done", `${rows.length} rows found`);
        } else if (ext === "xls") {
          throw new Error("Old .xls format — open it in Excel and “Save As” .xlsx, then upload again.");
        } else {
          throw new Error("Unsupported file type. Use PDF, XLSX or CSV.");
        }
        if (rows.length) setPending((p) => [...p.filter((r) => r.file !== file.name), ...rows]);
      } catch (e) {
        setStatus(file.name, "error", e instanceof Error ? e.message : "Could not read file");
      }
    }
  }, []);

  const pendingFiles = useMemo(() => new Set(pending.map((r) => r.file)), [pending]);
  const replacing = useMemo(() => {
    const inMaster = new Set(master.map((r) => r.file));
    return [...pendingFiles].filter((f) => inMaster.has(f));
  }, [master, pendingFiles]);
  const includedCount = pending.length - pending.filter((r) => excluded.has(r.id)).length;

  const commitPending = () => {
    const keep = pending.filter((r) => !excluded.has(r.id));
    setMaster((m) => [...m.filter((r) => !pendingFiles.has(r.file)), ...keep]);
    setPending([]);
    setExcluded(new Set());
  };

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let rows = words.length
      ? master.filter((r) => {
          const hay = `${r.name} ${r.sku}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : master;
    if (sort) {
      const { field, dir } = sort;
      rows = [...rows].sort((a, b) => {
        const av = a[field], bv = b[field];
        if (av === null || av === "") return 1;
        if (bv === null || bv === "") return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return rows;
  }, [master, query, sort]);

  const exportRows = async (rows: Row[], name: string) => {
    const { buildMasterWorkbook } = await import("@/lib/excel");
    download(await buildMasterWorkbook(rows), name);
  };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <header className="top">
        <div>
          <h1>Product Master</h1>
          <p className="muted">Combine PDF and Excel price lists into one searchable master Excel file.</p>
        </div>
        <div className="actions">
          <button className="primary" disabled={!master.length} onClick={() => exportRows(master, `master-products-${today}.xlsx`)}>
            Download master Excel
          </button>
        </div>
      </header>

      <section
        className={`drop ${dragging ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        <strong>Drop PDF / Excel / CSV files here</strong>
        <span className="muted">or click to choose — you can select many files at once. Files stay on this computer.</span>
        <span className="muted small">Tip: to continue an existing master, upload the master .xlsx you downloaded earlier.</span>
      </section>

      {statuses.length > 0 && (
        <ul className="statuses">
          {statuses.map((s, i) => (
            <li key={i} className={s.state}>
              <span className="dot" /> <b>{s.name}</b> — {s.message}
            </li>
          ))}
          <li><button className="link" onClick={() => setStatuses([])}>Clear list</button></li>
        </ul>
      )}

      {pending.length > 0 && (
        <section className="panel review">
          <div className="panel-head">
            <div>
              <h2>Review extracted rows</h2>
              <p className="muted">
                Check and fix anything that looks wrong, untick rows you don’t want, then add them to the master.
                {replacing.length > 0 && (
                  <> <b>{replacing.length} file(s) are already in the master</b> ({replacing.join(", ")}) — their old rows will be replaced.</>
                )}
              </p>
            </div>
            <div className="actions">
              <button onClick={() => { setPending([]); setExcluded(new Set()); }}>Discard</button>
              <button className="primary" disabled={!includedCount} onClick={commitPending}>
                Add {includedCount.toLocaleString()} rows to master
              </button>
            </div>
          </div>
          <RowsTable
            rows={pending}
            excluded={excluded}
            onToggle={(id) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            onEdit={(id, f, v) => setPending((p) => applyEdit(p, id, f, v))}
            onDelete={(id) => setPending((p) => p.filter((r) => r.id !== id))}
            emptyText=""
          />
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Master list <span className="count">{master.length.toLocaleString()} products · {new Set(master.map((r) => r.file)).size} files</span></h2>
          </div>
          <div className="actions">
            <input
              className="search"
              type="search"
              placeholder="Search by product name or code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button disabled={!filtered.length} onClick={() => exportRows(filtered, `search-${query.replace(/[^\w]+/g, "-")}-${today}.xlsx`)}>
                Download results
              </button>
            )}
            <button
              className="danger"
              disabled={!master.length}
              onClick={() => confirm("Delete ALL rows from the master list? Download it first if you need a copy.") && setMaster([])}
            >
              Clear all
            </button>
          </div>
        </div>
        {saveFailed && (
          <p className="warn">The browser couldn’t save this list (it may be too large). Download the master Excel so you don’t lose it.</p>
        )}
        {query && <p className="muted small">{filtered.length.toLocaleString()} match(es) for “{query}”</p>}
        <RowsTable
          key={query}
          rows={filtered}
          sort={sort}
          onSort={(field) => setSort((s) => (s?.field === field ? (s.dir === 1 ? { field, dir: -1 } : null) : { field, dir: 1 }))}
          onEdit={(id, f, v) => setMaster((m) => applyEdit(m, id, f, v))}
          onDelete={(id) => setMaster((m) => m.filter((r) => r.id !== id))}
          emptyText={!loaded ? "Loading…" : master.length ? "No products match your search." : "No products yet — upload some files above."}
        />
      </section>
    </main>
  );
}
