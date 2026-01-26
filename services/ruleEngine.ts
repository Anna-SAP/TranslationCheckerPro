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

export const createDefaultRules = (
  sourceLocale: string, 
  opts: { ignoreCase: boolean; trim: boolean; allowVariants: boolean },
  lang: 'zh' | 'en' = 'zh'
): Rule[] => {
  
  const T = {
    zh: {
      missingSource: "单语评估模式",
      missingSourceDesc: "源文缺失。验证将侧重于目标语言质量。",
      missingSourceTitle: "正在以单语模式运行",
      missingSourceExpl: "此键未提供源文本。跳过比较规则。",
      missingSourceSugg: "使用 AI 语言学审计进行质量评估。",
      
      missingTrans: "缺失翻译",
      missingTransDesc: "目标文本为空。",
      missingTransTitle: "空翻译",
      missingTransExpl: "目标字段为空或仅包含空格。",
      missingTransSugg: "请翻译或应用回退。",

      untranslated: "未翻译",
      untranslatedDesc: "目标文与源文相同。",
      untranslatedTitle: "与源文完全相同",
      untranslatedExpl: "目标文本与源文完全匹配。",
      untranslatedSugg: "检查是否需要本地化。",

      placeholder: "占位符完整性",
      placeholderDesc: "缺失或多余的占位符。",
      placeholderTitle: "占位符不匹配",
      placeholderExpl: (m: string, e: string) => `不匹配：${m ? '缺失 ' + m : ''} ${e ? '多余 ' + e : ''}`,
      placeholderSugg: "确保占位符符合技术要求。",

      icu: "ICU 语法 (花括号)",
      icuDesc: "不平衡的花括号通常会破坏 ICU 解析。",
      icuTitle: "花括号不平衡",
      icuExpl: "发现不匹配的 '{' 或 '}'。这将导致大多数 i18n 引擎崩溃。",
      icuSugg: "修复花括号嵌套。",

      icuHash: "ICU 数值占位符 (#)",
      icuHashDesc: "检查复数/序数格式中是否保留了 # (数值) 符号。",
      icuHashTitle: "# 占位符丢失",
      icuHashExpl: "源文在 plural/selectordinal 结构中使用了 # 来动态显示数值，但译文完全缺失此符号。",
      icuHashSugg: "请在译文对应的分支中恢复 #。",

      whitespace: "空格完整性",
      whitespaceDesc: "首尾空格或双空格。",
      whitespaceTrimTitle: "修剪问题",
      whitespaceTrimExpl: "边界处发现意外空格。",
      whitespaceTrimSugg: "修剪空格。",
      whitespaceDoubleTitle: "双空格",
      whitespaceDoubleExpl: "发现连续多个空格。",
      whitespaceDoubleSugg: "合并空格。",

      punctuation: "区域标点符号",
      punctuationDesc: "在 CJK 语言中使用全角标点。",
      punctuationTitle: "混合标点",
      punctuationExpl: "在 CJK 上下文中发现拉丁标点。",
      punctuationSugg: "使用适当的全角符号。",

      structure: "结构镜像原则",
      structureDesc: "确保译文保留源文首尾的结构性符号（如 []、()、{}）。",
      structureTitle: "结构符号丢失",
      structureExpl: (char: string, pos: string) => `源文在${pos}包含 '${char}'，但译文缺失。`,
      structureSugg: (char: string, pos: string) => `请在译文${pos}补充 '${char}'。`,

      brand: "品牌一致性 (DNT)",
      brandDesc: "严禁将品牌词 (如 RingCentral) 替换为 RingEX 或翻译。",
      brandTitle: "DNT 术语违规",
      brandExpl: (found: string) => found ? `检测到非法品牌替换：'${found}'。源文使用的是 'RingCentral'。` : "译文缺失 DNT 术语 'RingCentral'。",
      brandSugg: "必须保留 'RingCentral'，请勿翻译或替换。"
    },
    en: {
      missingSource: "Unilingual Mode",
      missingSourceDesc: "Source text is missing. Validations will focus on target language quality.",
      missingSourceTitle: "Operating in Unilingual Mode",
      missingSourceExpl: "No source text provided for this key. Comparison rules are skipped.",
      missingSourceSugg: "Use AI Linguistic Audit for quality assessment.",
      
      missingTrans: "Missing Translation",
      missingTransDesc: "Target text is empty.",
      missingTransTitle: "Empty translation",
      missingTransExpl: "Target field is empty or whitespace only.",
      missingTransSugg: "Translate or apply a fallback.",

      untranslated: "Untranslated",
      untranslatedDesc: "Target equals source.",
      untranslatedTitle: "Identical to source",
      untranslatedExpl: "Target text matches source exactly.",
      untranslatedSugg: "Check if this should be localized.",

      placeholder: "Placeholder Integrity",
      placeholderDesc: "Missing or extra placeholders.",
      placeholderTitle: "Placeholders mismatch",
      placeholderExpl: (m: string, e: string) => `Mismatch: ${m ? 'Missing ' + m : ''} ${e ? 'Extra ' + e : ''}`,
      placeholderSugg: "Ensure placeholders match technical requirements.",

      icu: "ICU Syntax (Braces)",
      icuDesc: "Unbalanced braces usually break ICU parsing.",
      icuTitle: "Unbalanced braces",
      icuExpl: "Found mismatched '{' or '}'. This will crash most i18n engines.",
      icuSugg: "Fix brace nesting.",

      icuHash: "ICU Numeric Placeholder (#)",
      icuHashDesc: "Checks if the '#' (value) symbol is preserved in plural/ordinal formats.",
      icuHashTitle: "Missing '#' Placeholder",
      icuHashExpl: "Source uses '#' for dynamic values in a plural/selectordinal block, but target is missing it.",
      icuHashSugg: "Restore '#' in the translation branches.",

      whitespace: "Whitespace Integrity",
      whitespaceDesc: "Leading/trailing spaces or double spaces.",
      whitespaceTrimTitle: "Trim issue",
      whitespaceTrimExpl: "Unexpected whitespace at boundaries.",
      whitespaceTrimSugg: "Trim whitespace.",
      whitespaceDoubleTitle: "Double spaces",
      whitespaceDoubleExpl: "Multiple consecutive spaces found.",
      whitespaceDoubleSugg: "Collapse spaces.",

      punctuation: "Regional Punctuation",
      punctuationDesc: "Use full-width punctuation in CJK languages.",
      punctuationTitle: "Mixed Punctuation",
      punctuationExpl: "Latin punctuation found in CJK context.",
      punctuationSugg: "Use appropriate full-width marks.",

      structure: "Structural Mirroring",
      structureDesc: "Ensure target preserves structural symbols (e.g. [], (), {}) at start/end.",
      structureTitle: "Missing Structural Symbol",
      structureExpl: (char: string, pos: string) => `Source has '${char}' at the ${pos}, but target is missing it.`,
      structureSugg: (char: string, pos: string) => `Add '${char}' at the ${pos}.`,

      brand: "Brand Consistency (DNT)",
      brandDesc: "Strictly forbids replacing brand terms (e.g. RingCentral) with RingEX or translating them.",
      brandTitle: "DNT Violation",
      brandExpl: (found: string) => found ? `Illegal brand replacement detected: '${found}'. Source uses 'RingCentral'.` : "Target is missing DNT term 'RingCentral'.",
      brandSugg: "Must preserve 'RingCentral'. Do not translate or replace."
    }
  }[lang];

  return [
    {
      id: "icu-hash",
      name: T.icuHash,
      severity: "high",
      description: T.icuHashDesc,
      check: ({ value, srcValue }) => {
        if (!srcValue || !value) return null;
        // Heuristic: Source has ICU structure AND '#' inside it
        // Regex checks for { ... , plural|selectordinal ... }
        const isIcuPlural = /{[^}]+,\s*(?:plural|selectordinal)/i.test(srcValue);
        if (isIcuPlural && srcValue.includes('#')) {
          if (!value.includes('#')) {
            return {
              title: T.icuHashTitle,
              explanation: T.icuHashExpl,
              suggestion: T.icuHashSugg
            };
          }
        }
        return null;
      }
    },
    {
      id: "brand-consistency",
      name: T.brand,
      severity: "critical",
      description: T.brandDesc,
      check: ({ value, srcValue }) => {
        if (!srcValue || !value) return null;
        
        // DNT configuration
        const dntTerm = "RingCentral";
        const forbiddenReplacements = ["RingEX", "RingEx", "RC"]; 

        if (srcValue.includes(dntTerm)) {
          if (!value.includes(dntTerm)) {
            // It's missing. Check if it was replaced by a forbidden term.
            let foundReplacement = "";
            for (const bad of forbiddenReplacements) {
              if (value.includes(bad)) {
                foundReplacement = bad;
                break;
              }
            }
            
            return {
              title: T.brandTitle,
              explanation: T.brandExpl(foundReplacement),
              suggestion: T.brandSugg
            };
          }
        }
        return null;
      }
    },
    {
      id: "structural-mirroring",
      name: T.structure,
      severity: "critical",
      description: T.structureDesc,
      check: ({ value, srcValue }) => {
        if (!srcValue || !value) return null;
        
        // Use trimmed values for checking boundaries to ensure exact match of visible structure
        const s = String(srcValue).trim();
        const t = String(value).trim();
        
        if (!s || !t) return null;

        // Define strict structural markers
        const startChars = ['[', '(', '{', '<', '“', '"', "'"];
        const endChars = [']', ')', '}', '>', '”', '"', "'"]; 
        // Note: '.' is excluded to avoid conflict with CJK period '。', focusing on brackets/quotes.

        const sStart = s.charAt(0);
        const sEnd = s.charAt(s.length - 1);
        const tStart = t.charAt(0);
        const tEnd = t.charAt(t.length - 1);

        if (startChars.includes(sStart) && tStart !== sStart) {
             const pos = lang === 'zh' ? '开头' : 'start';
             return {
                title: T.structureTitle,
                explanation: T.structureExpl(sStart, pos),
                suggestion: T.structureSugg(sStart, pos)
             };
        }

        if (endChars.includes(sEnd) && tEnd !== sEnd) {
             const pos = lang === 'zh' ? '结尾' : 'end';
             return {
                title: T.structureTitle,
                explanation: T.structureExpl(sEnd, pos),
                suggestion: T.structureSugg(sEnd, pos)
             };
        }
        
        return null;
      }
    },
    {
      id: "missing-source",
      name: T.missingSource,
      severity: "info",
      description: T.missingSourceDesc,
      check: ({ locale, value }) => {
        if (locale !== sourceLocale) return null;
        if (!String(value || "").trim()) {
          return {
            title: T.missingSourceTitle,
            explanation: T.missingSourceExpl,
            suggestion: T.missingSourceSugg
          };
        }
        return null;
      }
    },
    {
      id: "missing-translation",
      name: T.missingTrans,
      severity: "high",
      description: T.missingTransDesc,
      check: ({ locale, value }) => {
        if (locale === sourceLocale) return null;
        if (!String(value || "").trim()) {
          return {
            title: T.missingTransTitle,
            explanation: T.missingTransExpl,
            suggestion: T.missingTransSugg
          };
        }
        return null;
      }
    },
    {
      id: "untranslated",
      name: T.untranslated,
      severity: "medium",
      description: T.untranslatedDesc,
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
            title: T.untranslatedTitle,
            explanation: T.untranslatedExpl,
            suggestion: T.untranslatedSugg
          };
        }
        return null;
      }
    },
    {
      id: "placeholder-mismatch",
      name: T.placeholder,
      severity: "critical",
      description: T.placeholderDesc,
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
          return {
            title: T.placeholderTitle,
            explanation: T.placeholderExpl(missing.join(", "), extra.join(", ")),
            suggestion: T.placeholderSugg
          };
        }
        return null;
      }
    },
    {
      id: "icu-braces",
      name: T.icu,
      severity: "high",
      description: T.icuDesc,
      check: ({ value }) => {
        if (hasUnbalancedBraces(value)) {
          return {
            title: T.icuTitle,
            explanation: T.icuExpl,
            suggestion: T.icuSugg
          };
        }
        return null;
      }
    },
    {
      id: "trailing-space",
      name: T.whitespace,
      severity: "low",
      description: T.whitespaceDesc,
      check: ({ value }) => {
        const s = String(value ?? "");
        if (!s) return null;
        if (/^\s+|\s+$/.test(s)) return { title: T.whitespaceTrimTitle, explanation: T.whitespaceTrimExpl, suggestion: T.whitespaceTrimSugg };
        if (/[ \t]{2,}/.test(s)) return { title: T.whitespaceDoubleTitle, explanation: T.whitespaceDoubleExpl, suggestion: T.whitespaceDoubleSugg };
        return null;
      }
    },
    {
      id: "zh-punctuation",
      name: T.punctuation,
      severity: "low",
      description: T.punctuationDesc,
      check: ({ locale, value }) => {
        const loc = String(locale).toLowerCase();
        if (!loc.startsWith("zh") && !loc.startsWith("ja") && !loc.startsWith("ko")) return null;
        const s = String(value ?? "");
        if (/[,.!?:;]\s*[\u4e00-\u9fff\u3040-\u30ff]/.test(s)) {
          return { 
            title: T.punctuationTitle, 
            explanation: T.punctuationExpl, 
            suggestion: T.punctuationSugg 
          };
        }
        return null;
      }
    }
  ];
};