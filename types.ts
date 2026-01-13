export interface TranslationItem {
  key: string;
  [locale: string]: string;
}

export interface RuleCheckParams {
  key: string;
  locale: string;
  value: string;
  srcValue: string;
  item: TranslationItem;
  allLocales: string[];
}

export interface RuleOutput {
  title: string;
  explanation: string;
  suggestion: string;
}

export interface Rule {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  check: (params: RuleCheckParams) => RuleOutput | null;
}

export interface Issue {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  key: string;
  locale: string;
  itemIndex: number;
  lineNumber: number;
  sourceValue: string;
  currentValue: string;
  title: string;
  explanation: string;
  suggestion: string;
  createdAt: number;
}

export interface AppState {
  rawText: string;
  dataOriginal: TranslationItem[];
  dataWorking: TranslationItem[];
  locales: string[];
  sourceLocale: string;
  targetLocales: string[];
  issues: Issue[];
  ignoredIssueIds: Set<string>;
  lastAnalysisAt: number | null;
}

export interface AnalysisOptions {
  ignoreCase: boolean;
  trim: boolean;
  allowVariants: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
