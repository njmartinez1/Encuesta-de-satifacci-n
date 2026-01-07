
import React, { useState, useEffect } from 'react';
import { EMPLOYEES as INITIAL_EMPLOYEES, ASSIGNMENTS as INITIAL_ASSIGNMENTS, QUESTIONS } from './constants.ts';
import { Employee, Evaluation, Assignment } from './types.ts';
import EmployeeSelector from './components/EmployeeSelector.tsx';
import EvaluationForm from './components/EvaluationForm.tsx';
import ResultsDashboard from './components/ResultsDashboard.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import { Download, LayoutDashboard, ClipboardList, LogOut, ChevronRight, Settings } from 'lucide-react';

console.log("--> [App.tsx] Módulo cargado");

const App: React.FC = () => {
  console.log("--> [App.tsx] Renderizando componente App");
  
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [view, setView] = useState<'survey' | 'results' | 'admin'>('survey');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  useEffect(() => {
    console.log("--> [App.tsx] useEffect: Cargando datos iniciales");
    const savedEvals = localStorage.getItem('evaluations_db');
    const savedEmps = localStorage.getItem('employees_db');
    const savedAssigns = localStorage.getItem('assignments_db');

    if (savedEvals) setEvaluations(JSON.parse(savedEvals));
    setEmployees(savedEmps ? JSON.parse(savedEmps) : INITIAL_EMPLOYEES);
    setAssignments(savedAssigns ? JSON.parse(savedAssigns) : INITIAL_ASSIGNMENTS);
  }, []);

  useEffect(() => {
    localStorage.setItem('evaluations_db', JSON.stringify(evaluations));
  }, [evaluations]);

  useEffect(() => {
    localStorage.setItem('employees_db', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('assignments_db', JSON.stringify(assignments));
  }, [assignments]);

  const handleLogin = (employee: Employee) => {
    console.log("--> [App.tsx] Login usuario:", employee.name);
    setCurrentUser(employee);
    setView('survey');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedTargetId(null);
  };

  const handleSaveEvaluation = (evalData: Evaluation) => {
    console.log("--> [App.tsx] Guardando evaluación");
    setEvaluations(prev => {
      const filtered = prev.filter(e => !(e.evaluatorId === evalData.evaluatorId && e.evaluatedId === evalData.evaluatedId));
      return [...filtered, evalData];
    });
    setSelectedTargetId(null);
  };

  const exportToCSV = () => {
    if (evaluations.length === 0) return;
    const headers = ["Evaluador", "Evaluado", ...QUESTIONS.map(q => `P${q.id}`), "Comentarios", "Fecha"];
    const rows = evaluations.map(e => {
      const evaluator = employees.find(emp => emp.id === e.evaluatorId)?.name || 'N/A';
      const evaluated = employees.find(emp => emp.id === e.evaluatedId)?.name || 'N/A';
      const scores = QUESTIONS.map(q => e.answers[q.id] || 0);
      return [evaluator, evaluated, ...scores, `"${e.comments.replace(/"/g, '""')}"`, e.timestamp].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `evaluaciones_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const currentAssignment = currentUser ? assignments.find(a => a.evaluatorId === currentUser.id) : null;
  const targetsToEvaluate = currentAssignment ? currentAssignment.targets.map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[] : [];

  const isAdmin = currentUser?.id === 'admin';

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-600 to-purple-700">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800">Feedback 360</h1>
            <p className="text-slate-500 mt-2">Bienvenido al portal de evaluación</p>
          </div>
          <EmployeeSelector employees={employees} onSelect={handleLogin} />
          <div className="mt-8 pt-6 border-t text-center">
            <button 
              onClick={() => { setCurrentUser({ id: 'admin', name: 'Administrador', role: 'Control Central' }); setView('admin'); }}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Acceder como Administrador
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
              <ClipboardList size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 hidden sm:block">Feedback 360</h1>
              <p className="text-xs text-slate-500">{currentUser.name}</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-4">
            {!isAdmin && (
              <button 
                onClick={() => setView('survey')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${view === 'survey' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <ClipboardList size={18} />
                <span className="hidden sm:inline">Encuestas</span>
              </button>
            )}
            <button 
              onClick={() => setView('results')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${view === 'results' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <LayoutDashboard size={18} />
              <span className="hidden sm:inline">Resultados</span>
            </button>
            {isAdmin && (
              <button 
                onClick={() => setView('admin')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${view === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Settings size={18} />
                <span className="hidden sm:inline">Administración</span>
              </button>
            )}
            <div className="w-px h-6 bg-slate-200 mx-2"></div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
              <LogOut size={20} />
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {view === 'survey' && (
          <div className="space-y-8">
            {!selectedTargetId ? (
              <div className="max-w-3xl mx-auto">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">Tus Evaluaciones Pendientes</h2>
                  <p className="text-slate-500">Compañeros asignados para calificar.</p>
                </div>
                <div className="grid gap-4">
                  {targetsToEvaluate.map(target => {
                    const isCompleted = evaluations.some(e => e.evaluatorId === currentUser.id && e.evaluatedId === target.id);
                    return (
                      <button
                        key={target.id}
                        onClick={() => setSelectedTargetId(target.id)}
                        className={`flex items-center justify-between p-5 rounded-xl border-2 transition-all ${isCompleted ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md'}`}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${isCompleted ? 'bg-emerald-200 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {target.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800">{target.name}</h3>
                            <p className="text-sm text-slate-500">{target.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isCompleted && <span className="text-xs font-bold uppercase text-emerald-600 bg-emerald-100 px-2 py-1 rounded">Completado</span>}
                          <ChevronRight className={isCompleted ? 'text-emerald-400' : 'text-slate-300'} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto">
                <button onClick={() => setSelectedTargetId(null)} className="mb-6 text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1">← Volver</button>
                <EvaluationForm 
                  evaluatorId={currentUser.id}
                  targetEmployee={employees.find(e => e.id === selectedTargetId)!}
                  onSave={handleSaveEvaluation}
                />
              </div>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Panel de Resultados</h2>
                <p className="text-slate-500">Estadísticas y análisis de desempeño.</p>
              </div>
              <button onClick={exportToCSV} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all" disabled={evaluations.length === 0}>
                <Download size={18} /> Exportar CSV
              </button>
            </div>
            <ResultsDashboard evaluations={evaluations} employees={employees} />
          </div>
        )}

        {view === 'admin' && (
          <AdminPanel 
            employees={employees} 
            assignments={assignments} 
            setEmployees={setEmployees} 
            setAssignments={setAssignments} 
          />
        )}
      </main>
    </div>
  );
};

export default App;
