
import React, { useState, useEffect, useRef } from 'react';
import { Evaluation, Employee, Question } from '../types.ts';
import { analyzeEvaluations } from '../geminiService.ts';
import { Sparkles, BarChart3, TrendingUp, Copy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useModal } from './ModalProvider.tsx';

interface Props {
  evaluations: Evaluation[];
  employees: Employee[];
  questions: Question[];
}

const ResultsDashboard: React.FC<Props> = ({ evaluations, employees, questions }) => {
  const { showAlert } = useModal();
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [viewMode, setViewMode] = useState<'employee' | 'general'>('employee');
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

  const getStatsForEmployee = (empId: string) => {
    const relevant = evaluations.filter(e => {
      if (e.evaluatedId !== empId) return false;
      return Object.keys(e.answers).some(qId => peerQuestionMap.has(parseInt(qId, 10)));
    });
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { total: number, count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = peerQuestionMap.get(parseInt(qId, 10));
        if (question && question.type !== 'text' && typeof score === 'number') {
          if (!categoryScores[question.category]) categoryScores[question.category] = { total: 0, count: 0 };
          categoryScores[question.category].total += score;
          categoryScores[question.category].count += 1;
        }
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      avg: parseFloat((data.total / data.count).toFixed(2))
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getInternalStats = (empId: string) => {
    if (internalQuestionMap.size === 0) return null;
    const relevant = evaluations.filter(evalu => {
      if (evalu.evaluatedId !== empId) return false;
      return Object.keys(evalu.answers).some(qId => internalQuestionMap.has(parseInt(qId, 10)));
    });
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { total: number, count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = internalQuestionMap.get(parseInt(qId, 10));
        if (question && question.type !== 'text' && typeof score === 'number') {
          if (!categoryScores[question.category]) categoryScores[question.category] = { total: 0, count: 0 };
          categoryScores[question.category].total += score;
          categoryScores[question.category].count += 1;
        }
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      avg: parseFloat((data.total / data.count).toFixed(2))
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getAggregateStats = (questionMap: Map<number, Question>) => {
    if (questionMap.size === 0) return null;
    const relevant = evaluations.filter(evalu =>
      Object.keys(evalu.answers).some(qId => questionMap.has(parseInt(qId, 10)))
    );
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { total: number, count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = questionMap.get(parseInt(qId, 10));
        if (question && question.type !== 'text' && typeof score === 'number') {
          if (!categoryScores[question.category]) categoryScores[question.category] = { total: 0, count: 0 };
          categoryScores[question.category].total += score;
          categoryScores[question.category].count += 1;
        }
      });
    });

    const categories = Object.entries(categoryScores).map(([name, data]) => ({
      name,
      avg: parseFloat((data.total / data.count).toFixed(2))
    }));

    return { categories, totalEvaluations: relevant.length };
  };

  const getScaleMax = (questionMap: Map<number, Question>) => {
    const maxValues = Array.from(questionMap.values())
      .filter(question => question.type !== 'text')
      .map(question => (question.options && question.options.length > 0 ? question.options.length : 4));
    return maxValues.length > 0 ? Math.max(...maxValues) : 4;
  };

  const renderScoreTooltip = (maxValue: number) => ({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) => {
    if (!active || !payload || !payload.length) return null;
    const rawValue = payload[0]?.value;
    if (typeof rawValue !== 'number') return null;
    const safeMax = maxValue > 0 ? maxValue : 1;
    const percentage = Math.round((rawValue / safeMax) * 100);
    return (
      <div className="bg-white border rounded-lg px-3 py-2 text-xs shadow">
        <div className="font-semibold text-slate-800">{label}</div>
        <div className="text-slate-600">avg: {rawValue}</div>
        <div className="text-slate-500">{percentage}%</div>
      </div>
    );
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
    const results: string[] = [];
    evaluations.forEach(evalu => {
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
    evaluations.forEach(evalu => {
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
    evaluations.forEach((evalu) => {
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

  const handleAIAnalysis = async () => {
    if (!selectedEmp) return;
    setIsAnalyzing(true);
    const peerEvaluations = evaluations.filter(evalu =>
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
      showAlert('Tu navegador no permite copiar imagenes al portapapeles.');
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

  const stats = selectedEmp ? getStatsForEmployee(selectedEmp.id) : null;
  const internalStats = selectedEmp ? getInternalStats(selectedEmp.id) : null;
  const overallPeerStats = getAggregateStats(peerQuestionMap);
  const overallInternalStats = getAggregateStats(internalQuestionMap);
  const internalCategoryComments = getCommentsForCategory(selectedInternalCategory, internalQuestionMap);
  const peerCommentsForEmployee = selectedEmp ? getPeerCommentsForEmployee(selectedEmp.id) : [];
  const internalCommentsForEmployee = selectedEmp ? getInternalCommentsForEmployee(selectedEmp.id) : [];
  const peerScaleMax = getScaleMax(peerQuestionMap);
  const internalScaleMax = getScaleMax(internalQuestionMap);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1 w-fit">
        <button
          onClick={() => setViewMode('employee')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${viewMode === 'employee' ? 'bg-[#005187] text-white shadow-sm' : 'text-slate-600'}`}
        >
          Empleado
        </button>
        <button
          onClick={() => setViewMode('general')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${viewMode === 'general' ? 'bg-[#005187] text-white shadow-sm' : 'text-slate-600'}`}
        >
          General
        </button>
      </div>

      {viewMode === 'employee' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {employees.map(emp => (
                <button key={emp.id} onClick={() => setSelectedEmp(emp)} className={`w-full p-4 text-left transition-all ${selectedEmp?.id === emp.id ? 'bg-[#eef5fa] border-l-4 border-[#005187]' : ''}`}>
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
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold flex items-center gap-2"><BarChart3 size={20} /> Rendimiento</h3>
                      <button onClick={() => copyChartToClipboard(chartRef)} className="text-[#005187] flex items-center gap-2 text-xs font-bold"><Copy size={14} /> Copiar Imagen</button>
                    </div>
                    <div className="h-64" ref={chartRef}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.categories}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" />
                          <YAxis domain={[0, 4]} />
                          <Tooltip content={renderScoreTooltip(peerScaleMax)} />
                          <Bar dataKey="avg" fill="#005187" radius={[4, 4, 0, 0]} />
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
                    <h3 className="font-bold flex items-center gap-2"><BarChart3 size={20} /> Satisfaccion interna</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{internalStats ? `${internalStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                      {internalStats && (
                        <button onClick={() => copyChartToClipboard(internalChartRef)} className="text-[#005187] flex items-center gap-2 text-xs font-bold">
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
                          <XAxis dataKey="name" />
                          <YAxis domain={[0, 4]} />
                          <Tooltip content={renderScoreTooltip(internalScaleMax)} />
                          <Bar dataKey="avg" fill="#0f6d6d" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                      No hay evaluaciones internas registradas para este empleado.
                    </div>
                  )}
                  <div className="mt-6">
                    <h4 className="font-semibold text-slate-800 mb-3">Comentarios de satisfaccion interna</h4>
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
                      <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles size={24} className="text-[#7aa3c0]" /> Analisis IA</h3>
                      <button onClick={handleAIAnalysis} disabled={isAnalyzing} className="bg-[#005187] px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
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
                  <h4 className="font-semibold text-slate-800">Desempeno general</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{overallPeerStats ? `${overallPeerStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                    {overallPeerStats && (
                      <button onClick={() => copyChartToClipboard(overallPeerChartRef)} className="text-[#005187] flex items-center gap-2 text-xs font-bold">
                        <Copy size={14} /> Copiar Imagen
                      </button>
                    )}
                  </div>
                </div>
              {overallPeerStats ? (
                <div className="h-56" ref={overallPeerChartRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallPeerStats.categories}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                        <YAxis domain={[0, 4]} />
                        <Tooltip content={renderScoreTooltip(peerScaleMax)} />
                        <Bar dataKey="avg" fill="#005187" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                    No hay evaluaciones de desempeno registradas.
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-800">Satisfaccion interna (global)</h4>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{overallInternalStats ? `${overallInternalStats.totalEvaluations} evaluaciones` : 'Sin datos'}</span>
                    {overallInternalStats && (
                      <button onClick={() => copyChartToClipboard(overallInternalChartRef)} className="text-[#005187] flex items-center gap-2 text-xs font-bold">
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
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 4]} />
                      <Tooltip content={renderScoreTooltip(internalScaleMax)} />
                      <Bar
                        dataKey="avg"
                        fill="#0f6d6d"
                        radius={[4, 4, 0, 0]}
                        onClick={(data) => {
                          const nextCategory = data?.payload?.name ?? data?.name;
                          if (nextCategory) setSelectedInternalCategory(nextCategory);
                        }}
                      />
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800">Comentarios por seccion</h3>
                <p className="text-sm text-slate-500">Selecciona una barra en la grafica para ver los comentarios registrados.</p>
              </div>
              <span className="inline-flex items-center px-3 py-2 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {selectedInternalCategory || 'Sin categoria'}
              </span>
            </div>
            <div className="mt-6 space-y-3 max-h-80 overflow-y-auto">
              {selectedInternalCategory && internalCategoryComments.length > 0 ? (
                internalCategoryComments.map((comment, index) => (
                  <div key={`${selectedInternalCategory}-${index}`} className="border rounded-lg p-4 text-sm text-slate-700 bg-slate-50">
                    {comment}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                  {selectedInternalCategory ? 'No hay comentarios para esta categoria.' : 'Selecciona una categoria para ver comentarios.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDashboard;


