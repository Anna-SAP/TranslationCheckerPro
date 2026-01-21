import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Upload, FileCode, Play, Download, MessageSquare, ChevronDown, ChevronRight, AlertTriangle, RefreshCcw, Wand2, Trash2, Microscope, Sparkles, Copy, ClipboardList, Languages, Globe } from 'lucide-react';
import { parseAndNormalize, buildKeyLineMap } from './services/parser';
import { createDefaultRules } from './services/ruleEngine';
import { AppState, AnalysisOptions, Rule, TranslationItem } from './types';
import { Stats } from './components/Stats';
import { Toast } from './components/Toast';
import { generateContent, generateContentStream, listModels } from './services/geminiService';

const DEFAULT_JSON = `[
  {"key":"billing.invoice.title","en-US":"Invoice {invoiceNumber}","fr-FR":"Facture {invoiceNo}","de-DE":"Rechnung {invoiceNumber}"},
  {"key":"common.cta.save","en-US":"","fr-FR":"Enregistrer","it-IT":"Lo scambio con numero del Contact Center non è consentito.","zh-CN":"保存 "},
  {"key":"errors.network","en-US":"Network error. Try again.","fr-FR":"","zh-CN":"网络错误。请重试。"}
]`;

const UI_STRINGS = {
  zh: {
    appTitle: "Translation Checker Pro",
    appSubtitle: "深度语言学质量评估 (Linguistic QA)",
    inputData: "输入数据",
    runAnalysis: "运行分析",
    linguisticAudit: "语言学审计 (AI)",
    rules: "活动规则",
    resultsTab: "分析结果",
    aiTab: "Gemini 审计专家",
    parsedToast: (count: number) => `已解析 ${count} 个条目。`,
    analyzeDone: (count: number) => `完成。发现 ${count} 个规则违规。`,
    noItemsAudit: "没有条目可供审计。",
    noIssues: "没有问题。",
    copyReportOk: "分析报告已复制到剪贴板",
    copyLiteOk: "精简简报已复制 (按语种分组)",
    copyFail: "复制失败",
    copyAiOk: "审计内容已复制到剪贴板",
    noContentExport: "无内容可导出",
    exportOk: "审计报告已导出",
    searchPlaceholder: "搜索 key 或内容...",
    allIssues: "所有问题",
    criticalOnly: "仅致命错误",
    highPlus: "高严重性及以上",
    liteReport: "复制精简报告 (Lite)",
    fullReport: "复制完整报告 (MD)",
    exportReport: "导出报告",
    copyContent: "复制内容",
    exportAiReport: "导出报告",
    welcomeAi: "欢迎使用 AI 审计助手。我可以审查翻译的语法、风格和文化细微差别——即使没有源文也可以进行评估。",
    runAuditBtn: "🚀 运行深度质量审计报告",
    fixIssuesBtn: "🛠 自动修复规则违规",
    inputPlaceholder: "向专家咨询语言建议...",
    generating: "正在生成审计报告...",
    source: "源文",
    target: "目标",
    fix: "修复",
    unilingualTag: "单语评估模式 (Unilingual)",
    aiRoleDesc: "你是一名世界级的资深本地化质量审计专家，擅长多语种本地化审计与评估。",
    aiHelpDesc: "你是一名本地化专家。请使用简体中文提供帮助。",
    analysisWait: "...",
    allLanguages: "所有语言"
  },
  en: {
    appTitle: "Translation Checker Pro",
    appSubtitle: "Deep Linguistic QA",
    inputData: "Input Data",
    runAnalysis: "Run Analysis",
    linguisticAudit: "Linguistic Audit (AI)",
    rules: "Active Rules",
    resultsTab: "Analysis Results",
    aiTab: "Gemini Audit Expert",
    parsedToast: (count: number) => `Parsed ${count} items.`,
    analyzeDone: (count: number) => `Done. Found ${count} rule violations.`,
    noItemsAudit: "No items to audit.",
    noIssues: "No issues.",
    copyReportOk: "Report copied to clipboard",
    copyLiteOk: "Lite report copied (Grouped by Locale)",
    copyFail: "Copy failed",
    copyAiOk: "Audit content copied to clipboard",
    noContentExport: "No content to export",
    exportOk: "Audit report exported",
    searchPlaceholder: "Search key or content...",
    allIssues: "All Issues",
    criticalOnly: "Critical Only",
    highPlus: "High Severity+",
    liteReport: "Copy Lite Report",
    fullReport: "Copy Full Report (MD)",
    exportReport: "Export Report",
    copyContent: "Copy Content",
    exportAiReport: "Export Report",
    welcomeAi: "Welcome to the AI Audit Assistant. I can review translation grammar, style, and cultural nuances—even without source text.",
    runAuditBtn: "🚀 Run Deep Quality Audit Report",
    fixIssuesBtn: "🛠 Auto-fix Rule Violations",
    inputPlaceholder: "Ask expert for linguistic advice...",
    generating: "Generating audit report...",
    source: "Source",
    target: "Target",
    fix: "Fix",
    unilingualTag: "Unilingual Mode",
    aiRoleDesc: "You are a world-class senior localization quality audit expert, specializing in multilingual localization audit and assessment.",
    aiHelpDesc: "You are a localization expert. Please provide help in English.",
    analysisWait: "...",
    allLanguages: "All Languages"
  }
};

