import type { Row } from "./types";

const KEY = "product-master:v1";

export function loadMaster(): Row[] {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Returns false if the browser refused to save (storage full / disabled). */
export function saveMaster(rows: Row[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}
