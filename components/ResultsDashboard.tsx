
import React, { useState, useEffect, useRef } from 'react';
import { Evaluation, Employee, Question } from '../types.ts';
import { analyzeEvaluations } from '../geminiService.ts';
import { Sparkles, BarChart3, TrendingUp, Info, Copy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  evaluations: Evaluation[];
  employees: Employee[];
  questions: Question[];
}

const ResultsDashboard: React.FC<Props> = ({ evaluations, employees, questions }) => {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const getStatsForEmployee = (empId: string) => {
    const relevant = evaluations.filter(e => e.evaluatedId === empId);
    if (relevant.length === 0) return null;

    const categoryScores: { [key: string]: { total: number, count: number } } = {};
    relevant.forEach(evalu => {
      Object.entries(evalu.answers).forEach(([qId, score]) => {
        const question = questions.find(q => q.id === parseInt(qId));
        if (question) {
          if (!categoryScores[question.category]) categoryScores[question.category] = { total: 0, count: 0 };
          categoryScores[question.category].total += score as number;
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

  const handleAIAnalysis = async () => {
    if (!selectedEmp) return;
    setIsAnalyzing(true);
    const result = await analyzeEvaluations(evaluations, selectedEmp);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const copyChartToClipboard = async () => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      window.alert('Tu navegador no permite copiar imagenes al portapapeles.');
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
            window.alert('No se pudo copiar la imagen.');
          }
        } else {
          window.alert('No se pudo generar la imagen.');
        }
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  useEffect(() => { setAiAnalysis(''); }, [selectedEmp]);

  const stats = selectedEmp ? getStatsForEmployee(selectedEmp.id) : null;

  return (
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
        {selectedEmp && stats ? (
          <>
            <div className="bg-white p-6 rounded-xl border">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold flex items-center gap-2"><BarChart3 size={20} /> Rendimiento</h3>
                <button onClick={copyChartToClipboard} className="text-[#005187] flex items-center gap-2 text-xs font-bold"><Copy size={14} /> Copiar Imagen</button>
              </div>
              <div className="h-64" ref={chartRef}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.categories}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Bar dataKey="avg" fill="#005187" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-slate-900 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2"><Sparkles size={24} className="text-[#7aa3c0]" /> Análisis IA</h3>
                <button onClick={handleAIAnalysis} disabled={isAnalyzing} className="bg-[#005187] px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                  {isAnalyzing ? 'Analizando...' : 'Analizar'}
                </button>
              </div>
              {aiAnalysis && <div className="bg-slate-800 p-4 rounded-lg text-slate-200 text-sm whitespace-pre-line">{aiAnalysis}</div>}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border text-slate-400">Selecciona un empleado para ver resultados.</div>
        )}
      </div>
    </div>
  );
};

export default ResultsDashboard;