export default function App() {
  // --- State ---
  const [uiLanguage, setUiLanguage] = useState<'zh' | 'en'>('zh');
  const [rawText, setRawText] = useState(DEFAULT_JSON);
  const [sourceLocale, setSourceLocale] = useState('en-US');
  const [targetLocales, setTargetLocales] = useState<string[]>([]);
  const [parsedItems, setParsedItems] = useState<TranslationItem[]>([]);
  const [locales, setLocales] = useState<string[]>([]);
  const [issues, setIssues] = useState<AppState['issues']>([]);
  const [ignoredIssues, setIgnoredIssues] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'results' | 'ai'>('results');
  const [toasts, setToasts] = useState<{id: number, msg: string, type: 'ok'|'warn'|'bad'|'info'}[]>([]);
  
  // Filters
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterLocale, setFilterLocale] = useState<string>('all');
  const [filterText, setFilterText] = useState('');
  
  // AI State
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash-exp');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Analysis Options
  const [options, setOptions] = useState<AnalysisOptions>({
    ignoreCase: false,
    trim: true,
    allowVariants: true,
  });

  // Rules State
  const [rules, setRules] = useState<Rule[]>([]);
  const [enabledRuleIds, setEnabledRuleIds] = useState<Set<string>>(new Set());

  // --- Effects ---
  useEffect(() => {
    const defaultRules = createDefaultRules(sourceLocale, options, uiLanguage);
    setRules(defaultRules);
    setEnabledRuleIds(new Set(defaultRules.map(r => r.id)));
    listModels().then(setAvailableModels);
  }, [sourceLocale, options, uiLanguage]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // --- Helpers ---
  const ui = UI_STRINGS[uiLanguage];

  const addToast = (msg: string, type: 'ok'|'warn'|'bad'|'info' = 'info') => {
    setToasts(prev => [...prev, { id: Date.now(), msg, type }]);
  };

  const handleParse = useCallback(() => {
    try {
      const { items, locales: detectedLocales } = parseAndNormalize(rawText);
      setParsedItems(items);
      setLocales(detectedLocales);
      
      const likelySource = detectedLocales.includes('en-US') ? 'en-US' : detectedLocales[0] || 'en-US';
      if (!detectedLocales.includes(sourceLocale)) {
        setSourceLocale(likelySource);
      }
      setTargetLocales(detectedLocales.filter(l => l !== likelySource));
      addToast(ui.parsedToast(items.length), 'ok');
    } catch (e: any) {
      addToast(e.message, 'bad');
    }
  }, [rawText, sourceLocale, ui]);

  const handleAnalyze = useCallback(async () => {
    handleParse();
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 50));

    try {
      const { items, locales: allLocales } = parseAndNormalize(rawText);
      const keyLineMap = buildKeyLineMap(rawText);
      const currentRules = createDefaultRules(sourceLocale, options, uiLanguage);
      const activeRules = currentRules.filter(r => enabledRuleIds.has(r.id));
      
      const newIssues: AppState['issues'] = [];
      const targets = targetLocales.length > 0 ? targetLocales : allLocales.filter(l => l !== sourceLocale);

      items.forEach((item, idx) => {
        const key = item.key;
        const srcValue = item[sourceLocale] || "";
        const line = keyLineMap[key] || (idx + 1);

        [sourceLocale, ...targets].forEach(locale => {
           const val = item[locale] || "";
           activeRules.forEach(rule => {
             const res = rule.check({ key, locale, value: val, srcValue, item, allLocales: allLocales });
             if (res) {
               newIssues.push({
                 id: Math.random().toString(36).slice(2),
                 ruleId: rule.id,
                 ruleName: rule.name,
                 severity: rule.severity,
                 key,
                 locale,
                 itemIndex: idx + 1,
                 lineNumber: line,
                 sourceValue: srcValue,
                 currentValue: val,
                 title: res.title,
                 explanation: res.explanation,
                 suggestion: res.suggestion,
                 createdAt: Date.now()
               });
             }
           });
        });
      });

      setIssues(newIssues);
      setIgnoredIssues(new Set());
      addToast(ui.analyzeDone(newIssues.length), 'ok');
      setActiveTab('results');
    } catch (e: any) {
      addToast(e.message, 'bad');
    } finally {
      setIsAnalyzing(false);
    }
  }, [rawText, sourceLocale, targetLocales, options, enabledRuleIds, handleParse, uiLanguage, ui]);

  const handleLinguisticAudit = async () => {
    const activeItems = parsedItems.slice(0, 15); // Batch limit for performance
    if (activeItems.length === 0) {
      addToast(ui.noItemsAudit, 'warn');
      return;
    }

    const promptZh = `请对以下 JSON 本地化数据进行深度语言质量审计。
请严格使用简体中文输出一份结构化的 Markdown 报告。

评估维度：
1. 语法准确性 (Grammar Accuracy)：检查语法错误、句式结构问题
2. 用词恰当性 (Word Choice Appropriateness)：评估词汇选择的准确性和适用性
3. 表达流畅性 (Fluency)：评估语言表达的自然度和可读性
4. 术语一致性 (Terminology Consistency)：检查专业术语使用的统一性
5. 语言风格 (Style & Tone)：评估语言风格是否符合目标受众
6. 文化适应性 (Cultural Adaptability)：检查是否存在文化适应问题

注意：如果英文源文 (en-US) 缺失，请将目标语言作为独立文本进行质量评估。

待审计数据：${JSON.stringify(activeItems)}

输出要求：
- 请使用简体中文撰写报告。
- 针对具体的 key 提出改进建议。`;

    const promptEn = `Please perform a deep linguistic quality audit on the following JSON localization data.
Please strictly output a structured Markdown report in English.

Evaluation Dimensions:
1. Grammar Accuracy: Check for grammar errors and sentence structure issues.
2. Word Choice Appropriateness: Evaluate the accuracy and suitability of vocabulary.
3. Fluency: Evaluate the naturalness and readability of the language.
4. Terminology Consistency: Check for consistency in professional terminology.
5. Style & Tone: Evaluate if the style fits the target audience.
6. Cultural Adaptability: Check for cultural appropriateness.

Note: If source text (en-US) is missing, evaluate the target language as standalone text.

Data to Audit: ${JSON.stringify(activeItems)}

Output Requirements:
- Write the report in English.
- Provide specific improvement suggestions for specific keys.`;

    const prompt = uiLanguage === 'zh' ? promptZh : promptEn;

    setChatHistory(prev => [...prev, { role: 'user', text: prompt }]);
    setActiveTab('ai');
    setIsAiGenerating(true);

    try {
      let fullResponse = "";
      const stream = generateContentStream(aiModel, chatHistory, prompt, ui.aiRoleDesc);
      setChatHistory(prev => [...prev, { role: 'model', text: ui.generating }]);
      
      for await (const chunk of stream) {
        fullResponse += chunk;
        setChatHistory(prev => {
          const newH = [...prev];
          newH[newH.length - 1].text = fullResponse;
          return newH;
        });
      }
    } catch (e: any) {
      addToast(e.message, 'bad');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleAiSend = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAiGenerating(true);

    try {
      let fullResponse = "";
      const stream = generateContentStream(aiModel, chatHistory, userMsg, ui.aiHelpDesc);
      setChatHistory(prev => [...prev, { role: 'model', text: ui.analysisWait }]);
      for await (const chunk of stream) {
        fullResponse += chunk;
        setChatHistory(prev => {
          const newH = [...prev];
          newH[newH.length - 1].text = fullResponse;
          return newH;
        });
      }
    } catch (e: any) {
       addToast(e.message, 'bad');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleGeneratePatch = async () => {
    const visibleIssues = issues.filter(i => !ignoredIssues.has(i.id));
    if (visibleIssues.length === 0) { addToast(ui.noIssues, 'warn'); return; }

    const promptZh = `修复这些翻译问题。如果源文缺失，请优化目标语言的文本质量（流畅度、语法）。请输出 JSON patch 格式：{"patches": [{"key": "...", "locale": "...", "value": "..."}]}。 \n\n问题列表: ${JSON.stringify(visibleIssues.slice(0, 15))}`;
    const promptEn = `Fix these translation issues. If source is missing, optimize target text quality (fluency, grammar). Output in JSON patch format: {"patches": [{"key": "...", "locale": "...", "value": "..."}]}。 \n\nIssue List: ${JSON.stringify(visibleIssues.slice(0, 15))}`;
    
    const prompt = uiLanguage === 'zh' ? promptZh : promptEn;

    setIsAiGenerating(true);
    try {
      const resp = await generateContent(aiModel, prompt, undefined, true);
      setChatHistory(prev => [...prev, { role: 'user', text: ui.fixIssuesBtn }, { role: 'model', text: resp }]);
    } catch (e: any) {
      addToast(e.message, 'bad');
    } finally { setIsAiGenerating(false); }
  };

  const generateReportContent = () => {
    const visibleIssues = issues.filter(i => {
      if (ignoredIssues.has(i.id)) return false;
      if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
      if (filterLocale !== 'all' && i.locale !== filterLocale) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        return i.key.toLowerCase().includes(t) || i.title.toLowerCase().includes(t) || i.currentValue.toLowerCase().includes(t);
      }
      return true;
    });

    if (visibleIssues.length === 0) {
      if (uiLanguage === 'zh') {
        return `# 本地化质量评估报告
生成时间: ${new Date().toLocaleString()}

## 总体状态
✅ **未发现问题**

## 分析
- **流程成熟度**: 零缺陷结果验证了当前本地化流程和预防性维护策略的有效性。
- **降低风险**: 此结果显著降低了与本地化错误相关的潜在停机和返工成本。
- **资源效率**: 没有检测到缺陷，团队可以将资源分配给持续改进而不是修复。`;
      } else {
        return `# Localization QA Report
Generated: ${new Date().toLocaleString()}

## Overall Status
✅ **No issues found**

## Analysis
- **Process Maturity**: The zero-defect result validates the effectiveness of current localization procedures and preventive maintenance strategies.
- **Risk Reduction**: This outcome significantly minimizes potential downtime and rework costs associated with localization errors.
- **Resource Efficiency**: The absence of detected defects allows the team to allocate resources towards continuous improvement rather than remediation.`;
      }
    }
    
    const header = uiLanguage === 'zh' ? 
      `# 本地化质量评估报告\n生成时间: ${new Date().toLocaleString()}\n\n` :
      `# Localization QA Report\nGenerated: ${new Date().toLocaleString()}\n\n`;

    return header + visibleIssues.map(i => 
      `## ${i.key}\n- **${uiLanguage==='zh'?'语言':'Locale'}**: ${i.locale}\n- **${uiLanguage==='zh'?'严重性':'Severity'}**: ${i.severity.toUpperCase()}\n- **${uiLanguage==='zh'?'规则':'Rule'}**: ${i.ruleName}\n- **${uiLanguage==='zh'?'问题':'Issue'}**: ${i.title}\n- **${uiLanguage==='zh'?'解释':'Explanation'}**: ${i.explanation}\n- **${uiLanguage==='zh'?'当前值':'Current'}**: \`${i.currentValue}\`\n- **${uiLanguage==='zh'?'建议':'Suggestion'}**: \`${i.suggestion || 'N/A'}\``
    ).join('\n\n');
  };

  const generateLiteContent = () => {
    const visibleIssues = issues.filter(i => {
      if (ignoredIssues.has(i.id)) return false;
      if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
      if (filterLocale !== 'all' && i.locale !== filterLocale) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        return i.key.toLowerCase().includes(t) || i.title.toLowerCase().includes(t) || i.currentValue.toLowerCase().includes(t);
      }
      return true;
    });

    if (visibleIssues.length === 0) {
        if (uiLanguage === 'zh') {
           return `质量检查简报:
总体:
未发现问题。

分析:
• 流程成熟度: 零缺陷结果验证了有效性。
• 降低风险: 最小化返工成本。
• 资源效率: 无缺陷。`;
        } else {
           return `Sanity Checker Report:
Overall:
No issues found.

Analysis:
• Process Maturity: The zero-defect result validates the effectiveness.
• Risk Reduction: Minimizes rework costs.
• Resource Efficiency: No defects detected.`;
        }
    }

    const groupedIssues: Record<string, typeof issues> = {};
    const categoriesSet = new Set<string>();

    visibleIssues.forEach(issue => {
      if (!groupedIssues[issue.locale]) {
        groupedIssues[issue.locale] = [];
      }
      groupedIssues[issue.locale].push(issue);
      categoriesSet.add(issue.title);
    });

    const affectedLocales = Object.keys(groupedIssues).sort();
    const categories = Array.from(categoriesSet).sort();

    // Generate Header Summary
    let output = uiLanguage === 'zh' ? "质量检查简报:\n" : "Sanity Checker Report:\n";
    output += uiLanguage === 'zh' ? "总体:\n" : "Overall:\n";
    output += uiLanguage === 'zh' 
      ? `共 ${affectedLocales.length} 种语言存在问题:  ${affectedLocales.join(" / ")} / \n`
      : `Total ${affectedLocales.length} languages have issues:  ${affectedLocales.join(" / ")} / \n`;
    output += uiLanguage === 'zh'
      ? `共 ${categories.length} 类问题: ${categories.join(", ")} \n`
      : `Total ${categories.length} issue categories: ${categories.join(", ")} \n`;

    // Generate output organized by language blocks
    Object.entries(groupedIssues).sort((a, b) => a[0].localeCompare(b[0])).forEach(([locale, localeIssues]) => {
      output += `========================================\n`;
      output += uiLanguage === 'zh' ? `目标语言: ${locale}\n` : `Target Language: ${locale}\n`;
      output += uiLanguage === 'zh' ? `发现问题数: ${localeIssues.length}\n` : `Issues Found: ${localeIssues.length}\n`;
      output += `========================================\n\n`;

      output += localeIssues.map(i => 
        `${i.key}\n● ${uiLanguage==='zh'?'问题':'Issue'}: ${i.title}\n● ${uiLanguage==='zh'?'源文':'Source'}: ${i.sourceValue || 'N/A'}\n● ${uiLanguage==='zh'?'目标':'Target'}: ${i.currentValue}`
      ).join('\n\n');

      output += "\n\n\n";
    });

    return output.trim();
  };

  const handleCopyReport = async () => {
    const content = generateReportContent();
    try {
      await navigator.clipboard.writeText(content);
      addToast(ui.copyReportOk, "ok");
    } catch (err) {
      addToast(ui.copyFail, "bad");
    }
  };

  const handleCopyLite = async () => {
    const content = generateLiteContent();
    if (!content) {
      addToast(ui.noContentExport, "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      addToast(ui.copyLiteOk, "ok");
    } catch (err) {
      addToast(ui.copyFail, "bad");
    }
  };

  const downloadReport = () => {
    const content = generateReportContent();
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'qa_report.md';
    a.click();
  };

  const handleCopyAiReport = async () => {
    if (chatHistory.length === 0) {
      addToast(ui.noContentExport, "warn");
      return;
    }

    const textContent = chatHistory.map(msg => {
      const role = msg.role === 'user' ? 'USER' : 'GEMINI AUDIT EXPERT';
      return `[${role}]\n${msg.text}\n`;
    }).join('\n----------------------------------------\n\n');

    try {
      await navigator.clipboard.writeText(textContent);
      addToast(ui.copyAiOk, "ok");
    } catch (err) {
      addToast(ui.copyFail, "bad");
    }
  };

  const handleDownloadAiReport = () => {
    if (chatHistory.length === 0) {
      addToast(ui.noContentExport, "warn");
      return;
    }

    const rTitle = uiLanguage === 'zh' ? "语言学审计报告" : "Linguistic Audit Report";
    const rGen = uiLanguage === 'zh' ? "生成时间" : "Generated";

    const htmlContent = `<!DOCTYPE html>
<html lang="${uiLanguage === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${rTitle} - Translation Checker Pro</title>
<style>
  body { background-color: #0b0f19; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin: 0; padding: 20px; }
  .container { max-width: 900px; margin: 0 auto; }
  .header { text-align: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { color: #818cf8; margin: 0 0 10px 0; font-size: 24px; }
  .meta { color: #64748b; font-size: 12px; }
  .message-row { display: flex; margin-bottom: 24px; }
  .message-row.user { justify-content: flex-end; }
  .message-row.model { justify-content: flex-start; }
  .bubble { max-width: 85%; padding: 16px; border-radius: 12px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
  .user .bubble { background-color: #4f46e5; color: white; border-bottom-right-radius: 2px; }
  .model .bubble { background-color: #1e293b; color: #cbd5e1; border: 1px solid #334155; border-bottom-left-radius: 2px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .role { font-size: 11px; margin-bottom: 6px; font-weight: bold; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${rTitle}</h1>
    <div class="meta">${rGen}: ${new Date().toLocaleString()}</div>
  </div>
  <div class="chat">
    ${chatHistory.map(msg => `
      <div class="message-row ${msg.role}">
        <div class="bubble">
          <div class="role">${msg.role === 'user' ? 'USER' : 'GEMINI AUDIT EXPERT'}</div>
          ${msg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}
        </div>
      </div>
    `).join('')}
  </div>
</div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linguistic-audit-report-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(ui.exportOk, "ok");
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(i => {
      if (ignoredIssues.has(i.id)) return false;
      if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
      if (filterLocale !== 'all' && i.locale !== filterLocale) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        return i.key.toLowerCase().includes(t) || i.title.toLowerCase().includes(t) || i.currentValue.toLowerCase().includes(t);
      }
      return true;
    });
  }, [issues, ignoredIssues, filterSeverity, filterLocale, filterText]);

  const groupedIssues = useMemo(() => {
    const map = new Map<string, typeof issues>();
    filteredIssues.forEach(i => {
      if (!map.has(i.key)) map.set(i.key, []);
      map.get(i.key)!.push(i);
    });
    return Array.from(map.entries());
  }, [filteredIssues]);

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type} onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
        ))}
      </div>

      {/* --- Left Column --- */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <header className="mb-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">{ui.appTitle}</h1>
            <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400" /> {ui.appSubtitle}
            </p>
          </div>
          <button 
            onClick={() => setUiLanguage(l => l === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs border border-slate-700 transition font-mono"
            title="Switch Language / 切换语言"
          >
            <Languages size={14} /> {uiLanguage === 'zh' ? 'EN' : '中文'}
          </button>
        </header>

        <section className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
              <FileCode size={18} className="text-blue-400"/> {ui.inputData}
            </h2>
          </div>
          <div className="p-4 space-y-4">
            <textarea 
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[10px] text-slate-400 focus:outline-none focus:border-blue-500/50 transition resize-y"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={handleAnalyze} disabled={isAnalyzing} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-lg shadow-indigo-900/20">
                <Play size={16} className={isAnalyzing ? "animate-spin" : ""}/> {ui.runAnalysis}
              </button>
              <button onClick={handleLinguisticAudit} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 transition flex items-center gap-2">
                <Microscope size={16} className="text-emerald-400"/> {ui.linguisticAudit}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400"/> {ui.rules}
            </h2>
          </div>
          <div className="p-2 max-h-48 overflow-y-auto space-y-1">
             {rules.map(r => (
               <div key={r.id} className="flex items-start gap-3 p-2 hover:bg-slate-800/50 rounded transition group">
                 <input type="checkbox" checked={enabledRuleIds.has(r.id)} onChange={() => {
                   const next = new Set(enabledRuleIds);
                   if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                   setEnabledRuleIds(next);
                 }} className="mt-1" />
                 <div className="flex-1">
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-slate-300 group-hover:text-white transition">{r.name}</span>
                     <span className={`text-[9px] px-1 rounded uppercase font-bold ${r.severity === 'critical' ? 'text-rose-400 bg-rose-400/10' : 'text-slate-500 bg-slate-800'}`}>{r.severity}</span>
                   </div>
                   <p className="text-[10px] text-slate-500 leading-tight">{r.description}</p>
                 </div>
               </div>
             ))}
          </div>
        </section>
      </div>

      {/* --- Right Column --- */}
      <div className="lg:col-span-7 flex flex-col h-[calc(100vh-3rem)] sticky top-6">
        <div className="flex gap-2 mb-4 bg-slate-900/80 p-1 rounded-lg border border-slate-800 w-fit">
          <button onClick={() => setActiveTab('results')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'results' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>{ui.resultsTab}</button>
          <button onClick={() => setActiveTab('ai')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'ai' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>{ui.aiTab}</button>
        </div>

        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-0">
          {activeTab === 'results' && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800">
                <Stats issues={filteredIssues} ignoredIds={ignoredIssues} uiLanguage={uiLanguage} />
                <div className="flex flex-wrap gap-2 items-center mt-4">
                   <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-400 outline-none">
                     <option value="all">{ui.allIssues}</option>
                     <option value="critical">{ui.criticalOnly}</option>
                     <option value="high">{ui.highPlus}</option>
                   </select>

                   <div className="relative">
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Globe size={12} className="text-slate-500"/>
                      </div>
                      <select value={filterLocale} onChange={(e) => setFilterLocale(e.target.value)} className="bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-400 outline-none appearance-none hover:border-slate-700 transition cursor-pointer">
                        <option value="all">{ui.allLanguages}</option>
                        {targetLocales.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                   </div>

                   <input type="text" placeholder={ui.searchPlaceholder} value={filterText} onChange={(e) => setFilterText(e.target.value)} className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-400 outline-none flex-1" />
                   <button onClick={handleCopyLite} className="p-2 text-slate-500 hover:text-white transition" title={ui.liteReport}><ClipboardList size={18}/></button>
                   <button onClick={handleCopyReport} className="p-2 text-slate-500 hover:text-white transition" title={ui.fullReport}><Copy size={18}/></button>
                   <button onClick={downloadReport} className="p-2 text-slate-500 hover:text-white transition" title={ui.exportReport}><Download size={18}/></button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {groupedIssues.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                     <Microscope size={48} className="mb-4 opacity-20"/>
                     <p>{uiLanguage === 'zh' ? '运行分析以查看本地化问题。' : 'Run analysis to view localization issues.'}</p>
                  </div>
                ) : (
                  groupedIssues.map(([key, groupIssues]) => (
                    <div key={key} className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
                      <div className="p-3 bg-slate-800/60 flex justify-between items-center">
                        <span className="font-mono text-[10px] text-blue-300/80 truncate font-semibold flex-1">{key}</span>
                        {!groupIssues.some(i => i.sourceValue) && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 rounded uppercase font-bold tracking-wider">{ui.unilingualTag}</span>}
                      </div>
                      <div className="divide-y divide-slate-800/50">
                        {groupIssues.map(issue => (
                          <div key={issue.id} className="p-3 bg-slate-900/10 hover:bg-slate-900/40 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400">{issue.locale}</span>
                                <span className={`text-[9px] px-1 rounded uppercase font-bold ${issue.severity === 'critical' ? 'text-rose-400 bg-rose-400/10' : 'text-slate-500 bg-slate-800'}`}>{issue.ruleName}</span>
                              </div>
                              <button onClick={() => setIgnoredIssues(prev => new Set(prev).add(issue.id))} className="text-slate-600 hover:text-rose-400 transition"><Trash2 size={12}/></button>
                            </div>
                            <p className="text-[11px] text-slate-300 mb-1">{issue.title}</p>
                            <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">{issue.explanation}</p>
                            <div className="bg-slate-950/50 p-2 rounded border border-slate-800/50 space-y-2">
                              {issue.sourceValue && (
                                <div className="grid grid-cols-[50px_1fr] gap-2 items-start">
                                  <span className="text-[9px] text-slate-600 text-right mt-0.5">{ui.source}</span>
                                  <span className="text-[10px] font-mono text-slate-400 break-all">{issue.sourceValue}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-[50px_1fr] gap-2 items-start">
                                <span className="text-[9px] text-blue-500 text-right mt-0.5">{ui.target}</span>
                                <span className="text-[10px] font-mono text-slate-200 break-all">{issue.currentValue}</span>
                              </div>
                              {issue.suggestion && (
                                <div className="grid grid-cols-[50px_1fr] gap-2 items-start pt-1 border-t border-slate-800">
                                  <span className="text-[9px] text-emerald-500 text-right mt-0.5">{ui.fix}</span>
                                  <span className="text-[10px] text-emerald-300 break-all">{issue.suggestion}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="flex flex-col h-full bg-slate-950">
               <div className="p-3 bg-indigo-900/10 border-b border-indigo-900/30 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                   <Wand2 size={16} className="text-indigo-400"/>
                   <span className="text-sm font-semibold text-indigo-100">{ui.aiTab}</span>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={handleCopyAiReport} className="text-xs flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition" title={ui.copyContent}>
                      <Copy size={14} /> {ui.copyContent}
                    </button>
                    <button onClick={handleDownloadAiReport} className="text-xs flex items-center gap-1 px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded transition" title={ui.exportAiReport}>
                      <Download size={14} /> {ui.exportAiReport}
                    </button>
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto p-4 space-y-6">
                 {chatHistory.length === 0 && (
                   <div className="text-center text-slate-500 mt-12 px-8 space-y-6">
                     <Microscope size={48} className="mx-auto opacity-10" />
                     <p className="text-sm">{ui.welcomeAi}</p>
                     <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={handleLinguisticAudit} className="px-4 py-2 bg-indigo-600/20 text-indigo-300 rounded-full text-xs border border-indigo-600/30 hover:bg-indigo-600/40 transition">{ui.runAuditBtn}</button>
                        <button onClick={handleGeneratePatch} className="px-4 py-2 bg-slate-800 text-slate-400 rounded-full text-xs border border-slate-700 hover:text-white transition">{ui.fixIssuesBtn}</button>
                     </div>
                   </div>
                 )}
                 {chatHistory.map((msg, i) => (
                   <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[90%] rounded-xl p-4 text-[12px] leading-relaxed whitespace-pre-wrap ${
                       msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-900 text-slate-300 rounded-bl-none border border-slate-800 shadow-xl shadow-black/50'
                     }`}>
                       {msg.text}
                     </div>
                   </div>
                 ))}
                 <div ref={chatBottomRef}/>
               </div>
               <div className="p-4 bg-slate-900/80 border-t border-slate-800">
                 <div className="flex gap-2">
                   <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isAiGenerating && handleAiSend()} placeholder={ui.inputPlaceholder} disabled={isAiGenerating} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 transition" />
                   <button onClick={handleAiSend} disabled={isAiGenerating || !chatInput} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-2 rounded-lg transition">
                     <ChevronRight size={20}/>
                   </button>
                 </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}