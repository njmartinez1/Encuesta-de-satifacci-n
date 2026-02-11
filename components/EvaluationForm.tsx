
import React, { useState } from 'react';
import { Employee, Evaluation, Question } from '../types.ts';
import { Save } from 'lucide-react';
import { useModal } from './ModalProvider.tsx';
import { DEFAULT_SCALE_SCORE_VALUES, getScaleScore } from '../scoreUtils.ts';

console.log("--> [EvaluationForm.tsx] Módulo cargado");

interface Props {
  evaluatorId: string;
  targetEmployee: Employee;
  questions: Question[];
  sectionTitle?: string;
  sectionDescription?: string;
  initialAnswers?: { [key: number]: number | string };
  initialComments?: string;
  onSave: (evaluation: Evaluation) => Promise<boolean>;
}

const normalizeOptionLabel = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const NON_SCORING_OPTION_LABELS = [
  'no uso la plataforma',
  'no he presentado solicitudes de reembolso',
];
const isNonScoringOptionLabel = (label: string) =>
  NON_SCORING_OPTION_LABELS.some(term => normalizeOptionLabel(label).includes(term));

const SCALE_LABEL_VALUES: Record<string, number> = {
  'totalmente en desacuerdo': -1,
  'completamente en desacuerdo': -1,
  'en desacuerdo': -0.75,
  'de acuerdo': 0.75,
  'totalmente de acuerdo': 1,
  'completamente de acuerdo': 1,
};

const getScoreForOption = (options: string[], optionIndex: number) => {
  const hasNonScoring = options.some(label => isNonScoringOptionLabel(label));
  const normalizedLabel = normalizeOptionLabel(options[optionIndex] || '');
  const mappedByLabel = SCALE_LABEL_VALUES[normalizedLabel];
  if (typeof mappedByLabel === 'number') return mappedByLabel;
  const scoringOptions = options.filter(label => !isNonScoringOptionLabel(label));
  if (hasNonScoring && scoringOptions.length === DEFAULT_SCALE_SCORE_VALUES.length) {
    const scoringIndex = options
      .slice(0, optionIndex)
      .filter(label => !isNonScoringOptionLabel(label)).length;
    const mapped = DEFAULT_SCALE_SCORE_VALUES[scoringIndex];
    if (typeof mapped === 'number') return mapped;
    return getScaleScore(scoringIndex, scoringOptions.length);
  }
  return getScaleScore(optionIndex, options.length);
};

const EvaluationForm: React.FC<Props> = ({ evaluatorId, targetEmployee, questions, sectionTitle, sectionDescription, initialAnswers, initialComments, onSave }) => {
  const { showAlert } = useModal();
  const buildInitialAnswers = () => {
    if (!initialAnswers) return {};
    const mapped: { [key: number]: number | string } = { ...initialAnswers };
    questions.forEach((question) => {
      if (question.type === 'text') return;
      if (!question.options || question.options.length === 0) return;
      const noUseIndex = question.options.findIndex(option => isNonScoringOptionLabel(option));
      if (noUseIndex < 0) return;
      const noUseScore = getScaleScore(noUseIndex, question.options.length);
      if (mapped[question.id] === noUseScore) {
        mapped[question.id] = question.options[noUseIndex];
      }
    });
    return mapped;
  };
  const [answers, setAnswers] = useState<{ [key: number]: number | string }>(() => buildInitialAnswers());
  const [comments, setComments] = useState(() => initialComments ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAnswerChange = (questionId: number, value: number | string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const isQuestionAnswered = (question: Question, value: number | string | undefined) => {
    if (question.type === 'text') {
      return typeof value === 'string' && value.trim().length > 0;
    }
    if (typeof value === 'number') return true;
    return typeof value === 'string' && value.trim().length > 0;
  };
  const requiredQuestions = questions.filter(question => question.isRequired);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (questions.length === 0) {
      showAlert("No hay preguntas asignadas para este evaluador.");
      return;
    }
    const hasAllRequiredAnswers = requiredQuestions.every(question =>
      isQuestionAnswered(question, answers[question.id])
    );
    if (!hasAllRequiredAnswers) {
      showAlert("Por favor, responde las preguntas obligatorias antes de continuar.");
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

  const answeredCount = requiredQuestions.filter(question =>
    isQuestionAnswered(question, answers[question.id])
  ).length;
  const progress = requiredQuestions.length > 0
    ? Math.round((answeredCount / requiredQuestions.length) * 100)
    : 100;
  const defaultScaleOptions = [
    'Totalmente en desacuerdo',
    'En desacuerdo',
    'De acuerdo',
    'Totalmente de acuerdo',
  ];

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="bg-[var(--color-primary)] p-6 text-white">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-bold">Evaluando a {targetEmployee.name}</h2>
            <p className="text-[var(--color-primary-soft)] opacity-80">{targetEmployee.role}</p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold">{progress}%</span>
          </div>
        </div>
        <div className="w-full bg-[var(--color-primary)] rounded-full h-2">
          <div className="bg-white h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8">
        {sectionTitle ? (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-800">{sectionTitle}</h3>
            {sectionDescription ? (
              <p className="text-sm text-slate-500 mt-1">{sectionDescription}</p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-10">
          {questions.map((q, index) => {
            const isTextQuestion = q.type === 'text';
            const scaleOptions = q.options && q.options.length > 0 ? q.options : defaultScaleOptions;
            return (
              <div key={q.id} className="border-b border-slate-100 pb-8 last:border-0">
                <div className="flex items-start gap-4 mb-5">
                  <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold">{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-medium text-slate-800">{q.text}</h3>
                      {!q.isRequired && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-700">Opcional</span>
                      )}
                    </div>
                  </div>
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
                  <div
                    className="grid gap-2 w-full"
                    style={{ gridTemplateColumns: `repeat(${scaleOptions.length}, minmax(0, 1fr))` }}
                  >
                    {scaleOptions.map((label, optionIndex) => {
                      const isNonScoringOption = isNonScoringOptionLabel(label);
                      const optionValue = isNonScoringOption
                        ? label
                        : getScoreForOption(scaleOptions, optionIndex);
                      const isSelected = answers[q.id] === optionValue;
                      return (
                        <button
                          key={`${q.id}-${optionIndex}`}
                          type="button"
                          onClick={() => handleAnswerChange(q.id, optionValue)}
                          className={`w-full py-3 px-2 text-xs sm:text-sm leading-snug whitespace-normal rounded-lg border-2 transition-all ${isSelected ? 'bg-[var(--color-primary-tint)] border-[var(--color-primary)] text-[var(--color-primary-dark)]' : 'bg-white border-slate-200'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
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
          <button type="submit" disabled={isSubmitting} className="bg-[var(--color-primary)] text-white px-8 py-3 rounded-xl flex items-center gap-2">
            <Save size={20} /> Guardar Evaluación
          </button>
        </div>
      </form>
    </div>
  );
};

export default EvaluationForm;

