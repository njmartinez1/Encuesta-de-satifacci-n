import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Employee, Evaluation, Assignment, Question, QuestionCategory, QuestionSection, QuestionType } from './types.ts';
import EvaluationForm from './components/EvaluationForm.tsx';
import ResultsDashboard from './components/ResultsDashboard.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import QuestionsPanel from './components/QuestionsPanel.tsx';
import { Download, LayoutDashboard, ClipboardList, LogOut, ChevronRight, Settings, HelpCircle, Mail } from 'lucide-react';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient.ts';
import { useModal } from './components/ModalProvider.tsx';

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

type AssignmentRow = { evaluator_id: string; target_id: string };
type EvaluatorQuestionRow = { evaluator_id: string; question_id: number };
type EvaluationRow = {
  evaluator_id: string;
  evaluated_id: string;
  answers: Record<string, number | string>;
  comments: string | null;
  created_at: string | null;
};

const mapProfile = (profile: ProfileRow): Employee => ({
  id: profile.id,
  email: profile.email ?? '',
  name: profile.name || profile.email || 'Sin nombre',
  role: profile.role || 'Sin cargo',
  isAdmin: Boolean(profile.is_admin),
});

const App: React.FC = () => {
  const { showAlert } = useModal();
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [evaluatorQuestions, setEvaluatorQuestions] = useState<Record<string, number[]>>({});
  const [view, setView] = useState<'survey' | 'results' | 'admin' | 'questions'>('survey');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedEvaluationSection, setSelectedEvaluationSection] = useState<QuestionSection | null>(null);
  const [selectedInternalCategory, setSelectedInternalCategory] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [loginMode, setLoginMode] = useState<'link' | 'password'>('password');
  const [passwordInput, setPasswordInput] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoadingSession(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!session) {
        setCurrentUser(null);
        setEmployees([]);
        setAssignments([]);
        setEvaluations([]);
        setQuestions([]);
        setCategories([]);
        setEvaluatorQuestions({});
        return;
      }

      setIsLoadingData(true);
      setAuthError(null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, name, role, is_admin')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profileData) {
        setAuthError('Tu cuenta no tiene acceso.');
        await supabase.auth.signOut();
        setIsLoadingData(false);
        return;
      }

      const userProfile = mapProfile(profileData as ProfileRow);
      setCurrentUser(userProfile);

      const isAdmin = userProfile.isAdmin;

      const assignmentsQuery = supabase.from('assignments').select('evaluator_id, target_id');
      if (!isAdmin) assignmentsQuery.eq('evaluator_id', userProfile.id);

      const evaluatorQuestionsQuery = supabase.from('evaluator_questions').select('evaluator_id, question_id');
      if (!isAdmin) evaluatorQuestionsQuery.eq('evaluator_id', userProfile.id);

      const evaluationsQuery = supabase
        .from('evaluations')
        .select('evaluator_id, evaluated_id, answers, comments, created_at');
      if (!isAdmin) evaluationsQuery.eq('evaluator_id', userProfile.id);

      const [
        profilesRes,
        assignmentsRes,
        evaluatorQuestionsRes,
        evaluationsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id, email, name, role, is_admin'),
        assignmentsQuery,
        evaluatorQuestionsQuery,
        evaluationsQuery,
      ]);

      const categoriesPrimary = await supabase
        .from('question_categories')
        .select('name, section')
        .order('name');
      let categoriesData = categoriesPrimary.data;
      let categoriesError = categoriesPrimary.error;
      if (categoriesError) {
        const fallback = await supabase.from('question_categories').select('name').order('name');
        categoriesData = fallback.data;
        categoriesError = fallback.error;
      }

      const questionsPrimary = await supabase
        .from('questions')
        .select('id, text, category, section, question_type, options')
        .order('id');
      let questionsData = questionsPrimary.data;
      let questionsError = questionsPrimary.error;
      if (questionsError) {
        const fallback = await supabase.from('questions').select('id, text, category, section').order('id');
        questionsData = fallback.data;
        questionsError = fallback.error;
      }

      if (profilesRes.error || questionsError || categoriesError || assignmentsRes.error || evaluatorQuestionsRes.error || evaluationsRes.error) {
        setAuthError('No se pudieron cargar los datos.');
        setIsLoadingData(false);
        return;
      }

      const employeesList = (profilesRes.data || []).map((profile) => mapProfile(profile as ProfileRow));
      const questionsList = (questionsData || []).map(row => ({
        id: row.id,
        text: row.text,
        category: row.category,
        section: row.section ?? 'peer',
        type: (row.question_type ?? 'scale') as QuestionType,
        options: Array.isArray(row.options) ? row.options : undefined,
      })) as Question[];
      const categoriesList = (categoriesData || []).map(row => ({
        name: row.name,
        section: row.section ?? 'peer',
      })) as QuestionCategory[];
      const derivedCategories = Array.from(
        new Map(
          questionsList.map(question => [
            `${question.category}-${question.section}`,
            { name: question.category, section: question.section },
          ])
        ).values()
      );

      const assignmentRows = (assignmentsRes.data || []) as AssignmentRow[];
      const assignmentsMap = new Map<string, string[]>();
      assignmentRows.forEach(row => {
        const targets = assignmentsMap.get(row.evaluator_id) || [];
        targets.push(row.target_id);
        assignmentsMap.set(row.evaluator_id, targets);
      });
      const assignmentsList: Assignment[] = Array.from(assignmentsMap.entries()).map(([evaluatorId, targets]) => ({
        evaluatorId,
        targets,
      }));

      const evaluatorRows = (evaluatorQuestionsRes.data || []) as EvaluatorQuestionRow[];
      const evaluatorMap: Record<string, number[]> = {};
      evaluatorRows.forEach(row => {
        if (!evaluatorMap[row.evaluator_id]) evaluatorMap[row.evaluator_id] = [];
        evaluatorMap[row.evaluator_id].push(row.question_id);
      });
      const questionIds = questionsList.map(question => question.id);
      employeesList.forEach(emp => {
        if (!evaluatorMap[emp.id]) evaluatorMap[emp.id] = questionIds;
      });

      const evaluationsData = (evaluationsRes.data || []) as EvaluationRow[];
      const evaluationsList = evaluationsData.map(row => ({
        evaluatorId: row.evaluator_id,
        evaluatedId: row.evaluated_id,
        answers: (row.answers || {}) as { [questionId: number]: number | string },
        comments: row.comments || '',
        timestamp: row.created_at ? new Date(row.created_at).toLocaleString() : '',
      }));

      setEmployees(employeesList);
      setQuestions(questionsList);
      setCategories(categoriesList.length ? categoriesList : derivedCategories);
      setAssignments(assignmentsList);
      setEvaluatorQuestions(evaluatorMap);
      setEvaluations(evaluationsList);
      setIsLoadingData(false);
    };

    loadData();
  }, [session]);

  useEffect(() => {
    if (!currentUser?.isAdmin && view !== 'survey') {
      setView('survey');
    }
  }, [currentUser, view]);

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setLinkSent(false);
    if (!emailInput.trim() || !passwordInput) {
      setAuthError('Ingresa correo y contrasena.');
      return;
    }
    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password: passwordInput,
    });
    setIsSigningIn(false);
    if (error) {
      setAuthError('No se pudo iniciar sesion.');
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contrasenas no coinciden.');
      return;
    }
    setIsUpdatingPassword(true);
    const existingMetadata = session?.user?.user_metadata ?? {};
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { ...existingMetadata, must_change_password: false },
    });
    setIsUpdatingPassword(false);
    if (error) {
      setPasswordError('No se pudo actualizar la contrasena.');
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  };

  const handleMagicLinkLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setLinkSent(false);
    if (!emailInput.trim()) {
      setAuthError('Ingresa tu correo corporativo.');
      return;
    }
    setIsSendingLink(true);
    if (!supabaseUrl || !supabaseAnonKey) {
      setIsSendingLink(false);
      setAuthError('Configuracion de Supabase incompleta.');
      return;
    }
    const response = await fetch(`${supabaseUrl}/functions/v1/send-magic-link`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailInput.trim(),
        redirectTo: window.location.origin,
      }),
    });
    const data = await response.json().catch(() => null);
    setIsSendingLink(false);
    if (!response.ok) {
      setAuthError(data?.error || 'No se pudo enviar el enlace. Verifica el correo.');
      return;
    }
    setLinkSent(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedTargetId(null);
    setSelectedEvaluationSection(null);
    setSelectedInternalCategory(null);
    setView('survey');
  };

  const handleSurveyBack = () => {
    if (selectedEvaluationSection === 'internal' && selectedInternalCategory) {
      setSelectedInternalCategory(null);
      return;
    }
    setSelectedTargetId(null);
    setSelectedEvaluationSection(null);
    setSelectedInternalCategory(null);
  };

  const formatInternalCommentBlock = (category: string | null, comment: string) => {
    const trimmed = comment.trim();
    if (!trimmed) return '';
    const safeCategory = category?.trim();
    if (safeCategory) {
      return `[[internal|${safeCategory}]] ${trimmed}`;
    }
    return `[[internal]] ${trimmed}`;
  };

  const getInternalCategoriesFromAnswers = (answers: Record<number, number | string>) => {
    const categories = new Set<string>();
    Object.keys(answers).forEach((questionId) => {
      const question = questions.find(item => item.id === Number(questionId));
      if (question?.section === 'internal') {
        categories.add(question.category);
      }
    });
    return Array.from(categories);
  };

  const handleSaveEvaluation = async (evalData: Evaluation) => {
    const existingEvaluation = evaluations.find(
      evaluation => evaluation.evaluatorId === evalData.evaluatorId && evaluation.evaluatedId === evalData.evaluatedId
    );
    const shouldMerge = selectedEvaluationSection === 'internal' && existingEvaluation;
    const mergedAnswers = shouldMerge
      ? { ...existingEvaluation.answers, ...evalData.answers }
      : evalData.answers;
    let existingComments = existingEvaluation?.comments?.trim() || '';
    if (shouldMerge && existingComments && !/\[\[internal(\||\]\])/.test(existingComments)) {
      const existingCategories = getInternalCategoriesFromAnswers(existingEvaluation.answers);
      existingComments = formatInternalCommentBlock(existingCategories.length === 1 ? existingCategories[0] : null, existingComments);
    }
    const newCommentBlock = selectedEvaluationSection === 'internal'
      ? formatInternalCommentBlock(selectedInternalCategory, evalData.comments)
      : evalData.comments.trim();
    const mergedComments = shouldMerge
      ? [existingComments, newCommentBlock].filter(Boolean).join('\n\n')
      : newCommentBlock;

    const { error } = await supabase
      .from('evaluations')
      .upsert(
        {
          evaluator_id: evalData.evaluatorId,
          evaluated_id: evalData.evaluatedId,
          answers: mergedAnswers,
          comments: mergedComments,
        },
        { onConflict: 'evaluator_id,evaluated_id' }
      );

    if (error) {
      showAlert('No se pudo guardar la evaluacion.');
      return false;
    }

    setEvaluations(prev => {
      const filtered = prev.filter(e => !(e.evaluatorId === evalData.evaluatorId && e.evaluatedId === evalData.evaluatedId));
      return [...filtered, { ...evalData, answers: mergedAnswers, comments: mergedComments }];
    });
    setSelectedTargetId(null);
    if (selectedEvaluationSection === 'internal') {
      setSelectedInternalCategory(null);
    } else {
      setSelectedEvaluationSection(null);
    }
    return true;
  };

  const handleUpdateEmployee = async (id: string, updates: { name: string; role: string }) => {
    const { error } = await supabase
      .from('profiles')
      .update({ name: updates.name, role: updates.role })
      .eq('id', id);
    if (error) {
      showAlert('No se pudo actualizar el perfil.');
      return;
    }
    setEmployees(prev => prev.map(emp => (emp.id === id ? { ...emp, ...updates } : emp)));
    if (currentUser?.id === id) {
      setCurrentUser(prev => (prev ? { ...prev, ...updates } : prev));
    }
  };

  const handleToggleAssignment = async (evaluatorId: string, targetId: string) => {
    const existing = assignments.find(a => a.evaluatorId === evaluatorId)?.targets.includes(targetId);
    if (existing) {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('evaluator_id', evaluatorId)
        .eq('target_id', targetId);
      if (error) {
        showAlert('No se pudo actualizar la asignacion.');
        return;
      }
      setAssignments(prev => prev.map(a => (
        a.evaluatorId === evaluatorId
          ? { ...a, targets: a.targets.filter(tid => tid !== targetId) }
          : a
      )).filter(a => a.targets.length > 0));
      return;
    }

    const { error } = await supabase.from('assignments').insert({ evaluator_id: evaluatorId, target_id: targetId });
    if (error) {
      showAlert('No se pudo actualizar la asignacion.');
      return;
    }
    setAssignments(prev => {
      const existingAssignment = prev.find(a => a.evaluatorId === evaluatorId);
      if (existingAssignment) {
        return prev.map(a => a.evaluatorId === evaluatorId ? { ...a, targets: [...a.targets, targetId] } : a);
      }
      return [...prev, { evaluatorId, targets: [targetId] }];
    });
  };

  const handleUpdateEvaluatorQuestions = async (evaluatorId: string, questionIds: number[]) => {
    const { error: deleteError } = await supabase
      .from('evaluator_questions')
      .delete()
      .eq('evaluator_id', evaluatorId);
    if (deleteError) {
      showAlert('No se pudo actualizar las preguntas.');
      return;
    }

    if (questionIds.length > 0) {
      const rows = questionIds.map(questionId => ({
        evaluator_id: evaluatorId,
        question_id: questionId,
      }));
      const { error: insertError } = await supabase.from('evaluator_questions').insert(rows);
      if (insertError) {
        showAlert('No se pudo actualizar las preguntas.');
        return;
      }
    }

    setEvaluatorQuestions(prev => ({ ...prev, [evaluatorId]: questionIds }));
  };

  const handleAddQuestion = async (text: string, category: string, section: QuestionSection, type: QuestionType, options: string[]) => {
    const { data, error } = await supabase
      .from('questions')
      .insert({ text, category, section, question_type: type, options: type === 'scale' ? options : null })
      .select('id, text, category, section, question_type, options')
      .single();
    if (error || !data) {
      showAlert('No se pudo crear la pregunta.');
      return;
    }

    const newQuestion = {
      id: data.id,
      text: data.text,
      category: data.category,
      section: data.section ?? section,
      type: (data.question_type ?? type) as QuestionType,
      options: Array.isArray(data.options) ? data.options : (type === 'scale' ? options : undefined),
    } as Question;
    setQuestions(prev => [...prev, newQuestion].sort((a, b) => a.id - b.id));
    if (!categories.some(cat => cat.name === category)) {
      setCategories(prev => [...prev, { name: category, section }]);
    }
  };

  const handleUpdateQuestion = async (id: number, text: string, category: string, section: QuestionSection, type: QuestionType, options: string[]) => {
    const { error } = await supabase
      .from('questions')
      .update({ text, category, section, question_type: type, options: type === 'scale' ? options : null })
      .eq('id', id);
    if (error) {
      showAlert('No se pudo actualizar la pregunta.');
      return;
    }
    setQuestions(prev => prev.map(q => (
      q.id === id
        ? { ...q, text, category, section, type, options: type === 'scale' ? options : undefined }
        : q
    )));
  };

  const handleDeleteQuestion = async (id: number) => {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) {
      showAlert('No se pudo eliminar la pregunta.');
      return;
    }
    setQuestions(prev => prev.filter(q => q.id !== id));
    setEvaluatorQuestions(prev => {
      const updated: Record<string, number[]> = {};
      Object.entries(prev).forEach(([evaluatorId, questionIds]) => {
        updated[evaluatorId] = questionIds.filter(qid => qid !== id);
      });
      return updated;
    });
  };

  const handleAddCategory = async (name: string, section: QuestionSection) => {
    const { error } = await supabase.from('question_categories').insert({ name, section });
    if (error) {
      showAlert('No se pudo crear la categoria.');
      return;
    }
    setCategories(prev => [...prev, { name, section }]);
  };

  const handleUpdateCategory = async (prevName: string, nextName: string) => {
    const { error } = await supabase.from('question_categories').update({ name: nextName }).eq('name', prevName);
    if (error) {
      showAlert('No se pudo actualizar la categoria.');
      return;
    }
    setCategories(prev => prev.map(cat => (cat.name === prevName ? { ...cat, name: nextName } : cat)));
    setQuestions(prev => prev.map(q => (q.category === prevName ? { ...q, category: nextName } : q)));
  };

  const handleDeleteCategory = async (name: string, fallback: string) => {
    const { error: updateError } = await supabase.from('questions').update({ category: fallback }).eq('category', name);
    if (updateError) {
      showAlert('No se pudo actualizar las preguntas.');
      return;
    }
    const { error: deleteError } = await supabase.from('question_categories').delete().eq('name', name);
    if (deleteError) {
      showAlert('No se pudo eliminar la categoria.');
      return;
    }
    setCategories(prev => prev.filter(cat => cat.name !== name));
    setQuestions(prev => prev.map(q => (q.category === name ? { ...q, category: fallback } : q)));
  };

  const handleCreateUser = async (payload: { email: string; name: string; role: string; isAdmin: boolean }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
      throw new Error('Sesion no valida.');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: payload.email,
        name: payload.name,
        role: payload.role,
        is_admin: payload.isAdmin,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'No se pudo crear el usuario.');
    }

    if (!data?.profile) {
      throw new Error('Respuesta invalida del servidor.');
    }

    const created = mapProfile(data.profile as ProfileRow);
    setEmployees(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };

  const handleResetPassword = async (userId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
      throw new Error('Sesion no valida.');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        password: '123456',
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'No se pudo restablecer la contrasena.');
    }

  };

  const exportToCSV = () => {
    if (evaluations.length === 0) return;
    if (questions.length === 0) {
      showAlert("No hay preguntas configuradas.");
      return;
    }
    const headers = ["Evaluador", "Evaluado", ...questions.map(q => `P${q.id}`), "Comentarios", "Fecha"];
    const rows = evaluations.map(e => {
      const evaluator = employees.find(emp => emp.id === e.evaluatorId)?.name || 'N/A';
      const evaluated = employees.find(emp => emp.id === e.evaluatedId)?.name || 'N/A';
      const scores = questions.map(q => {
        const value = e.answers[q.id];
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
        return '';
      });
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

  const isAdmin = Boolean(currentUser?.isAdmin);
  const questionIdsForCurrentUser = currentUser
    ? evaluatorQuestions[currentUser.id] || questions.map(question => question.id)
    : [];
  const questionsForCurrentUser = questions.filter(question => questionIdsForCurrentUser.includes(question.id));
  const peerQuestionsForCurrentUser = questionsForCurrentUser.filter(question => question.section === 'peer');
  const internalQuestionsForCurrentUser = questionsForCurrentUser.filter(question => question.section === 'internal');
  const internalCategories = Array.from(
    new Set(internalQuestionsForCurrentUser.map(question => question.category))
  ).sort((a, b) => a.localeCompare(b));
  const internalQuestionsForSelectedCategory = selectedInternalCategory
    ? internalQuestionsForCurrentUser.filter(question => question.category === selectedInternalCategory)
    : [];
  const internalQuestionIds = internalQuestionsForCurrentUser.map(question => question.id);
  const internalEvaluation = currentUser
    ? evaluations.find(e => e.evaluatorId === currentUser.id && e.evaluatedId === currentUser.id)
    : null;
  const hasAnswer = (question: Question, value: number | string | undefined) => {
    if (question.type === 'text') {
      return typeof value === 'string' && value.trim().length > 0;
    }
    return typeof value === 'number';
  };
  const internalEvaluationCompleted = Boolean(
    internalEvaluation
    && internalQuestionIds.length > 0
    && internalQuestionsForCurrentUser.every(question => hasAnswer(question, internalEvaluation.answers[question.id]))
  );
  const getInternalCategoryStats = (category: string) => {
    const categoryQuestions = internalQuestionsForCurrentUser.filter(question => question.category === category);
    const answered = internalEvaluation
      ? categoryQuestions.filter(question => hasAnswer(question, internalEvaluation.answers[question.id])).length
      : 0;
    return {
      total: categoryQuestions.length,
      answered,
      completed: categoryQuestions.length > 0 && answered === categoryQuestions.length,
    };
  };

  const currentAssignment = currentUser ? assignments.find(a => a.evaluatorId === currentUser.id) : null;
  const targetsToEvaluate = currentAssignment
    ? currentAssignment.targets.map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[]
    : [];

  const tabs = [
    { id: 'survey', label: 'Encuestas', icon: ClipboardList, show: true },
    { id: 'results', label: 'Resultados', icon: LayoutDashboard, show: isAdmin },
    { id: 'questions', label: 'Preguntas', icon: HelpCircle, show: isAdmin },
    { id: 'admin', label: 'Administracion', icon: Settings, show: isAdmin },
  ].filter(tab => tab.show);

  const mustChangePassword = false;

  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Cargando...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#005187] to-[#003a5e]">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt="Encuestas Reinvented"
              className="mx-auto w-40 h-auto max-w-full object-contain mb-4"
            />
            <h1 className="text-3xl font-bold text-slate-800">Encuestas Reinvented</h1>
            <p className="text-slate-500 mt-2">Ingresa tu correo para recibir un enlace de acceso.</p>
          </div>
          {authError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg mb-4">
              {authError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => { setLoginMode('link'); setAuthError(null); setLinkSent(false); }}
              className={`py-2 rounded-lg text-sm font-semibold ${loginMode === 'link' ? 'bg-[#005187] text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Enlace
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('password'); setAuthError(null); setLinkSent(false); }}
              className={`py-2 rounded-lg text-sm font-semibold ${loginMode === 'password' ? 'bg-[#005187] text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Contraseña
            </button>
          </div>
          {loginMode === 'link' && linkSent ? (
            <div className="space-y-3">
              <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                Revisa tu correo para continuar.
              </div>
              <button
                type="button"
                onClick={() => setLinkSent(false)}
                className="w-full border border-[#c7dceb] text-[#00406b] px-4 py-2 rounded-lg font-semibold"
              >
                Enviar otro enlace
              </button>
            </div>
          ) : loginMode === 'link' ? (
            <form onSubmit={handleMagicLinkLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Correo corporativo</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder="usuario@empresa.com"
                  className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSendingLink}
                className="w-full flex items-center justify-center gap-2 bg-[#005187] hover:bg-[#00406b] text-white px-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-60"
              >
                <Mail size={18} /> {isSendingLink ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Correo corporativo</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder="usuario@empresa.com"
                  className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Contraseña</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="123456"
                  className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-2 bg-[#005187] hover:bg-[#00406b] text-white px-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-60"
              >
                {isSigningIn ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (isLoadingData || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Cargando datos...
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Actualiza tu contrasena</h1>
            <p className="text-slate-500 mt-2">Debes cambiar la contrasena inicial para continuar.</p>
          </div>
          {passwordError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg mb-4">
              {passwordError}
            </div>
          )}
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Nueva contrasena</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Confirmar contrasena</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[#005187] outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="w-full bg-[#005187] hover:bg-[#00406b] text-white px-4 py-3 rounded-lg font-semibold disabled:opacity-60"
            >
              {isUpdatingPassword ? 'Actualizando...' : 'Actualizar contrasena'}
            </button>
          </form>
          <button
            onClick={handleLogout}
            className="w-full mt-4 text-sm text-slate-500 hover:text-slate-700"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white p-2 rounded-lg">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt="Encuestas Reinvented"
                className="w-28 h-auto max-w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 hidden sm:block">Encuestas Reinvented</h1>
              <p className="text-xs text-slate-500">{currentUser.name}</p>
            </div>
          </div>

          <nav className="flex items-center gap-3">
            <div className="bg-slate-100 rounded-full p-1 flex items-center gap-1 overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id as 'survey' | 'results' | 'admin' | 'questions')}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${isActive ? 'bg-[#005187] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-full transition-colors" aria-label="Cerrar sesion">
              <LogOut size={20} />
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {authError && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg">
            {authError}
          </div>
        )}
        {view === 'survey' && (
          <div className="space-y-8">
            {!selectedEvaluationSection ? (
              <div className="max-w-3xl mx-auto space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Tus evaluaciones pendientes</h2>
                  <p className="text-slate-500">Selecciona la seccion que deseas completar.</p>
                </div>

                {internalQuestionsForCurrentUser.length > 0 && (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-slate-800">Satisfaccion interna</h3>
                      <p className="text-sm text-slate-500">Evalua la institucion y las condiciones internas.</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedEvaluationSection('internal');
                        setSelectedInternalCategory(null);
                        setSelectedTargetId(null);
                      }}
                      className={`flex items-center justify-between w-full p-5 rounded-xl border-2 transition-all ${internalEvaluationCompleted ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100 hover:border-[#c7dceb] hover:shadow-md'}`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${internalEvaluationCompleted ? 'bg-emerald-200 text-emerald-700' : 'bg-[#dbe9f3] text-[#00406b]'}`}>
                          SI
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-800">Satisfaccion interna</h4>
                          <p className="text-sm text-slate-500">Encuesta institucional</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {internalEvaluationCompleted && <span className="text-xs font-bold uppercase text-emerald-600 bg-emerald-100 px-2 py-1 rounded">Completado</span>}
                        <ChevronRight className={internalEvaluationCompleted ? 'text-emerald-400' : 'text-slate-300'} />
                      </div>
                    </button>
                  </div>
                )}

                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Evaluacion de pares</h3>
                    <p className="text-sm text-slate-500">Companeros asignados para calificar.</p>
                  </div>
                  <div className="grid gap-4">
                    {peerQuestionsForCurrentUser.length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-xl border text-slate-400">
                        No hay preguntas para evaluacion de pares configuradas.
                      </div>
                    ) : (
                      <>
                        {targetsToEvaluate.map(target => {
                          const isCompleted = evaluations.some(e => e.evaluatorId === currentUser.id && e.evaluatedId === target.id);
                          return (
                            <button
                              key={target.id}
                              onClick={() => {
                                setSelectedEvaluationSection('peer');
                                setSelectedInternalCategory(null);
                                setSelectedTargetId(target.id);
                              }}
                              className={`flex items-center justify-between p-5 rounded-xl border-2 transition-all ${isCompleted ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100 hover:border-[#c7dceb] hover:shadow-md'}`}
                            >
                              <div className="flex items-center gap-4 text-left">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${isCompleted ? 'bg-emerald-200 text-emerald-700' : 'bg-[#dbe9f3] text-[#00406b]'}`}>
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
                        {targetsToEvaluate.length === 0 && (
                          <div className="text-center py-16 bg-white rounded-xl border text-slate-400">
                            No tienes evaluaciones asignadas.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto">
                <button
                  onClick={handleSurveyBack}
                  className="mb-6 text-sm font-medium text-slate-500 hover:text-[#005187] flex items-center gap-1"
                >
                  Volver
                </button>
                {selectedEvaluationSection === 'internal' && !selectedInternalCategory ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">Categorias de satisfaccion interna</h3>
                      <p className="text-sm text-slate-500">Selecciona el area que deseas evaluar.</p>
                    </div>
                    <div className="grid gap-4">
                      {internalCategories.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border text-slate-400">
                          No hay categorias configuradas para satisfaccion interna.
                        </div>
                      ) : (
                        internalCategories.map(category => {
                          const stats = getInternalCategoryStats(category);
                          const badge = category.trim().charAt(0).toUpperCase() || 'I';
                          return (
                            <button
                              key={category}
                              onClick={() => setSelectedInternalCategory(category)}
                              className={`flex items-center justify-between p-5 rounded-xl border-2 transition-all ${stats.completed ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100 hover:border-[#c7dceb] hover:shadow-md'}`}
                            >
                              <div className="flex items-center gap-4 text-left">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${stats.completed ? 'bg-emerald-200 text-emerald-700' : 'bg-[#dbe9f3] text-[#00406b]'}`}>
                                  {badge}
                                </div>
                                <div>
                                  <h4 className="font-semibold text-slate-800">{category}</h4>
                                  <p className="text-sm text-slate-500">{stats.answered}/{stats.total} respondidas</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {stats.completed && <span className="text-xs font-bold uppercase text-emerald-600 bg-emerald-100 px-2 py-1 rounded">Completado</span>}
                                <ChevronRight className={stats.completed ? 'text-emerald-400' : 'text-slate-300'} />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <EvaluationForm
                    evaluatorId={currentUser.id}
                    targetEmployee={selectedEvaluationSection === 'internal'
                      ? { ...currentUser, name: 'Institucion', role: `Satisfaccion interna${selectedInternalCategory ? ` - ${selectedInternalCategory}` : ''}` }
                      : employees.find(e => e.id === selectedTargetId)!}
                    questions={selectedEvaluationSection === 'internal' ? internalQuestionsForSelectedCategory : peerQuestionsForCurrentUser}
                    onSave={handleSaveEvaluation}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {view === 'results' && isAdmin && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Panel de resultados</h2>
                <p className="text-slate-500">Estadisticas y analisis de desempeno.</p>
              </div>
              <button onClick={exportToCSV} className="flex items-center gap-2 bg-[#005187] hover:bg-[#00406b] text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all" disabled={evaluations.length === 0}>
                <Download size={18} /> Exportar CSV
              </button>
            </div>
            <ResultsDashboard evaluations={evaluations} employees={employees} questions={questions} />
          </div>
        )}

        {view === 'questions' && isAdmin && (
          <QuestionsPanel
            questions={questions}
            categories={categories}
            onAddQuestion={handleAddQuestion}
            onUpdateQuestion={handleUpdateQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        )}

        {view === 'admin' && isAdmin && (
          <AdminPanel
            employees={employees}
            assignments={assignments}
            questions={questions}
            evaluatorQuestions={evaluatorQuestions}
            onUpdateEmployee={handleUpdateEmployee}
            onToggleAssignment={handleToggleAssignment}
            onUpdateEvaluatorQuestions={handleUpdateEvaluatorQuestions}
            onCreateUser={handleCreateUser}
            onResetPassword={handleResetPassword}
          />
        )}
      </main>
    </div>
  );
};

export default App;
