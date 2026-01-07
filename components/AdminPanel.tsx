
import React, { useState } from 'react';
import { Employee, Assignment } from '../types.ts';
import { UserPlus, Users, ListChecks, Trash2, CheckCircle2, Edit2, X, Check, Download, Upload, Database } from 'lucide-react';

interface Props {
  employees: Employee[];
  assignments: Assignment[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
}

const AdminPanel: React.FC<Props> = ({ employees, assignments, setEmployees, setAssignments }) => {
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [selectedEvaluator, setSelectedEvaluator] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  const addEmployee = () => {
    if (!newName || !newRole) return;
    const newId = `emp_${Date.now()}`;
    const newEmp: Employee = { id: newId, name: newName, role: newRole };
    setEmployees(prev => [...prev, newEmp]);
    setNewName('');
    setNewRole('');
  };

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

  const saveEdit = (id: string) => {
    if (!editName || !editRole) return;
    setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, name: editName, role: editRole } : emp));
    setEditingId(null);
  };

  const removeEmployee = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este empleado? Se borrarán sus asignaciones.')) {
      setEmployees(prev => prev.filter(e => e.id !== id));
      setAssignments(prev => prev.filter(a => a.evaluatorId !== id).map(a => ({
        ...a,
        targets: a.targets.filter(tid => tid !== id)
      })));
      if (selectedEvaluator === id) setSelectedEvaluator(null);
    }
  };

  const toggleAssignment = (evaluatorId: string, targetId: string) => {
    setAssignments(prev => {
      const existing = prev.find(a => a.evaluatorId === evaluatorId);
      if (existing) {
        const isAssigned = existing.targets.includes(targetId);
        const newTargets = isAssigned 
          ? existing.targets.filter(tid => tid !== targetId)
          : [...existing.targets, targetId];
        
        return prev.map(a => a.evaluatorId === evaluatorId ? { ...a, targets: newTargets } : a);
      } else {
        return [...prev, { evaluatorId, targets: [targetId] }];
      }
    });
  };

  const downloadBackup = () => {
    const data = {
      employees: JSON.parse(localStorage.getItem('employees_db') || '[]'),
      assignments: JSON.parse(localStorage.getItem('assignments_db') || '[]'),
      evaluations: JSON.parse(localStorage.getItem('evaluations_db') || '[]'),
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `feedback360_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.employees && data.evaluations) {
          if(confirm('Esto reemplazará todos los datos actuales. ¿Estás seguro?')) {
            localStorage.setItem('employees_db', JSON.stringify(data.employees));
            localStorage.setItem('assignments_db', JSON.stringify(data.assignments || []));
            localStorage.setItem('evaluations_db', JSON.stringify(data.evaluations));
            window.location.reload();
          }
        } else {
          alert('El archivo no tiene el formato correcto.');
        }
      } catch (err) {
        alert('Error al leer el archivo de respaldo.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-10">
      {/* Data Management Section */}
      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-800">Almacenamiento de Datos</h2>
        </div>
        <div className="bg-indigo-50 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-indigo-900">Copia de Seguridad y Restauración</h3>
            <p className="text-sm text-indigo-700 mt-1">Descarga un archivo con toda la información o restaura una copia anterior.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={downloadBackup}
              className="flex items-center gap-2 bg-white text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
            >
              <Download size={18} /> Backup
            </button>
            <label className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors cursor-pointer">
              <Upload size={18} /> Restaurar
              <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
            </label>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-6">
            <UserPlus className="text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-800">Gestionar Plantilla</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-xl">
            <input 
              type="text" 
              placeholder="Nombre" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <input 
              type="text" 
              placeholder="Cargo" 
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button onClick={addEmployee} className="sm:col-span-2 bg-indigo-600 text-white font-bold py-2 rounded-lg">Añadir</button>
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
                  </div>
                )}
                <div className="flex gap-1">
                  {editingId === emp.id ? (
                    <><button onClick={() => saveEdit(emp.id)}><Check size={18} className="text-emerald-600"/></button><button onClick={cancelEditing}><X size={18} className="text-slate-400"/></button></>
                  ) : (
                    <><button onClick={() => startEditing(emp)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-indigo-600"><Edit2 size={16}/></button><button onClick={() => removeEmployee(emp.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500"><Trash2 size={16}/></button></>
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
    </div>
  );
};

export default AdminPanel;
