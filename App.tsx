import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AccessRole, Employee, Evaluation, EvaluationPeriod, Assignment, Question, QuestionCategory, QuestionSection, QuestionSectionOption, QuestionType } from './types.ts';
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
  access_role: string | null;
  group_name: string | null;
  campus: string | null;
  is_admin: boolean | null;
};

type AssignmentRow = { evaluator_id: string; target_id: string };
type EvaluatorQuestionRow = { evaluator_id: string; question_id: number };
type EvaluationRow = {
  evaluator_id: string;
  evaluated_id: string;
  period_id: string | null;
  answers: Record<string, number | string>;
  comments: string | null;
  is_anonymous: boolean | null;
  created_at: string | null;
};

type PeriodRow = {
  id: string;
  name: string;
  academic_year: string;
  period_number: number;
  starts_at: string;
  ends_at: string;
};

type SectionOrderRow = { section: string | null; sort_order: number | null };

const DEFAULT_SECTION_OPTIONS: QuestionSectionOption[] = [
  { value: 'peer', label: 'Evaluación de pares' },
  { value: 'internal', label: 'Satisfacción interna' },
];
const OPTIONAL_CATEGORIES = new Set(['alimentacion', 'enfermeria', 'seguros']);
const normalizeCategoryName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();
const isOptionalCategory = (category: string) => OPTIONAL_CATEGORIES.has(normalizeCategoryName(category));

const buildSectionOptions = (rows: SectionOrderRow[] | null | undefined): QuestionSectionOption[] => {
  if (!rows || rows.length === 0) {
    return DEFAULT_SECTION_OPTIONS;
  }
  const orderMap = new Map<string, number>();
  rows.forEach(row => {
    if (row.section) {
      orderMap.set(row.section, row.sort_order ?? 0);
    }
  });
  return DEFAULT_SECTION_OPTIONS
    .map((section, index) => ({
      ...section,
      sortOrder: orderMap.get(section.value) ?? index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder, ...section }) => section);
};

const sortQuestionsBySection = (items: Question[], sections: QuestionSectionOption[]) => {
  const orderMap = new Map<QuestionSection, number>();
  sections.forEach((section, index) => {
    orderMap.set(section.value, index);
  });
  return [...items].sort((a, b) => {
    const sectionOrderA = orderMap.get(a.section) ?? 0;
    const sectionOrderB = orderMap.get(b.section) ?? 0;
    if (sectionOrderA !== sectionOrderB) {
      return sectionOrderA - sectionOrderB;
    }
    const aOrder = a.sortOrder ?? a.id;
    const bOrder = b.sortOrder ?? b.id;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.id - b.id;
  });
};
const normalizeAccessRole = (value?: string | null): AccessRole => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'viewer') return 'viewer';
  if (normalized === 'principal') return 'principal';
  if (normalized === 'educator') return 'educator';
  return 'educator';
};

const mapProfile = (profile: ProfileRow): Employee => ({
  id: profile.id,
  email: profile.email ?? '',
  name: profile.name || profile.email || 'Sin nombre',
  role: profile.role || 'Sin cargo',
  group: profile.group_name || '',
  campus: profile.campus || '',
  isAdmin: Boolean(profile.is_admin),
  accessRole: profile.is_admin ? 'admin' : normalizeAccessRole(profile.access_role),
});

type ThemePalette = {
  primary: string;
  primaryDark: string;
  primaryDarker: string;
  primarySoft: string;
  primaryTint: string;
  primaryBorder: string;
  complete: string;
  completeSoft: string;
  completeBorder: string;
  completeBadgeBg: string;
  completeBadgeBorder: string;
  logo: {
    one: string;
    two: string;
    three: string;
    four: string;
  };
};

const DEFAULT_PRIMARY = '#005187';
const DEFAULT_LOGO_COLORS = {
  one: '#A0A0A0',
  two: '#E25139',
  three: '#FCDA35',
  four: '#3C7EDD',
};

const DEFAULT_THEME: ThemePalette = {
  primary: DEFAULT_PRIMARY,
  primaryDark: '#00406b',
  primaryDarker: '#003a5e',
  primarySoft: '#dbe9f3',
  primaryTint: '#eef5fa',
  primaryBorder: '#c7dceb',
  complete: '#34d399',
  completeSoft: '#effbf7',
  completeBorder: '#d6f6eb',
  completeBadgeBg: '#d6f6eb',
  completeBadgeBorder: '#aeedd6',
  logo: DEFAULT_LOGO_COLORS,
};

const clampChannel = (value: number) => Math.min(255, Math.max(0, value));

const hexToRgb = (hex: string) => {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return null;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
};

const channelToHex = (value: number) => clampChannel(Math.round(value)).toString(16).padStart(2, '0');

const mixHex = (base: string, mix: string, mixRatio: number) => {
  const baseRgb = hexToRgb(base);
  const mixRgb = hexToRgb(mix);
  if (!baseRgb || !mixRgb) return base;
  const ratio = Math.min(1, Math.max(0, mixRatio));
  const r = baseRgb.r * (1 - ratio) + mixRgb.r * ratio;
  const g = baseRgb.g * (1 - ratio) + mixRgb.g * ratio;
  const b = baseRgb.b * (1 - ratio) + mixRgb.b * ratio;
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
};

const invertHex = (color: string) => {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `#${channelToHex(255 - rgb.r)}${channelToHex(255 - rgb.g)}${channelToHex(255 - rgb.b)}`;
};

const buildLogoPalette = (primary: string, useDefault: boolean) => {
  if (useDefault) return DEFAULT_LOGO_COLORS;
  const complement = invertHex(primary);
  return {
    one: mixHex(primary, '#ffffff', 0.65),
    two: mixHex(complement, '#000000', 0.15),
    three: mixHex(complement, '#ffffff', 0.25),
    four: mixHex(primary, '#000000', 0.15),
  };
};

const buildThemePalette = (primary: string, useDefaultLogo: boolean): ThemePalette => ({
  primary,
  primaryDark: mixHex(primary, '#000000', 0.18),
  primaryDarker: mixHex(primary, '#000000', 0.32),
  primarySoft: mixHex(primary, '#ffffff', 0.7),
  primaryTint: mixHex(primary, '#ffffff', 0.85),
  primaryBorder: mixHex(primary, '#ffffff', 0.55),
  complete: '#34d399',
  completeSoft: mixHex('#34d399', '#ffffff', 0.92),
  completeBorder: mixHex('#34d399', '#ffffff', 0.8),
  completeBadgeBg: mixHex('#34d399', '#ffffff', 0.8),
  completeBadgeBorder: mixHex('#34d399', '#ffffff', 0.6),
  logo: buildLogoPalette(primary, useDefaultLogo),
});

