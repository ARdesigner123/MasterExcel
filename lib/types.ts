export type Row = {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  currency: string;
  unit: string;
  details: string;
  /** Original file the row came from, e.g. "supplier-A.pdf" */
  file: string;
  /** Where inside the file, e.g. "Page 3" or "Sheet: Prices" */
  location: string;
};

export type Field = "name" | "sku" | "price" | "currency" | "unit" | "details" | "file" | "location";

/** Columns of the master Excel file, in order. */
export const MASTER_COLUMNS: { field: Field; header: string; width: number }[] = [
  { field: "name", header: "Product Name", width: 45 },
  { field: "sku", header: "SKU / Code", width: 18 },
  { field: "price", header: "Price", width: 12 },
  { field: "currency", header: "Currency", width: 10 },
  { field: "unit", header: "Unit", width: 12 },
  { field: "details", header: "Details", width: 50 },
  { field: "file", header: "Source File", width: 30 },
  { field: "location", header: "Location", width: 16 },
];

let counter = 0;
export function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyRow(file: string, location: string): Row {
  return { id: newId(), name: "", sku: "", price: null, currency: "", unit: "", details: "", file, location };
}
