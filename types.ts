
export interface Employee {
  id: string;
  name: string;
  role: string;
}

export interface Question {
  id: number;
  text: string;
  category: 'Comportamiento' | 'Técnico' | 'Liderazgo' | 'Comunicación';
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
