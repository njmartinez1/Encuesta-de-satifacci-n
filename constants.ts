
import { Employee, Question, Assignment } from './types.ts';

console.log("--> [constants.ts] Módulo cargado");

export const EMPLOYEES: Employee[] = [
  { id: 'emp1', name: 'Empleado 1', role: 'Gerente de Proyectos' },
  { id: 'emp2', name: 'Empleado 2', role: 'Desarrollador Senior' },
  { id: 'emp3', name: 'Empleado 3', role: 'Diseñador UI/UX' },
  { id: 'emp4', name: 'Empleado 4', role: 'QA Engineer' },
  { id: 'emp5', name: 'Empleado 5', role: 'Analista de Negocios' },
];

export const ASSIGNMENTS: Assignment[] = [
  { evaluatorId: 'emp1', targets: ['emp2', 'emp3', 'emp4', 'emp5'] },
  { evaluatorId: 'emp2', targets: ['emp3', 'emp4'] },
  { evaluatorId: 'emp5', targets: ['emp1'] },
];

export const QUESTIONS: Question[] = [
  { id: 1, text: '¿Muestra iniciativa para resolver problemas complejos?', category: 'Técnico' },
  { id: 2, text: '¿Se comunica de manera clara y efectiva con el equipo?', category: 'Comunicación' },
  { id: 3, text: '¿Cumple con las entregas en los plazos acordados?', category: 'Comportamiento' },
  { id: 4, text: '¿Colabora activamente ayudando a sus compañeros?', category: 'Comportamiento' },
  { id: 5, text: '¿Muestra apertura ante críticas constructivas?', category: 'Comunicación' },
  { id: 6, text: '¿Inspira confianza y motiva a los demás?', category: 'Liderazgo' },
  { id: 7, text: '¿Demuestra dominio de las herramientas y tecnologías requeridas?', category: 'Técnico' },
  { id: 8, text: '¿Mantiene una actitud profesional bajo presión?', category: 'Comportamiento' },
  { id: 9, text: '¿Propone ideas innovadoras para mejorar procesos?', category: 'Liderazgo' },
  { id: 10, text: '¿Es puntual y responsable en sus actividades diarias?', category: 'Comportamiento' },
];
