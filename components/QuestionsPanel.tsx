import React, { useState, useEffect, useMemo } from 'react';
import { Question, QuestionCategory, QuestionSection, QuestionSectionOption, QuestionType } from '../types.ts';
import { HelpCircle, PlusCircle, Edit2, Trash2, Check, X, Settings } from 'lucide-react';
import { useModal } from './ModalProvider.tsx';

interface Props {
  questions: Question[];
  categories: QuestionCategory[];
  questionSections: QuestionSectionOption[];
  onAddQuestion: (text: string, category: string, section: QuestionSection, type: QuestionType, options: string[], isRequired: boolean) => Promise<void>;
  onUpdateQuestion: (id: number, text: string, category: string, section: QuestionSection, type: QuestionType, options: string[], isRequired: boolean) => Promise<void>;
  onDeleteQuestion: (id: number) => Promise<void>;
  onAddCategory: (name: string, section: QuestionSection, description?: string) => Promise<void>;
  onUpdateCategory: (prevName: string, nextName: string, description?: string) => Promise<void>;
  onDeleteCategory: (name: string, fallback: string) => Promise<void>;
  onUpdateCategoryOrder: (section: QuestionSection, orderedNames: string[]) => Promise<void>;
}

const ADD_CATEGORY_VALUE = '__add__';
const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'scale', label: 'Opción múltiple' },
  { value: 'text', label: 'Texto' },
];
const DEFAULT_SCALE_OPTIONS = [
  'Totalmente en desacuerdo',
  'En desacuerdo',
  'De acuerdo',
  'Totalmente de acuerdo',
];

const OPTIONAL_CATEGORIES = new Set(['alimentacion', 'enfermeria', 'seguros']);
const normalizeCategoryName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();
const isOptionalCategory = (category: string) => OPTIONAL_CATEGORIES.has(normalizeCategoryName(category));

