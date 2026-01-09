import React, { useState, useEffect } from 'react';
import { Question } from '../types.ts';
import { HelpCircle, PlusCircle, Edit2, Trash2, Check, X, Settings } from 'lucide-react';

interface Props {
  questions: Question[];
  categories: string[];
  onAddQuestion: (text: string, category: string) => Promise<void>;
  onUpdateQuestion: (id: number, text: string, category: string) => Promise<void>;
  onDeleteQuestion: (id: number) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
  onUpdateCategory: (prevName: string, nextName: string) => Promise<void>;
  onDeleteCategory: (name: string, fallback: string) => Promise<void>;
}

const ADD_CATEGORY_VALUE = '__add__';

const QuestionsPanel: React.FC<Props> = ({
  questions,
  categories,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState(categories[0] || '');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState(categories[0] || '');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  useEffect(() => {
    if (categories.length === 0) {
      if (newCategory !== '') setNewCategory('');
      if (editingId !== null && editCategory !== '') setEditCategory('');
      return;
    }
    if (!categories.includes(newCategory)) {
      setNewCategory(categories[0]);
    }
    if (editingId !== null && !categories.includes(editCategory)) {
      setEditCategory(categories[0]);
    }
  }, [categories, editCategory, editingId, newCategory]);

  const normalizeCategory = (value: string) => value.trim();
  const categoryExists = (value: string) => categories.some(cat => cat.toLowerCase() === value.toLowerCase());

  const handleNewCategoryChange = (value: string) => {
    if (value === ADD_CATEGORY_VALUE) {
      setShowCategoryManager(true);
      return;
    }
    setNewCategory(value);
  };

  const handleEditCategoryChange = (value: string) => {
    if (value === ADD_CATEGORY_VALUE) {
      setShowCategoryManager(true);
      return;
    }
    setEditCategory(value);
  };

  const addQuestion = async () => {
    if (!newText.trim()) return;
    if (categories.length === 0) {
      alert('Primero agrega una categoria.');
      setShowCategoryManager(true);
      return;
    }
    await onAddQuestion(newText.trim(), newCategory);
    setNewText('');
    setNewCategory(categories[0] || newCategory);
  };

  const startEditing = (question: Question) => {
    setEditingId(question.id);
    setEditText(question.text);
    setEditCategory(question.category);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
    setEditCategory(categories[0] || '');
  };

  const saveEdit = async (id: number) => {
    if (!editText.trim()) return;
    await onUpdateQuestion(id, editText.trim(), editCategory);
    setEditingId(null);
  };

  const removeQuestion = async (id: number) => {
    if (confirm('Estas seguro de eliminar esta pregunta?')) {
      await onDeleteQuestion(id);
      if (editingId === id) cancelEditing();
    }
  };

  const addCategory = async () => {
    const name = normalizeCategory(newCategoryName);
    if (!name) return;
    if (categoryExists(name)) {
      alert('La categoria ya existe.');
      return;
    }
    await onAddCategory(name);
    setNewCategory(name);
    setNewCategoryName('');
    setShowCategoryManager(true);
  };

  const startCategoryEdit = (category: string) => {
    setEditingCategory(category);
    setEditCategoryName(category);
    setShowCategoryManager(true);
  };

  const cancelCategoryEdit = () => {
    setEditingCategory(null);
    setEditCategoryName('');
  };

  const saveCategoryEdit = async (category: string) => {
    const name = normalizeCategory(editCategoryName);
    if (!name) return;
    if (categoryExists(name) && name.toLowerCase() !== category.toLowerCase()) {
      alert('La categoria ya existe.');
      return;
    }
    await onUpdateCategory(category, name);
    if (newCategory === category) setNewCategory(name);
    if (editCategory === category) setEditCategory(name);
    setEditingCategory(null);
  };

  const removeCategory = async (category: string) => {
    if (categories.length === 1) {
      alert('Debes mantener al menos una categoria.');
      return;
    }
    const usageCount = questions.filter(q => q.category === category).length;
    const fallback = categories.find(cat => cat !== category) || '';
    const message = usageCount > 0
      ? `Esta categoria se usa en ${usageCount} preguntas. Se reasignaran a "${fallback}". Continuar?`
      : 'Estas seguro de eliminar esta categoria?';

    if (!confirm(message)) return;

    await onDeleteCategory(category, fallback);
    if (newCategory === category) setNewCategory(fallback);
    if (editCategory === category) setEditCategory(fallback);
  };

  return (
    <div className="space-y-8">
      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-6">
          <HelpCircle className="text-[#005187]" />
          <div>
            <h2 className="text-xl font-bold text-slate-800">Preguntas</h2>
            <p className="text-sm text-slate-500">Crea y administra las preguntas activas.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,220px,160px] gap-4 bg-slate-50 p-4 rounded-xl">
          <input
            type="text"
            placeholder="Texto de la pregunta"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
          />
          <select
            value={newCategory}
            onChange={(e) => handleNewCategoryChange(e.target.value)}
            className="px-4 py-2 rounded-lg border bg-white"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value={ADD_CATEGORY_VALUE}>Agregar categoria...</option>
          </select>
          <button
            onClick={addQuestion}
            className="flex items-center justify-center gap-2 bg-[#005187] text-white font-bold py-2 rounded-lg"
          >
            <PlusCircle size={18} /> Agregar
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">Listado</h3>
          <span className="text-sm text-slate-500">{questions.length} preguntas</span>
        </div>

        {questions.length === 0 ? (
          <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-6 text-center">
            No hay preguntas configuradas.
          </div>
        ) : (
          <div className="divide-y">
            {questions.map(question => (
              <div key={question.id} className="py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#eef5fa] text-[#005187] flex items-center justify-center font-bold text-sm">
                  P{question.id}
                </div>
                <div className="flex-1">
                  {editingId === question.id ? (
                    <div className="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-3">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="px-3 py-2 text-sm border rounded-lg"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => handleEditCategoryChange(e.target.value)}
                        className="px-3 py-2 text-sm border rounded-lg bg-white"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value={ADD_CATEGORY_VALUE}>Agregar categoria...</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-slate-800">{question.text}</p>
                      <span className="inline-flex mt-2 text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                        {question.category}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingId === question.id ? (
                    <>
                      <button onClick={() => saveEdit(question.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                        <Check size={18} />
                      </button>
                      <button onClick={cancelEditing} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEditing(question)} className="p-2 text-slate-400 hover:text-[#005187] hover:bg-[#eef5fa] rounded-lg">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => removeQuestion(question.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Settings className="text-[#005187]" />
            <div>
              <h3 className="text-lg font-bold text-slate-800">Categorias</h3>
              <p className="text-sm text-slate-500">Agrega, edita o elimina categorias.</p>
            </div>
          </div>
          <button
            onClick={() => setShowCategoryManager(prev => !prev)}
            className="text-xs font-semibold text-[#005187] hover:text-[#003a5e]"
          >
            {showCategoryManager ? 'Ocultar' : 'Gestionar'}
          </button>
        </div>

        {showCategoryManager ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px] gap-3 bg-slate-50 p-4 rounded-xl">
              <input
                type="text"
                placeholder="Nueva categoria"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg"
              />
              <button
                onClick={addCategory}
                className="flex items-center justify-center gap-2 bg-[#005187] text-white font-semibold py-2 rounded-lg"
              >
                <PlusCircle size={16} /> Agregar categoria
              </button>
            </div>

            <div className="divide-y">
              {categories.map(category => {
                const usageCount = questions.filter(q => q.category === category).length;
                return (
                  <div key={category} className="py-3 flex items-center justify-between">
                    {editingCategory === category ? (
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-2 mr-2">
                        <input
                          value={editCategoryName}
                          onChange={(e) => setEditCategoryName(e.target.value)}
                          className="px-3 py-2 text-sm border rounded-lg"
                        />
                        <span className="text-xs text-slate-500 self-center">{usageCount} preguntas</span>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-slate-800">{category}</p>
                        <p className="text-xs text-slate-500">{usageCount} preguntas</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {editingCategory === category ? (
                        <>
                          <button onClick={() => saveCategoryEdit(category)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                            <Check size={18} />
                          </button>
                          <button onClick={cancelCategoryEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startCategoryEdit(category)} className="p-2 text-slate-400 hover:text-[#005187] hover:bg-[#eef5fa] rounded-lg">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => removeCategory(category)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
            Usa "Agregar categoria" desde el selector de preguntas para abrir la gestion.
          </div>
        )}
      </section>
    </div>
  );
};

export default QuestionsPanel;

