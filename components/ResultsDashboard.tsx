
import React, { useState, useEffect, useRef } from 'react';
import { Assignment, Evaluation, Employee, Question } from '../types.ts';
import { DEFAULT_SCALE_SCORE_VALUES, getScaleRangeFromCount, getScorePercentage, getScaleScore } from '../scoreUtils.ts';
import { analyzeEvaluations } from '../geminiService.ts';
import { Sparkles, BarChart3, TrendingUp, Copy, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useModal } from './ModalProvider.tsx';

interface Props {
  evaluations: Evaluation[];
  employees: Employee[];
  questions: Question[];
  assignments: Assignment[];
  campus?: string | null;
  hideEmployeeMatrix?: boolean;
  hideEmployeeTab?: boolean;
  hideGeneralExport?: boolean;
  hideEmployeeExport?: boolean;
  canSelectCampus?: boolean;
  forcedCampus?: string | null;
  showCommentAuthors?: boolean;
}

const ResultsDashboard: React.FC<Props> = ({
  evaluations,
  employees,
  questions,
  assignments,
  campus,
  hideEmployeeMatrix = false,
  hideEmployeeTab = false,
  hideGeneralExport = false,
  hideEmployeeExport = false,
  canSelectCampus = false,
  forcedCampus = null,
  showCommentAuthors = false,
}) => {
  const { showAlert } = useModal();
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [viewMode, setViewMode] = useState<'employee' | 'general'>(() => (
    hideEmployeeTab ? 'general' : 'employee'
  ));
  const [selectedCampus, setSelectedCampus] = useState(() => (
    !canSelectCampus && forcedCampus ? forcedCampus : 'all'
  ));
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedInternalCategory, setSelectedInternalCategory] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedInternalQuestionId, setExpandedInternalQuestionId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const internalChartRef = useRef<HTMLDivElement>(null);
  const overallPeerChartRef = useRef<HTMLDivElement>(null);
  const overallInternalChartRef = useRef<HTMLDivElement>(null);
  const internalQuestionCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const makeAnonymityKey = (evaluatorId: string, periodId?: string | null) =>
    `${evaluatorId}::${periodId ?? ''}`;
  const internalAnonymityByEvaluator = new Map<string, boolean>();
  evaluations.forEach(evaluation => {
    if (evaluation.evaluatorId !== evaluation.evaluatedId) return;
    const hasInternalAnswer = Object.keys(evaluation.answers).some(questionId =>
      internalQuestionIds.has(Number(questionId))
    );
    if (!hasInternalAnswer) return;
    internalAnonymityByEvaluator.set(
      makeAnonymityKey(evaluation.evaluatorId, evaluation.periodId),
      evaluation.isAnonymous
    );
  });
  const resolveEvaluationAnonymity = (evaluation: Evaluation) =>
    internalAnonymityByEvaluator.get(makeAnonymityKey(evaluation.evaluatorId, evaluation.periodId))
    ?? evaluation.isAnonymous
    ?? false;
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
  const DEFAULT_SCALE_OPTIONS = [
    'Totalmente en desacuerdo',
    'En desacuerdo',
    'De acuerdo',
    'Totalmente de acuerdo',
  ];
  const SCALE_LABEL_VALUES: Record<string, number> = {
    'totalmente en desacuerdo': -1,
    'completamente en desacuerdo': -1,
    'en desacuerdo': -0.75,
    'de acuerdo': 0.75,
    'totalmente de acuerdo': 1,
    'completamente de acuerdo': 1,
  };
  const getQuestionOptionLabels = (question: Question) => {
    if (question.options && question.options.length > 0) {
      return question.options;
    }
    if (isZeroToTenQuestion(question)) {
      return Array.from({ length: 10 }, (_, index) => String(index + 1));
    }
    return DEFAULT_SCALE_OPTIONS;
  };
  const getScoreForOption = (options: string[], optionIndex: number) => {
    const label = options[optionIndex] || '';
    if (isNonScoringOptionLabel(label)) return null;
    const normalized = normalizeOptionLabel(label);
    const mapped = SCALE_LABEL_VALUES[normalized];
    if (typeof mapped === 'number') return mapped;
    const scoringOptions = options.filter(option => !isNonScoringOptionLabel(option));
    if (scoringOptions.length === DEFAULT_SCALE_SCORE_VALUES.length) {
      const scoringIndex = options
        .slice(0, optionIndex)
        .filter(option => !isNonScoringOptionLabel(option)).length;
      return DEFAULT_SCALE_SCORE_VALUES[scoringIndex] ?? null;
    }
    return getScaleScore(optionIndex, options.length);
  };
  const getLabelForNumericAnswer = (question: Question, value: number) => {
    const options = getQuestionOptionLabels(question);
    if (isZeroToTenQuestion(question)) {
      const normalized = normalizeZeroToTenValue(value, question);
      const index = normalized - 1;
      return options[index] ?? String(normalized);
    }
    if (options.length > 0) {
      for (let i = 0; i < options.length; i += 1) {
        const score = getScoreForOption(options, i);
        if (score === null) continue;
        if (score === value) return options[i];
      }
    }
    const fallbackIndex = DEFAULT_SCALE_SCORE_VALUES.findIndex(score => score === value);
    if (fallbackIndex >= 0) return DEFAULT_SCALE_OPTIONS[fallbackIndex];
    return String(value);
  };
  const getLabelForAnswer = (question: Question, answer: number | string | undefined) => {
    if (answer === undefined || answer === null) return null;
    if (typeof answer === 'string') {
      const normalized = normalizeOptionLabel(answer);
      const options = getQuestionOptionLabels(question);
      const match = options.find(option => normalizeOptionLabel(option) === normalized);
      return match ?? answer;
    }
    if (isNonScoringAnswer(question, answer)) {
      const options = getQuestionOptionLabels(question);
      const index = options.findIndex(option => isNonScoringOptionLabel(option));
      return index >= 0 ? options[index] : null;
    }
    return getLabelForNumericAnswer(question, answer);
  };
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

  const formatCampusLabel = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Sin colegio';
    return trimmed;
  };

  const clampChannel = (value: number) => Math.min(255, Math.max(0, value));
  const hexToRgb = (hex: string) => {
    const cleaned = hex.replace('#', '');
    if (cleaned.length !== 6) return null;
    const r = Number.parseInt(cleaned.slice(0, 2), 16);
    const g = Number.parseInt(cleaned.slice(2, 4), 16);
    const b = Number.parseInt(cleaned.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  };
  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (value: number) => clampChannel(Math.round(value)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  const mixHex = (start: string, end: string, ratio: number) => {
    const startRgb = hexToRgb(start);
    const endRgb = hexToRgb(end);
    if (!startRgb || !endRgb) return start;
    const clamped = Math.min(1, Math.max(0, ratio));
    const r = startRgb.r * (1 - clamped) + endRgb.r * clamped;
    const g = startRgb.g * (1 - clamped) + endRgb.g * clamped;
    const b = startRgb.b * (1 - clamped) + endRgb.b * clamped;
    return rgbToHex(r, g, b);
  };
  const getScoreRingColor = (percent: number) => {
    const lowColor = '#f6b4b4';
    const highColor = '#40CCA1';
    const ratio = percent / 100;
    return mixHex(lowColor, highColor, ratio);
  };

  const normalizeCampusValue = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bcolegio\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();

  const campusOptions = Array.from(
    new Set(employees.map(emp => (emp.campus || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));
  const normalizedSelectedCampus = normalizeCampusValue(selectedCampus);
  const campusMatches = (value: string, selected: string) => {
    if (!selected) return true;
    const normalizedValue = normalizeCampusValue(value);
    if (!normalizedValue) return false;
    return normalizedValue === selected
      || normalizedValue.includes(selected)
      || selected.includes(normalizedValue);
  };
  const filteredEmployees = selectedCampus === 'all'
    ? employees
    : employees.filter(emp => campusMatches(emp.campus || '', normalizedSelectedCampus));
  const filteredEmployeeIds = new Set(filteredEmployees.map(emp => emp.id));
  const normalizedEmployeeSearch = employeeSearch.trim().toLowerCase();
  const filteredEmployeesBySearch = normalizedEmployeeSearch
    ? filteredEmployees.filter(emp => {
        const name = (emp.name || '').toLowerCase();
        const role = (emp.role || '').toLowerCase();
        return name.includes(normalizedEmployeeSearch) || role.includes(normalizedEmployeeSearch);
      })
    : filteredEmployees;
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
  const escapeCsvValueWithDelimiter = (
    value: string | number | null | undefined,
    delimiter: string
  ) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    const needsQuotes = stringValue.includes(delimiter) || /["\n]/.test(stringValue);
    if (needsQuotes) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };
  const formatCsvNumber = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    const stringValue = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return stringValue.replace('.', ',');
  };

  const buildEvaluationCsv = (
    evaluationList: Evaluation[],
    questionList: Question[],
    options: { includeAnonymous?: boolean } = {}
  ) => {
    const includeAnonymous = options.includeAnonymous ?? false;
    const isPeerExport = questionList.length > 0 && questionList.every(question => question.section === 'peer');
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
      const resolvedAnonymity = includeAnonymous
        ? (isPeerExport ? resolveEvaluationAnonymity(evaluation) : evaluation.isAnonymous)
        : false;
      const anonymity = includeAnonymous ? [resolvedAnonymity ? 'Si' : 'No'] : [];
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
    const delimiter = ';';
    const lines = [headers, ...rows]
      .map(row => row
        .map(value => (typeof value === 'number' ? formatCsvNumber(value) : value))
        .map(value => escapeCsvValueWithDelimiter(value, delimiter))
        .join(delimiter))
      .join('\n');
    return `sep=${delimiter}\n${lines}`;
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
    const exportBase = selectedCampus === 'all'
      ? filteredEvaluations
      : filteredEvaluations.filter(evaluation => filteredEmployeeIds.has(evaluation.evaluatedId));
    const relevant = filterEvaluationsByQuestions(peerQuestionIds, exportBase);
    exportCsv(
      buildFilename('desempeÃ±o_general'),
      relevant,
      peerQuestions,
      'No hay evaluaciones de pares registradas.',
      { includeAnonymous: true }
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

  const buildPeerMatrixCsv = () => {
    const headers = [
      'Empleado',
      'AVERAGE',
      ...peerQuestions.map(question => `${question.text} (%)`),
    ];

    const rows = peerTableRows.map(row => {
      const overallPercent = row.totalOverall === null || row.evaluationsCount === 0 || peerQuestions.length === 0
        ? null
        : Math.round(Math.min(100, Math.max(0, (row.totalOverall / (row.evaluationsCount * peerQuestions.length)) * 100)));
      const questionValues = peerQuestions.map((_, index) => {
        const pct = row.percents[index];
        return pct === null ? '' : pct;
      });
      return [
        row.employee.name,
        overallPercent === null ? '' : overallPercent,
        ...questionValues,
      ];
    });

    const delimiter = ';';
    const lines = [headers, ...rows]
      .map(row => row
        .map(value => (typeof value === 'number' ? formatCsvNumber(value) : value))
        .map(value => escapeCsvValueWithDelimiter(value, delimiter))
        .join(delimiter))
      .join('\n');
    return `sep=${delimiter}\n${lines}`;
  };

  const handleExportPeerMatrix = () => {
    if (peerQuestions.length === 0) {
      showAlert('No hay preguntas configuradas para exportar.');
      return;
    }
    if (!hasPeerTableData) {
      showAlert('No hay evaluaciones de pares para mostrar.');
      return;
    }
    const csvContent = buildPeerMatrixCsv();
    downloadCsv(buildFilename('resultados_empleados_pares'), csvContent);
  };

  const isZeroToTenQuestion = (question: Question) => {
    const text = question.text.toLowerCase();
    return text.includes('del 1 al 10') || text.includes('escala del 1 al 10') || text.includes('del 0 al 10') || text.includes('escala del 0 al 10');
  };
  const isSpecialScaleQuestion = (question: Question) => {
    if (!question.options || question.options.length === 0) return false;
    return question.options.length !== DEFAULT_SCALE_SCORE_VALUES.length;
  };
  const AXIS_STOP_WORDS = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'para', 'por', 'en', 'con', 'al', 'a',
  ]);
  const buildAxisAbbreviations = (labels: string[]) => {
    const raw = labels.map(label => {
      const words = label.split(/\s+/).filter(Boolean);
      const filtered = words.filter(word => !AXIS_STOP_WORDS.has(word.toLowerCase()));
      const source = filtered.length > 0 ? filtered : words;
      const initials = source.map(word => word[0]?.toUpperCase()).join('');
      const base = initials.slice(0, 3);
      if (base.length >= 2) return base;
      return label.trim().slice(0, 2).toUpperCase();
    });
    const counts = new Map<string, number>();
    return labels.reduce<Record<string, string>>((acc, label, index) => {
      let abbr = raw[index];
      const seen = counts.get(abbr) ?? 0;
      counts.set(abbr, seen + 1);
      if (seen > 0) {
        abbr = `${abbr}${seen + 1}`;
      }
      acc[label] = abbr;
      return acc;
    }, {});
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

  const getPercentageForScore = (question: Question, score: number) => {
    if (question.type === 'text') return null;
    const optionCount = question.options && question.options.length > 0 ? question.options.length : 4;
    const { min, max } = getScaleRangeFromCount(optionCount);
    return getScorePercentage(score, min, max);
  };

  const handleOverallInternalChartClick = (chartState?: { activeLabel?: string; activePayload?: { payload?: { name?: string } }[] }) => {
    const label = chartState?.activeLabel ?? chartState?.activePayload?.[0]?.payload?.name;
    if (label) setSelectedInternalCategory(label);
  };

  const getStatsForEmployee = (empId: string) => {
    const relevant = filteredEvaluations.filter(e => {
      if (e.evaluatedId !== empId) return false;
      return Object.keys(e.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)));
    });
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { total: number; max: number } } = {};
    let totalOverall = 0;
    let maxOverall = 0;
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = peerQuestionMap.get(parseInt(qId, 10));
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        if (isNonScoringAnswer(question, score)) return;
        if (!categoryScores[question.category]) categoryScores[question.category] = { total: 0, max: 0 };
        categoryScores[question.category].total += getPointValue(question, score);
        categoryScores[question.category].max += 1;
        totalOverall += getPointValue(question, score);
        maxOverall += 1;
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      percent: data.max > 0 ? Math.round(Math.min(100, Math.max(0, (data.total / data.max) * 100))) : 0,
    }));

    const overallPercent = maxOverall > 0
      ? Math.round(Math.min(100, Math.max(0, (totalOverall / maxOverall) * 100)))
      : null;

    return { categories, totalEvaluations: relevant.length, overallPercent };
  };

  const getInternalStats = (empId: string) => {
    if (internalQuestionMap.size === 0) return null;
    const relevant = filteredEvaluations.filter(evalu => {
      if (evalu.evaluatedId !== empId) return false;
      return Object.keys(evalu.answers).some(qId => internalQuestionMap.has(parseInt(qId, 10)));
    });
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { total: number; max: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = internalQuestionMap.get(parseInt(qId, 10));
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        if (isNonScoringAnswer(question, score)) return;
        if (!categoryScores[question.category]) categoryScores[question.category] = { total: 0, max: 0 };
        categoryScores[question.category].total += getPointValue(question, score);
        categoryScores[question.category].max += 1;
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      percent: data.max > 0 ? Math.round(Math.min(100, Math.max(0, (data.total / data.max) * 100))) : 0,
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getAggregateStats = (questionMap: Map<number, Question>) => {
    if (questionMap.size === 0) return null;
    const relevant = filteredEvaluations.filter(evalu =>
      Object.keys(evalu.answers).some(qId => questionMap.has(parseInt(qId, 10)))
    );
    if (relevant.length === 0) return null;

    const questionScores = new Map<number, { total: number; count: number }>();
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const questionId = parseInt(qId, 10);
        const question = questionMap.get(questionId);
        if (!question || question.type === 'text' || typeof score !== 'number') return;
        if (isNonScoringAnswer(question, score)) return;
        const current = questionScores.get(questionId) || { total: 0, count: 0 };
        current.total += getPointValue(question, score);
        current.count += 1;
        questionScores.set(questionId, current);
      });
    });

    const categoryQuestions = new Map<string, Question[]>();
    Array.from(questionMap.values()).forEach(question => {
      if (question.type === 'text') return;
      const list = categoryQuestions.get(question.category) || [];
      list.push(question);
      categoryQuestions.set(question.category, list);
    });

    const categories = Array.from(categoryQuestions.entries()).map(([name, questions]) => {
      const hasSpecial = questions.some(isSpecialScaleQuestion);
      if (hasSpecial) {
        const percents = questions.map(question => {
          const data = questionScores.get(question.id);
          if (!data || data.count === 0) return null;
          return Math.round(Math.min(100, Math.max(0, (data.total / data.count) * 100)));
        }).filter((value): value is number => value !== null);
        const percent = percents.length > 0
          ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
          : 0;
        return { name, percent };
      }

      let total = 0;
      let count = 0;
      questions.forEach(question => {
        const data = questionScores.get(question.id);
        if (!data || data.count === 0) return;
        total += data.total;
        count += data.count;
      });
      const percent = count > 0
        ? Math.round(Math.min(100, Math.max(0, (total / count) * 100)))
        : 0;
      return { name, percent };
    });

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
  const formatPointAverage = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  };
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
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const hexToRgb = (hex: string) => {
    const normalized = hex.replace('#', '');
    const parsed = normalized.length === 3
      ? normalized.split('').map(ch => ch + ch).join('')
      : normalized;
    const int = parseInt(parsed, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  };
  const rgbToHsl = (r: number, g: number, b: number) => {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case nr:
          h = (ng - nb) / d + (ng < nb ? 6 : 0);
          break;
        case ng:
          h = (nb - nr) / d + 2;
          break;
        default:
          h = (nr - ng) / d + 4;
          break;
      }
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  };
  const hslToHex = (h: number, s: number, l: number) => {
    const sat = s / 100;
    const light = l / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = light - c / 2;
    const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  const getTonePalette = (count: number, baseHex: string) => {
    if (count <= 0) return [];
    const { r, g, b } = hexToRgb(baseHex);
    const base = rgbToHsl(r, g, b);
    const hueRange = clamp(count * 3, 12, 36);
    const lightRange = clamp(count * 2, 16, 30);
    const startHue = base.h - hueRange / 2;
    const endHue = base.h + hueRange / 2;
    const startLight = clamp(base.l - lightRange / 2, 28, 70);
    const endLight = clamp(base.l + lightRange / 2, 32, 80);
    return Array.from({ length: count }, (_value, index) => {
      const t = count === 1 ? 0.5 : index / (count - 1);
      const hue = startHue + (endHue - startHue) * t;
      const light = startLight + (endLight - startLight) * t;
      const sat = clamp(base.s + (t - 0.5) * 12, 35, 75);
      return hslToHex(hue, sat, light);
    });
  };

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
    const results: { text: string; author: string }[] = [];
    filteredEvaluations.forEach(evalu => {
      if (evalu.evaluatedId !== empId) return;
      if (!Object.keys(evalu.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)))) return;
      const commentText = (evalu.comments || '').trim();
      if (!commentText) return;
      const authorName = resolveEvaluationAnonymity(evalu)
        ? 'Anónimo'
        : (employees.find(emp => emp.id === evalu.evaluatorId)?.name || 'N/A');
      splitCommentBlocks(commentText).forEach(block => {
        const tagged = parseTaggedBlock(block);
        if (tagged) {
          if (tagged.tag.startsWith('internal')) return;
          if (tagged.text) results.push({ text: tagged.text, author: authorName });
        } else {
          results.push({ text: block, author: authorName });
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

    const results: { text: string; author: string }[] = [];
    filteredEvaluations.forEach((evalu) => {
      if (!Object.keys(evalu.answers).some(qId => questionIds.has(parseInt(qId, 10)))) return;
      const commentText = (evalu.comments || '').trim();
      if (!commentText) return;
      const authorName = resolveEvaluationAnonymity(evalu)
        ? 'Anónimo'
        : (employees.find(emp => emp.id === evalu.evaluatorId)?.name || 'N/A');

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
            if (taggedCategory === normalizedCategory) results.push({ text, author: authorName });
          } else if (tag === 'internal' && singleCategory.toLowerCase() === normalizedCategory) {
            results.push({ text, author: authorName });
          }
          return;
        }

        if (singleCategory && singleCategory.toLowerCase() === normalizedCategory) {
          results.push({ text: block, author: authorName });
        }
      });
    });

    return results;
  };

  const getQuestionTotalsForCategory = (categoryName: string) => {
    if (!categoryName) return [];
    const categoryQuestions = internalQuestions.filter(question =>
      question.category === categoryName && question.type !== 'text'
    );
    if (categoryQuestions.length === 0) return [];

    const totals = new Map<number, { total: number; max: number }>();
    filteredEvaluations.forEach((evaluation) => {
      categoryQuestions.forEach((question) => {
        const value = evaluation.answers[question.id];
        if (typeof value !== 'number') return;
        if (isNonScoringAnswer(question, value)) return;
        const current = totals.get(question.id) || { total: 0, max: 0 };
        current.total += getPointValue(question, value);
        current.max += 1;
        totals.set(question.id, current);
      });
    });

    return categoryQuestions.map(question => {
      const data = totals.get(question.id);
      if (!data || data.max === 0) {
        return { id: question.id, text: question.text, percent: null, count: 0 };
      }
      const percent = Math.round(Math.min(100, Math.max(0, (data.total / data.max) * 100)));
      return {
        id: question.id,
        text: question.text,
        percent,
        count: data.max,
      };
    });
  };
  const getInternalQuestionDistribution = (questionId: number) => {
    const question = internalQuestionMap.get(questionId);
    if (!question) return null;
    const labels = getQuestionOptionLabels(question);
    const counts = new Map<string, number>();
    labels.forEach(label => counts.set(label, 0));
    let total = 0;

    filteredEvaluations.forEach(evaluation => {
      const answer = evaluation.answers[questionId];
      const label = getLabelForAnswer(question, answer);
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
      total += 1;
    });

    const palette = getTonePalette(labels.length, activePalette[0] || '#34D399');
    const data = labels.map((label, index) => {
      const count = counts.get(label) || 0;
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      return {
        name: label,
        count,
        percent,
        color: palette[index] || getPastelColor(index),
      };
    });

    return { total, data };
  };
  const getPeerQuestionTotalsForEmployee = (empId: string) => {
    const relevant = filteredEvaluations.filter(evaluation => (
      evaluation.evaluatedId === empId
      && Object.keys(evaluation.answers).some(questionId => peerQuestionIds.has(Number(questionId)))
    ));
    const totals = new Map<number, number>();

    relevant.forEach(evaluation => {
      peerQuestions.forEach(question => {
        const value = evaluation.answers[question.id];
        if (typeof value === 'number' && !isNonScoringAnswer(question, value)) {
          totals.set(question.id, (totals.get(question.id) || 0) + getPointValue(question, value));
        }
      });
    });

    const totalsByQuestion = peerQuestions.map(question => {
      const total = totals.get(question.id);
      return typeof total === 'number' ? total : null;
    });
    const numericTotals = totalsByQuestion.filter((value): value is number => typeof value === 'number');
    const totalOverall = numericTotals.length > 0
      ? numericTotals.reduce((sum, value) => sum + value, 0)
      : null;
    const averagesByQuestion = totalsByQuestion.map(total => (
      total === null || relevant.length === 0 ? null : total / relevant.length
    ));
    const percentsByQuestion = totalsByQuestion.map(total => {
      if (total === null || relevant.length === 0) return null;
      return Math.round(Math.min(100, Math.max(0, (total / relevant.length) * 100)));
    });

    return {
      hasData: relevant.length > 0 && numericTotals.length > 0,
      evaluationsCount: relevant.length,
      totals: totalsByQuestion,
      averages: averagesByQuestion,
      percents: percentsByQuestion,
      totalOverall,
    };
  };
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

  const COPY_SCALE = 2;
  const COPY_PADDING = 24;
  const triggerCopied = (key: string) => {
    setCopiedKey(key);
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = setTimeout(() => {
      setCopiedKey(null);
      copiedTimeoutRef.current = null;
    }, 2000);
  };
  const copyChartToClipboard = async (containerRef: React.RefObject<HTMLDivElement>) => {
    if (!containerRef.current) return false;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return false;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showAlert('Tu navegador no permite copiar imágenes al portapapeles.');
      return false;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    return new Promise<boolean>((resolve) => {
      img.onload = async () => {
        canvas.width = img.width * COPY_SCALE + COPY_PADDING * 2 * COPY_SCALE;
        canvas.height = img.height * COPY_SCALE + COPY_PADDING * 2 * COPY_SCALE;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(COPY_SCALE, COPY_SCALE);
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width / COPY_SCALE, canvas.height / COPY_SCALE);
          ctx.drawImage(img, COPY_PADDING, COPY_PADDING);
          const blob = await new Promise<Blob | null>((resolveBlob) => canvas.toBlob(resolveBlob, 'image/png'));
          if (blob) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              resolve(true);
            } catch (error) {
              showAlert('No se pudo copiar la imagen.');
              resolve(false);
            }
          } else {
            showAlert('No se pudo generar la imagen.');
            resolve(false);
          }
        } else {
          resolve(false);
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        showAlert('No se pudo generar la imagen.');
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
  };
  const copyElementToClipboard = async (element: HTMLElement | null) => {
    if (!element) return false;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showAlert('Tu navegador no permite copiar imágenes al portapapeles.');
      return false;
    }
    try {
      const module = await import('html2canvas');
      const html2canvas = module.default;
      const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: COPY_SCALE });
      const paddedCanvas = document.createElement('canvas');
      const padding = COPY_PADDING * COPY_SCALE;
      paddedCanvas.width = canvas.width + padding * 2;
      paddedCanvas.height = canvas.height + padding * 2;
      const ctx = paddedCanvas.getContext('2d');
      if (!ctx) {
        showAlert('No se pudo generar la imagen.');
        return false;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
      ctx.drawImage(canvas, padding, padding);
      const blob = await new Promise<Blob | null>((resolveBlob) => paddedCanvas.toBlob(resolveBlob, 'image/png'));
      if (!blob) {
        showAlert('No se pudo generar la imagen.');
        return false;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch (error) {
      showAlert('No se pudo copiar la imagen.');
      return false;
    }
  };

  useEffect(() => { setAiAnalysis(''); }, [selectedEmp]);
  useEffect(() => () => {
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (hideEmployeeTab && viewMode === 'employee') {
      setViewMode('general');
    }
  }, [hideEmployeeTab, viewMode]);
  useEffect(() => {
    if (!canSelectCampus && forcedCampus && selectedCampus !== forcedCampus) {
      setSelectedCampus(forcedCampus);
    }
  }, [canSelectCampus, forcedCampus, selectedCampus]);
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
  const overallPeerAxisLabels = buildAxisAbbreviations(
    overallPeerQuestionStats ? overallPeerQuestionStats.questions.map(item => item.name) : []
  );
  const overallInternalAxisLabels = buildAxisAbbreviations(
    overallInternalStats ? overallInternalStats.categories.map(item => item.name) : []
  );
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
          {!hideEmployeeTab && (
            <button
              onClick={() => setViewMode('employee')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${viewMode === 'employee' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-slate-600'}`}
            >
              Empleado
            </button>
          )}
          <button
            onClick={() => setViewMode('general')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${viewMode === 'general' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-slate-600'}`}
          >
            General
          </button>
        </div>
        {canSelectCampus ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <label htmlFor="results-campus" className="font-semibold">Colegio</label>
            <select
              id="results-campus"
              value={selectedCampus}
              onChange={(event) => setSelectedCampus(event.target.value)}
              className="border border-slate-200 rounded-md bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            >
              <option value="all">Todos los colegios</option>
              {campusOptions.map(campusOption => (
                <option key={campusOption} value={campusOption}>{campusOption}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold">Colegio</span>
            <span className="border border-slate-200 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700 shadow-sm">
              {formatCampusLabel(forcedCampus || '')}
            </span>
          </div>
        )}
      </div>

      {viewMode === 'employee' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-white">
              <input
                type="text"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                placeholder="Buscar empleado..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              />
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {filteredEmployeesBySearch.length === 0 && (
                <div className="p-4 text-xs text-slate-500 text-center">No se encontraron empleados.</div>
              )}
              {filteredEmployeesBySearch.map(emp => (
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
                        {!hideEmployeeExport && (
                          <button
                            onClick={handleExportEmployeePeer}
                            className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold"
                          >
                            <Download size={14} /> Exportar CSV
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            triggerCopied('employee-chart');
                            await copyChartToClipboard(chartRef);
                          }}
                          className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold focus:outline-none focus-visible:outline-none"
                        >
                          <Copy size={14} /> {copiedKey === 'employee-chart' ? 'Copiado' : 'Copiar imagen'}
                        </button>
                      </div>
                    </div>
                    <div className="h-64 relative" ref={chartRef}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'score', value: stats.overallPercent ?? 0 },
                              { name: 'rest', value: 100 - (stats.overallPercent ?? 0) },
                            ]}
                            dataKey="value"
                            innerRadius={70}
                            outerRadius={95}
                            stroke="none"
                            startAngle={90}
                            endAngle={-270}
                          >
                            <Cell fill={getScoreRingColor(stats.overallPercent ?? 0)} />
                            <Cell fill="#e2e8f0" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-3xl font-bold text-slate-800">
                          {stats.overallPercent ?? 0}%
                        </div>
                        <div className="text-xs font-semibold text-slate-500">CalificaciÃ³n general</div>
                      </div>
                    </div>
                    <div className="mt-6">
                      <h4 className="font-semibold text-slate-800 mb-3">Comentarios sobre este empleado</h4>
                      {peerCommentsForEmployee.length > 0 ? (
                        <div className="space-y-3">
                      {peerCommentsForEmployee.map((comment, index) => (
                        <div key={`peer-comment-${index}`} className="border rounded-lg p-4 text-sm text-slate-700 bg-slate-50">
                          {showCommentAuthors && (
                            <div className="text-xs font-semibold text-slate-500 mb-2">{comment.author}</div>
                          )}
                          {comment.text}
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
                {stats && (
                  <div className="bg-slate-900 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles size={24} className="text-[var(--color-primary)]" /> AnÃ¡lisis IA</h3>
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
                  <h4 className="font-semibold text-slate-800">DesempeÃ±o general</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{overallPeerQuestionStats ? `${overallPeerQuestionStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                    {!hideGeneralExport && (
                      <button
                        onClick={handleExportGeneralPeer}
                        disabled={!canExportPeer}
                        className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                      >
                        <Download size={14} /> Exportar CSV
                      </button>
                    )}
                    {overallPeerQuestionStats && (
                      <button
                        onClick={async () => {
                          triggerCopied('overall-peer');
                          await copyChartToClipboard(overallPeerChartRef);
                        }}
                        className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold focus:outline-none focus-visible:outline-none"
                      >
                        <Copy size={14} /> {copiedKey === 'overall-peer' ? 'Copiado' : 'Copiar imagen'}
                      </button>
                    )}
                  </div>
                </div>
              {overallPeerQuestionStats ? (
                <div className="h-56" ref={overallPeerChartRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallPeerQuestionStats.questions}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => overallPeerAxisLabels[String(value)] ?? String(value)}
                      />
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
                    No hay evaluaciones de desempeÃ±o registradas.
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-800">Satisfacción interna (global)</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{overallInternalStats ? `${overallInternalStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                    {!hideGeneralExport && (
                      <button
                        onClick={handleExportGeneralInternal}
                        disabled={!canExportInternal}
                        className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                      >
                        <Download size={14} /> Exportar CSV
                      </button>
                    )}
                    {overallInternalStats && (
                      <button
                        onClick={async () => {
                          triggerCopied('overall-internal');
                          await copyChartToClipboard(overallInternalChartRef);
                        }}
                        className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold focus:outline-none focus-visible:outline-none"
                      >
                        <Copy size={14} /> {copiedKey === 'overall-internal' ? 'Copiado' : 'Copiar imagen'}
                      </button>
                    )}
                  </div>
                </div>
              {overallInternalStats ? (
                <div className="h-56" ref={overallInternalChartRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallInternalStats.categories} onClick={handleOverallInternalChartClick}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => overallInternalAxisLabels[String(value)] ?? String(value)}
                      />
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
          {!hideEmployeeMatrix && (
            <div className="bg-white p-6 rounded-xl border">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3 className="font-bold text-slate-800">Resultados por empleado (pares)</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Promedio y % por pregunta</span>
                  <button
                    onClick={handleExportPeerMatrix}
                    disabled={!hasPeerTableData || peerQuestions.length === 0}
                    className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                  >
                    <Download size={14} /> Exportar CSV
                  </button>
                </div>
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
                            <span className="block text-right">{question.text}</span>
                            <span className="block text-[10px] text-slate-400 font-normal">Puntos / %</span>
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
                          {row.totals.map((value, index) => {
                            const percent = row.percents[index];
                            return (
                              <td key={`peer-${row.employee.id}-${index}`} className="px-3 py-2 text-right text-slate-700">
                                {value === null || percent === null ? (
                                  '-'
                                ) : (
                                  <div className="flex flex-col items-end">
                                    <span className="font-semibold">{formatPointAverage(value)}</span>
                                    <span className="text-[10px] text-slate-500">{percent}%</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
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
          )}
          <div className="bg-white p-6 rounded-xl border">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800">Preguntas y porcentaje</h3>
                <p className="text-sm text-slate-500">Selecciona una barra en la grÃ¡fica para ver el detalle de la sección.</p>
              </div>
              <span className="inline-flex items-center px-3 py-2 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {selectedInternalCategory || 'Sin categoría'}
              </span>
            </div>
            <div className="mt-6 space-y-6">
              {selectedInternalCategory && (
                <div>
                  {internalCategoryQuestionTotals.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {internalCategoryQuestionTotals.map(item => {
                        const isExpanded = expandedInternalQuestionId === item.id;
                        const distribution = isExpanded ? getInternalQuestionDistribution(item.id) : null;
                        const useBarChart = distribution ? distribution.data.length > 5 : false;
                        const setCardRef = (node: HTMLDivElement | null) => {
                          internalQuestionCardRefs.current[item.id] = node;
                        };
                        return (
                          <div
                            key={`${item.id}`}
                            ref={setCardRef}
                            className="border rounded-lg p-3 text-sm bg-slate-50"
                          >
                            <button
                              type="button"
                              onClick={() => setExpandedInternalQuestionId(prev => (prev === item.id ? null : item.id))}
                              className="w-full flex items-start justify-between gap-4 text-left focus:outline-none focus-visible:outline-none"
                            >
                              <span className="text-slate-700">{item.text}</span>
                              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                                {item.percent === null ? 'Sin respuestas' : `${item.percent}% (${item.count} respuestas)`}
                              </span>
                            </button>
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[1000px] opacity-100 translate-y-0 mt-3' : 'max-h-0 opacity-0 -translate-y-1'}`}
                            >
                              {distribution && distribution.total > 0 ? (
                                <div className="bg-white border rounded-lg p-4">
                                  <div className="flex items-center justify-between gap-3 mb-3">
                                    <span className="text-xs font-semibold text-slate-500">Detalle de respuestas</span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        triggerCopied(`internal-question-${item.id}`);
                                        await copyElementToClipboard(internalQuestionCardRefs.current[item.id] ?? null);
                                      }}
                                      className="text-[var(--color-primary)] flex items-center gap-2 text-xs font-bold focus:outline-none focus-visible:outline-none"
                                    >
                                      <Copy size={14} /> {copiedKey === `internal-question-${item.id}` ? 'Copiado' : 'Copiar imagen'}
                                    </button>
                                  </div>
                                  <div
                                    className={`grid gap-4 items-center min-w-0 ${
                                      useBarChart ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[160px,1fr]'
                                    }`}
                                  >
                                    <div
                                      className={`select-none outline-none ${useBarChart ? 'h-56 md:h-48' : 'h-40 md:h-36'}`}
                                      onMouseDown={(event) => event.preventDefault()}
                                    >
                                      <ResponsiveContainer width="100%" height="100%">
                                        {useBarChart ? (
                                          <BarChart
                                            data={distribution.data}
                                            margin={{ top: 8, right: 8, bottom: 16, left: 0 }}
                                          >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                                            <Tooltip
                                              formatter={(value: number, _name, props: { payload?: { percent?: number } }) => {
                                                const pct = props?.payload?.percent ?? 0;
                                                return [`${value} (${pct}%)`, 'Respuestas'];
                                              }}
                                            />
                                            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                              {distribution.data.map((entry, index) => (
                                                <Cell key={`dist-${item.id}-${index}`} fill={entry.color} />
                                              ))}
                                            </Bar>
                                          </BarChart>
                                        ) : (
                                          <PieChart
                                            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                            style={{ outline: 'none' }}
                                            className="outline-none"
                                            tabIndex={-1}
                                          >
                                            <Pie
                                              data={distribution.data}
                                              dataKey="count"
                                              nameKey="name"
                                              innerRadius={36}
                                              outerRadius={52}
                                              paddingAngle={2}
                                              cx="50%"
                                              cy="50%"
                                              isAnimationActive={false}
                                            >
                                              {distribution.data.map((entry, index) => (
                                                <Cell key={`dist-${item.id}-${index}`} fill={entry.color} />
                                              ))}
                                            </Pie>
                                            <Tooltip
                                              formatter={(value: number, _name, props: { payload?: { percent?: number } }) => {
                                                const pct = props?.payload?.percent ?? 0;
                                                return [`${value} (${pct}%)`, 'Respuestas'];
                                              }}
                                            />
                                          </PieChart>
                                        )}
                                      </ResponsiveContainer>
                                    </div>
                                    {!useBarChart && (
                                      <div className="space-y-2 text-xs text-slate-600 min-w-0">
                                        {distribution.data.map(entry => (
                                          <div key={`${item.id}-${entry.name}`} className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                              <span className="break-words text-slate-600">{entry.name}</span>
                                            </div>
                                            <span className="font-semibold">{entry.count} ({entry.percent}%)</span>
                                          </div>
                                        ))}
                                        <div className="pt-2 text-[11px] text-slate-500">
                                          Total respuestas: {distribution.total}
                                        </div>
                                      </div>
                                    )}
                                    {useBarChart && (
                                      <div className="space-y-2">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-600">
                                          {distribution.data.map(entry => (
                                            <div key={`${item.id}-${entry.name}-legend`} className="flex items-center gap-2 min-w-0">
                                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                              <span className="truncate">{entry.name}</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Total respuestas: {distribution.total}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400 bg-white border rounded-lg p-4">
                                  No hay respuestas para esta pregunta.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                      No hay preguntas registradas para esta categorÃ­a.
                    </div>
                  )}
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold text-slate-700">Comentarios por sección</h4>
                <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
                  {selectedInternalCategory && internalCategoryComments.length > 0 ? (
                    internalCategoryComments.map((comment, index) => (
                      <div key={`${selectedInternalCategory}-${index}`} className="border rounded-lg p-4 text-sm text-slate-700 bg-slate-50">
                        {showCommentAuthors && (
                          <div className="text-xs font-semibold text-slate-500 mb-2">{comment.author}</div>
                        )}
                        {comment.text}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                      {selectedInternalCategory ? 'No hay comentarios para esta categorÃ­a.' : 'Selecciona una categorÃ­a para ver comentarios.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDashboard;




















