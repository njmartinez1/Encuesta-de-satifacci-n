
import React, { useState } from 'react';
import { Employee, Evaluation, Question } from '../types.ts';
import { Save } from 'lucide-react';

console.log("--> [EvaluationForm.tsx] Módulo cargado");

interface Props {
  evaluatorId: string;
  targetEmployee: Employee;
  questions: Question[];
  onSave: (evaluation: Evaluation) => Promise<boolean>;
}

const EvaluationForm: React.FC<Props> = ({ evaluatorId, targetEmployee, questions, onSave }) => {
  const [answers, setAnswers] = useState<{ [key: number]: number | string }>({});
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAnswerChange = (questionId: number, value: number | string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (questions.length === 0) {
      alert("No hay preguntas asignadas para este evaluador.");
      return;
    }
    const hasAllAnswers = questions.every(question => {
      const value = answers[question.id];
      if (question.type === 'text') {
        return typeof value === 'string' && value.trim().length > 0;
      }
      return typeof value === 'number';
    });
    if (!hasAllAnswers) {
      alert("Por favor, responde todas las preguntas antes de continuar.");
      return;
    }

    setIsSubmitting(true);
    const evaluation: Evaluation = {
      evaluatorId,
      evaluatedId: targetEmployee.id,
      answers,
      comments,
      timestamp: new Date().toLocaleString()
    };
    try {
      const saved = await onSave(evaluation);
      if (saved) {
        setComments('');
        setAnswers({});
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const answeredCount = questions.filter(question => {
    const value = answers[question.id];
    if (question.type === 'text') {
      return typeof value === 'string' && value.trim().length > 0;
    }
    return typeof value === 'number';
  }).length;
  const progress = questions.length > 0
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;
  const defaultScaleOptions = [
    'Totalmente en desacuerdo',
    'En desacuerdo',
    'De acuerdo',
    'Totalmente de acuerdo',
  ];

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="bg-[#005187] p-6 text-white">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-bold">Evaluando a {targetEmployee.name}</h2>
            <p className="text-[#cfe0ea] opacity-80">{targetEmployee.role}</p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold">{progress}%</span>
          </div>
        </div>
        <div className="w-full bg-[#003a5e] rounded-full h-2">
          <div className="bg-emerald-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="space-y-10">
          {questions.map((q, index) => {
            const isTextQuestion = q.type === 'text';
            const scaleOptions = q.options && q.options.length > 0 ? q.options : defaultScaleOptions;
            return (
              <div key={q.id} className="border-b border-slate-100 pb-8 last:border-0">
                <div className="flex items-start gap-4 mb-5">
                  <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold">{index + 1}</span>
                  <h3 className="text-lg font-medium text-slate-800">{q.text}</h3>
                </div>
                {isTextQuestion ? (
                  <textarea
                    value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Escribe tu respuesta..."
                    className="w-full p-4 border rounded-xl"
                    rows={3}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
                    {scaleOptions.map((label, optionIndex) => (
                      <button
                        key={`${q.id}-${optionIndex}`}
                        type="button"
                        onClick={() => handleAnswerChange(q.id, optionIndex + 1)}
                        className={`w-full py-3 px-3 text-sm rounded-lg border-2 transition-all ${answers[q.id] === optionIndex + 1 ? 'bg-[#eef5fa] border-[#005187] text-[#00406b]' : 'bg-white border-slate-200'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-8">
          <label className="text-sm font-semibold text-slate-700">Comentarios</label>
          <p className="text-sm text-slate-500 mt-1">
            Valoramos tu opinión, déjanos tus comentarios y sugerencias.
          </p>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Valoramos tu opinión, déjanos tus comentarios y sugerencias."
            className="w-full mt-4 p-4 border rounded-xl"
            rows={4}
          />
        </div>
        <div className="mt-10 flex justify-end">
          <button type="submit" disabled={isSubmitting} className="bg-[#005187] text-white px-8 py-3 rounded-xl flex items-center gap-2">
            <Save size={20} /> Guardar Evaluación
          </button>
        </div>
      </form>
    </div>
  );
};

export default EvaluationForm;

