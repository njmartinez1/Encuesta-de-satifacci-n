
import React from 'react';
import { Employee } from '../types.ts';
import { UserCircle2 } from 'lucide-react';

console.log("--> [EmployeeSelector.tsx] Módulo cargado");

interface Props {
  employees: Employee[];
  onSelect: (employee: Employee) => void;
}

const EmployeeSelector: React.FC<Props> = ({ employees, onSelect }) => {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-700 mb-2">Selecciona tu perfil:</label>
      <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
        {employees.map(employee => (
          <button
            key={employee.id}
            onClick={() => onSelect(employee)}
            className="group flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-[#005187] hover:bg-[#eef5fa] transition-all text-left"
          >
            <div className="bg-slate-100 text-slate-500 group-hover:bg-[#dbe9f3] group-hover:text-[#005187] p-2 rounded-full transition-colors">
              <UserCircle2 size={28} />
            </div>
            <div>
              <p className="font-semibold text-slate-800">{employee.name}</p>
              <p className="text-xs text-slate-500 group-hover:text-[#005187]">{employee.role}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmployeeSelector;