const QuestionsPanel: React.FC<Props> = ({
  questions,
  categories,
  questionSections,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onUpdateCategoryOrder,
}) => {
  const { showAlert, showConfirm } = useModal();
  const sectionOptions = questionSections;
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newSection, setNewSection] = useState<QuestionSection>('peer');
  const [newType, setNewType] = useState<QuestionType>('scale');
  const [newOptions, setNewOptions] = useState(DEFAULT_SCALE_OPTIONS.join(', '));
  const [newIsRequired, setNewIsRequired] = useState(true);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryManagerSection, setCategoryManagerSection] = useState<QuestionSection>('peer');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSection, setEditSection] = useState<QuestionSection>('peer');
  const [editType, setEditType] = useState<QuestionType>('scale');
  const [editOptions, setEditOptions] = useState(DEFAULT_SCALE_OPTIONS.join(', '));
  const [editIsRequired, setEditIsRequired] = useState(true);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryDescription, setEditCategoryDescription] = useState('');

  const categoriesBySection = useMemo(() => {
    const grouped: Record<QuestionSection, QuestionCategory[]> = { peer: [], internal: [] };
    categories.forEach(category => {
      if (!grouped[category.section].some(item => item.name === category.name)) {
        grouped[category.section].push(category);
      }
    });
    const sortByOrder = (a: QuestionCategory, b: QuestionCategory) => {
      const aOrder = a.sortOrder ?? 0;
      const bOrder = b.sortOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    };
    grouped.peer.sort(sortByOrder);
    grouped.internal.sort(sortByOrder);
    return grouped;
  }, [categories]);

  const categoryNamesBySection = useMemo(() => ({
    peer: categoriesBySection.peer.map(category => category.name),
    internal: categoriesBySection.internal.map(category => category.name),
  }), [categoriesBySection]);

  const categoriesForNewSection = categoryNamesBySection[newSection];
  const categoriesForEditSection = categoryNamesBySection[editSection];
  const isNewCategoryOptional = isOptionalCategory(newCategory);
  const isEditCategoryOptional = isOptionalCategory(editCategory);
  const effectiveNewIsRequired = isNewCategoryOptional ? false : newIsRequired;
  const effectiveEditIsRequired = isEditCategoryOptional ? false : editIsRequired;

  const [draggedCategory, setDraggedCategory] = useState<QuestionCategory | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

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
      showAlert('Primero agrega una categoría para esta sección.');
      setShowCategoryManager(true);
      return;
    }
    const options = ensureOptions(newType, newOptions);
    await onAddQuestion(newText.trim(), newCategory, newSection, newType, options, effectiveNewIsRequired);
    setNewText('');
    setNewIsRequired(true);
    setNewCategory(categoriesForNewSection[0] || newCategory);
  };

  const startEditing = (question: Question) => {
    setEditingId(question.id);
    setEditText(question.text);
    setEditCategory(question.category);
    setEditSection(question.section);
    setEditType(question.type ?? 'scale');
    setEditOptions(formatOptions(question.options));
    setEditIsRequired(question.isRequired);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
    setEditCategory(categoriesBySection.peer[0] || '');
    setEditSection('peer');
    setEditType('scale');
    setEditOptions(formatOptions());
    setEditIsRequired(true);
  };

  const saveEdit = async (id: number) => {
    if (!editText.trim()) return;
    const options = ensureOptions(editType, editOptions);
    await onUpdateQuestion(id, editText.trim(), editCategory, editSection, editType, options, effectiveEditIsRequired);
    setEditingId(null);
  };

  const removeQuestion = async (id: number) => {
    const confirmed = await showConfirm('¿Estás seguro de eliminar esta pregunta?', {
      title: 'Eliminar pregunta',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;
    await onDeleteQuestion(id);
    if (editingId === id) cancelEditing();
  };

  const addCategory = async () => {
    const name = normalizeCategory(newCategoryName);
    if (!name) return;
    if (categoryExists(name)) {
      showAlert('La categoría ya existe.');
      return;
    }
    await onAddCategory(name, categoryManagerSection, newCategoryDescription);
    if (categoryManagerSection === newSection) {
      setNewCategory(name);
    }
    if (editingId !== null && categoryManagerSection === editSection) {
      setEditCategory(name);
    }
    setNewCategoryName('');
    setNewCategoryDescription('');
    setShowCategoryManager(true);
  };

  const startCategoryEdit = (category: string) => {
    const entry = categories.find(cat => cat.name === category);
    setEditingCategory(category);
    setEditCategoryName(category);
    setEditCategoryDescription(entry?.description ?? '');
    setShowCategoryManager(true);
  };

  const cancelCategoryEdit = () => {
    setEditingCategory(null);
    setEditCategoryDescription('');
    setEditCategoryName('');
  };

  const saveCategoryEdit = async (category: string) => {
    const name = normalizeCategory(editCategoryName);
    if (!name) return;
    if (categoryExists(name) && name.toLowerCase() !== category.toLowerCase()) {
      showAlert('La categoría ya existe.');
      return;
    }
    await onUpdateCategory(category, name, editCategoryDescription);
    if (newCategory === category) setNewCategory(name);
    if (editCategory === category) setEditCategory(name);
    setEditingCategory(null);
    setEditCategoryDescription('');
  };

  const removeCategory = async (category: string) => {
    const categoryEntry = categories.find(cat => cat.name === category);
    if (!categoryEntry) return;
    const remainingInSection = categories.filter(cat => cat.section === categoryEntry.section).length;
    if (remainingInSection <= 1) {
      showAlert('Debes mantener al menos una categoría por sección.');
      return;
    }
    const usageCount = questions.filter(q => q.category === category).length;
    const fallback = categories.find(cat => cat.name !== category && cat.section === categoryEntry.section)?.name || '';
    const message = usageCount > 0
      ? `Esta categoría se usa en ${usageCount} preguntas. Se reasignarán a "${fallback}". ¿Continuar?`
      : '¿Estás seguro de eliminar esta categoría?';

    const confirmed = await showConfirm(message, {
      title: 'Eliminar categoría',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    await onDeleteCategory(category, fallback);
    if (newCategory === category) setNewCategory(fallback);
    if (editCategory === category) setEditCategory(fallback);
  };

  const handleCategoryDragStart = (category: QuestionCategory) => (event: React.DragEvent<HTMLDivElement>) => {
    setDraggedCategory(category);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleCategoryDragOver = (category: QuestionCategory) => (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedCategory) return;
    if (draggedCategory.section !== category.section) return;
    if (draggedCategory.name === category.name) return;
    event.preventDefault();
    setDragOverCategory(category.name);
    event.dataTransfer.dropEffect = 'move';
  };

  const handleCategoryDrop = (category: QuestionCategory) => async (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedCategory) return;
    if (draggedCategory.section !== category.section) return;
    if (draggedCategory.name === category.name) {
      setDraggedCategory(null);
      setDragOverCategory(null);
      return;
    }
    event.preventDefault();
    const sectionCategories = categoriesBySection[category.section];
    const reordered = [...sectionCategories];
    const fromIndex = reordered.findIndex(item => item.name === draggedCategory.name);
    const toIndex = reordered.findIndex(item => item.name === category.name);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedCategory(null);
      setDragOverCategory(null);
      return;
    }
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDraggedCategory(null);
    setDragOverCategory(null);
    await onUpdateCategoryOrder(category.section, reordered.map(item => item.name));
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  const getSectionLabel = (section: QuestionSection) =>
    sectionOptions.find(option => option.value === section)?.label || section;
  const getTypeLabel = (type: QuestionType) =>
    QUESTION_TYPE_OPTIONS.find(option => option.value === type)?.label || type;

  return (
    <div className="space-y-8">
      <section className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center gap-3 mb-6">
          <HelpCircle className="text-[var(--color-primary)]" />
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
            className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
          />
          <div className="grid grid-cols-1 lg:grid-cols-[200px,220px,180px,160px] gap-4">
            <select
              value={newSection}
              onChange={(e) => setNewSection(e.target.value as QuestionSection)}
              className="px-4 py-2 rounded-lg border bg-white"
            >
              {sectionOptions.map(section => (
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
              <option value={ADD_CATEGORY_VALUE}>Agregar categoría...</option>
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
              className="flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white font-bold py-2 rounded-lg"
            >
              <PlusCircle size={18} /> Agregar
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={effectiveNewIsRequired}
              onChange={(e) => setNewIsRequired(e.target.checked)}
              disabled={isNewCategoryOptional}
              className="h-4 w-4 text-[var(--color-primary)]"
            />
            Obligatoria
          </label>
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
            <p className="text-xs text-slate-500">Preguntas separadas por sección.</p>
          </div>
          <span className="text-sm text-slate-500">{questions.length} preguntas</span>
        </div>

        <div className="space-y-6">
          {sectionOptions.map(section => {
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
                        <div className="w-10 h-10 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-primary)] flex items-center justify-center font-bold text-sm">
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
                                  {sectionOptions.map(option => (
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
                                  <option value={ADD_CATEGORY_VALUE}>Agregar categoría...</option>
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
                              <label className="flex items-center gap-2 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={effectiveEditIsRequired}
                                  onChange={(e) => setEditIsRequired(e.target.checked)}
                                  disabled={isEditCategoryOptional}
                                  className="h-4 w-4 text-[var(--color-primary)]"
                                />
                                Obligatoria
                              </label>
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
                                <span className="inline-flex text-xs font-semibold px-2 py-1 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
                                  {getTypeLabel(question.type)}
                                </span>
                                <span className={`inline-flex text-xs font-semibold px-2 py-1 rounded-full ${question.isRequired ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {question.isRequired ? 'Obligatoria' : 'Opcional'}
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
                              <button onClick={() => startEditing(question)} className="p-2 text-slate-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] rounded-lg">
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
            <Settings className="text-[var(--color-primary)]" />
            <div>
              <h3 className="text-lg font-bold text-slate-800">Categorías</h3>
              <p className="text-sm text-slate-500">Agrega, edita o elimina categorías.</p>
            </div>
          </div>
          <button
            onClick={() => setShowCategoryManager(prev => !prev)}
            className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-darker)]"
          >
            {showCategoryManager ? 'Ocultar' : 'Gestionar'}
          </button>
        </div>

        {showCategoryManager ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,220px,180px] gap-3 bg-slate-50 p-4 rounded-xl">
              <input
                type="text"
                placeholder="Nueva categoría"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg"
              />
              <select
                value={categoryManagerSection}
                onChange={(e) => setCategoryManagerSection(e.target.value as QuestionSection)}
                className="px-3 py-2 text-sm border rounded-lg bg-white"
              >
                {sectionOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                onClick={addCategory}
                className="flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white font-semibold py-2 rounded-lg"
              >
                <PlusCircle size={16} /> Agregar categoría
              </button>
            </div>
            <textarea
              placeholder="Descripcion (opcional)"
              value={newCategoryDescription}
              onChange={(e) => setNewCategoryDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg"
              rows={2}
            />


            <div className="space-y-6">
              {sectionOptions.map(section => {
                const sectionCategories = categoriesBySection[section.value];
                return (
                  <div key={section.value}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-slate-700">{section.label}</h4>
                      <span className="text-xs text-slate-500">{sectionCategories.length} categorias</span>
                    </div>
                    <div className="divide-y">
                      {sectionCategories.map(category => {
                        const usageCount = questions.filter(q => q.category === category.name).length;
                        const isDragOver = dragOverCategory === category.name;
                        const isDragging = draggedCategory?.name === category.name;
                        return (
                          <div
                            key={category.name}
                            className={`py-3 flex items-center justify-between ${isDragOver ? 'bg-[var(--color-primary-tint)]' : ''} ${isDragging ? 'opacity-60' : ''} ${editingCategory === category.name ? '' : 'cursor-grab'}`}
                            draggable={editingCategory !== category.name}
                            onDragStart={handleCategoryDragStart(category)}
                            onDragOver={handleCategoryDragOver(category)}
                            onDrop={handleCategoryDrop(category)}
                            onDragEnd={handleCategoryDragEnd}
                          >
                            {editingCategory === category.name ? (
                              <div className="flex-1 space-y-2 mr-2">
                                <input
                                  value={editCategoryName}
                                  onChange={(e) => setEditCategoryName(e.target.value)}
                                  className="px-3 py-2 text-sm border rounded-lg"
                                />
                                <textarea
                                  value={editCategoryDescription}
                                  onChange={(e) => setEditCategoryDescription(e.target.value)}
                                  placeholder="Descripcion (opcional)"
                                  className="px-3 py-2 text-sm border rounded-lg"
                                  rows={2}
                                />
                                <span className="text-xs text-slate-500">{usageCount} preguntas</span>
                              </div>
                            ) : (
                              <div>
                                <p className="font-medium text-slate-800">{category.name}</p>
                                {category.description?.trim() ? (
                                  <p className="text-xs text-slate-500 mt-1">{category.description}</p>
                                ) : null}
                                <div className="flex items-center gap-2 mt-1">
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
                                  <button onClick={() => startCategoryEdit(category.name)} className="p-2 text-slate-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] rounded-lg">
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
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
            Usa "Agregar categoría" desde el selector de preguntas para abrir la gestión.
          </div>
        )}
      </section>
    </div>
  );
};

export default QuestionsPanel;


