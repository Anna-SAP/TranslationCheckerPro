import { Rule, RuleCheckParams, RuleOutput } from '../types';

// --- Helpers ---

function normalizeForEquality(s: string, ignoreCase: boolean, trim: boolean): string {
  let t = String(s || "");
  if (trim) t = t.trim();
  if (ignoreCase) t = t.toLowerCase();
  return t;
}

function extractPlaceholders(text: string): Set<string> {
  const src = String(text || "");
  const set = new Set<string>();
  
  // ICU {name}
  let m;
  const icu = /{([a-zA-Z0-9_]+)(?:\s*,[^}]*)?}/g;
  while ((m = icu.exec(src))) set.add(`{${m[1]}}`);
  
  // Mustache {{name}}
  const must = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  while ((m = must.exec(src))) set.add(`{{${m[1]}}`);
  
  // Printf %s
  const printf = /%(\d+\$)?[sdif]/g;
  while ((m = printf.exec(src))) set.add(m[0]);
  
  return set;
}

function extractHtmlTags(text: string): string[] {
  const src = String(text || "");
  const tags: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    tags.push(m[1].toLowerCase());
  }
  return tags;
}

function multisetSignature(arr: string[]): string {
  const map = new Map<string, number>();
  for (const a of arr) {
    map.set(a, (map.get(a) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

function extractNumbers(text: string): string[] {
  const src = String(text || "");
  const tokens: string[] = [];
  const re = /-?\d[\d\s\u00A0\u202F,.'’]*\d|-?\d/g;
  let m;
  while ((m = re.exec(src))) {
    let t = m[0].replace(/[\s\u00A0\u202F'’]/g, "");
    const lastDot = t.lastIndexOf(".");
    const lastComma = t.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) {
      if (lastDot > lastComma) t = t.replace(/,/g, "");
      else {
        t = t.replace(/\./g, "");
        t = t.replace(/,/g, ".");
      }
    } else {
      if (lastComma !== -1) {
        const parts = t.split(",");
        const tail = parts[parts.length - 1];
        if (tail.length <= 2) t = parts.slice(0, -1).join("") + "." + tail;
        else t = parts.join("");
      }
      if (lastDot !== -1) {
        const parts = t.split(".");
        const tail = parts[parts.length - 1];
        if (tail.length > 2) t = parts.join("");
      }
    }
    tokens.push(t);
  }
  return tokens;
}

function hasUnbalancedBraces(text: string): boolean {
  const s = String(text || "");
  let bal = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") bal++;
    else if (ch === "}") bal--;
    if (bal < 0) return true;
  }
  return bal !== 0;
}

// --- Rules ---

export const createDefaultRules = (sourceLocale: string, opts: { ignoreCase: boolean; trim: boolean; allowVariants: boolean }): Rule[] => [
  {
    id: "missing-source",
    name: "Unilingual Mode",
    severity: "info",
    description: "Source text is missing. Validations will focus on target language quality.",
    check: ({ locale, value }) => {
      if (locale !== sourceLocale) return null;
      if (!String(value || "").trim()) {
        return {
          title: "Operating in Unilingual Mode",
          explanation: "No source text provided for this key. Comparison rules are skipped.",
          suggestion: "Use AI Linguistic Audit for quality assessment."
        };
      }
      return null;
    }
  },
  {
    id: "missing-translation",
    name: "Missing Translation",
    severity: "high",
    description: "Target text is empty.",
    check: ({ locale, value }) => {
      if (locale === sourceLocale) return null;
      if (!String(value || "").trim()) {
        return {
          title: "Empty translation",
          explanation: "Target field is empty or whitespace only.",
          suggestion: "Translate or apply a fallback."
        };
      }
      return null;
    }
  },
  {
    id: "untranslated",
    name: "Untranslated",
    severity: "medium",
    description: "Target equals source.",
    check: ({ locale, value, srcValue }) => {
      if (locale === sourceLocale || !srcValue) return null;
      if (opts.allowVariants) {
        const srcLang = String(sourceLocale).split("-")[0].toLowerCase();
        const tgtLang = String(locale).split("-")[0].toLowerCase();
        if (srcLang === tgtLang) return null;
      }
      const a = normalizeForEquality(value, opts.ignoreCase, opts.trim);
      const b = normalizeForEquality(srcValue, opts.ignoreCase, opts.trim);
      if (a && b && a === b) {
        return {
          title: "Identical to source",
          explanation: "Target text matches source exactly.",
          suggestion: "Check if this should be localized."
        };
      }
      return null;
    }
  },
  {
    id: "placeholder-mismatch",
    name: "Placeholder Integrity",
    severity: "critical",
    description: "Missing or extra placeholders.",
    check: ({ locale, value, srcValue }) => {
      if (locale === sourceLocale || !srcValue) return null;
      const src = extractPlaceholders(srcValue);
      const tgt = extractPlaceholders(value);
      if (src.size === 0 && tgt.size === 0) return null;

      const missing: string[] = [];
      src.forEach(p => { if (!tgt.has(p)) missing.push(p); });
      const extra: string[] = [];
      tgt.forEach(p => { if (!src.has(p)) extra.push(p); });

      if (missing.length || extra.length) {
        let explanation = "Mismatch: ";
        if (missing.length) explanation += `Missing ${missing.join(", ")}. `;
        if (extra.length) explanation += `Extra ${extra.join(", ")}.`;
        return {
          title: "Placeholders mismatch",
          explanation,
          suggestion: "Ensure placeholders match technical requirements."
        };
      }
      return null;
    }
  },
  {
    id: "icu-braces",
    name: "ICU Syntax (Braces)",
    severity: "high",
    description: "Unbalanced braces usually break ICU parsing.",
    check: ({ value }) => {
      if (hasUnbalancedBraces(value)) {
        return {
          title: "Unbalanced braces",
          explanation: "Found mismatched '{' or '}'. This will crash most i18n engines.",
          suggestion: "Fix brace nesting."
        };
      }
      return null;
    }
  },
  {
    id: "trailing-space",
    name: "Whitespace Integrity",
    severity: "low",
    description: "Leading/trailing spaces or double spaces.",
    check: ({ value }) => {
      const s = String(value ?? "");
      if (!s) return null;
      if (/^\s+|\s+$/.test(s)) return { title: "Trim issue", explanation: "Unexpected whitespace at boundaries.", suggestion: "Trim whitespace." };
      if (/[ \t]{2,}/.test(s)) return { title: "Double spaces", explanation: "Multiple consecutive spaces found.", suggestion: "Collapse spaces." };
      return null;
    }
  },
  {
    id: "zh-punctuation",
    name: "Regional Punctuation",
    severity: "low",
    description: "Use full-width punctuation in CJK languages.",
    check: ({ locale, value }) => {
      const loc = String(locale).toLowerCase();
      if (!loc.startsWith("zh") && !loc.startsWith("ja") && !loc.startsWith("ko")) return null;
      const s = String(value ?? "");
      if (/[,.!?:;]\s*[\u4e00-\u9fff\u3040-\u30ff]/.test(s)) {
        return { 
          title: "Mixed Punctuation", 
          explanation: "Latin punctuation found in CJK context.", 
          suggestion: "Use appropriate full-width marks." 
        };
      }
      return null;
    }
  }
];
