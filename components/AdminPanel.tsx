import React, { useState } from 'react';
import { AccessRole, Employee, Assignment, Question, QuestionSection, QuestionSectionOption } from '../types.ts';
import { Users, ListChecks, CheckCircle2, Edit2, X, Check, Database, HelpCircle, KeyRound, PlusCircle } from 'lucide-react';
import { useModal } from './ModalProvider.tsx';

interface Props {
  employees: Employee[];
  assignments: Assignment[];
  questions: Question[];
  questionSections: QuestionSectionOption[];
  evaluatorQuestions: Record<string, number[]>;
  onUpdateEmployee: (id: string, updates: { name: string; role: string; group: string; campus: string }) => Promise<void>;
  onToggleAssignment: (evaluatorId: string, targetId: string) => Promise<void>;
  onUpdateEvaluatorQuestions: (evaluatorId: string, questionIds: number[]) => Promise<void>;
  onUpdateQuestionOrder: (section: QuestionSection, questionIds: number[]) => Promise<void>;
  onUpdateQuestionSections: (sections: QuestionSectionOption[]) => Promise<void>;
  onCreateUser: (payload: { email: string; name: string; role: string; group: string; campus: string; isAdmin: boolean; accessRole: AccessRole }) => Promise<Employee>;
  onResetPassword: (id: string) => Promise<void>;
}

