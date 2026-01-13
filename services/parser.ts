import { TranslationItem } from "../types";

function normalizeLocaleKey(k: string): string {
  return String(k || "").trim();
}

export function parseAndNormalize(rawText: string): { items: TranslationItem[], locales: string[] } {
  const text = rawText.trim();
  if (!text) throw new Error("Input is empty.");
  
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`JSON Parse Error: ${e.message}`);
  }

  const items: TranslationItem[] = [];
  const localesSet = new Set<string>();

  const pushLocale = (lk: string) => {
    const k = normalizeLocaleKey(lk);
    if (!k) return;
    if (["key", "id", "name", "description", "context", "comment"].includes(k)) return;
    localesSet.add(k);
  };

  const normalizeItem = (key: string, obj: any) => {
    const item: TranslationItem = { key: String(key) };
    for (const [k, v] of Object.entries(obj || {})) {
      if (["key", "id", "name"].includes(k)) continue;
      if (typeof v === "string" || v === null) {
        item[k] = v === null ? "" : v as string;
        pushLocale(k);
      }
    }
    return item;
  };

  if (Array.isArray(json)) {
    for (const row of json) {
      if (!row || typeof row !== "object") continue;
      const key = row.key ?? row.id ?? row.name ?? "unknown";
      items.push(normalizeItem(key, row));
    }
  } else if (json && typeof json === "object") {
    // Heuristic: if object has "key" and locales, treat as single row
    if (Object.prototype.hasOwnProperty.call(json, "key")) {
      const key = json.key ?? "unknown";
      items.push(normalizeItem(key, json));
    } else {
      // mapping: key -> {locale:value}
      const vals = Object.values(json);
      const looksLikeMap = vals.every(v => v && typeof v === "object" && !Array.isArray(v));
      if (looksLikeMap) {
        for (const [k, v] of Object.entries(json)) {
          items.push(normalizeItem(k, v));
          for (const lk of Object.keys(v || {})) pushLocale(lk);
        }
      } else {
        // fallback: wrap as single item
        const key = "root";
        items.push(normalizeItem(key, json));
      }
    }
  } else {
    throw new Error("Unsupported JSON structure.");
  }

  const locales = Array.from(localesSet).sort((a, b) => a.localeCompare(b));
  return { items, locales };
}

export function buildKeyLineMap(rawText: string): Record<string, number> {
  const lines = rawText.split("\n");
  const map: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/"key"\s*:\s*"([^"]+)"/);
    if (m) {
      map[m[1]] = i + 1;
    } else {
      const m2 = line.match(/^\s*"([^"]+)"\s*:\s*\{/);
      if (m2 && !map[m2[1]]) map[m2[1]] = i + 1;
    }
  }
  return map;
}