const normalizeCampusName = (value?: string | null) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '')
  .toLowerCase();

const getThemeForCampus = (campus?: string | null) => {
  const normalized = normalizeCampusName(campus);
  if (normalized === 'puembo') {
    const complete = '#40CCA1';
    const completeSoft = mixHex(complete, '#ffffff', 0.92);
    const completeBorder = mixHex(complete, '#ffffff', 0.8);
    const completeBadgeBg = mixHex(complete, '#ffffff', 0.8);
    const completeBadgeBorder = mixHex(complete, '#ffffff', 0.6);
    return {
      ...buildThemePalette('#40CCA1', false),
      complete,
      completeSoft,
      completeBorder,
      completeBadgeBg,
      completeBadgeBorder,
    };
  }
  if (normalized === 'santaclara') {
    const primaryBase = '#127EFF';
    const primary = mixHex(primaryBase, '#ffffff', 0.25);
    const complete = mixHex(primaryBase, '#ffffff', 0.35);
    return {
      ...buildThemePalette(primary, false),
      complete,
      completeSoft: mixHex(complete, '#ffffff', 0.92),
      completeBorder: mixHex(complete, '#ffffff', 0.8),
      completeBadgeBg: mixHex(complete, '#ffffff', 0.8),
      completeBadgeBorder: mixHex(complete, '#ffffff', 0.6),
    };
  }
  return DEFAULT_THEME;
};
const getLogoForCampus = (campus?: string | null) => {
  const normalized = normalizeCampusName(campus);
  if (normalized === 'puembo') {
    return 'Logo-puembo.svg';
  }
  if (normalized === 'santaclara') {
    return 'Logo-santaclara.svg';
  }
  return 'logo.svg';
};

const Logo: React.FC<{ className?: string; title?: string }> = ({ className, title }) => (
  <svg
    width="481"
    height="67"
    viewBox="0 0 481 67"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {title ? <title>{title}</title> : null}
    <path d="M32.3066 0.5C49.8705 0.500128 64.1131 14.8025 64.1133 32.4502C64.1133 50.098 49.8706 64.4012 32.3066 64.4014C14.7425 64.4014 0.5 50.0981 0.5 32.4502C0.500168 14.8025 14.7426 0.5 32.3066 0.5Z" fill="var(--logo-1)" stroke="var(--logo-1)" />
    <path d="M171.307 1.5C188.871 1.50013 203.113 15.8025 203.113 33.4502C203.113 51.098 188.871 65.4012 171.307 65.4014C153.743 65.4014 139.5 51.0981 139.5 33.4502C139.5 15.8025 153.743 1.5 171.307 1.5Z" fill="var(--logo-2)" stroke="var(--logo-2)" />
    <path d="M315.062 1.93945C332.626 1.93958 346.869 16.242 346.869 33.8896C346.869 51.5374 332.626 65.8407 315.062 65.8408C297.498 65.8408 283.256 51.5375 283.256 33.8896C283.256 16.2419 297.499 1.93945 315.062 1.93945Z" fill="var(--logo-3)" stroke="var(--logo-3)" />
    <path d="M448.674 0.939453C466.238 0.939582 480.48 15.242 480.48 32.8896C480.48 50.5374 466.238 64.8407 448.674 64.8408C431.11 64.8408 416.867 50.5375 416.867 32.8896C416.867 15.2419 431.11 0.939453 448.674 0.939453Z" fill="var(--logo-4)" stroke="var(--logo-4)" />
  </svg>
);

