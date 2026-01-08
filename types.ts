export interface Employee {
  id: string;
  name: string;
  role: string;
  email: string;
  isAdmin: boolean;
}

export interface Question {
  id: number;
  text: string;
  category: string;
}

export interface Evaluation {
  evaluatorId: string;
  evaluatedId: string;
  answers: { [questionId: number]: number };
  comments: string;
  timestamp: string;
}

export interface Assignment {
  evaluatorId: string;
  targets: string[]; // List of employee IDs to evaluate
}