const AdminPanel: React.FC<Props> = ({
  employees,
  assignments,
  questions,
  questionSections,
  evaluatorQuestions,
  onUpdateEmployee,
  onToggleAssignment,
  onUpdateEvaluatorQuestions,
  onUpdateQuestionOrder,
  onUpdateQuestionSections,
  onCreateUser,
  onResetPassword,
}) => {
  const { showConfirm } = useModal();
  const [selectedEvaluator, setSelectedEvaluator] = useState<string | null>(null);
  const [selectedQuestionSection, setSelectedQuestionSection] = useState<QuestionSection>('peer');
  const [draggedSection, setDraggedSection] = useState<QuestionSection | null>(null);
  const [dragOverSection, setDragOverSection] = useState<QuestionSection | null>(null);
  const [draggedQuestionId, setDraggedQuestionId] = useState<number | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editCampus, setEditCampus] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newCampus, setNewCampus] = useState('');
  const [newAccessRole, setNewAccessRole] = useState<AccessRole>('educator');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  const [staffGroupFilter, setStaffGroupFilter] = useState('');
  const [staffCampusFilter, setStaffCampusFilter] = useState('');
  const [assignmentTargetFilter, setAssignmentTargetFilter] = useState('');
  const [showAssignmentPicker, setShowAssignmentPicker] = useState(false);

  const startEditing = (emp: Employee) => {
    setEditingId(emp.id);
    setEditName(emp.name);
    setEditRole(emp.role);
    setEditGroup(emp.group);
    setEditCampus(emp.campus);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditRole('');
    setEditGroup('');
    setEditCampus('');
  };

  const saveEdit = async (id: string) => {
    if (!editName || !editRole) return;
    await onUpdateEmployee(id, { name: editName, role: editRole, group: editGroup, campus: editCampus });
    setEditingId(null);
  };

  const selectEvaluator = (emp: Employee) => {
    setSelectedEvaluator(emp.id);
    setAssignmentTargetFilter('');
    setShowAssignmentPicker(false);
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
        group: newGroup.trim(),
        campus: newCampus.trim(),
        isAdmin: newIsAdmin,
        accessRole: newAccessRole,
      });
      setCreateSuccess(`Usuario creado: ${created.email}`);
      setNewEmail('');
      setNewName('');
      setNewRole('');
      setNewGroup('');
      setNewCampus('');
      setNewAccessRole('educator');
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
    const confirmed = await showConfirm(`Se restablecerá la contraseña de ${email} a 123456. ¿Continuar?`, {
      title: 'Restablecer contraseña',
      confirmLabel: 'Continuar',
      variant: 'warning',
    });
    if (!confirmed) return;
    try {
      await onResetPassword(id);
      setResetMessage(`Contraseña restablecida: ${email}`);
    } catch (error) {
      setResetMessage('No se pudo restablecer la contraseña.');
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
    const current = evaluatorQuestions[evaluatorId] || [];
    const sectionQuestionIds = questions
      .filter(question => question.section === selectedQuestionSection)
      .map(question => question.id);
    const updated = Array.from(new Set([...current, ...sectionQuestionIds]));
    await onUpdateEvaluatorQuestions(evaluatorId, updated);
  };

  const toggleAssignment = async (evaluatorId: string, targetId: string) => {
    await onToggleAssignment(evaluatorId, targetId);
  };

  const handleSectionDragStart = (section: QuestionSection) => (event: React.DragEvent<HTMLButtonElement>) => {
    setDraggedSection(section);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleSectionDragOver = (section: QuestionSection) => (event: React.DragEvent<HTMLButtonElement>) => {
    if (!draggedSection || draggedSection === section) return;
    event.preventDefault();
    setDragOverSection(section);
    event.dataTransfer.dropEffect = 'move';
  };

  const handleSectionDrop = (section: QuestionSection) => async (event: React.DragEvent<HTMLButtonElement>) => {
    if (!draggedSection || draggedSection === section) {
      setDraggedSection(null);
      setDragOverSection(null);
      return;
    }
    event.preventDefault();
    const fromIndex = questionSections.findIndex(item => item.value === draggedSection);
    const toIndex = questionSections.findIndex(item => item.value === section);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedSection(null);
      setDragOverSection(null);
      return;
    }
    const nextSections = [...questionSections];
    const [moved] = nextSections.splice(fromIndex, 1);
    nextSections.splice(toIndex, 0, moved);
    setDraggedSection(null);
    setDragOverSection(null);
    await onUpdateQuestionSections(nextSections);
  };

  const handleSectionDragEnd = () => {
    setDraggedSection(null);
    setDragOverSection(null);
  };

  const selectedQuestionIds = selectedEvaluator
    ? (evaluatorQuestions[selectedEvaluator] || [])
    : [];
  const questionsForSection = questions
    .filter(question => question.section === selectedQuestionSection)
    .sort((a, b) => {
      const aOrder = a.sortOrder ?? a.id;
      const bOrder = b.sortOrder ?? b.id;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.id - b.id;
    });
  const selectedCount = questionsForSection.filter(question => selectedQuestionIds.includes(question.id)).length;
  const selectedSectionLabel = questionSections.find(option => option.value === selectedQuestionSection)?.label || '';

  const handleQuestionDragStart = (questionId: number) => (event: React.DragEvent<HTMLLabelElement>) => {
    setDraggedQuestionId(questionId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleQuestionDragOver = (questionId: number) => (event: React.DragEvent<HTMLLabelElement>) => {
    if (!draggedQuestionId || draggedQuestionId === questionId) return;
    event.preventDefault();
    setDragOverQuestionId(questionId);
    event.dataTransfer.dropEffect = 'move';
  };

  const handleQuestionDrop = (questionId: number) => async (event: React.DragEvent<HTMLLabelElement>) => {
    if (!draggedQuestionId || draggedQuestionId === questionId) {
      setDraggedQuestionId(null);
      setDragOverQuestionId(null);
      return;
    }
    event.preventDefault();
    const reordered = [...questionsForSection];
    const fromIndex = reordered.findIndex(question => question.id === draggedQuestionId);
    const toIndex = reordered.findIndex(question => question.id === questionId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedQuestionId(null);
      setDragOverQuestionId(null);
      return;
    }
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDraggedQuestionId(null);
    setDragOverQuestionId(null);
    await onUpdateQuestionOrder(selectedQuestionSection, reordered.map(question => question.id));
  };

  const handleQuestionDragEnd = () => {
    setDraggedQuestionId(null);
    setDragOverQuestionId(null);
  };
  const normalizeValue = (value: string) => value.trim().toLowerCase();
  const normalizedFilter = normalizeValue(staffFilter);
  const normalizedRoleFilter = normalizeValue(staffRoleFilter);
  const normalizedGroupFilter = normalizeValue(staffGroupFilter);
  const normalizedCampusFilter = normalizeValue(staffCampusFilter);
  const roleOptions = Array.from(
    new Set(employees.map(emp => emp.role).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const groupOptions = Array.from(
    new Set(employees.map(emp => emp.group).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const campusOptions = Array.from(
    new Set(employees.map(emp => emp.campus).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const filteredEmployees = employees.filter(emp => {
    const matchesText = normalizedFilter
      ? (
        normalizeValue(emp.name).includes(normalizedFilter)
        || normalizeValue(emp.role).includes(normalizedFilter)
        || normalizeValue(emp.group).includes(normalizedFilter)
        || normalizeValue(emp.campus).includes(normalizedFilter)
      )
      : true;
    const matchesRole = normalizedRoleFilter
      ? normalizeValue(emp.role) === normalizedRoleFilter
      : true;
    const matchesGroup = normalizedGroupFilter
      ? normalizeValue(emp.group) === normalizedGroupFilter
      : true;
    const matchesCampus = normalizedCampusFilter
      ? normalizeValue(emp.campus) === normalizedCampusFilter
      : true;
    return matchesText && matchesRole && matchesGroup && matchesCampus;
  });
    const selectedAssignment = selectedEvaluator
    ? assignments.find(a => a.evaluatorId === selectedEvaluator)
    : null;
  const selectedTargets = selectedAssignment?.targets ?? [];
  const assignedEmployees = employees.filter(emp => selectedTargets.includes(emp.id));
  const hasAssignments = selectedTargets.length > 0;
  const normalizedTargetFilter = assignmentTargetFilter.trim().toLowerCase();
  const assignmentTargets = employees.filter(emp => emp.id !== selectedEvaluator && !selectedTargets.includes(emp.id));
  const filteredAssignmentTargets = normalizedTargetFilter
    ? assignmentTargets.filter(emp => (
      emp.name.toLowerCase().includes(normalizedTargetFilter)
      || emp.role.toLowerCase().includes(normalizedTargetFilter)
      || emp.group.toLowerCase().includes(normalizedTargetFilter)
      || emp.campus.toLowerCase().includes(normalizedTargetFilter)
    ))
    : assignmentTargets;

  return (
    <div className="space-y-10">
        <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-xl font-bold text-slate-800">Crear usuario</h2>
            <p className="text-sm text-slate-500">Se crea con contraseña por defecto: 123456.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
          <input
            type="email"
            placeholder="Correo"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
          />
          <input
            type="text"
            placeholder="Nombre"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
          />
          <input
            type="text"
            placeholder="Cargo"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
          />
          <input
            type="text"
            placeholder="Grupo"
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
          />
          <input
            type="text"
            placeholder="Campus"
            value={newCampus}
            onChange={(event) => setNewCampus(event.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
          />
          <label className="text-sm text-slate-600">
            Acceso
            <select
              value={newAccessRole}
              onChange={(event) => setNewAccessRole(event.target.value as AccessRole)}
              disabled={newIsAdmin}
              className="mt-2 w-full px-3 py-2 text-sm border rounded-lg bg-white disabled:opacity-60"
            >
              <option value="educator">Educador</option>
              <option value="principal">Principal</option>
              <option value="reviewer">Reviewer</option>
              <option value="manager">Manager</option>
              <option value="viewer">Visualizador</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={newIsAdmin}
              onChange={(event) => { const checked = event.target.checked; setNewIsAdmin(checked); if (checked) setNewAccessRole('educator'); }}
              className="h-4 w-4 text-[var(--color-primary)]"
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
            <div className="text-sm text-[var(--color-primary-dark)] bg-[var(--color-primary-tint)] border border-[var(--color-primary-soft)] p-3 rounded-lg lg:col-span-2">
              {resetMessage}
            </div>
          )}
          <button
            onClick={handleCreateUser}
            disabled={isCreating}
            className="lg:col-span-2 bg-[var(--color-primary)] text-white font-bold py-2 rounded-lg disabled:opacity-60"
          >
            {isCreating ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </section>
        <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="text-[var(--color-primary)]" />
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
            <Users className="text-[var(--color-primary)]" />
            <h2 className="text-xl font-bold text-slate-800">Gestionar plantilla</h2>
          </div>

          <div className="mb-4 space-y-3">
            <input
              type="text"
              placeholder="Buscar por nombre, cargo, grupo o campus"
              value={staffFilter}
              onChange={(event) => setStaffFilter(event.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs font-semibold text-slate-500">
                Cargo
                <select
                  value={staffRoleFilter}
                  onChange={(event) => setStaffRoleFilter(event.target.value)}
                  className="mt-2 w-full px-3 py-2 text-sm border rounded-lg bg-white"
                >
                  <option value="">Todos</option>
                  {roleOptions.map(option => (
                    <option key={`role-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Grupo
                <select
                  value={staffGroupFilter}
                  onChange={(event) => setStaffGroupFilter(event.target.value)}
                  className="mt-2 w-full px-3 py-2 text-sm border rounded-lg bg-white"
                >
                  <option value="">Todos</option>
                  {groupOptions.map(option => (
                    <option key={`group-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Campus
                <select
                  value={staffCampusFilter}
                  onChange={(event) => setStaffCampusFilter(event.target.value)}
                  className="mt-2 w-full px-3 py-2 text-sm border rounded-lg bg-white"
                >
                  <option value="">Todos</option>
                  {campusOptions.map(option => (
                    <option key={`campus-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="divide-y max-h-[400px] overflow-y-auto">
            {filteredEmployees.map(emp => (
              <div
                key={emp.id}
                onClick={() => selectEvaluator(emp)}
                className={`py-3 px-2 -mx-2 rounded-lg flex items-center justify-between group cursor-pointer transition-all ${selectedEvaluator === emp.id ? 'bg-[var(--color-primary-tint)] border-l-4 border-[var(--color-primary)]' : 'hover:bg-slate-50'}`}
              >
                {editingId === emp.id ? (
                  <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-2 mr-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)} className="px-2 py-1 text-sm border rounded"/>
                    <input value={editRole} onChange={e => setEditRole(e.target.value)} className="px-2 py-1 text-sm border rounded"/>
                    <input value={editGroup} onChange={e => setEditGroup(e.target.value)} className="px-2 py-1 text-sm border rounded"/>
                    <input value={editCampus} onChange={e => setEditCampus(e.target.value)} className="px-2 py-1 text-sm border rounded"/>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-slate-800">{emp.name}</p>
                    <p className="text-xs text-slate-500">{emp.role}</p>
                    {(emp.group || emp.campus) && (
                      <p className="text-xs text-slate-400">
                        {[emp.group, emp.campus].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-slate-400">{emp.email}</p>
                  </div>
                )}
                <div className="flex gap-1">
                  {editingId === emp.id ? (
                    <>
                      <button onClick={(event) => { event.stopPropagation(); saveEdit(emp.id); }}><Check size={18} className="text-emerald-600"/></button>
                      <button onClick={(event) => { event.stopPropagation(); cancelEditing(); }}><X size={18} className="text-slate-400"/></button>
                    </>
                  ) : (
                    <>
                      <button onClick={(event) => { event.stopPropagation(); startEditing(emp); }} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-[var(--color-primary)]">
                        <Edit2 size={16}/>
                      </button>
                      <button
                        onClick={(event) => { event.stopPropagation(); handleResetPassword(emp.id, emp.email); }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-[var(--color-primary)]"
                        title="Restablecer contraseña"
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
            <ListChecks className="text-[var(--color-primary)]" />
            <h2 className="text-xl font-bold text-slate-800">Asignaciones</h2>
          </div>
          {!selectedEvaluator ? (
            <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
              Selecciona una persona en Gestionar plantilla para ver sus asignaciones.
            </div>
          ) : !hasAssignments && !showAssignmentPicker ? (
            <div className="text-sm text-slate-500 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
              <p className="font-semibold text-slate-700">No tienes personal asignado</p>
              <p className="mt-1">Agrega personas para empezar a asignar.</p>
              <button
                type="button"
                onClick={() => setShowAssignmentPicker(true)}
                className="mt-4 inline-flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white font-bold py-2 px-4 rounded-lg"
              >
                <PlusCircle size={16} /> Agregar
              </button>
            </div>
          ) : (
            <>
              {hasAssignments && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">Personal asignado</p>
                  <div className="grid grid-cols-1 gap-2 max-h-[240px] overflow-y-auto">
                    {assignedEmployees.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => toggleAssignment(selectedEvaluator, emp.id)}
                        className="flex items-center gap-3 p-3 rounded-xl border-2 text-left border-emerald-500 bg-emerald-50"
                      >
                        <CheckCircle2 size={18} className="text-emerald-500" />
                        <div>
                          <span className="text-sm font-medium">{emp.name}</span>
                          {emp.campus && (
                            <p className="text-xs text-slate-500">Sucursal: {emp.campus}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!showAssignmentPicker ? (
                <button
                  type="button"
                  onClick={() => setShowAssignmentPicker(true)}
                  className="inline-flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white font-bold py-2 px-4 rounded-lg"
                >
                  <PlusCircle size={16} /> Agregar
                </button>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Buscar personal por nombre, cargo, grupo o campus"
                    value={assignmentTargetFilter}
                    onChange={(event) => setAssignmentTargetFilter(event.target.value)}
                    className="w-full px-4 py-2 rounded-lg border mb-3 bg-white"
                  />
                  {filteredAssignmentTargets.length === 0 ? (
                    <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                      No hay coincidencias para este filtro.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto">
                      {filteredAssignmentTargets.map(emp => {
                        const isAssigned = selectedTargets.includes(emp.id);
                        return (
                          <button
                            key={emp.id}
                            onClick={() => toggleAssignment(selectedEvaluator, emp.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left ${isAssigned ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}
                          >
                            <CheckCircle2 size={18} className={isAssigned ? 'text-emerald-500' : 'text-slate-300'} />
                            <div>
                              <span className="text-sm font-medium">{emp.name}</span>
                              {emp.campus && (
                                <p className="text-xs text-slate-500">Sucursal: {emp.campus}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-3">
            <HelpCircle className="text-[var(--color-primary)]" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">Preguntas que aparecerán</h2>
              <p className="text-sm text-slate-500">
                {selectedEvaluator
                  ? `${selectedCount}/${questionsForSection.length} seleccionadas en ${selectedSectionLabel.toLowerCase()}`
                  : 'Selecciona una persona en Gestionar plantilla para ver sus preguntas.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {questionSections.map(section => {
              const isDragOver = dragOverSection === section.value;
              const isDragging = draggedSection === section.value;
              return (
                <button
                  key={section.value}
                  type="button"
                  draggable
                  onDragStart={handleSectionDragStart(section.value)}
                  onDragOver={handleSectionDragOver(section.value)}
                  onDrop={handleSectionDrop(section.value)}
                  onDragEnd={handleSectionDragEnd}
                  onClick={() => setSelectedQuestionSection(section.value)}
                  className={`px-3 py-2 rounded-full text-xs font-semibold ${selectedQuestionSection === section.value ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'bg-slate-100 text-slate-600'} ${isDragOver ? 'ring-2 ring-[var(--color-primary)] ring-offset-2' : ''} ${isDragging ? 'opacity-60' : ''} cursor-grab`}
                >
                  {section.label}
                </button>
              );
            })}
            <button
              onClick={() => selectedEvaluator && selectAllQuestions(selectedEvaluator)}
              disabled={!selectedEvaluator || questionsForSection.length === 0}
              className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-darker)] disabled:text-slate-300"
            >
              Seleccionar todo
            </button>
          </div>
        </div>

        {questionsForSection.length === 0 ? (
          <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
            No hay preguntas configuradas para {selectedSectionLabel.toLowerCase()}.
          </div>
        ) : !selectedEvaluator ? (
          <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
            Selecciona una persona en Gestionar plantilla para configurar sus preguntas.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
            {questionsForSection.map(question => {
              const isActive = selectedQuestionIds.includes(question.id);
              const isDragOver = dragOverQuestionId === question.id;
              const isDragging = draggedQuestionId === question.id;
              return (
                <label
                  key={question.id}
                  draggable
                  onDragStart={handleQuestionDragStart(question.id)}
                  onDragOver={handleQuestionDragOver(question.id)}
                  onDrop={handleQuestionDrop(question.id)}
                  onDragEnd={handleQuestionDragEnd}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${isActive ? 'border-[var(--color-primary)] bg-[var(--color-primary-tint)]' : 'border-slate-100 bg-slate-50'} ${isDragOver ? 'ring-2 ring-[var(--color-primary)] ring-offset-2' : ''} ${isDragging ? 'opacity-60' : ''} cursor-grab`}
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleQuestionForEvaluator(selectedEvaluator, question.id)}
                    className="mt-1 h-4 w-4 text-[var(--color-primary)]"
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