const App: React.FC = () => {
  const { showAlert } = useModal();
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [activePeriod, setActivePeriod] = useState<EvaluationPeriod | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [questionSections, setQuestionSections] = useState<QuestionSectionOption[]>(DEFAULT_SECTION_OPTIONS);
  const [evaluatorQuestions, setEvaluatorQuestions] = useState<Record<string, number[]>>({});
  const [view, setView] = useState<'survey' | 'results' | 'admin' | 'questions'>('survey');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedEvaluationSection, setSelectedEvaluationSection] = useState<QuestionSection | null>(null);
  const [selectedInternalCategory, setSelectedInternalCategory] = useState<string | null>(null);
  const [internalAnonymityChoice, setInternalAnonymityChoice] = useState<boolean | null>(null);
  const [isInternalAnonymityPromptOpen, setIsInternalAnonymityPromptOpen] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [loginMode, setLoginMode] = useState<'link' | 'password'>('link');
  const [passwordInput, setPasswordInput] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const theme = getThemeForCampus(currentUser?.campus);
  const themeStyle = {
    '--color-primary': theme.primary,
    '--color-primary-dark': theme.primaryDark,
    '--color-primary-darker': theme.primaryDarker,
    '--color-primary-soft': theme.primarySoft,
    '--color-primary-tint': theme.primaryTint,
    '--color-primary-border': theme.primaryBorder,
    '--color-complete': theme.complete,
    '--color-complete-soft': theme.completeSoft,
    '--color-complete-border': theme.completeBorder,
    '--color-complete-badge': theme.completeBadgeBg,
    '--color-complete-badge-border': theme.completeBadgeBorder,
    '--logo-1': theme.logo.one,
    '--logo-2': theme.logo.two,
    '--logo-3': theme.logo.three,
    '--logo-4': theme.logo.four,
  } as React.CSSProperties;

  const logoSrc = getLogoForCampus(currentUser?.campus);
  const isDefaultLogo = logoSrc === 'logo.svg';

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
        setPeriods([]);
        setActivePeriod(null);
        setSelectedPeriodId('');
        setQuestions([]);
        setCategories([]);
        setQuestionSections(DEFAULT_SECTION_OPTIONS);
        setEvaluatorQuestions({});
        setIsLoadingData(false);
        return;
      }

      setIsLoadingData(true);
      setAuthError(null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, name, role, group_name, campus, access_role, is_admin')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profileData) {
        setAuthError('Tu cuenta no tiene acceso.');
        setIsLoadingData(false);
        setCurrentUser(null);
        setSession(null);
        supabase.auth.signOut();
        return;
      }

      const userProfile = mapProfile(profileData as ProfileRow);
      setCurrentUser(userProfile);

      const isAdmin = userProfile.isAdmin;
      const isViewer = userProfile.accessRole === 'viewer';
      const isPrincipal = userProfile.accessRole === 'principal';

      const assignmentsQuery = supabase.from('assignments').select('evaluator_id, target_id');
      if (!isAdmin) assignmentsQuery.eq('evaluator_id', userProfile.id);

      const evaluatorQuestionsQuery = supabase.from('evaluator_questions').select('evaluator_id, question_id');
      if (!isAdmin) evaluatorQuestionsQuery.eq('evaluator_id', userProfile.id);

      const evaluationsQuery = supabase
        .from('evaluations')
        .select('evaluator_id, evaluated_id, period_id, answers, comments, is_anonymous, created_at');
      if (!isAdmin && !isViewer && !isPrincipal) evaluationsQuery.eq('evaluator_id', userProfile.id);

      const [
        profilesRes,
        assignmentsRes,
        evaluatorQuestionsRes,
        evaluationsRes,
        periodsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id, email, name, role, group_name, campus, access_role, is_admin'),
        assignmentsQuery,
        evaluatorQuestionsQuery,
        evaluationsQuery,
        supabase
          .from('evaluation_periods')
          .select('id, name, academic_year, period_number, starts_at, ends_at')
          .order('starts_at', { ascending: false }),
      ]);

      const categoriesPrimary = await supabase
        .from('question_categories')
        .select('name, section, sort_order, description')
        .order('sort_order', { ascending: true })
        .order('name');
      let categoriesData = categoriesPrimary.data;
      let categoriesError = categoriesPrimary.error;
      if (categoriesError) {
        const fallback = await supabase.from('question_categories').select('name, section').order('name');
        categoriesData = fallback.data;
        categoriesError = fallback.error;
      }

      const questionsPrimary = await supabase
        .from('questions')
        .select('id, text, category, section, question_type, options, sort_order, is_required')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      let questionsData = questionsPrimary.data;
      let questionsError = questionsPrimary.error;
      if (questionsError) {
        const fallback = await supabase.from('questions').select('id, text, category, section').order('id');
        questionsData = fallback.data;
        questionsError = fallback.error;
      }

      const sectionOrderRes = await supabase
        .from('question_sections')
        .select('section, sort_order')
        .order('sort_order', { ascending: true });

      if (profilesRes.error || questionsError || categoriesError || assignmentsRes.error || evaluatorQuestionsRes.error || evaluationsRes.error || periodsRes.error) {
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
        isRequired: isOptionalCategory(row.category) ? false : (row.is_required ?? true),
        sortOrder: row.sort_order ?? undefined,
      })) as Question[];
      const categoriesList = (categoriesData || []).map(row => ({
        name: row.name,
        section: row.section ?? 'peer',
        sortOrder: row.sort_order ?? 0,
        description: row.description ?? '',
      })) as QuestionCategory[];

      const derivedCategoriesMap = new Map<string, QuestionCategory>();
      questionsList.forEach(question => {
        const key = `${question.category}-${question.section}`;
        const current = derivedCategoriesMap.get(key);
        const orderValue = question.sortOrder ?? question.id;
        if (!current || orderValue < (current.sortOrder ?? orderValue)) {
          derivedCategoriesMap.set(key, {
            name: question.category,
            section: question.section,
            sortOrder: orderValue,
            description: '',
          });
        }
      });

      const derivedCategories = Array.from(derivedCategoriesMap.values()).sort((a, b) => {
        const aOrder = a.sortOrder ?? 0;
        const bOrder = b.sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });

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
        periodId: row.period_id ?? null,
        answers: (row.answers || {}) as { [questionId: number]: number | string },
        comments: row.comments || '',
        isAnonymous: row.is_anonymous ?? false,
        timestamp: row.created_at ? new Date(row.created_at).toLocaleString() : '',
      }));

      const sectionOptions = buildSectionOptions(
        sectionOrderRes.error ? null : (sectionOrderRes.data as SectionOrderRow[] | null)
      );
      const sortedQuestions = sortQuestionsBySection(questionsList, sectionOptions);

      const periodRows = (periodsRes.data || []) as PeriodRow[];
      const periodsList: EvaluationPeriod[] = periodRows.map(row => ({
        id: row.id,
        name: row.name,
        academicYear: row.academic_year,
        periodNumber: row.period_number,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      }));
      const now = new Date();
      const activePeriodFromList = periodsList.find(period => {
        const start = new Date(`${period.startsAt}T00:00:00`);
        const end = new Date(`${period.endsAt}T23:59:59`);
        return now >= start && now <= end;
      }) ?? null;

      setPeriods(periodsList);
      setActivePeriod(activePeriodFromList);
      setSelectedPeriodId(prev => {
        if (prev && periodsList.some(period => period.id === prev)) return prev;
        return activePeriodFromList?.id ?? (periodsList[0]?.id ?? '');
      });

      setEmployees(employeesList);
      setQuestions(sortedQuestions);
      setCategories(categoriesList.length ? categoriesList : derivedCategories);
      setQuestionSections(sectionOptions);
      setAssignments(assignmentsList);
      setEvaluatorQuestions(evaluatorMap);
      setEvaluations(evaluationsList);
      setIsLoadingData(false);
    };

    loadData().catch((error) => {
      console.error('Error cargando datos', error);
      setAuthError('No se pudieron cargar los datos.');
      setIsLoadingData(false);
      setCurrentUser(null);
      setSession(null);
      supabase.auth.signOut();
    });
  }, [session]);

  useEffect(() => {
    if (!currentUser) return;
    const isViewer = !currentUser.isAdmin && currentUser.accessRole === 'viewer';
    const isPrincipal = !currentUser.isAdmin && currentUser.accessRole === 'principal';
    const canViewResults = currentUser.isAdmin || isViewer || isPrincipal;
    const canViewSurvey = true;
    const isAllowedView = (
      (view === 'survey' && canViewSurvey)
      || (view === 'results' && canViewResults)
      || ((view === 'admin' || view === 'questions') && currentUser.isAdmin)
    );
    if (!isAllowedView) {
      setView(isViewer || isPrincipal ? 'results' : 'survey');
    }
  }, [currentUser, view]);

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setLinkSent(false);
    if (!emailInput.trim() || !passwordInput) {
      setAuthError('Ingresa correo y contraseña.');
      return;
    }
    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password: passwordInput,
    });
    setIsSigningIn(false);
    if (error) {
      setAuthError('No se pudo iniciar sesión.');
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
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
      setPasswordError('No se pudo actualizar la contraseña.');
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
    const redirectTo = import.meta.env.VITE_SITE_URL || (window.location.origin + import.meta.env.BASE_URL).replace(/\/+$/, '/');
    const response = await fetch(`${supabaseUrl}/functions/v1/send-magic-link`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailInput.trim(),
        redirectTo,
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
    setInternalAnonymityChoice(null);
    setIsInternalAnonymityPromptOpen(false);
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
    setInternalAnonymityChoice(null);
    setIsInternalAnonymityPromptOpen(false);
  };

  const handleStartInternalSurvey = () => {
    setSelectedTargetId(null);
    setSelectedInternalCategory(null);
    setInternalAnonymityChoice(null);
    setIsInternalAnonymityPromptOpen(true);
  };

  const handleInternalAnonymityChoice = (isAnonymous: boolean) => {
    setInternalAnonymityChoice(isAnonymous);
    setIsInternalAnonymityPromptOpen(false);
    setSelectedEvaluationSection('internal');
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
  const parseInternalCommentBlocks = (comments: string) => {
    const blocks = comments.split(/\n\s*\n/);
    const byCategory = new Map<string, string>();
    const uncategorized: string[] = [];
    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const match = trimmed.match(/^\[\[internal(?:\|([^\]]+))?\]\]\s*([\s\S]*)$/);
      if (match) {
        const category = (match[1] || '').trim();
        const body = (match[2] || '').trim();
        if (category) {
          byCategory.set(category, body);
        } else if (body) {
          uncategorized.push(body);
        }
        return;
      }
      uncategorized.push(trimmed);
    });
    return { byCategory, uncategorized: uncategorized.join('\n\n') };
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
    const periodId = activePeriod?.id;
    if (!periodId) {
      showAlert('No hay un periodo de evaluación activo.');
      return false;
    }
    const existingEvaluation = evaluations.find(
      evaluation => evaluation.evaluatorId === evalData.evaluatorId
        && evaluation.evaluatedId === evalData.evaluatedId
        && evaluation.periodId === periodId
    );
    if (selectedEvaluationSection === 'internal' && internalAnonymityChoice === null && !existingEvaluation) {
      showAlert('Selecciona si deseas que la encuesta sea anónima antes de continuar.');
      return false;
    }
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
    const internalAnonymityPreference = internalAnonymityChoice ?? evaluations.find(
      evaluation => evaluation.evaluatorId === evalData.evaluatorId
        && evaluation.evaluatedId === evalData.evaluatorId
        && evaluation.periodId === periodId
    )?.isAnonymous;
    const resolvedAnonymity = Boolean(
      selectedEvaluationSection === 'internal'
        ? (internalAnonymityPreference ?? existingEvaluation?.isAnonymous)
        : (internalAnonymityPreference ?? existingEvaluation?.isAnonymous ?? false)
    );

    const { error } = await supabase
      .from('evaluations')
      .upsert(
        {
          evaluator_id: evalData.evaluatorId,
          evaluated_id: evalData.evaluatedId,
          period_id: periodId,
          answers: mergedAnswers,
          comments: mergedComments,
          is_anonymous: resolvedAnonymity,
        },
        { onConflict: 'evaluator_id,evaluated_id,period_id' }
      );

    if (error) {
      showAlert('No se pudo guardar la evaluación.');
      return false;
    }

    setEvaluations(prev => {
      const filtered = prev.filter(e => !(
        e.evaluatorId === evalData.evaluatorId
        && e.evaluatedId === evalData.evaluatedId
        && e.periodId === periodId
      ));
      return [...filtered, {
        ...evalData,
        periodId,
        answers: mergedAnswers,
        comments: mergedComments,
        isAnonymous: resolvedAnonymity,
      }];
    });
    setSelectedTargetId(null);
    if (selectedEvaluationSection === 'internal') {
      setSelectedInternalCategory(null);
    } else {
      setSelectedEvaluationSection(null);
    }
    return true;
  };

  const handleUpdateEmployee = async (id: string, updates: { name: string; role: string; group: string; campus: string }) => {
    const { error } = await supabase
      .from('profiles')
      .update({ name: updates.name, role: updates.role, group_name: updates.group, campus: updates.campus })
      .eq('id', id);
    if (error) {
      showAlert('No se pudo actualizar al empleado.');
      return;
    }
    setEmployees(prev => prev.map(emp => (emp.id === id ? { ...emp, ...updates } : emp)));
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

  const handleAddQuestion = async (text: string, category: string, section: QuestionSection, type: QuestionType, options: string[], isRequired: boolean) => {
    const sectionQuestions = questions.filter(question => question.section === section);
    const maxSortOrder = sectionQuestions.reduce((max, question, index) => (
      Math.max(max, question.sortOrder ?? index)
    ), -1);
    const nextSortOrder = maxSortOrder + 1;
    const requiredValue = isOptionalCategory(category) ? false : isRequired;
    const { data, error } = await supabase
      .from('questions')
      .insert({
        text,
        category,
        section,
        question_type: type,
        options: type === 'scale' ? options : null,
        is_required: requiredValue,
        sort_order: nextSortOrder,
      })
      .select('id, text, category, section, question_type, options, sort_order, is_required')
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
      isRequired: data.is_required ?? requiredValue,
      sortOrder: data.sort_order ?? nextSortOrder,
    } as Question;
    setQuestions(prev => sortQuestionsBySection([...prev, newQuestion], questionSections));
    if (!categories.some(cat => cat.name === category)) {
      setCategories(prev => [...prev, { name: category, section, description: '' }]);
    }
  };
  const handleUpdateQuestion = async (id: number, text: string, category: string, section: QuestionSection, type: QuestionType, options: string[], isRequired: boolean) => {
    const existing = questions.find(question => question.id === id);
    const sectionQuestions = questions.filter(question => question.section === section);
    const currentIndex = sectionQuestions.findIndex(question => question.id === id);
    const baseSortOrder = existing?.sortOrder ?? (currentIndex >= 0 ? currentIndex : 0);
    const maxSortOrder = sectionQuestions
      .filter(question => question.id !== id)
      .reduce((max, question, index) => Math.max(max, question.sortOrder ?? index), -1);
    const nextSortOrder = existing?.section === section ? baseSortOrder : maxSortOrder + 1;
    const requiredValue = isOptionalCategory(category) ? false : isRequired;
    const { error } = await supabase
      .from('questions')
      .update({
        text,
        category,
        section,
        question_type: type,
        options: type === 'scale' ? options : null,
        sort_order: nextSortOrder,
        is_required: requiredValue,
      })
      .eq('id', id);
    if (error) {
      showAlert('No se pudo actualizar la pregunta.');
      return;
    }
    setQuestions(prev => sortQuestionsBySection(prev.map(question => (
      question.id === id
        ? {
          ...question,
          text,
          category,
          section,
          type,
          options: type === 'scale' ? options : undefined,
          isRequired: requiredValue,
          sortOrder: nextSortOrder,
        }
        : question
    )), questionSections));
  };
  const handleUpdateQuestionOrder = async (section: QuestionSection, orderedIds: number[]) => {
    const rows = orderedIds.map((questionId, index) => ({
      id: questionId,
      sort_order: index,
    }));
    const { error } = await supabase
      .from('questions')
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      showAlert('No se pudo actualizar el orden de preguntas.');
      return;
    }
    const orderMap = new Map(orderedIds.map((questionId, index) => [questionId, index]));
    setQuestions(prev => sortQuestionsBySection(prev.map(question => (
      question.section === section && orderMap.has(question.id)
        ? { ...question, sortOrder: orderMap.get(question.id) }
        : question
    )), questionSections));
  };

  const handleUpdateQuestionSections = async (sections: QuestionSectionOption[]) => {
    const rows = sections.map((section, index) => ({
      section: section.value,
      sort_order: index,
    }));
    const { error } = await supabase
      .from('question_sections')
      .upsert(rows, { onConflict: 'section' });
    if (error) {
      showAlert('No se pudo actualizar el orden de secciones.');
      return;
    }
    setQuestionSections(sections);
    setQuestions(prev => sortQuestionsBySection(prev, sections));
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

  const handleAddCategory = async (name: string, section: QuestionSection, description?: string) => {
    const sectionCategories = categories.filter(cat => cat.section === section);
    const maxSortOrder = sectionCategories.reduce((max, cat, index) => (
      Math.max(max, cat.sortOrder ?? index)
    ), -1);
    const nextSortOrder = maxSortOrder + 1;
    const trimmedDescription = description?.trim();
    const { error } = await supabase.from('question_categories').insert({
      name,
      section,
      description: trimmedDescription || null,
      sort_order: nextSortOrder,
    });
    if (error) {
      showAlert('No se pudo crear la categoría.');
      return;
    }
    setCategories(prev => [...prev, { name, section, sortOrder: nextSortOrder, description: trimmedDescription || '' }]);
  };
  const handleUpdateCategory = async (prevName: string, nextName: string, description?: string) => {
    const trimmedDescription = description?.trim();
    const { error } = await supabase.from('question_categories').update({ name: nextName, description: trimmedDescription || null }).eq('name', prevName);
    if (error) {
      showAlert('No se pudo actualizar la categoría.');
      return;
    }
    setCategories(prev => prev.map(cat => (cat.name === prevName ? { ...cat, name: nextName, description: trimmedDescription || '' } : cat)));
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
      showAlert('No se pudo eliminar la categoría.');
      return;
    }
    setCategories(prev => prev.filter(cat => cat.name !== name));
    setQuestions(prev => prev.map(q => (q.category === name ? { ...q, category: fallback } : q)));
  };

  const handleUpdateCategoryOrder = async (section: QuestionSection, orderedNames: string[]) => {
    const rows = orderedNames.map((name, index) => ({
      name,
      section,
      sort_order: index,
    }));
    const { error } = await supabase
      .from('question_categories')
      .upsert(rows, { onConflict: 'name' });
    if (error) {
      showAlert('No se pudo actualizar el orden de categorías.');
      return;
    }
    const orderMap = new Map(orderedNames.map((name, index) => [name, index]));
    setCategories(prev => prev.map(cat => (
      cat.section === section && orderMap.has(cat.name)
        ? { ...cat, sortOrder: orderMap.get(cat.name) }
        : cat
    )));
  };
  const handleCreateUser = async (payload: { email: string; name: string; role: string; group: string; campus: string; isAdmin: boolean; accessRole: AccessRole }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
      throw new Error('Sesión no válida.');
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
        group: payload.group,
        campus: payload.campus,
        is_admin: payload.isAdmin,
        access_role: payload.accessRole,
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
      throw new Error('Sesión no válida.');
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
      throw new Error(data?.error || 'No se pudo restablecer la contraseña.');
    }

  };

  const exportToCSV = () => {
    const exportEvaluations = selectedPeriodId
      ? evaluations.filter(e => e.periodId === selectedPeriodId)
      : evaluations;
    if (exportEvaluations.length === 0) return;
    if (questions.length === 0) {
      showAlert("No hay preguntas configuradas.");
      return;
    }
    const escapeCsvValueWithDelimiter = (value: string | number | null | undefined, delimiter: string) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      const needsQuotes = stringValue.includes(delimiter) || /["\n]/.test(stringValue);
      if (needsQuotes) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };
    const formatCsvNumber = (value: number) => {
      const rounded = Math.round(value * 100) / 100;
      const stringValue = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return stringValue.replace('.', ',');
    };
    const delimiter = ';';
    const headers = [
      "Evaluador",
      "Evaluado",
      "Anonimo",
      ...questions.map(q => q.text),
      "Comentarios",
      "Fecha",
    ];
    const rows = exportEvaluations.map(e => {
      const evaluator = employees.find(emp => emp.id === e.evaluatorId)?.name || 'N/A';
      const evaluated = employees.find(emp => emp.id === e.evaluatedId)?.name || 'N/A';
      const scores = questions.map(q => {
        const value = e.answers[q.id];
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return value;
        return '';
      });
      const row = [
        evaluator,
        evaluated,
        e.isAnonymous ? 'true' : 'false',
        ...scores,
        e.comments || '',
        e.timestamp,
      ];
      return row
        .map(value => (typeof value === 'number' ? formatCsvNumber(value) : value))
        .map(value => escapeCsvValueWithDelimiter(value, delimiter))
        .join(delimiter);
    });
    const headerLine = headers.map(value => escapeCsvValueWithDelimiter(value, delimiter)).join(delimiter);
    const csvContent = `sep=${delimiter}\n${[headerLine, ...rows].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `evaluaciones_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  }; 

  const isAdmin = Boolean(currentUser?.isAdmin);
  const accessRole = currentUser?.accessRole ?? 'educator';
  const isViewer = !isAdmin && accessRole === 'viewer';
  const isPrincipal = !isAdmin && accessRole === 'principal';
  const canViewResults = isAdmin || isViewer || isPrincipal;
  const canViewSurvey = true;
  const activePeriodId = activePeriod?.id ?? '';
  const hasActivePeriod = Boolean(activePeriodId);
  const surveyDaysRemaining = activePeriod
    ? Math.max(
      0,
      Math.ceil(
        (new Date(`${activePeriod.endsAt}T23:59:59`).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    )
    : null;
  const surveyDaysRemainingLabel = surveyDaysRemaining === null
    ? ''
    : surveyDaysRemaining <= 1
      ? 'Hoy es el ultimo dia para realizar encuestas.'
      : `Quedan ${surveyDaysRemaining} días antes de que se cierre el periodo de encuestas.`;
  const isLastSurveyDay = surveyDaysRemaining === 1;
  const surveyEvaluations = activePeriodId
    ? evaluations.filter(e => e.periodId === activePeriodId)
    : [];
  const resultsEvaluations = selectedPeriodId
    ? evaluations.filter(e => e.periodId === selectedPeriodId)
    : evaluations;
  const selectedPeriod = periods.find(period => period.id === selectedPeriodId) ?? activePeriod;
  const questionIdsForCurrentUser = currentUser
    ? evaluatorQuestions[currentUser.id] || questions.map(question => question.id)
    : [];
  const questionsForCurrentUser = questions.filter(question => questionIdsForCurrentUser.includes(question.id));
  const peerQuestionsForCurrentUser = questionsForCurrentUser.filter(question => question.section === 'peer');
  const internalQuestionsForCurrentUser = questionsForCurrentUser.filter(question => question.section === 'internal');
  const requiredInternalQuestions = internalQuestionsForCurrentUser.filter(question => question.isRequired);
  const allOptionalInternalQuestions = internalQuestionsForCurrentUser.length > 0 && requiredInternalQuestions.length === 0;
  const allOptionalPeerQuestions = peerQuestionsForCurrentUser.length > 0 && peerQuestionsForCurrentUser.every(question => !question.isRequired);
  const internalCategoryNames = new Set(internalQuestionsForCurrentUser.map(question => question.category));
  const orderedInternalCategories = categories
    .filter(cat => cat.section === 'internal' && internalCategoryNames.has(cat.name))
    .sort((a, b) => {
      const aOrder = a.sortOrder ?? 0;
      const bOrder = b.sortOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    })
    .map(cat => cat.name);
  const remainingInternalCategories = Array.from(internalCategoryNames)
    .filter(name => !orderedInternalCategories.includes(name))
    .sort((a, b) => a.localeCompare(b));
  const internalCategories = [...orderedInternalCategories, ...remainingInternalCategories];
  const getCategoryDescription = (categoryName: string, section: QuestionSection) => {
    const description = categories.find(cat => cat.section === section && cat.name === categoryName)?.description;
    return description?.trim() || '';
  };
  const selectedInternalCategoryDescription = selectedInternalCategory
    ? getCategoryDescription(selectedInternalCategory, 'internal')
    : '';
  const internalEvaluation = currentUser
    ? surveyEvaluations.find(e => e.evaluatorId === currentUser.id && e.evaluatedId === currentUser.id)
    : null;
  const peerEvaluation = currentUser && selectedTargetId
    ? surveyEvaluations.find(e => e.evaluatorId === currentUser.id && e.evaluatedId === selectedTargetId)
    : null;
  const activeEvaluation = selectedEvaluationSection === 'internal' ? internalEvaluation : peerEvaluation;
  const internalCommentData = internalEvaluation
    ? parseInternalCommentBlocks(internalEvaluation.comments)
    : { byCategory: new Map<string, string>(), uncategorized: '' };
  const selectedInternalCategoryComment = selectedInternalCategory
    ? internalCommentData.byCategory.get(selectedInternalCategory)
    ?? (internalCommentData.byCategory.size === 0 ? internalCommentData.uncategorized : '')
    : '';
  const evaluationInitialAnswers = activeEvaluation?.answers ?? {};
  const evaluationInitialComments = selectedEvaluationSection === 'internal'
    ? selectedInternalCategoryComment
    : (activeEvaluation?.comments ?? '');
  const evaluationFormKey = selectedEvaluationSection === 'internal'
    ? `internal-${currentUser?.id ?? 'none'}-${selectedInternalCategory ?? 'none'}-${activeEvaluation?.timestamp ?? 'new'}`
    : `peer-${currentUser?.id ?? 'none'}-${selectedTargetId ?? 'none'}-${activeEvaluation?.timestamp ?? 'new'}`;
  const internalQuestionsForSelectedCategory = selectedInternalCategory
    ? internalQuestionsForCurrentUser.filter(question => question.category === selectedInternalCategory)
    : [];

  const hasAnswer = (question: Question, value: number | string | undefined) => {
    if (question.type === 'text') {
      return typeof value === 'string' && value.trim().length > 0;
    }
    if (typeof value === 'number') return true;
    return typeof value === 'string' && value.trim().length > 0;
  };
  const internalEvaluationCompleted = Boolean(
    internalEvaluation
    && (requiredInternalQuestions.length > 0
      ? requiredInternalQuestions.every(question => hasAnswer(question, internalEvaluation.answers[question.id]))
      : internalQuestionsForCurrentUser.length > 0
      && internalQuestionsForCurrentUser.every(question => hasAnswer(question, internalEvaluation.answers[question.id]))
    )
  );
  const getInternalCategoryStats = (category: string) => {
    const categoryQuestions = internalQuestionsForCurrentUser.filter(question => question.category === category);
    const requiredCategoryQuestions = categoryQuestions.filter(question => question.isRequired);
    const answered = internalEvaluation
      ? categoryQuestions.filter(question => hasAnswer(question, internalEvaluation.answers[question.id])).length
      : 0;
    const requiredAnswered = internalEvaluation
      ? requiredCategoryQuestions.filter(question => hasAnswer(question, internalEvaluation.answers[question.id])).length
      : 0;
    const completed = categoryQuestions.length > 0 && (
      requiredCategoryQuestions.length > 0
        ? requiredAnswered === requiredCategoryQuestions.length
        : answered === categoryQuestions.length
    );
    return {
      total: categoryQuestions.length,
      answered,
      completed,
      allOptional: categoryQuestions.length > 0 && requiredCategoryQuestions.length === 0,
    };
  };

  const currentAssignment = currentUser ? assignments.find(a => a.evaluatorId === currentUser.id) : null;
  const targetsToEvaluate = currentAssignment
    ? currentAssignment.targets.map(id => employees.find(e => e.id === id)).filter(Boolean) as Employee[]
    : [];

  const tabs = [
    { id: 'survey', label: 'Encuestas', icon: ClipboardList, show: canViewSurvey },
    { id: 'results', label: 'Resultados', icon: LayoutDashboard, show: canViewResults },
    { id: 'questions', label: 'Preguntas', icon: HelpCircle, show: isAdmin },
    { id: 'admin', label: 'Administración', icon: Settings, show: isAdmin },
  ].filter(tab => tab.show);

  const mustChangePassword = false;

  if (isLoadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500" style={themeStyle}>
        Cargando...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-darker)]" style={themeStyle}>
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img
              src={`${import.meta.env.BASE_URL}${logoSrc}`}
              alt="Encuestas Reinvented"
              className={`mx-auto h-auto max-w-full object-contain mb-4 ${isDefaultLogo ? 'w-28' : 'w-40'}`}
            />
            <h1 className="text-3xl font-bold text-slate-800">Encuestas Reinvented</h1>
            <p className="text-slate-500 mt-2">Ingresa tu correo para recibir un enlace de acceso.</p>
          </div>
          {authError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg mb-4">
              {authError}
            </div>
          )}
          {loginMode === 'link' && linkSent ? (
            <div className="space-y-3">
              <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                Revisa tu correo para continuar.
              </div>
              <button
                type="button"
                onClick={() => setLinkSent(false)}
                className="w-full border border-[var(--color-primary-border)] text-[var(--color-primary-dark)] px-4 py-2 rounded-lg font-semibold"
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
                  className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSendingLink}
                className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-60"
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
                  className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Contraseña</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="123456"
                  className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-4 py-3 rounded-lg font-semibold transition-all disabled:opacity-60"
              >
                {isSigningIn ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500" style={themeStyle}>
        Cargando datos...
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50" style={themeStyle}>
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Actualiza tu contraseña</h1>
            <p className="text-slate-500 mt-2">Debes cambiar la contraseña inicial para continuar.</p>
          </div>
          {passwordError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg mb-4">
              {passwordError}
            </div>
          )}
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Nueva contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-4 py-3 rounded-lg font-semibold disabled:opacity-60"
            >
              {isUpdatingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
          <button
            onClick={handleLogout}
            className="w-full mt-4 text-sm text-slate-500 hover:text-slate-700"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={themeStyle}>
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`bg-white rounded-lg ${isDefaultLogo ? 'p-1' : 'p-2'}`}>
              <img
                src={`${import.meta.env.BASE_URL}${logoSrc}`}
                alt="Encuestas Reinvented"
                className={`w-auto object-contain ${isDefaultLogo ? 'h-6 max-w-[69px]' : 'h-10 max-w-[220px]'}`}
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 hidden sm:block">Encuestas Reinvented</h1>
              <p className="text-sm text-slate-500">{currentUser.name}</p>
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
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${isActive ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-full transition-colors" aria-label="Cerrar sesión">
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
        {view === 'survey' && canViewSurvey && (
          <div className="space-y-8">
            {!hasActivePeriod ? (
              <div className="text-center py-16 bg-white rounded-xl border text-slate-500">
                No hay un periodo de evaluación activo. Contacta al administrador.
              </div>
            ) : !selectedEvaluationSection ? (
              <div className="max-w-3xl mx-auto space-y-8">
                <div>
                  {surveyDaysRemainingLabel && (
                    <div className={`mt-3 flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold w-fit text-left ${isLastSurveyDay ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                      {surveyDaysRemainingLabel}
                    </div>
                  )}
                  <h2 className="text-2xl font-bold text-slate-800">Tus evaluaciones pendientes</h2>
                  <p className="text-slate-500">Selecciona la sección que deseas completar.</p>
                </div>

                {internalQuestionsForCurrentUser.length > 0 && (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-slate-800">Satisfacción interna</h3>
                      <p className="text-sm text-slate-500">Evalúa la institución y las condiciones internas.</p>
                    </div>
                    <button
                      onClick={handleStartInternalSurvey}
                      className={`flex items-center justify-between w-full p-5 rounded-xl border-2 transition-all ${internalEvaluationCompleted ? 'bg-[var(--color-complete-soft)] border-[var(--color-complete-border)]' : 'bg-white border-slate-100 hover:border-[var(--color-primary-border)] hover:shadow-md'}`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${internalEvaluationCompleted ? 'bg-[var(--color-complete-badge-border)] text-[var(--color-complete)]' : 'bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]'}`}>
                          SI
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-800">Satisfacción interna</h4>
                          <p className="text-sm text-slate-500">Encuesta institucional</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {allOptionalInternalQuestions && !internalEvaluationCompleted && <span className="text-xs font-bold uppercase text-amber-700 bg-amber-100 px-2 py-1 rounded">Opcional</span>}
                        {internalEvaluationCompleted && <span className="text-xs font-bold uppercase text-[var(--color-complete)] bg-[var(--color-complete-badge)] px-2 py-1 rounded">Completado</span>}
                        <ChevronRight className={internalEvaluationCompleted ? 'text-[var(--color-complete)]' : 'text-slate-300'} />
                      </div>
                    </button>
                  </div>
                )}

                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Evaluación de pares</h3>
                    <p className="text-sm text-slate-500">Compañeros asignados para calificar.</p>
                  </div>
                  <div className="grid gap-4">
                    {peerQuestionsForCurrentUser.length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-xl border text-slate-400">
                        No hay preguntas para evaluación de pares configuradas.
                      </div>
                    ) : (
                      <>
                        {targetsToEvaluate.map(target => {
                          const evaluation = surveyEvaluations.find(e => e.evaluatorId === currentUser.id && e.evaluatedId === target.id);
                          const isCompleted = Boolean(evaluation);
                          const allPeerAnswered = evaluation
                            ? peerQuestionsForCurrentUser.every(question => hasAnswer(question, evaluation.answers[question.id]))
                            : false;
                          const showCompleted = isCompleted && (!allOptionalPeerQuestions || allPeerAnswered);
                          return (
                            <button
                              key={target.id}
                              onClick={() => {
                                setSelectedEvaluationSection('peer');
                                setSelectedInternalCategory(null);
                                setSelectedTargetId(target.id);
                              }}
                              className={`flex items-center justify-between p-5 rounded-xl border-2 transition-all ${showCompleted ? 'bg-[var(--color-complete-soft)] border-[var(--color-complete-border)]' : 'bg-white border-slate-100 hover:border-[var(--color-primary-border)] hover:shadow-md'}`}
                            >
                              <div className="flex items-center gap-4 text-left">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${showCompleted ? 'bg-[var(--color-complete-badge-border)] text-[var(--color-complete)]' : 'bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]'}`}>
                                  {target.name.charAt(0)}
                                </div>
                                <div>
                                  <h3 className="font-semibold text-slate-800">{target.name}</h3>
                                  <p className="text-sm text-slate-500">{target.role}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {allOptionalPeerQuestions && !showCompleted && <span className="text-xs font-bold uppercase text-amber-700 bg-amber-100 px-2 py-1 rounded">Opcional</span>}
                                {showCompleted && <span className="text-xs font-bold uppercase text-[var(--color-complete)] bg-[var(--color-complete-badge)] px-2 py-1 rounded">Completado</span>}
                                <ChevronRight className={showCompleted ? 'text-[var(--color-complete)]' : 'text-slate-300'} />
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
                  className="mb-6 text-sm font-medium text-slate-500 hover:text-[var(--color-primary)] flex items-center gap-1"
                >
                  Volver
                </button>
                {selectedEvaluationSection === 'internal' && !selectedInternalCategory ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">Categorías de satisfacción interna</h3>
                      <p className="text-sm text-slate-500">Selecciona el area que deseas evaluar.</p>
                    </div>
                    <div className="grid gap-4">
                      {internalCategories.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border text-slate-400">
                          No hay categorías configuradas para satisfacción interna.
                        </div>
                      ) : (
                        internalCategories.map(category => {
                          const stats = getInternalCategoryStats(category);
                          const badge = category.trim().charAt(0).toUpperCase() || 'I';
                          const showOptional = stats.allOptional && !stats.completed;
                          const showCompleted = stats.completed;
                          return (
                            <button
                              key={category}
                              onClick={() => setSelectedInternalCategory(category)}
                              className={`flex items-center justify-between p-5 rounded-xl border-2 transition-all ${showCompleted ? 'bg-[var(--color-complete-soft)] border-[var(--color-complete-border)]' : 'bg-white border-slate-100 hover:border-[var(--color-primary-border)] hover:shadow-md'}`}
                            >
                              <div className="flex items-center gap-4 text-left">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${showCompleted ? 'bg-[var(--color-complete-badge-border)] text-[var(--color-complete)]' : 'bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]'}`}>
                                  {badge}
                                </div>
                                <div>
                                  <h4 className="font-semibold text-slate-800">{category}</h4>
                                  <p className="text-sm text-slate-500">{stats.answered}/{stats.total} respondidas</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {showOptional && <span className="text-xs font-bold uppercase text-amber-700 bg-amber-100 px-2 py-1 rounded">Opcional</span>}
                                {showCompleted && <span className="text-xs font-bold uppercase text-[var(--color-complete)] bg-[var(--color-complete-badge)] px-2 py-1 rounded">Completado</span>}
                                <ChevronRight className={showCompleted ? 'text-[var(--color-complete)]' : 'text-slate-300'} />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <EvaluationForm
                    key={evaluationFormKey}
                    evaluatorId={currentUser.id}
                    targetEmployee={selectedEvaluationSection === 'internal'
                      ? { ...currentUser, name: 'Institución', role: `Satisfacción interna${selectedInternalCategory ? ` - ${selectedInternalCategory}` : ''}` }
                      : employees.find(e => e.id === selectedTargetId)!}
                    questions={selectedEvaluationSection === 'internal' ? internalQuestionsForSelectedCategory : peerQuestionsForCurrentUser}
                    sectionTitle={selectedEvaluationSection === 'internal' ? selectedInternalCategory ?? undefined : undefined}
                    sectionDescription={selectedEvaluationSection === 'internal' ? (selectedInternalCategoryDescription || undefined) : undefined}
                    initialAnswers={evaluationInitialAnswers}
                    initialComments={evaluationInitialComments}
                    onSave={handleSaveEvaluation}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {view === 'results' && canViewResults && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Panel de resultados</h2>
                <p className="text-slate-500">Estadísticas y análisis de desempeño.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <label className="text-xs font-semibold text-slate-500">
                  Periodo
                  <select
                    value={selectedPeriodId}
                    onChange={(event) => setSelectedPeriodId(event.target.value)}
                    className="mt-2 sm:mt-0 sm:ml-2 px-3 py-2 text-sm border rounded-lg bg-white"
                  >
                    <option value="">Todos</option>
                    {periods.map(period => (
                      <option key={period.id} value={period.id}>{period.name}  -  {period.academicYear}</option>
                    ))}
                  </select>
                </label>
                {isAdmin && (
                  <button onClick={exportToCSV} className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all" disabled={resultsEvaluations.length === 0}>
                    <Download size={18} /> Exportar CSV
                  </button>
                )}
              </div>
            </div>
            <ResultsDashboard
              evaluations={resultsEvaluations}
              employees={employees}
              questions={questions}
              assignments={assignments}
              campus={currentUser?.campus ?? null}
              hideEmployeeMatrix={isPrincipal}
              hideEmployeeTab={isPrincipal}
              hideGeneralExport={isPrincipal}
              canSelectCampus={isAdmin}
              forcedCampus={isAdmin ? null : (currentUser?.campus ?? null)}
            />
          </div>
        )}

        {view === 'questions' && isAdmin && (
          <QuestionsPanel
            questions={questions}
            categories={categories}
            questionSections={questionSections}
            onAddQuestion={handleAddQuestion}
            onUpdateQuestion={handleUpdateQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateCategoryOrder={handleUpdateCategoryOrder}
          />
        )}

        {view === 'admin' && isAdmin && (
          <AdminPanel
            employees={employees}
            assignments={assignments}
            questions={questions}
            questionSections={questionSections}
            evaluatorQuestions={evaluatorQuestions}
            onUpdateEmployee={handleUpdateEmployee}
            onToggleAssignment={handleToggleAssignment}
            onUpdateEvaluatorQuestions={handleUpdateEvaluatorQuestions}
            onUpdateQuestionOrder={handleUpdateQuestionOrder}
            onUpdateQuestionSections={handleUpdateQuestionSections}
            onCreateUser={handleCreateUser}
            onResetPassword={handleResetPassword}
          />
        )}
      </main>
      {isInternalAnonymityPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 p-8"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-xl font-bold text-slate-800">Anonimato en la encuesta</h3>
            <p className="mt-3 text-base text-slate-600 text-center">
              ¿Cómo quieres tratar tus datos en esta encuesta?
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleInternalAnonymityChoice(true)}
                className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-4 py-3 rounded-lg font-semibold"
              >
                Quiero que sea anónima
              </button>
              <button
                type="button"
                onClick={() => handleInternalAnonymityChoice(false)}
                className="flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-3 rounded-lg font-semibold"
              >
                Quiero que se muestren mis datos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;










