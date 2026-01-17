export interface Employee {
  id: string;
  name: string;
  role: string;
  group: string;
  campus: string;
  email: string;
  isAdmin: boolean;
}

export type QuestionSection = 'peer' | 'internal';
export type QuestionType = 'scale' | 'text';

export interface Question {
  id: number;
  text: string;
  category: string;
  section: QuestionSection;
  type: QuestionType;
  options?: string[];
  sortOrder?: number;
}

export interface QuestionCategory {
  name: string;
  section: QuestionSection;
  sortOrder?: number;
}

export interface QuestionSectionOption {
  value: QuestionSection;
  label: string;
}

export interface Evaluation {
  evaluatorId: string;
  evaluatedId: string;
  answers: { [questionId: number]: number | string };
  comments: string;
  timestamp: string;
}

export interface Assignment {
  evaluatorId: string;
  targets: string[]; // List of employee IDs to evaluate
}



