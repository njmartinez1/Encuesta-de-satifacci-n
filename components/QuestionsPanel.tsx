import React, { useState, useEffect, useMemo } from 'react';
import { Question, QuestionCategory, QuestionSection, QuestionType } from '../types.ts';
import { HelpCircle, PlusCircle, Edit2, Trash2, Check, X, Settings } from 'lucide-react';

interface Props {
  questions: Question[];
  categories: QuestionCategory[];
  onAddQuestion: (text: string, category: string, section: QuestionSection, type: QuestionType, options: string[]) => Promise<void>;
  onUpdateQuestion: (id: number, text: string, category: string, section: QuestionSection, type: QuestionType, options: string[]) => Promise<void>;
  onDeleteQuestion: (id: number) => Promise<void>;
  onAddCategory: (name: string, section: QuestionSection) => Promise<void>;
  onUpdateCategory: (prevName: string, nextName: string) => Promise<void>;
  onDeleteCategory: (name: string, fallback: string) => Promise<void>;
}

const ADD_CATEGORY_VALUE = '__add__';
const SECTION_OPTIONS: { value: QuestionSection; label: string }[] = [
  { value: 'peer', label: 'Evaluacion de pares' },
  { value: 'internal', label: 'Satisfaccion interna' },
];
const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'scale', label: 'Opcion multiple' },
  { value: 'text', label: 'Texto' },
];
const DEFAULT_SCALE_OPTIONS = [
  'Totalmente en desacuerdo',
  'En desacuerdo',
  'De acuerdo',
  'Totalmente de acuerdo',
];

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
  const [newCategory, setNewCategory] = useState('');
  const [newSection, setNewSection] = useState<QuestionSection>('peer');
  const [newType, setNewType] = useState<QuestionType>('scale');
  const [newOptions, setNewOptions] = useState(DEFAULT_SCALE_OPTIONS.join(', '));
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryManagerSection, setCategoryManagerSection] = useState<QuestionSection>('peer');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSection, setEditSection] = useState<QuestionSection>('peer');
  const [editType, setEditType] = useState<QuestionType>('scale');
  const [editOptions, setEditOptions] = useState(DEFAULT_SCALE_OPTIONS.join(', '));

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  const categoriesBySection = useMemo(() => {
    const grouped: Record<QuestionSection, string[]> = { peer: [], internal: [] };
    categories.forEach(category => {
      if (!grouped[category.section].includes(category.name)) {
        grouped[category.section].push(category.name);
      }
    });
    grouped.peer.sort((a, b) => a.localeCompare(b));
    grouped.internal.sort((a, b) => a.localeCompare(b));
    return grouped;
  }, [categories]);

  const categoriesForNewSection = categoriesBySection[newSection];
  const categoriesForEditSection = categoriesBySection[editSection];

  useEffect(() => {
    if (categoriesForNewSection.length === 0) {
      if (newCategory !== '') setNewCategory('');
    } else if (!categoriesForNewSection.includes(newCategory)) {
      setNewCategory(categoriesForNewSection[0]);
    }

    if (editingId !== null) {
      if (categoriesForEditSection.length === 0) {
        if (editCategory !== '') setEditCategory('');
      } else if (!categoriesForEditSection.includes(editCategory)) {
        setEditCategory(categoriesForEditSection[0]);
      }
    }
  }, [
    categoriesForEditSection,
    categoriesForNewSection,
    editCategory,
    editingId,
    newCategory,
  ]);

  const normalizeCategory = (value: string) => value.trim();
  const categoryExists = (value: string) => categories.some(cat => cat.name.toLowerCase() === value.toLowerCase());

  const handleNewCategoryChange = (value: string) => {
    if (value === ADD_CATEGORY_VALUE) {
      setShowCategoryManager(true);
      setCategoryManagerSection(newSection);
      return;
    }
    setNewCategory(value);
  };

  const handleEditCategoryChange = (value: string) => {
    if (value === ADD_CATEGORY_VALUE) {
      setShowCategoryManager(true);
      setCategoryManagerSection(editSection);
      return;
    }
    setEditCategory(value);
  };

  const parseOptions = (value: string) => value
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);
  const formatOptions = (options?: string[]) => (options && options.length > 0 ? options.join(', ') : DEFAULT_SCALE_OPTIONS.join(', '));
  const ensureOptions = (type: QuestionType, optionsText: string) => {
    if (type !== 'scale') return [];
    const parsed = parseOptions(optionsText);
    return parsed.length > 0 ? parsed : DEFAULT_SCALE_OPTIONS;
  };

  const addQuestion = async () => {
    if (!newText.trim()) return;
    if (categoriesForNewSection.length === 0 || !newCategory) {
      alert('Primero agrega una categoria para esta seccion.');
      setShowCategoryManager(true);
      return;
    }
    const options = ensureOptions(newType, newOptions);
    await onAddQuestion(newText.trim(), newCategory, newSection, newType, options);
    setNewText('');
    setNewCategory(categoriesForNewSection[0] || newCategory);
  };

  const startEditing = (question: Question) => {
    setEditingId(question.id);
    setEditText(question.text);
    setEditCategory(question.category);
    setEditSection(question.section);
    setEditType(question.type ?? 'scale');
    setEditOptions(formatOptions(question.options));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
    setEditCategory(categoriesBySection.peer[0] || '');
    setEditSection('peer');
    setEditType('scale');
    setEditOptions(formatOptions());
  };

  const saveEdit = async (id: number) => {
    if (!editText.trim()) return;
    const options = ensureOptions(editType, editOptions);
    await onUpdateQuestion(id, editText.trim(), editCategory, editSection, editType, options);
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
    await onAddCategory(name, categoryManagerSection);
    if (categoryManagerSection === newSection) {
      setNewCategory(name);
    }
    if (editingId !== null && categoryManagerSection === editSection) {
      setEditCategory(name);
    }
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
    const categoryEntry = categories.find(cat => cat.name === category);
    if (!categoryEntry) return;
    const remainingInSection = categories.filter(cat => cat.section === categoryEntry.section).length;
    if (remainingInSection <= 1) {
      alert('Debes mantener al menos una categoria por seccion.');
      return;
    }
    const usageCount = questions.filter(q => q.category === category).length;
    const fallback = categories.find(cat => cat.name !== category && cat.section === categoryEntry.section)?.name || '';
    const message = usageCount > 0
      ? `Esta categoria se usa en ${usageCount} preguntas. Se reasignaran a "${fallback}". Continuar?`
      : 'Estas seguro de eliminar esta categoria?';

    if (!confirm(message)) return;

    await onDeleteCategory(category, fallback);
    if (newCategory === category) setNewCategory(fallback);
    if (editCategory === category) setEditCategory(fallback);
  };

  const getSectionLabel = (section: QuestionSection) =>
    SECTION_OPTIONS.find(option => option.value === section)?.label || section;
  const getTypeLabel = (type: QuestionType) =>
    QUESTION_TYPE_OPTIONS.find(option => option.value === type)?.label || type;

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

        <div className="bg-slate-50 p-4 rounded-xl space-y-4">
          <input
            type="text"
            placeholder="Texto de la pregunta"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
          />
          <div className="grid grid-cols-1 lg:grid-cols-[200px,220px,180px,160px] gap-4">
            <select
              value={newSection}
              onChange={(e) => setNewSection(e.target.value as QuestionSection)}
              className="px-4 py-2 rounded-lg border bg-white"
            >
              {SECTION_OPTIONS.map(section => (
                <option key={section.value} value={section.value}>{section.label}</option>
              ))}
            </select>
            <select
              value={newCategory}
              onChange={(e) => handleNewCategoryChange(e.target.value)}
              className="px-4 py-2 rounded-lg border bg-white"
            >
              {categoriesForNewSection.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value={ADD_CATEGORY_VALUE}>Agregar categoria...</option>
            </select>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as QuestionType)}
              className="px-4 py-2 rounded-lg border bg-white"
            >
              {QUESTION_TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              onClick={addQuestion}
              className="flex items-center justify-center gap-2 bg-[#005187] text-white font-bold py-2 rounded-lg"
            >
              <PlusCircle size={18} /> Agregar
            </button>
          </div>
          {newType === 'scale' && (
            <div className="bg-white border rounded-lg p-3">
              <label className="text-xs font-semibold text-slate-600">Opciones (separadas por coma)</label>
              <input
                type="text"
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder={DEFAULT_SCALE_OPTIONS.join(', ')}
                className="mt-2 w-full px-4 py-2 rounded-lg border"
              />
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Listado</h3>
            <p className="text-xs text-slate-500">Preguntas separadas por seccion.</p>
          </div>
          <span className="text-sm text-slate-500">{questions.length} preguntas</span>
        </div>

        <div className="space-y-6">
          {SECTION_OPTIONS.map(section => {
            const sectionQuestions = questions.filter(question => question.section === section.value);
            return (
              <div key={section.value}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">{section.label}</h4>
                  <span className="text-xs text-slate-500">{sectionQuestions.length} preguntas</span>
                </div>
                {sectionQuestions.length === 0 ? (
                  <div className="text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl p-4 text-center">
                    No hay preguntas en {section.label.toLowerCase()}.
                  </div>
                ) : (
                  <div className="divide-y">
                    {sectionQuestions.map(question => (
                      <div key={question.id} className="py-4 flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#eef5fa] text-[#005187] flex items-center justify-center font-bold text-sm">
                          P{question.id}
                        </div>
                        <div className="flex-1">
                          {editingId === question.id ? (
                            <div className="space-y-3">
                              <input
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-lg"
                              />
                              <div className="grid grid-cols-1 md:grid-cols-[180px,200px,180px] gap-3">
                                <select
                                  value={editSection}
                                  onChange={(e) => setEditSection(e.target.value as QuestionSection)}
                                  className="px-3 py-2 text-sm border rounded-lg bg-white"
                                >
                                  {SECTION_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                                <select
                                  value={editCategory}
                                  onChange={(e) => handleEditCategoryChange(e.target.value)}
                                  className="px-3 py-2 text-sm border rounded-lg bg-white"
                                >
                                  {categoriesForEditSection.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                  <option value={ADD_CATEGORY_VALUE}>Agregar categoria...</option>
                                </select>
                                <select
                                  value={editType}
                                  onChange={(e) => setEditType(e.target.value as QuestionType)}
                                  className="px-3 py-2 text-sm border rounded-lg bg-white"
                                >
                                  {QUESTION_TYPE_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>
                              {editType === 'scale' && (
                                <div className="bg-white border rounded-lg p-3">
                                  <label className="text-xs font-semibold text-slate-600">Opciones (separadas por coma)</label>
                                  <input
                                    type="text"
                                    value={editOptions}
                                    onChange={(e) => setEditOptions(e.target.value)}
                                    placeholder={DEFAULT_SCALE_OPTIONS.join(', ')}
                                    className="mt-2 w-full px-3 py-2 text-sm border rounded-lg"
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-slate-800">{question.text}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="inline-flex text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                                  {getSectionLabel(question.section)}
                                </span>
                                <span className="inline-flex text-xs font-semibold px-2 py-1 rounded-full bg-white text-slate-600 border">
                                  {question.category}
                                </span>
                                <span className="inline-flex text-xs font-semibold px-2 py-1 rounded-full bg-[#eef5fa] text-[#005187]">
                                  {getTypeLabel(question.type)}
                                </span>
                              </div>
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
              </div>
            );
          })}
        </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,220px,180px] gap-3 bg-slate-50 p-4 rounded-xl">
              <input
                type="text"
                placeholder="Nueva categoria"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg"
              />
              <select
                value={categoryManagerSection}
                onChange={(e) => setCategoryManagerSection(e.target.value as QuestionSection)}
                className="px-3 py-2 text-sm border rounded-lg bg-white"
              >
                {SECTION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                onClick={addCategory}
                className="flex items-center justify-center gap-2 bg-[#005187] text-white font-semibold py-2 rounded-lg"
              >
                <PlusCircle size={16} /> Agregar categoria
              </button>
            </div>

            <div className="divide-y">
              {categories.map(category => {
                const usageCount = questions.filter(q => q.category === category.name).length;
                return (
                  <div key={category.name} className="py-3 flex items-center justify-between">
                    {editingCategory === category.name ? (
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
                        <p className="font-medium text-slate-800">{category.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{usageCount} preguntas</span>
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {getSectionLabel(category.section)}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {editingCategory === category.name ? (
                        <>
                          <button onClick={() => saveCategoryEdit(category.name)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                            <Check size={18} />
                          </button>
                          <button onClick={cancelCategoryEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startCategoryEdit(category.name)} className="p-2 text-slate-400 hover:text-[#005187] hover:bg-[#eef5fa] rounded-lg">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => removeCategory(category.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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

