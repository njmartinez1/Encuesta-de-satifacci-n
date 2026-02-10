export type AccessRole = 'educator' | 'viewer' | 'principal' | 'reviewer' | 'admin';

export interface Employee {
  id: string;
  name: string;
  role: string;
  group: string;
  campus: string;
  email: string;
  isAdmin: boolean;
  accessRole?: AccessRole;
}

export type QuestionSection = 'peer' | 'internal';
export type QuestionType = 'scale' | 'text';

export interface Question {
  id: number;
  text: string;
  category: string;
  section: QuestionSection;
  type: QuestionType;
  isRequired: boolean;
  options?: string[];
  sortOrder?: number;
}

export interface QuestionCategory {
  name: string;
  section: QuestionSection;
  sortOrder?: number;
  description?: string | null;
}

export interface QuestionSectionOption {
  value: QuestionSection;
  label: string;
}

export interface Evaluation {
  evaluatorId: string;
  evaluatedId: string;
  periodId?: string | null;
  isAnonymous?: boolean | null;
  answers: { [questionId: number]: number | string };
  comments: string;
  timestamp: string;
}

export interface Assignment {
  evaluatorId: string;
  targets: string[]; // List of employee IDs to evaluate
}

export interface EvaluationPeriod {
  id: string;
  name: string;
  academicYear: string;
  periodNumber: number;
  startsAt: string;
  endsAt: string;
}



