import React, { useState } from 'react';
import { Employee, Assignment, Question } from '../types.ts';
import { Users, ListChecks, CheckCircle2, Edit2, X, Check, Database, HelpCircle, KeyRound } from 'lucide-react';

interface Props {
  employees: Employee[];
  assignments: Assignment[];
  questions: Question[];
  evaluatorQuestions: Record<string, number[]>;
  onUpdateEmployee: (id: string, updates: { name: string; role: string }) => Promise<void>;
  onToggleAssignment: (evaluatorId: string, targetId: string) => Promise<void>;
  onUpdateEvaluatorQuestions: (evaluatorId: string, questionIds: number[]) => Promise<void>;
  onCreateUser: (payload: { email: string; name: string; role: string; isAdmin: boolean }) => Promise<Employee>;
  onResetPassword: (id: string) => Promise<void>;
}

const AdminPanel: React.FC<Props> = ({
  employees,
  assignments,
  questions,
  evaluatorQuestions,
  onUpdateEmployee,
  onToggleAssignment,
  onUpdateEvaluatorQuestions,
  onCreateUser,
  onResetPassword,
}) => {
  const [selectedEvaluator, setSelectedEvaluator] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const startEditing = (emp: Employee) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditRole(emp.role);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditRole('');
  };

  const saveEdit = async (id: string) => {
    if (!editName || !editRole) return;
    await onUpdateEmployee(id, { name: editName, role: editRole });
    setEditingId(null);
  };

  const handleCreateUser = async () => {
    setCreateError(null);
    setCreateSuccess(null);
    setResetMessage(null);
    if (!newEmail.trim() || !newName.trim() || !newRole.trim()) {
      setCreateError('Completa correo, nombre y cargo.');
      return;
    }
    setIsCreating(true);
    try {
      const created = await onCreateUser({
        email: newEmail.trim(),
        name: newName.trim(),
        role: newRole.trim(),
        isAdmin: newIsAdmin,
      });
      setCreateSuccess(`Usuario creado: ${created.email}`);
      setNewEmail('');
      setNewName('');
      setNewRole('');
      setNewIsAdmin(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'No se pudo crear el usuario.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async (id: string, email: string) => {
    setCreateError(null);
    setCreateSuccess(null);
    setResetMessage(null);
    if (!confirm(`Se restablecera la contrasena de ${email} a 123456. Continuar?`)) return;
    try {
      await onResetPassword(id);
      setResetMessage(`Contrasena restablecida: ${email}`);
    } catch (error) {
      setResetMessage('No se pudo restablecer la contrasena.');
    }
  };

  const toggleQuestionForEvaluator = async (evaluatorId: string, questionId: number) => {
    const current = evaluatorQuestions[evaluatorId] || [];
    const updated = current.includes(questionId)
      ? current.filter(id => id !== questionId)
      : [...current, questionId];
    await onUpdateEvaluatorQuestions(evaluatorId, updated);
  };

  const selectAllQuestions = async (evaluatorId: string) => {
    await onUpdateEvaluatorQuestions(evaluatorId, questions.map(question => question.id));
  };

  const toggleAssignment = async (evaluatorId: string, targetId: string) => {
    await onToggleAssignment(evaluatorId, targetId);
  };

  const selectedQuestionIds = selectedEvaluator
    ? (evaluatorQuestions[selectedEvaluator] || [])
    : [];

  return (
    <div className="space-y-10">
      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="text-indigo-600" />
          <div>
            <h2 className="text-xl font-bold text-slate-800">Crear usuario</h2>
            <p className="text-sm text-slate-500">Se crea con contrasena por defecto: 123456.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
          <input
            type="email"
            placeholder="Correo"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="text"
            placeholder="Nombre"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="text"
            placeholder="Cargo"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={newIsAdmin}
              onChange={(event) => setNewIsAdmin(event.target.checked)}
              className="h-4 w-4 text-indigo-600"
            />
            Administrador
          </label>
          {createError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg lg:col-span-2">
              {createError}
            </div>
          )}
          {createSuccess && (
            <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 p-3 rounded-lg lg:col-span-2">
              {createSuccess}
            </div>
          )}
          {resetMessage && (
            <div className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 p-3 rounded-lg lg:col-span-2">
              {resetMessage}
            </div>
          )}
          <button
            onClick={handleCreateUser}
            disabled={isCreating}
            className="lg:col-span-2 bg-indigo-600 text-white font-bold py-2 rounded-lg disabled:opacity-60"
          >
            {isCreating ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </section>
      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="text-indigo-600" />
          <div>
            <h2 className="text-xl font-bold text-slate-800">Usuarios y permisos</h2>
            <p className="text-sm text-slate-500">
              Las cuentas se crean desde Supabase Auth y se autorizan por correo en allowlist.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-6">
            <Users className="text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-800">Gestionar plantilla</h2>
          </div>

          <div className="divide-y max-h-[400px] overflow-y-auto">
            {employees.map(emp => (
              <div key={emp.id} className="py-3 flex items-center justify-between group">
                {editingId === emp.id ? (
                  <div className="flex-grow grid grid-cols-2 gap-2 mr-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)} className="px-2 py-1 text-sm border rounded"/>
                    <input value={editRole} onChange={e => setEditRole(e.target.value)} className="px-2 py-1 text-sm border rounded"/>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-slate-800">{emp.name}</p>
                    <p className="text-xs text-slate-500">{emp.role}</p>
                    <p className="text-xs text-slate-400">{emp.email}</p>
                  </div>
                )}
                <div className="flex gap-1">
                  {editingId === emp.id ? (
                    <>
                      <button onClick={() => saveEdit(emp.id)}><Check size={18} className="text-emerald-600"/></button>
                      <button onClick={cancelEditing}><X size={18} className="text-slate-400"/></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEditing(emp)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-indigo-600">
                        <Edit2 size={16}/>
                      </button>
                      <button
                        onClick={() => handleResetPassword(emp.id, emp.email)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-indigo-600"
                        title="Restablecer contrasena"
                      >
                        <KeyRound size={16}/>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-6">
            <ListChecks className="text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-800">Asignaciones</h2>
          </div>
          <select
            className="w-full px-4 py-2 rounded-lg border mb-6 bg-white"
            value={selectedEvaluator || ''}
            onChange={(e) => setSelectedEvaluator(e.target.value)}
          >
            <option value="">Selecciona evaluador...</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>

          {selectedEvaluator && (
            <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto">
              {employees.filter(e => e.id !== selectedEvaluator).map(emp => {
                const isAssigned = assignments.find(a => a.evaluatorId === selectedEvaluator)?.targets.includes(emp.id);
                return (
                  <button
                    key={emp.id}
                    onClick={() => toggleAssignment(selectedEvaluator, emp.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left ${isAssigned ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}
                  >
                    <CheckCircle2 size={18} className={isAssigned ? 'text-emerald-500' : 'text-slate-300'} />
                    <span className="text-sm font-medium">{emp.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-3">
            <HelpCircle className="text-indigo-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">Preguntas que apareceran</h2>
              <p className="text-sm text-slate-500">
                {selectedEvaluator
                  ? `${selectedQuestionIds.length}/${questions.length} seleccionadas`
                  : 'Selecciona el evaluador en Asignaciones para ver sus preguntas.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => selectedEvaluator && selectAllQuestions(selectedEvaluator)}
            disabled={!selectedEvaluator || questions.length === 0}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-slate-300"
          >
            Seleccionar todo
          </button>
        </div>

        {questions.length === 0 ? (
          <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
            No hay preguntas configuradas.
          </div>
        ) : !selectedEvaluator ? (
          <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
            Selecciona un evaluador en Asignaciones para configurar sus preguntas.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
            {questions.map(question => {
              const isActive = selectedQuestionIds.includes(question.id);
              return (
                <label
                  key={question.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleQuestionForEvaluator(selectedEvaluator, question.id)}
                    className="mt-1 h-4 w-4 text-indigo-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{question.text}</p>
                    <span className="inline-flex mt-2 text-xs font-semibold px-2 py-1 rounded-full bg-white text-slate-600 border">
                      {question.category}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminPanel;
