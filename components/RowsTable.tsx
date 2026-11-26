"use client";

import { useState } from "react";
import type { Field, Row } from "@/lib/types";

const COLS: { field: Field; label: string; className?: string }[] = [
  { field: "name", label: "Product Name", className: "col-name" },
  { field: "sku", label: "SKU / Code" },
  { field: "price", label: "Price", className: "col-price" },
  { field: "currency", label: "Cur.", className: "col-cur" },
  { field: "unit", label: "Unit", className: "col-unit" },
  { field: "details", label: "Details", className: "col-details" },
  { field: "file", label: "Source", className: "col-source" },
];

const PAGE = 200;

type Props = {
  rows: Row[];
  onEdit: (id: string, field: Field, value: string) => void;
  onDelete?: (id: string) => void;
  excluded?: Set<string>;
  onToggle?: (id: string) => void;
  sort?: { field: Field; dir: 1 | -1 } | null;
  onSort?: (field: Field) => void;
  emptyText: string;
};

export default function RowsTable({ rows, onEdit, onDelete, excluded, onToggle, sort, onSort, emptyText }: Props) {
  const [limit, setLimit] = useState(PAGE);
  if (!rows.length) return <p className="empty">{emptyText}</p>;
  const shown = rows.slice(0, limit);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {onToggle && <th className="col-check" />}
            {COLS.map((c) => (
              <th key={c.field} className={c.className}>
                {onSort ? (
                  <button className="sort" onClick={() => onSort(c.field)}>
                    {c.label}
                    {sort?.field === c.field ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
            {onDelete && <th className="col-del" />}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className={excluded?.has(r.id) ? "excluded" : ""}>
              {onToggle && (
                <td className="col-check">
                  <input type="checkbox" checked={!excluded?.has(r.id)} onChange={() => onToggle(r.id)} aria-label="Include row" />
                </td>
              )}
              {COLS.map((c) =>
                c.field === "file" ? (
                  <td key={c.field} className="col-source" title={`${r.file}${r.location ? " — " + r.location : ""}`}>
                    {r.file}
                    {r.location && <span className="muted"> · {r.location}</span>}
                  </td>
                ) : (
                  <td key={c.field} className={c.className}>
                    <input
                      className="cell"
                      value={r[c.field] === null ? "" : String(r[c.field])}
                      inputMode={c.field === "price" ? "decimal" : undefined}
                      onChange={(e) => onEdit(r.id, c.field, e.target.value)}
                    />
                  </td>
                )
              )}
              {onDelete && (
                <td className="col-del">
                  <button className="icon" onClick={() => onDelete(r.id)} title="Delete row" aria-label="Delete row">
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="more">
          Showing {limit.toLocaleString()} of {rows.length.toLocaleString()} rows.{" "}
          <button className="link" onClick={() => setLimit(limit + PAGE * 5)}>Show more</button>
        </div>
      )}
    </div>
  );
}
