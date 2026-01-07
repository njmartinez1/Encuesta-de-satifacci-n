
import React, { useState } from 'react';
import { QUESTIONS } from '../constants.ts';
import { Employee, Evaluation } from '../types.ts';
import { Save } from 'lucide-react';

console.log("--> [EvaluationForm.tsx] Módulo cargado");

interface Props {
  evaluatorId: string;
  targetEmployee: Employee;
  onSave: (evaluation: Evaluation) => void;
}

const EvaluationForm: React.FC<Props> = ({ evaluatorId, targetEmployee, onSave }) => {
  const [answers, setAnswers] = useState<{ [key: number]: number }>({});
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScoreChange = (questionId: number, score: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: score }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(answers).length < QUESTIONS.length) {
      alert("Por favor, responde todas las preguntas antes de continuar.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const evaluation: Evaluation = {
        evaluatorId,
        evaluatedId: targetEmployee.id,
        answers,
        comments,
        timestamp: new Date().toLocaleString()
      };
      onSave(evaluation);
      setIsSubmitting(false);
    }, 800);
  };

  const progress = Math.round((Object.keys(answers).length / QUESTIONS.length) * 100);

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="bg-indigo-600 p-6 text-white">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-bold">Evaluando a {targetEmployee.name}</h2>
            <p className="text-indigo-100 opacity-80">{targetEmployee.role}</p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold">{progress}%</span>
          </div>
        </div>
        <div className="w-full bg-indigo-800 rounded-full h-2">
          <div className="bg-emerald-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="space-y-10">
          {QUESTIONS.map((q, index) => (
            <div key={q.id} className="border-b border-slate-100 pb-8 last:border-0">
              <div className="flex items-start gap-4 mb-5">
                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold">{index + 1}</span>
                <h3 className="text-lg font-medium text-slate-800">{q.text}</h3>
              </div>
              <div className="flex flex-wrap gap-2 max-w-lg">
                {[1, 2, 3, 4, 5].map(score => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => handleScoreChange(q.id, score)}
                    className={`flex-1 py-3 rounded-lg border-2 transition-all ${answers[q.id] === score ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-200'}`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Comentarios adicionales..."
          className="w-full mt-8 p-4 border rounded-xl"
          rows={4}
        />
        <div className="mt-10 flex justify-end">
          <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white px-8 py-3 rounded-xl flex items-center gap-2">
            <Save size={20} /> Guardar Evaluación
          </button>
        </div>
      </form>
    </div>
  );
};

export default EvaluationForm;
