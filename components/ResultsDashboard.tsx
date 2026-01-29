
import React, { useState, useEffect, useRef } from 'react';
import { Assignment, Evaluation, Employee, Question } from '../types.ts';
import { getScaleRangeFromCount, getScorePercentage, getScaleScore } from '../scoreUtils.ts';
import { analyzeEvaluations } from '../geminiService.ts';
import { Sparkles, BarChart3, TrendingUp, Copy, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useModal } from './ModalProvider.tsx';

interface Props {
  evaluations: Evaluation[];
  employees: Employee[];
  questions: Question[];
  assignments: Assignment[];
  campus?: string | null;
}

const ResultsDashboard: React.FC<Props> = ({ evaluations, employees, questions, assignments, campus }) => {
  const { showAlert } = useModal();
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [viewMode, setViewMode] = useState<'employee' | 'general'>('employee');
  const [selectedCampus, setSelectedCampus] = useState('all');
  const [selectedInternalCategory, setSelectedInternalCategory] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const internalChartRef = useRef<HTMLDivElement>(null);
  const overallPeerChartRef = useRef<HTMLDivElement>(null);
  const overallInternalChartRef = useRef<HTMLDivElement>(null);
  const peerQuestionMap = new Map(
    questions
      .filter(question => question.section === 'peer')
      .map(question => [question.id, question])
  );
  const internalQuestionMap = new Map(
    questions
      .filter(question => question.section === 'internal')
      .map(question => [question.id, question])
  );
  const internalCategories = Array.from(
    new Set(Array.from(internalQuestionMap.values()).map(question => question.category))
  ).sort((a, b) => a.localeCompare(b, 'es'));
  const peerQuestions = questions.filter(question => question.section === 'peer');
  const internalQuestions = questions.filter(question => question.section === 'internal');
  const peerQuestionIds = new Set(peerQuestions.map(question => question.id));
  const internalQuestionIds = new Set(internalQuestions.map(question => question.id));
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
  const isNonScoringAnswer = (question: Question, score: number) => {
    if (!question.options || question.options.length === 0) return false;
    const noUseIndex = question.options.findIndex(option => isNonScoringOptionLabel(option));
    if (noUseIndex < 0) return false;
    return score === getScaleScore(noUseIndex, question.options.length);
  };
  const assignedCountByTarget: Record<string, number> = {};
  assignments.forEach(assignment => {
    assignment.targets.forEach(targetId => {
      assignedCountByTarget[targetId] = (assignedCountByTarget[targetId] || 0) + 1;
    });
  });

  const campusOptions = Array.from(
    new Set(employees.map(emp => (emp.campus || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));
  const normalizedSelectedCampus = selectedCampus.trim().toLowerCase();
  const filteredEmployees = selectedCampus === 'all'
    ? employees
    : employees.filter(emp => (emp.campus || '').trim().toLowerCase() === normalizedSelectedCampus);
  const filteredEmployeeIds = new Set(filteredEmployees.map(emp => emp.id));
  const filteredEvaluations = selectedCampus === 'all'
    ? evaluations
    : evaluations.filter(evaluation =>
        filteredEmployeeIds.has(evaluation.evaluatedId) || filteredEmployeeIds.has(evaluation.evaluatorId)
      );

  const escapeCsvValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const buildEvaluationCsv = (
    evaluationList: Evaluation[],
    questionList: Question[],
    options: { includeAnonymous?: boolean } = {}
  ) => {
    const includeAnonymous = options.includeAnonymous ?? false;
    const headers = [
      'Evaluador',
      'Evaluado',
      ...(includeAnonymous ? ['Anonimo'] : []),
      ...questionList.map(question => question.text),
      'Comentarios',
      'Fecha',
    ];
    const rows = evaluationList.map((evaluation) => {
      const evaluator = employees.find(emp => emp.id === evaluation.evaluatorId)?.name || 'N/A';
      const evaluated = employees.find(emp => emp.id === evaluation.evaluatedId)?.name || 'N/A';
      const anonymity = includeAnonymous ? [evaluation.isAnonymous ? 'Si' : 'No'] : [];
      const answers = questionList.map((question) => {
        const value = evaluation.answers[question.id];
        if (typeof value === 'number') {
          if (isNonScoringAnswer(question, value)) {
            const noUseLabel = question.options?.find(option => isNonScoringOptionLabel(option)) || '';
            return noUseLabel;
          }
          return value;
        }
        if (typeof value === 'string') return value;
        return '';
      });
      return [evaluator, evaluated, ...anonymity, ...answers, evaluation.comments || '', evaluation.timestamp];
    });
    return [headers, ...rows]
      .map(row => row.map(escapeCsvValue).join(','))
      .join('\n');
  };

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.click();
    URL.revokeObjectURL(url);
  };

  const buildFilename = (prefix: string, suffix?: string) => {
    const dateStamp = new Date().toISOString().split('T')[0];
    const safeSuffix = suffix
      ? suffix.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      : '';
    return `${prefix}${safeSuffix ? `_${safeSuffix}` : ''}_${dateStamp}.csv`;
  };

  const filterEvaluationsByQuestions = (questionIds: Set<number>, targetList: Evaluation[] = filteredEvaluations) =>
    targetList.filter(evaluation =>
      Object.keys(evaluation.answers).some(questionId => questionIds.has(Number(questionId)))
    );

  const exportCsv = (
    filename: string,
    evaluationList: Evaluation[],
    questionList: Question[],
    emptyMessage: string,
    options: { includeAnonymous?: boolean } = {}
  ) => {
    if (questionList.length === 0) {
      showAlert('No hay preguntas configuradas para exportar.');
      return;
    }
    if (evaluationList.length === 0) {
      showAlert(emptyMessage);
      return;
    }
    const filteredQuestions = questionList.filter(question =>
      evaluationList.some(evaluation => Object.prototype.hasOwnProperty.call(evaluation.answers, String(question.id)))
    );
    if (filteredQuestions.length === 0) {
      showAlert('No hay respuestas disponibles para exportar.');
      return;
    }
    const csvContent = buildEvaluationCsv(evaluationList, filteredQuestions, options);
    downloadCsv(filename, csvContent);
  };

  const handleExportEmployeePeer = () => {
    if (!selectedEmp) {
      showAlert('Selecciona un empleado para exportar.');
      return;
    }
    const evaluationsForEmployee = filterEvaluationsByQuestions(
      peerQuestionIds,
      filteredEvaluations.filter(evaluation => evaluation.evaluatedId === selectedEmp.id)
    );
    exportCsv(
      buildFilename('evaluaciones_pares', selectedEmp.name),
      evaluationsForEmployee,
      peerQuestions,
      'No hay evaluaciones de pares para este empleado.'
    );
  };

  const handleExportGeneralPeer = () => {
    const relevant = filterEvaluationsByQuestions(peerQuestionIds);
    exportCsv(
      buildFilename('desempeño_general'),
      relevant,
      peerQuestions,
      'No hay evaluaciones de pares registradas.'
    );
  };

  const handleExportGeneralInternal = () => {
    const relevant = filterEvaluationsByQuestions(internalQuestionIds);
    exportCsv(
      buildFilename('satisfacción_interna'),
      relevant,
      internalQuestions,
      'No hay evaluaciones internas registradas.',
      { includeAnonymous: true }
    );
  };

  const isZeroToTenQuestion = (question: Question) => {
    const text = question.text.toLowerCase();
    return text.includes('del 1 al 10') || text.includes('escala del 1 al 10') || text.includes('del 0 al 10') || text.includes('escala del 0 al 10');
  };

  const normalizeZeroToTenValue = (value: number, question: Question) => {
    if (question.options && question.options.length === 11) {
      return value - 1;
    }
    return value;
  };

  const getPointValue = (question: Question, score: number) => {
    if (isZeroToTenQuestion(question)) {
      const normalized = normalizeZeroToTenValue(score, question);
      if (normalized >= 9) return 1;
      if (normalized >= 7) return 0;
      return -1;
    }
    return score;
  };

  const getStatsForEmployee = (empId: string) => {
    const relevant = filteredEvaluations.filter(e => {
      if (e.evaluatedId !== empId) return false;
      return Object.keys(e.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)));
    });
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { sum: number; count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = peerQuestionMap.get(parseInt(qId, 10));
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        const percent = getPercentageForScore(question, score);
        if (typeof percent !== 'number') return;
        if (!categoryScores[question.category]) categoryScores[question.category] = { sum: 0, count: 0 };
        categoryScores[question.category].sum += percent;
        categoryScores[question.category].count += 1;
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      percent: data.count > 0 ? Math.round(data.sum / data.count) : 0,
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getInternalStats = (empId: string) => {
    if (internalQuestionMap.size === 0) return null;
    const relevant = filteredEvaluations.filter(evalu => {
      if (evalu.evaluatedId !== empId) return false;
      return Object.keys(evalu.answers).some(qId => internalQuestionMap.has(parseInt(qId, 10)));
    });
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { sum: number; count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = internalQuestionMap.get(parseInt(qId, 10));
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        const percent = getPercentageForScore(question, score);
        if (typeof percent !== 'number') return;
        if (!categoryScores[question.category]) categoryScores[question.category] = { sum: 0, count: 0 };
        categoryScores[question.category].sum += percent;
        categoryScores[question.category].count += 1;
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      percent: data.count > 0 ? Math.round(data.sum / data.count) : 0,
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getAggregateStats = (questionMap: Map<number, Question>) => {
    if (questionMap.size === 0) return null;
    const relevant = filteredEvaluations.filter(evalu =>
      Object.keys(evalu.answers).some(qId => questionMap.has(parseInt(qId, 10)))
    );
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { sum: number; count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = questionMap.get(parseInt(qId, 10));
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        const percent = getPercentageForScore(question, score);
        if (typeof percent !== 'number') return;
        if (!categoryScores[question.category]) categoryScores[question.category] = { sum: 0, count: 0 };
        categoryScores[question.category].sum += percent;
        categoryScores[question.category].count += 1;
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      percent: data.count > 0 ? Math.round(data.sum / data.count) : 0,
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getQuestionStats = (questionMap: Map<number, Question>) => {
    if (questionMap.size === 0) return null;
    const relevant = filteredEvaluations.filter(evalu =>
      Object.keys(evalu.answers).some(qId => questionMap.has(parseInt(qId, 10)))
    );
    if (relevant.length === 0) return null;

    const questionScores: { [key: number]: { sum: number; count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const questionId = parseInt(qId, 10);
        const question = questionMap.get(questionId);
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        const percent = getPercentageForScore(question, score);
        if (typeof percent !== 'number') return;
        if (!questionScores[questionId]) questionScores[questionId] = { sum: 0, count: 0 };
        questionScores[questionId].sum += percent;
        questionScores[questionId].count += 1;
      });
    });

    const questions = Array.from(questionMap.values())
      .map(question => {
        const data = questionScores[question.id];
        if (!data || data.count === 0) return null;
        return { name: question.text, percent: Math.round(data.sum / data.count) };
      })
      .filter(Boolean) as { name: string; percent: number }[];

    if (questions.length === 0) return null;
    return { questions, totalEvaluations: relevant.length };
  };


  const formatPercent = (value: number) => `${Math.round(value)}%`;
  const renderScoreTooltip = () => ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value?: number }[];
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const rawValue = payload[0]?.value;
    if (typeof rawValue !== 'number') return null;
    return (
      <div className="bg-white border rounded-lg px-3 py-2 text-xs shadow">
        <div className="font-semibold text-slate-800">{label}</div>
        <div className="text-slate-600">porcentaje: {formatPercent(rawValue)}</div>
      </div>
    );
  };

  const normalizeCampusName = (value: string | null | undefined) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const PUEMBO_PALETTE = ['#40CCA1', '#2EA884', '#67D8B7', '#1F7A62', '#9AE7D3'];
  const SANTA_CLARA_PALETTE = ['#4D82BC', '#8AB6F4', '#C4D6FA', '#F8C2DA', '#F7D7EF'];
  const DEFAULT_PALETTE = ['#34D399', '#60A5FA', '#FBBF24', '#F472B6', '#818CF8', '#F87171'];

  const paletteSource = selectedCampus !== 'all' ? selectedCampus : campus;
  const normalizedPaletteSource = normalizeCampusName(paletteSource);
  const activePalette = normalizedPaletteSource.includes('puembo')
    ? PUEMBO_PALETTE
    : normalizedPaletteSource.includes('santa clara') || normalizedPaletteSource.includes('santaclara')
      ? SANTA_CLARA_PALETTE
      : DEFAULT_PALETTE;

  const getPastelColor = (index: number) => activePalette[index % activePalette.length];

  const splitCommentBlocks = (commentText: string) => commentText
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  const parseTaggedBlock = (block: string) => {
    const tagRegex = /^\[\[(.+?)\]\]\s*(.*)$/;
    const match = block.match(tagRegex);
    if (!match) return null;
    return { tag: match[1], text: (match[2] || '').trim() };
  };

  const getPeerCommentsForEmployee = (empId: string) => {
    const results: string[] = [];
    filteredEvaluations.forEach(evalu => {
      if (evalu.evaluatedId !== empId) return;
      if (!Object.keys(evalu.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)))) return;
      const commentText = (evalu.comments || '').trim();
      if (!commentText) return;
      splitCommentBlocks(commentText).forEach(block => {
        const tagged = parseTaggedBlock(block);
        if (tagged) {
          if (tagged.tag.startsWith('internal')) return;
          if (tagged.text) results.push(tagged.text);
        } else {
          results.push(block);
        }
      });
    });
    return results;
  };

  const getInternalCommentsForEmployee = (empId: string) => {
    const results: { category: string; text: string }[] = [];
    filteredEvaluations.forEach(evalu => {
      if (evalu.evaluatorId !== empId) return;
      if (!Object.keys(evalu.answers).some(qId => internalQuestionMap.has(parseInt(qId, 10)))) return;
      const commentText = (evalu.comments || '').trim();
      if (!commentText) return;

      const categoriesInEvaluation = new Set<string>();
      Object.keys(evalu.answers).forEach((qId) => {
        const question = internalQuestionMap.get(parseInt(qId, 10));
        if (question) categoriesInEvaluation.add(question.category);
      });
      const categoriesList = Array.from(categoriesInEvaluation);
      const singleCategory = categoriesList.length === 1 ? categoriesList[0] : '';

      splitCommentBlocks(commentText).forEach(block => {
        const tagged = parseTaggedBlock(block);
        if (tagged) {
          if (!tagged.text) return;
          if (tagged.tag.startsWith('internal|')) {
            const category = tagged.tag.replace('internal|', '');
            results.push({ category, text: tagged.text });
            return;
          }
          if (tagged.tag === 'internal') {
            results.push({ category: singleCategory || 'General', text: tagged.text });
            return;
          }
          return;
        }
        if (singleCategory) {
          results.push({ category: singleCategory, text: block });
        } else {
          results.push({ category: 'General', text: block });
        }
      });
    });
    return results;
  };

  const getCommentsForCategory = (categoryName: string, questionMap: Map<number, Question>) => {
    if (!categoryName) return [];
    const questionIds = new Set(
      Array.from(questionMap.entries())
        .filter(([, question]) => question.category === categoryName)
        .map(([id]) => id)
    );
    if (questionIds.size === 0) return [];

    const normalizedCategory = categoryName.toLowerCase();
    const extractBlocks = (commentText: string) => commentText.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
    const tagRegex = /^\[\[(.+?)\]\]\s*(.*)$/;

    const results: string[] = [];
    filteredEvaluations.forEach((evalu) => {
      if (!Object.keys(evalu.answers).some(qId => questionIds.has(parseInt(qId, 10)))) return;
      const commentText = (evalu.comments || '').trim();
      if (!commentText) return;

      const categoriesInEvaluation = new Set<string>();
      Object.keys(evalu.answers).forEach((qId) => {
        const question = questionMap.get(parseInt(qId, 10));
        if (question) categoriesInEvaluation.add(question.category);
      });
      const categoriesList = Array.from(categoriesInEvaluation);
      const singleCategory = categoriesList.length === 1 ? categoriesList[0] : '';

      extractBlocks(commentText).forEach((block) => {
        const match = block.match(tagRegex);
        if (match) {
          const tag = match[1];
          const text = (match[2] || '').trim();
          if (!text) return;
          if (tag.startsWith('internal|')) {
            const taggedCategory = tag.replace('internal|', '').toLowerCase();
            if (taggedCategory === normalizedCategory) results.push(text);
          } else if (tag === 'internal' && singleCategory.toLowerCase() === normalizedCategory) {
            results.push(text);
          }
          return;
        }

        if (singleCategory && singleCategory.toLowerCase() === normalizedCategory) {
          results.push(block);
        }
      });
    });

    return results;
  };

  const getQuestionTotalsForCategory = (categoryName: string) => {     if (!categoryName) return [];     const categoryQuestions = internalQuestions.filter(question =>       question.category === categoryName && question.type !== 'text'     );     if (categoryQuestions.length === 0) return [];      const totals = new Map<number, number>();     filteredEvaluations.forEach((evaluation) => {       categoryQuestions.forEach((question) => {         const value = evaluation.answers[question.id];         if (typeof value === 'number' && !isNonScoringAnswer(question, value)) {           totals.set(question.id, (totals.get(question.id) || 0) + getPointValue(question, value));         }       });     });      return categoryQuestions.map(question => {       const total = totals.get(question.id);       if (typeof total !== 'number') {         return { id: question.id, text: question.text, total: null };       }       return {         id: question.id,         text: question.text,         total,       };     });   };

  const getPeerQuestionTotalsForEmployee = (empId: string) => {     const relevant = filteredEvaluations.filter(evaluation => (       evaluation.evaluatedId === empId       && Object.keys(evaluation.answers).some(questionId => peerQuestionIds.has(Number(questionId)))     ));     const totals = new Map<number, number>();      relevant.forEach(evaluation => {       peerQuestions.forEach(question => {         const value = evaluation.answers[question.id];         if (typeof value === 'number' && !isNonScoringAnswer(question, value)) {           totals.set(question.id, (totals.get(question.id) || 0) + getPointValue(question, value));         }       });     });      const totalsByQuestion = peerQuestions.map(question => {       const total = totals.get(question.id);       return typeof total === 'number' ? total : null;     });     const numericTotals = totalsByQuestion.filter((value): value is number => typeof value === 'number');     const totalOverall = numericTotals.length > 0       ? numericTotals.reduce((sum, value) => sum + value, 0)       : null;     return {       hasData: relevant.length > 0 && numericTotals.length > 0,       evaluationsCount: relevant.length,       totals: totalsByQuestion,       totalOverall,     };   };
  const handleAIAnalysis = async () => {
    if (!selectedEmp) return;
    setIsAnalyzing(true);
    const peerEvaluations = filteredEvaluations.filter(evalu =>
      Object.keys(evalu.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)))
    );
    const result = await analyzeEvaluations(peerEvaluations, selectedEmp);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const copyChartToClipboard = async (containerRef: React.RefObject<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showAlert('Tu navegador no permite copiar imágenes al portapapeles.');
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = async () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(2, 2);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          } catch (error) {
            showAlert('No se pudo copiar la imagen.');
          }
        } else {
          showAlert('No se pudo generar la imagen.');
        }
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  useEffect(() => { setAiAnalysis(''); }, [selectedEmp]);
  useEffect(() => {
    if (!internalCategories.length) {
      setSelectedInternalCategory('');
      return;
    }
    setSelectedInternalCategory(prev => (prev && internalCategories.includes(prev) ? prev : internalCategories[0]));
  }, [internalCategories]);

  useEffect(() => {
    if (!selectedEmp) return;
    if (selectedCampus === 'all') return;
    if (!filteredEmployeeIds.has(selectedEmp.id)) {
      setSelectedEmp(null);
    }
  }, [selectedCampus, selectedEmp, filteredEmployeeIds]);

  const stats = selectedEmp ? getStatsForEmployee(selectedEmp.id) : null;
  const internalStats = selectedEmp ? getInternalStats(selectedEmp.id) : null;
  const overallPeerQuestionStats = getQuestionStats(peerQuestionMap);
  const overallInternalStats = getAggregateStats(internalQuestionMap);
  const internalCategoryComments = getCommentsForCategory(selectedInternalCategory, internalQuestionMap);
  const internalCategoryQuestionTotals = getQuestionTotalsForCategory(selectedInternalCategory);
  const peerCommentsForEmployee = selectedEmp ? getPeerCommentsForEmployee(selectedEmp.id) : [];
  const internalCommentsForEmployee = selectedEmp ? getInternalCommentsForEmployee(selectedEmp.id) : [];
  const peerEvaluationsForSelected = selectedEmp
    ? filteredEvaluations.filter(evalu => (
      evalu.evaluatedId === selectedEmp.id
      && Object.keys(evalu.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)))
    ))
    : [];
  const completedPeerCount = peerEvaluationsForSelected.length;
  const assignedPeerCount = selectedEmp ? (assignedCountByTarget[selectedEmp.id] || 0) : 0;
  const displayAssignedPeerCount = assignedPeerCount > 0 ? assignedPeerCount : completedPeerCount; 
  const peerExportEvaluations = filterEvaluationsByQuestions(peerQuestionIds);
  const internalExportEvaluations = filterEvaluationsByQuestions(internalQuestionIds);
  const canExportPeer = peerQuestions.length > 0 && peerExportEvaluations.length > 0;
  const canExportInternal = internalQuestions.length > 0 && internalExportEvaluations.length > 0;
  const peerTableRows = filteredEmployees.map(employee => ({
    employee,
    ...getPeerQuestionTotalsForEmployee(employee.id),
  }));
  const hasPeerTableData = peerTableRows.some(row => row.hasData);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1 w-fit">
        <button
          onClick={() => setViewMode('employee')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${viewMode === 'employee' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-slate-600'}`}
        >
          Empleado
        </button>
        <button
          onClick={() => setViewMode('general')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${viewMode === 'general' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-slate-600'}`}
        >
          General
        </button>
      </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <label htmlFor="results-campus" className="font-semibold">Colegio</label>
          <select
            id="results-campus"
            value={selectedCampus}
            onChange={(event) => setSelectedCampus(event.target.value)}
            className="border border-slate-200 rounded-md bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          >
            <option value="all">Todos los colegios</option>
            {campusOptions.map(campus => (
              <option key={campus} value={campus}>{campus}</option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === 'employee' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {filteredEmployees.map(emp => (
                <button key={emp.id} onClick={() => setSelectedEmp(emp)} className={`w-full p-4 text-left transition-all ${selectedEmp?.id === emp.id ? 'bg-[var(--color-primary-tint)] border-l-4 border-[var(--color-primary)]' : ''}`}>
                  <p className="font-semibold">{emp.name}</p>
                  <p className="text-xs text-slate-500">{emp.role}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            {selectedEmp ? (
              <>
                {stats && (
                  <div className="bg-white p-6 rounded-xl border">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="font-bold flex items-center gap-2"><BarChart3 size={20} /> Rendimiento</h3>
                        {selectedEmp && (
                          <p className="text-xs text-slate-500">{completedPeerCount} de {displayAssignedPeerCount} evaluaciones completadas</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleExportEmployeePeer}
                          className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold"
                        >
                          <Download size={14} /> Exportar CSV
                        </button>
                        <button onClick={() => copyChartToClipboard(chartRef)} className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold">
                          <Copy size={14} /> Copiar Imagen
                        </button>
                      </div>
                    </div>
                    <div className="h-64" ref={chartRef}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.categories}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={false} />
                          <YAxis domain={[0, 100]} tickFormatter={formatPercent} />
                          <Tooltip content={renderScoreTooltip()} />
                          <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                            {stats.categories.map((_, index) => (
                              <Cell key={`peer-emp-${index}`} fill={getPastelColor(index)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-6">
                      <h4 className="font-semibold text-slate-800 mb-3">Comentarios sobre este empleado</h4>
                      {peerCommentsForEmployee.length > 0 ? (
                        <div className="space-y-3">
                          {peerCommentsForEmployee.map((comment, index) => (
                            <div key={`peer-comment-${index}`} className="border rounded-lg p-4 text-sm text-slate-700 bg-slate-50">
                              {comment}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                          No hay comentarios registrados para este empleado.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="bg-white p-6 rounded-xl border">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold flex items-center gap-2"><BarChart3 size={20} /> Satisfacción interna</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{internalStats ? `${internalStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                      {internalStats && (
                        <button onClick={() => copyChartToClipboard(internalChartRef)} className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold">
                          <Copy size={14} /> Copiar Imagen
                        </button>
                      )}
                    </div>
                  </div>
                  {internalStats ? (
                    <div className="h-64" ref={internalChartRef}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={internalStats.categories}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={false} />
                          <YAxis domain={[0, 100]} tickFormatter={formatPercent} />
                          <Tooltip content={renderScoreTooltip()} />
                          <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                            {internalStats.categories.map((_, index) => (
                              <Cell key={`internal-emp-${index}`} fill={getPastelColor(index)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                      No hay evaluaciones internas registradas para este empleado.
                    </div>
                  )}
                  <div className="mt-6">
                    <h4 className="font-semibold text-slate-800 mb-3">Comentarios de satisfacción interna</h4>
                    {internalCommentsForEmployee.length > 0 ? (
                      <div className="space-y-3">
                        {internalCommentsForEmployee.map((comment, index) => (
                          <div key={`internal-comment-${index}`} className="border rounded-lg p-4 text-sm text-slate-700 bg-slate-50">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 mb-2">
                              {comment.category}
                            </span>
                            <div>{comment.text}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                        No hay comentarios internos registrados para este empleado.
                      </div>
                    )}
                  </div>
                </div>
                {stats && (
                  <div className="bg-slate-900 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles size={24} className="text-[var(--color-primary)]" /> Análisis IA</h3>
                      <button onClick={handleAIAnalysis} disabled={isAnalyzing} className="bg-[var(--color-primary)] px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                        {isAnalyzing ? 'Analizando...' : 'Analizar'}
                      </button>
                    </div>
                    {aiAnalysis && <div className="bg-slate-800 p-4 rounded-lg text-slate-200 text-sm whitespace-pre-line">{aiAnalysis}</div>}
                  </div>
                )}
                {!stats && !internalStats && (
                  <div className="text-center py-20 bg-white rounded-xl border text-slate-400">
                    No hay evaluaciones registradas para este empleado.
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20 bg-white rounded-xl border text-slate-400">Selecciona un empleado para ver resultados.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold flex items-center gap-2"><TrendingUp size={20} /> Resumen general</h3>
              <span className="text-xs text-slate-500">Todas las evaluaciones</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-800">Desempeño general</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{overallPeerQuestionStats ? `${overallPeerQuestionStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                    <button
                      onClick={handleExportGeneralPeer}
                      disabled={!canExportPeer}
                      className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                    {overallPeerQuestionStats && (
                      <button onClick={() => copyChartToClipboard(overallPeerChartRef)} className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold">
                        <Copy size={14} /> Copiar Imagen
                      </button>
                    )}
                  </div>
                </div>
              {overallPeerQuestionStats ? (
                <div className="h-56" ref={overallPeerChartRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallPeerQuestionStats.questions}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={false} />
                      <YAxis domain={[0, 100]} tickFormatter={formatPercent} />
                      <Tooltip content={renderScoreTooltip()} />
                      <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                        {overallPeerQuestionStats.questions.map((_, index) => (
                          <Cell key={`peer-overall-${index}`} fill={getPastelColor(index)} />
                        ))}
                      </Bar>
                    </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                    No hay evaluaciones de desempeño registradas.
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-800">Satisfacción interna (global)</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{overallInternalStats ? `${overallInternalStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                    <button
                      onClick={handleExportGeneralInternal}
                      disabled={!canExportInternal}
                      className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                    {overallInternalStats && (
                      <button onClick={() => copyChartToClipboard(overallInternalChartRef)} className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold">
                        <Copy size={14} /> Copiar Imagen
                      </button>
                    )}
                  </div>
                </div>
              {overallInternalStats ? (
                <div className="h-56" ref={overallInternalChartRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallInternalStats.categories}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={false} />
                      <YAxis domain={[0, 100]} tickFormatter={formatPercent} />
                      <Tooltip content={renderScoreTooltip()} />
                      <Bar
                        dataKey="percent"
                        radius={[4, 4, 0, 0]}
                        onClick={(data) => {
                          const nextCategory = data?.payload?.name ?? data?.name;
                          if (nextCategory) setSelectedInternalCategory(nextCategory);
                        }}
                      >
                        {overallInternalStats.categories.map((_, index) => (
                          <Cell key={`internal-overall-${index}`} fill={getPastelColor(index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                  <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                    No hay evaluaciones internas registradas.
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Resultados por empleado (pares)</h3>
              <span className="text-xs text-slate-500">Puntos por pregunta</span>
            </div>
            {hasPeerTableData ? (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="text-left px-3 py-2 font-semibold">Empleado</th>
                      <th className="text-right px-3 py-2 font-semibold">TOTAL</th>
                      <th className="text-right px-3 py-2 font-semibold">AVERAGE</th>
                      {peerQuestions.map(question => (
                        <th key={`peer-head-${question.id}`} className="text-right px-3 py-2 font-semibold">
                          {question.text}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {peerTableRows.map(row => (
                      <tr key={row.employee.id} className="border-t">
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.employee.name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">
                          {row.totalOverall === null ? '-' : row.totalOverall}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">
                          {row.totalOverall === null || row.evaluationsCount === 0 || peerQuestions.length === 0 ? '-' : Math.round(Math.min(100, Math.max(0, (row.totalOverall / (row.evaluationsCount * peerQuestions.length)) * 100)))}
                        </td>
                        {row.totals.map((value, index) => (
                          <td key={`peer-${row.employee.id}-${index}`} className="px-3 py-2 text-right text-slate-700">
                            {value === null ? '-' : value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                No hay evaluaciones de pares para mostrar.
              </div>
            )}
          </div>
          <div className="bg-white p-6 rounded-xl border">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800">Comentarios por sección</h3>
                <p className="text-sm text-slate-500">Selecciona una barra en la gráfica para ver los comentarios registrados.</p>
              </div>
              <span className="inline-flex items-center px-3 py-2 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {selectedInternalCategory || 'Sin categoría'}
              </span>
            </div>
            <div className="mt-6 space-y-6">
              {selectedInternalCategory && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700">Preguntas y total</h4>
                  {internalCategoryQuestionTotals.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {internalCategoryQuestionTotals.map(item => (
                        <div key={`${item.id}`} className="flex items-start justify-between gap-4 border rounded-lg p-3 text-sm bg-slate-50">
                          <span className="text-slate-700">{item.text}</span>
                          <span className="text-xs font-semibold text-slate-600">
                            {item.total === null ? 'Sin respuestas' : item.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                      No hay preguntas registradas para esta categoría.
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {selectedInternalCategory && internalCategoryComments.length > 0 ? (
                  internalCategoryComments.map((comment, index) => (
                    <div key={`${selectedInternalCategory}-${index}`} className="border rounded-lg p-4 text-sm text-slate-700 bg-slate-50">
                      {comment}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                    {selectedInternalCategory ? 'No hay comentarios para esta categoría.' : 'Selecciona una categoría para ver comentarios.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDashboard;



















