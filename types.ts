
export type AssessmentType = 'goal' | 'intelligence' | 'eq' | 'riasec' | 'readiness';

export interface StudentInfo {
  name: string;
  class: string;
}

export interface CodeAnalysis {
  summary: string;
  bugs: string[];
  optimizations: string[];
  securityConcerns: string[];
  refactoredCode?: string;
}

export interface Assessment {
  key: string;
  title: string;
  icon: string;
  color: string;
  questions: string[];
  options: string[] | string[][];
  type: AssessmentType;
  categories?: string[];
  group1?: number[];
  dimensions?: any;
}

export type ViewState = 'home' | 'info' | 'customInfo' | 'select' | 'assessment' | 'results' | 'sync';
