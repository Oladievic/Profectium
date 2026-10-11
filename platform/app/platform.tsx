/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  Bookmark,
  BadgeCheck,
  MapPin,
  Trophy,
  Plus,
  Code2,
  SlidersHorizontal,
  BriefcaseBusiness,
  Mail,
  Check,
  Clock,
  Users,
  RefreshCw,
  Info,
  X,
  LogIn,
  ChevronDown,
  Layers,
  ShieldCheck,
  GitCompareArrows,
  BarChart3,
  Plug,
  ClipboardList,
  BookOpen,
  ArrowUpRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Picker, EmptyState } from "./ui";
import { JobForm, OfferForm, ProfileForm } from "./forms";
import {
  AssessmentPanel,
  CompanyForm,
  Onboarding,
  PdfButton,
} from "./assessment";
import {
  roles,
  defaultFilters,
  type AppState,
  type Candidate,
  type Job,
  type Filters,
} from "@/lib/types";
import {
  filterCandidates,
  matchCandidate,
  categories,
  salary,
  roleLabel,
  statusLabel,
  rankingScore,
  rankingReasons,
} from "@/lib/domain";

import {
  AccountPanel,
  IntegrationsPanel,
  ComparePanel,
  HiringBoard,
  InsightsPanel,
  CareerPanel,
  ScoreBreakdown,
  NoteEditor,
} from "./workbench";
import { BrandOrbit, MotionControls, CommandMenu } from "./motion";
import { CareerStudio } from "./studio";
import { SignalsPanel, type SignalsSection } from "./signals";
import { EmployerTestsPanel } from "./employer-tests";
import { CategoryMatrix, UpgradeAbout, OfferEvidence } from "./upgrade-pages";
import { IntentSearch } from "./intent-search";

type View =
  | "tests"
  | "signals"
  | "studio"
  | "catalog"
  | "jobs"
  | "offers"
  | "profile"
  | "about"
  | "assessment"
  | "company"
  | "account"
  | "integrations"
  | "compare"
  | "board"
  | "insights"
  | "career";
const emptyCandidates: Candidate[] = [];
const emptyJobs: Job[] = [];
const views: View[] = [
  "tests",
  "signals",
  "studio",
  "catalog",
  "jobs",
  "offers",
  "profile",
  "about",
  "assessment",
  "company",
  "account",
  "integrations",
  "compare",
  "board",
  "insights",
  "career",
];
const date = (value: string) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
const all = { value: "all", label: "Все" };
function allowWorkspaceNavigation() {
  const allowed = window.dispatchEvent(new Event("profectium:before-navigate", { cancelable: true }));
  if (!allowed) toast.info("Сохраните изменения или используйте кнопку возврата внутри теста.");
  return allowed;
}

export default function Platform({ publicAuth = false }: { publicAuth?: boolean }) {
  const currentUrl = useRef("");
  const [studioCandidate, setStudioCandidate] = useState<string | null>(null);
  const [studioOffer, setStudioOffer] = useState<string | null>(null);
  const [studioSection, setStudioSection] = useState<"requests" | undefined>(
    undefined,
  );
  const [signalsSection, setSignalsSection] = useState<SignalsSection>("tasks");
  const [dense, setDense] = useState(false);
  const [data, setData] = useState<AppState | null>(null),
    [error, setError] = useState(""),
    [unauthorized, setUnauthorized] = useState(false),
    [busy, setBusy] = useState(false);
  const [requestedView, setView] = useState<View>("catalog"),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [savedOnly, setSavedOnly] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState(false),
    [offerCandidate, setOfferCandidate] = useState<Candidate | null>(null),
    [roleDialog, setRoleDialog] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false),
    [jobDetail, setJobDetail] = useState<Job | null>(null),
    [offerStatus, setOfferStatus] = useState("all"),
    [jobQuery, setJobQuery] = useState(""),
    [onboarding, setOnboarding] = useState(false);
  const [enrollmentNeeded, setEnrollmentNeeded] = useState(false);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [compared, setCompared] = useState<string[]>([]);
  const compareToggle = (id: string) =>
    setCompared((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < 3
          ? [...ids, id]
          : (toast.info("Можно сравнить до трёх специалистов"), ids),
    );
  const [assessmentDrafts, setAssessmentDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const disciplines = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.candidates ?? []).flatMap((c) =>
            c.achievements.map((a) => a.discipline),
          ),
        ),
      ).sort(),
    [data],
  );
  const load = useCallback(async () => {
    try {
      const live = new URL(location.href).searchParams.get("mode") === "live";
      const r = await fetch((live ? "/api/live/v1" : "/api/v1") + "/state", {
        cache: "no-store",
      });
      if (live && r.status === 403) {
        setEnrollmentNeeded(true);
        return;
      }
      if (r.status === 401) {
        setUnauthorized(true);
        return;
      }
      const j = (await r.json()) as AppState & { error?: string };
      if (!r.ok) throw new Error(j.error);
      setData(j);
      setError("");
      setUnauthorized(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    }
  }, []);
  // Hydrate remote state and synchronize URL once; subsequent URL changes use popstate.
  /* eslint-disable react-hooks/set-state-in-effect -- Initial server hydration and URL restoration. */
  useEffect(() => {
    const restore = () => {
      if (!allowWorkspaceNavigation()) {
        if (currentUrl.current) history.pushState({}, "", currentUrl.current);
        return;
      }
      const u = new URL(location.href);
      currentUrl.current = u.href;
      const v = u.searchParams.get("view") as View;
      setView(views.includes(v) ? v : "catalog");
      setSelectedId(u.searchParams.get("candidate"));
    };
    void load().then(restore);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const navigate = useCallback((v: View) => {
    if (!allowWorkspaceNavigation()) return;
    setView(v);
    setSelectedId(null);
    const u = new URL(location.href);
    u.searchParams.set("view", v);
    u.searchParams.delete("candidate");
    history.pushState({}, "", u);
    currentUrl.current = u.href;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const openProfile = (id: string | null) => {
    setSelectedId(id);
    const u = new URL(location.href);
    if (id) u.searchParams.set("candidate", id);
    else u.searchParams.delete("candidate");
    history.replaceState({}, "", u);
  };
  const openStudio = (
    id: string | null = null,
    offerId: string | null = null,
  ) => {
    setStudioSection(undefined);
    setStudioCandidate(id);
    setStudioOffer(offerId);
    navigate("studio");
  };
  const mutate = async (
    path: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => {
    if (!data || busy) return false;
    setBusy(true);
    try {
      const r = await fetch(
        (data.session.mode === "live" ? "/api/live/v1/" : "/api/v1/") + path,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Session-Revision": String(data.session.revision),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const j = (await r.json()) as AppState & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Не удалось сохранить данные");
      setData(j);
      setError("");
      toast.success(
        path === "session"
          ? "Демороль переключена"
          : path.endsWith("/sync")
            ? "Демодостижения синхронизированы"
            : path === "offers"
              ? "Предложение отправлено"
              : "Изменения сохранены",
      );
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сохранить";
      toast.error(msg, { duration: 7000 });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const candidates = data?.candidates ?? emptyCandidates,
    jobs = data?.jobs ?? emptyJobs,
    offers = data?.offers ?? [],
    isEmployer = data?.session.role !== "candidate";
  const view: View =
    isEmployer && ["assessment", "profile", "career"].includes(requestedView)
      ? "catalog"
      : !isEmployer &&
          [
            "catalog",
            "company",
            "integrations",
            "compare",
            "board",
            "insights",
          ].includes(requestedView)
        ? "assessment"
        : requestedView;
  const me = candidates.find((c) => c.id === data?.session.candidateId),
    selected = candidates.find((c) => c.id === selectedId);
  const chosenJob = jobs.find((j) => j.id === filters.jobId);
  const results = useMemo(
    () =>
      filterCandidates(candidates, filters, jobs).filter(
        (c) => !savedOnly || data?.favorites.includes(c.id),
      ),
    [candidates, filters, jobs, savedOnly, data?.favorites],
  );
  const activeJobs = jobs.filter((j) => j.status === "active");
  const unread = offers.filter((o) => o.status === "pending").length;
  const setFilter = (key: keyof Filters, value: string | boolean) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => {
    setFilters(defaultFilters);
    setSavedOnly(false);
  };
  const activeFilterCount = [
    filters.role !== "all",
    filters.grade !== "all",
    filters.format !== "all",
    !!filters.maxSalary,
    filters.hasAchievements,
    filters.discipline !== "all",
    filters.jobId !== "all",
    !!filters.query,
  ].filter(Boolean).length;
  useEffect(() => {
    if (!data || data.session.role !== "employer") return;
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: "search_profectium_candidates",
          title: "Поиск ИТ-специалистов",
          description:
            "Поиск по доступным профилям текущего пространства: обновляет каталог и возвращает найденные имена. Данные не изменяются.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", maxLength: 100 },
              role: { type: "string", enum: ["all", ...roles] },
            },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            if (!input || typeof input !== "object")
              throw new Error("Ожидается объект");
            const v = input as Record<string, unknown>;
            if (
              typeof v.query !== "string" ||
              v.query.length > 100 ||
              (v.role !== undefined &&
                !["all", ...roles].includes(v.role as never)) ||
              Object.keys(v).some((k) => !["query", "role"].includes(k))
            )
              throw new Error("Некорректные фильтры");
            const f = {
              ...defaultFilters,
              query: v.query,
              role: String(v.role ?? "all"),
            };
            setFilters(f);
            setSavedOnly(false);
            navigate("catalog");
            return {
              synthetic: data.session.mode === "demo",
              candidates: filterCandidates(candidates, f, jobs).map((c) => ({
                id: c.id,
                name: c.fullName,
                role: c.role,
              })),
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [candidates, jobs, navigate, data]);
  const filterPanel = (
    <>
      <div className="filter-heading">
        <h3>
          <SlidersHorizontal size={17} /> Фильтры
        </h3>
        {activeFilterCount > 0 && (
          <button className="text-button" onClick={clearFilters}>
            Сбросить
          </button>
        )}
      </div>
      <label>Специализация</label>
      <div className="role-filters">
        {["all", ...roles].map((r) => (
          <button
            key={r}
            className={
              "filter-choice " + (filters.role === r ? "selected" : "")
            }
            onClick={() => setFilter("role", r)}
          >
            {r === "all" ? "Все специалисты" : r}
            <span>
              {
                candidates.filter(
                  (c) => c.available !== false && (r === "all" || c.role === r),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="filter-divider" />
      <label>Уровень опыта</label>
      <Picker
        label="Уровень опыта"
        value={filters.grade}
        onChange={(v) => setFilter("grade", v)}
        options={[all, "Junior", "Middle", "Senior"]}
      />
      <label className="filter-label">Формат работы</label>
      <Picker
        label="Формат работы"
        value={filters.format}
        onChange={(v) => setFilter("format", v)}
        options={[all, "Удалённо", "Гибрид", "Офис"]}
      />
      <label className="filter-label" htmlFor="maxSalary">
        Бюджет до, ₽ / мес.
      </label>
      <input
        className="filter-input"
        id="maxSalary"
        aria-label="Максимальный бюджет"
        type="number"
        min={0}
        max={2000000}
        step={10000}
        placeholder="Например, 250 000"
        value={filters.maxSalary}
        onChange={(e) => setFilter("maxSalary", e.target.value)}
      />
      <div className="filter-divider" />
      <label className="check-row">
        <Checkbox
          checked={filters.hasAchievements}
          onCheckedChange={(v) => setFilter("hasAchievements", v === true)}
        />
        <span>Есть достижения</span>
      </label>
      <label className="filter-label">Дисциплина</label>
      <Picker
        label="Дисциплина соревнований"
        value={filters.discipline}
        onChange={(v) => setFilter("discipline", v)}
        options={[all, ...disciplines]}
      />
      <p className="filter-footnote">
        Грейд в каталоге — результат теста. Навыки указаны кандидатом.
        Достижения дают отдельный бонус в ранжировании.
      </p>
    </>
  );

  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  if (enrollmentNeeded)
    return (
      <main className="workspace">
        <Link
          prefetch={false}
          className="brand"
          href="/"
          onNavigate={(event) => {
            event.preventDefault();
            window.location.assign(new URL("/", window.location.origin).href);
          }}
        >
          Profectium.
        </Link>
        <AccountPanel />
      </main>
    );
  if (unauthorized)
    return (
      <div className="auth-screen">
        <BrandOrbit />
        <Image
          src="/brand/profectium.svg"
          alt="Profectium"
          width={65}
          height={65}
          unoptimized
        />
        <div className="eyebrow">PROFECTIUM</div>
        <h1>
          От достижений
          <br />к новым возможностям<span>.</span>
        </h1>
        <p>
          Откройте личное демопространство: находите специалистов, создавайте
          вакансии и проверяйте предложения с обеих сторон.
        </p>
        <a
          className="button primary"
          href={publicAuth ? "/signin" : "/signin-local?return_to=/"}
          target="_top"
        >
          <LogIn size={18} /> {publicAuth ? "Войти или зарегистрироваться" : "Открыть демопространство"}
        </a>
        <small>
          {publicAuth ? "Подтверждение email не требуется. Можно попробовать платформу без регистрации." : "Все профили и компании вымышлены. Ваши действия сохраняются отдельно."}
        </small>
      </div>
    );
  if (!data)
    return (
      <div className="workspace">
        <div className="brand">
          <Image
            src="/brand/profectium.svg"
            alt="Profectium"
            width={65}
            height={65}
            unoptimized
          />
          Profectium
        </div>
        {error ? (
          <EmptyState title="Не удалось открыть платформу" description={error}>
            <button className="button primary" onClick={load}>
              Попробовать снова
            </button>
          </EmptyState>
        ) : (
          <div className="loading-grid" aria-label="Загружаем профили">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton className="h-72 rounded-xl" key={i} />
            ))}
          </div>
        )}
      </div>
    );

  return (
    <>
      <Toaster position="bottom-right" theme="light" richColors closeButton />
      <a href="#main" className="skip-link">
        Перейти к содержимому
      </a>
      <header className="topbar">
        <Link
          prefetch={false}
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate(isEmployer ? "catalog" : "profile");
          }}
        >
          <Image
            src="/brand/profectium.svg"
            alt="Profectium"
            width={65}
            height={65}
            unoptimized
          />
          <span>
            Profectium<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Основная навигация">
          {(
            [
              ...(isEmployer
                ? [
                    { v: "catalog", label: "Специалисты" },
                    { v: "company", label: "Компания" },
                  ]
                : [{ v: "assessment", label: "Моя категория" }]),
              { v: "jobs", label: "Вакансии" },
              { v: "offers", label: "Предложения" },
              { v: "tests", label: "Тесты" },
              ...(!isEmployer ? [{ v: "profile", label: "Мой профиль" }] : []),
            ] as { v: View; label: string }[]
          ).map((n) => (
            <button
              key={n.v}
              className={"nav-link " + (view === n.v ? "active" : "")}
              aria-current={view === n.v ? "page" : undefined}
              onClick={() => navigate(n.v)}
            >
              {n.label}
              {n.v === "offers" && unread > 0 && (
                <span className="nav-count">{unread}</span>
              )}
            </button>
          ))}
        </nav>
        <span className="demo-tag">
          {data.session.mode === "live" ? "РАБОЧИЙ" : "ДЕМО"}
        </span>
        <button
          className="account-button"
          disabled={busy}
          onClick={() =>
            data.session.mode === "live"
              ? navigate("account")
              : allowWorkspaceNavigation() && setRoleDialog(true)
          }
          aria-label={
            data.session.mode === "live" ? "Аккаунт" : "Переключить демороль"
          }
        >
          <div className="company-avatar">
            {isEmployer ? <BriefcaseBusiness size={16} /> : me?.initials}
          </div>
          <span>{isEmployer ? "Работодатель" : "Соискатель"}</span>
          <ChevronDown size={14} />
        </button>
      </header>
      <div className="work-nav">
        <div className="work-nav-inner">
          <span className="work-nav-label">ВАШЕ ПРОСТРАНСТВО</span>
          <button className={view === "about" ? "active" : ""} onClick={() => navigate("about")} aria-current={view === "about" ? "page" : undefined}><Info size={15} /> О платформе</button>
          <button
            className={
              view === "studio" ? "active studio-nav-link" : "studio-nav-link"
            }
            onClick={() => openStudio()}
          >
            <Layers size={15} />
            Подбор и навыки
          </button>
          <button
            className={view === "signals" ? "active" : ""}
            aria-current={view === "signals" ? "page" : undefined}
            onClick={() => {
              setSignalsSection("tasks");
              navigate("signals");
            }}
          >
            <ClipboardList size={15} />
            Пульт
          </button>
          {(isEmployer
            ? [
                { v: "board", label: "Подборка", icon: ClipboardList },
                { v: "compare", label: "Сравнение", icon: GitCompareArrows },
                { v: "insights", label: "Обзор", icon: BarChart3 },
                { v: "integrations", label: "Интеграции", icon: Plug },
              ]
            : [{ v: "career", label: "План развития", icon: BookOpen }]
          ).map((n) => (
            <button
              key={n.v}
              className={view === n.v ? "active" : ""}
              onClick={() => navigate(n.v as View)}
              aria-current={view === n.v ? "page" : undefined}
            >
              <n.icon size={15} />
              {n.label}
              {n.v === "compare" && compared.length > 0 && (
                <b>{compared.length}</b>
              )}
            </button>
          ))}
          <button
            className={view === "account" ? "active" : ""}
            onClick={() => navigate("account")}
          >
            <ShieldCheck size={15} />
            Аккаунт
          </button>
          <CommandMenu
            isEmployer={isEmployer}
            navigate={(v) => navigate(v as View)}
            candidates={candidates}
            onProfile={(id) => { if (allowWorkspaceNavigation()) { navigate("catalog"); openProfile(id); } }}
            onCategory={(role, grade) => { if (allowWorkspaceNavigation()) { setFilters({ ...defaultFilters, role, grade }); setSavedOnly(false); navigate("catalog"); } }}
          />
          <MotionControls />
        </div>
      </div>
      <main className="workspace" id="main" data-view={view}>
        {view === "tests" && (
          <EmployerTestsPanel key={`${data.session.mode}:${data.session.revision}`} base={data} />
        )}
        {view === "signals" && (
          <SignalsPanel
            key={`${data.session.mode}:${data.session.revision}:${signalsSection}`}
            base={data}
            filters={filters}
            initialSection={signalsSection}
            onApply={(f) => {
              setFilters(f);
              navigate("catalog");
            }}
            onProfile={(id) => {
              navigate("catalog");
              openProfile(id);
            }}
            onStudio={(offerId) => {
              openStudio(null, offerId ?? null);
              if (!offerId) setStudioSection("requests");
            }}
            onNavigate={(v) => navigate(v as View)}
          />
        )}
        {view === "studio" && (
          <CareerStudio
            key={`${data.session.mode}:${data.session.revision}:${studioCandidate}:${studioOffer}:${studioSection}`}
            base={data}
            reload={load}
            initialSection={studioSection}
            initialCandidate={studioCandidate}
            initialOfferId={studioOffer}
            onOffer={setOfferCandidate}
            onProfile={openProfile}
            navigate={(v) => navigate(v as View)}
          />
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={load}>Обновить</button>
          </div>
        )}
        {view === "catalog" && isEmployer && (
          <>
            <div className="page-heading catalog-heading">
              <div>
                <div className="section-index">01 — TALENT DISCOVERY</div>
                <div className="eyebrow">
                  PROFECTIUM / ПРОФЕССИОНАЛЬНАЯ КАТЕГОРИЯ
                </div>
                <h1>
                  {filters.role === "all" ? "Специалисты" : filters.role}{" "}
                  <br />
                  <em>{filters.grade === "all" ? "с подтверждённым профилем" : filters.grade}</em>
                  <span>.</span>
                </h1>
                <p>
                  {filterCandidates(candidates, defaultFilters, []).length} доступных профилей · {candidates.filter(c => c.qualification && c.available !== false && c.achievements.length > 0).length} с достижениями ФСП{data.session.mode === "demo" ? " · Демоданные" : ""}. Приглашения с прозрачной зарплатой.
                </p>
              </div>
              {isEmployer ? (
                <button
                  className="button primary"
                  onClick={() => setJobForm(true)}
                >
                  <Plus size={18} /> Создать вакансию
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => navigate("profile")}
                >
                  Мой профиль
                </button>
              )}
            </div>
            <div className="trust-strip">
              <BadgeCheck />
              <span>
                <strong>Сначала категория. Затем личное приглашение.</strong>
                <br />
                {data.session.mode === "demo"
                  ? "Вы изучаете демо на вымышленных данных. Основания оценки открыты в каждом профиле."
                  : "В каталоге только опубликованные профили с категорией. У каждого результата указано основание."}
              </span>
              <button className="text-button" onClick={() => navigate("about")}>
                Как устроен подбор
              </button>
            </div>
            <CategoryMatrix candidates={candidates} filters={filters} onApply={(f) => { setFilters(f); setSavedOnly(false); }} />
            <IntentSearch mode={data.session.mode} sessionRevision={data.session.revision} onApply={(f) => { setFilters(f); setSavedOnly(false); }} />
            <div className="searchbar">
              <Search size={21} />
              <input
                aria-label="Поиск специалистов"
                placeholder="Специализация, навык или имя"
                maxLength={100}
                value={filters.query}
                onChange={(e) => setFilter("query", e.target.value)}
              />
              {filters.query ? (
                <button
                  className="icon-button"
                  aria-label="Очистить поиск"
                  onClick={() => setFilter("query", "")}
                >
                  <X size={17} />
                </button>
              ) : (
                <kbd>Найдите свой следующий мэтч</kbd>
              )}
            </div>
            <div className="catalog-layout">
              <aside className="filters">{filterPanel}</aside>
              <section className="results">
                <div className="match-toolbar">
                  <span>
                    <BriefcaseBusiness size={16} /> Подобрать под вакансию
                  </span>
                  <Picker
                    label="Подобрать под вакансию"
                    value={filters.jobId}
                    onChange={(v) => setFilter("jobId", v)}
                    options={[
                      { value: "all", label: "Без привязки к вакансии" },
                      ...activeJobs.map((j) => ({
                        value: j.id,
                        label: j.title,
                      })),
                    ]}
                  />
                </div>
                <div className="mobile-filter-row">
                  <button
                    className="button secondary"
                    onClick={() => setMobileFilters(true)}
                  >
                    <SlidersHorizontal size={16} /> Фильтры{" "}
                    {activeFilterCount > 0 && "(" + activeFilterCount + ")"}
                  </button>
                </div>
                <Tabs
                  value={savedOnly ? "saved" : "all"}
                  onValueChange={(v) => setSavedOnly(v === "saved")}
                >
                  <div className="results-head">
                    <button
                      className="density-toggle"
                      onClick={() => {
                        setSignalsSection("radars");
                        navigate("signals");
                      }}
                    >
                      Сохранить поиск
                    </button>
                    <button
                      className="density-toggle"
                      aria-pressed={dense}
                      onClick={() => setDense(!dense)}
                    >
                      {dense ? "Карточки" : "Компактно"}
                    </button>
                    <TabsList variant="line" className="catalog-tabs">
                      <TabsTrigger value="all">
                        Специалисты <span>{results.length}</span>
                      </TabsTrigger>
                      {isEmployer && (
                        <TabsTrigger value="saved">
                          <Bookmark size={14} /> Избранное{" "}
                          <span>{data.favorites.length}</span>
                        </TabsTrigger>
                      )}
                    </TabsList>
                    <Picker
                      label="Сортировка"
                      value={filters.sort}
                      onChange={(v) => setFilter("sort", v)}
                      options={[
                        {
                          value: "relevance",
                          label: chosenJob
                            ? "По соответствию потребности"
                            : "По подтверждённому профилю",
                        },
                        { value: "salary", label: "По зарплате" },
                        { value: "experience", label: "По опыту" },
                      ]}
                    />
                  </div>
                  <TabsContent value={savedOnly ? "saved" : "all"}>
                    <p className="result-announcement" aria-live="polite">
                      Найдено специалистов: {results.length}
                      {chosenJob
                        ? " · Категория: " +
                          chosenJob.role +
                          " / " +
                          chosenJob.grade
                        : ""}
                    </p>
                    {results.length ? (
                      <div
                        className={
                          "candidate-grid" + (dense ? " dense-candidates" : "")
                        }
                      >
                        {results.map((c, i) => (
                          <CandidateCard
                            key={c.id}
                            candidate={c}
                            index={i}
                            saved={data.favorites.includes(c.id)}
                            canSave={isEmployer}
                            busy={busy}
                            compared={compared.includes(c.id)}
                            onCompare={() => compareToggle(c.id)}
                            job={chosenJob}
                            onOpen={() => openProfile(c.id)}
                            onSave={() =>
                              void mutate(
                                "favorites/" + c.id,
                                data.favorites.includes(c.id)
                                  ? "DELETE"
                                  : "PUT",
                              )
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title={
                          savedOnly
                            ? "В избранном пока пусто"
                            : "Таких специалистов пока нет"
                        }
                        description={
                          savedOnly
                            ? "Сохраняйте интересные профили, чтобы вернуться к ним позже."
                            : "Попробуйте убрать часть фильтров или изменить поисковый запрос."
                        }
                      >
                        <button
                          className="button secondary"
                          onClick={clearFilters}
                        >
                          Показать всех специалистов
                        </button>
                      </EmptyState>
                    )}
                  </TabsContent>
                </Tabs>
                <div className="catalog-note">
                  <Code2 size={20} />
                  <p>
                    Основа ранжирования: тест до 60 баллов, достижения ФСП до
                    20. Для выбранной потребности добавляются навыки до 15 и
                    пересечение зарплат до 5. Это баллы правил, не вероятность
                    успешного найма.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
        {view === "jobs" && (
          <>
            <PageHeading
              eyebrow="ВОЗМОЖНОСТИ ДЛЯ ИТ-СПЕЦИАЛИСТОВ"
              title={
                isEmployer
                  ? "Вакансии вашей команды"
                  : "Следующий шаг в карьере"
              }
              description={
                isEmployer
                  ? "Создавайте вакансии с понятными задачами и предлагайте их подходящим специалистам."
                  : "Изучайте задачи и условия. Работодатели сами присылают предложения в ваш кабинет."
              }
            >
              {isEmployer && (
                <button
                  className="button primary"
                  onClick={() => setJobForm(true)}
                >
                  <Plus size={18} /> Создать вакансию
                </button>
              )}
            </PageHeading>
            <div className="searchbar section-space">
              <Search size={20} />
              <input
                aria-label="Поиск вакансий"
                placeholder="Название, компания или технология"
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
              />
            </div>
            <div className="job-list">
              {jobs
                .filter(
                  (j) =>
                    (isEmployer || j.status === "active") &&
                    [j.title, j.company, ...j.skills]
                      .join(" ")
                      .toLowerCase()
                      .includes(jobQuery.toLowerCase()),
                )
                .map((j) => (
                  <article className="job-card" key={j.id}>
                    <div className="job-emblem">{j.company[0]}</div>
                    <div className="job-content">
                      <div className="job-topline">
                        <span>{j.company}</span>
                        <span
                          className={
                            "status-badge " +
                            (j.status === "active" ? "accepted" : "withdrawn")
                          }
                        >
                          {j.status === "active" ? "Активна" : "В архиве"}
                        </span>
                      </div>
                      <button
                        className="job-title"
                        onClick={() => setJobDetail(j)}
                      >
                        {j.title}
                      </button>
                      <div className="meta">
                        <span>{j.grade}</span>
                        <span>{j.city}</span>
                        <span>{j.workFormat}</span>
                      </div>
                      <div className="skills">
                        {j.skills.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="job-actions">
                      <strong>{salary(j.salaryMin, j.salaryMax)}</strong>
                      <small>в месяц до вычета налогов</small>
                      {isEmployer ? (
                        <>
                          <button
                            className="button secondary"
                            disabled={j.status !== "active"}
                            onClick={() => {
                              /*
                               * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
                               * Все права сохранены.
                               *
                               * Автор: Криницин Вячеслав Александрович
                               */
                              setFilters({ ...defaultFilters, jobId: j.id });
                              setSavedOnly(false);
                              navigate("catalog");
                            }}
                          >
                            <Users size={16} /> Найти специалистов
                          </button>
                          <button
                            className="text-button muted"
                            disabled={busy}
                            onClick={() =>
                              void mutate("jobs/" + j.id, "PATCH", {
                                status:
                                  j.status === "active" ? "archived" : "active",
                              })
                            }
                          >
                            {j.status === "active" ? "В архив" : "Возобновить"}
                          </button>
                        </>
                      ) : (
                        <button
                          className="button secondary"
                          onClick={() => setJobDetail(j)}
                        >
                          Подробнее о вакансии
                        </button>
                      )}
                    </div>
                  </article>
                ))}
            </div>
            {!jobs.some(
              (j) =>
                (isEmployer || j.status === "active") &&
                [j.title, j.company, ...j.skills]
                  .join(" ")
                  .toLowerCase()
                  .includes(jobQuery.toLowerCase()),
            ) && (
              <EmptyState
                title="Вакансии не найдены"
                description="Измените поисковый запрос или создайте новую вакансию."
              />
            )}
            <div className="catalog-note">
              <Info size={18} />
              <p>
                {data.session.mode === "demo"
                  ? "Все компании в демо вымышлены. Внешние площадки пока не подключены."
                  : "Условия указаны работодателем. Уточняйте детали на встрече с командой."}
              </p>
            </div>
          </>
        )}
        {view === "offers" && (
          <>
            <PageHeading
              eyebrow={
                isEmployer
                  ? "ПРЯМОЙ КОНТАКТ С КАНДИДАТАМИ"
                  : "ПРИГЛАШЕНИЯ ОТ КОМАНД"
              }
              title={isEmployer ? "Ваши предложения" : "Предложения для вас"}
              description={
                isEmployer
                  ? "Здесь видны условия и ответы кандидатов."
                  : "Вы решаете, с какой командой продолжить знакомство."
              }
            />
            <div className="stat-row">
              <Stat
                label="Всего предложений"
                value={offers.length}
                icon={<Mail />}
              />
              <Stat label="Ожидают ответа" value={unread} icon={<Clock />} />
              <Stat
                label="Принято"
                value={offers.filter((o) => o.status === "accepted").length}
                icon={<Check />}
              />
            </div>
            <div className="results-head">
              <h2>{isEmployer ? "История контактов" : me?.fullName}</h2>
              <Picker
                label="Статус предложения"
                value={offerStatus}
                onChange={setOfferStatus}
                options={[
                  { value: "all", label: "Все статусы" },
                  ...["pending", "accepted", "declined", "withdrawn"].map(
                    (s) => ({ value: s, label: statusLabel(s) }),
                  ),
                ]}
              />
            </div>
            <div className="offer-list">
              {offers
                .filter(
                  (o) => offerStatus === "all" || o.status === offerStatus,
                )
                .map((o) => {
                  const c = candidates.find((x) => x.id === o.candidateId);
                  return (
                    <article className="offer-card" key={o.id}>
                      <div className="offer-heading">
                        <div className="avatar avatar-2">
                          {isEmployer ? c?.initials : <BriefcaseBusiness />}
                        </div>
                        <div>
                          <h3>
                            {isEmployer
                              ? (c?.fullName ?? "Кандидат · профиль скрыт")
                              : o.company}
                          </h3>
                          <button
                            disabled={!o.jobId}
                            className="text-button job-offer-title"
                            onClick={() =>
                              setJobDetail(
                                jobs.find((j) => j.id === o.jobId) ?? null,
                              )
                            }
                          >
                            {o.jobTitle}
                          </button>
                        </div>
                        <span className={"status-badge " + o.status}>
                          {statusLabel(o.status)}
                        </span>
                      </div>
                      <div className="offer-body">
                        <strong className="offer-salary">
                          {salary(o.salaryMin, o.salaryMax)}{" "}
                          <small>/ мес. до налогов</small>
                        </strong>
                        <p>{o.message}</p>
                        <OfferEvidence offer={o} candidate={c} />
                        {o.declineReason && <p className="upgrade-callout"><strong>Причина отказа:</strong> {o.declineReason}</p>}
                        <p className="contact-line">
                          Связь с компанией:{" "}
                          {o.employerContact ?? "team@orbita.example (демо)"}
                        </p>
                        {isEmployer && o.candidateContact && (
                          <p className="contact-revealed">
                            <Check size={16} />
                            Кандидат разрешил связь: {o.candidateContact}
                          </p>
                        )}
                        {!isEmployer && o.status === "pending" && (
                          <p className="small-note">
                            {o.hasDialogue
                              ? "Откройте актуальные условия. Контакт станет доступен компании только после вашего окончательного принятия."
                              : "Нажимая «Мне интересно», вы разрешаете этой компании увидеть контакт из вашего профиля."}
                          </p>
                        )}
                      </div>
                      <div className="offer-footer">
                        <span>Отправлено {date(o.createdAt)}</span>
                        {o.status === "pending" ? (
                          isEmployer ? (
                            <>
                              <button
                                className="text-button"
                                onClick={() => openProfile(o.candidateId)}
                              >
                                Профиль кандидата
                              </button>
                              <button
                                className="button secondary"
                                onClick={() => openStudio(null, o.id)}
                              >
                                Условия и диалог
                              </button>
                              <button
                                className="text-button muted"
                                disabled={busy}
                                onClick={() =>
                                  void mutate("offers/" + o.id, "PATCH", {
                                    status: "withdrawn",
                                  })
                                }
                              >
                                Отозвать
                              </button>
                            </>
                          ) : (
                            <div className="button-group">
                              <button
                                className="button plain"
                                disabled={busy}
                                onClick={() => { setDeclineId(o.id); setDeclineReason(""); }}
                              >
                                Не подходит
                              </button>
                              <button
                                className="button primary"
                                disabled={busy}
                                onClick={() =>
                                  o.hasDialogue
                                    ? openStudio(null, o.id)
                                    : void mutate("offers/" + o.id, "PATCH", {
                                        status: "accepted",
                                      })
                                }
                              >
                                <Check size={16} />{" "}
                                {o.hasDialogue
                                  ? "Согласовать условия"
                                  : "Мне интересно"}
                              </button>
                            </div>
                          )
                        ) : (
                          <span>Обновлено {date(o.updatedAt)}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
            {!offers.some(
              (o) => offerStatus === "all" || o.status === offerStatus,
            ) && (
              <EmptyState
                title="Предложений пока нет"
                description={
                  isEmployer
                    ? "Откройте профиль специалиста и предложите вакансию с зарплатой."
                    : "Заполните профиль и укажите навыки: работодателям будет проще вас найти."
                }
              >
                <button
                  className="button secondary"
                  onClick={() => navigate(isEmployer ? "catalog" : "profile")}
                >
                  {isEmployer ? "Найти специалиста" : "Открыть профиль"}
                </button>
              </EmptyState>
            )}
          </>
        )}
        {(view === "assessment" || (!isEmployer && view === "catalog")) &&
          !isEmployer && (
            <AssessmentPanel
              key={data.session.candidateId}
              drafts={assessmentDrafts}
              onAnswersChange={(id, answers) =>
                setAssessmentDrafts((current) => ({
                  ...current,
                  [id]: answers,
                }))
              }
              data={data}
              mutate={mutate}
              busy={busy}
              onNavigate={(v) => navigate(v)}
            />
          )}
        {view === "account" && <AccountPanel />}
        {view === "integrations" && isEmployer && (
          <IntegrationsPanel data={data} />
        )}
        {view === "compare" && isEmployer && (
          <ComparePanel
            candidates={candidates.filter((c) => compared.includes(c.id))}
            job={chosenJob}
            onOpen={openProfile}
            onRemove={compareToggle}
          />
        )}
        {view === "board" && isEmployer && (
          <HiringBoard data={data} onOpen={openProfile} />
        )}
        {view === "insights" && isEmployer && <InsightsPanel data={data} />}
        {view === "career" && !isEmployer && (
          <CareerPanel data={data} mutate={mutate} busy={busy} />
        )}
        {view === "company" && isEmployer && (
          <CompanyForm company={data.company} mutate={mutate} busy={busy} />
        )}
        {view === "profile" && me && (
          <>
            <PageHeading
              eyebrow="ВАШ ОПЫТ. ВАШИ ДОСТИЖЕНИЯ."
              title={me.fullName}
              description="Заполните профиль, пройдите тест и выберите, что увидит работодатель."
            >
              <div className="button-group">
                <PdfButton candidate={me} />
                <button
                  className="button primary"
                  onClick={() => navigate("assessment")}
                >
                  Моя категория и тест
                </button>
              </div>
            </PageHeading>
            {isEmployer ? (
              <EmptyState
                title="Откройте роль соискателя"
                description="В демопространстве можно посмотреть сервис глазами любого вымышленного кандидата."
              >
                <button
                  className="button primary"
                  onClick={() => setRoleDialog(true)}
                >
                  Выбрать демопрофиль
                </button>
              </EmptyState>
            ) : (
              <div className="profile-layout section-space">
                <ProfileForm
                  key={me.id}
                  candidate={me}
                  mode={data.session.mode}
                  mutate={mutate}
                  busy={busy}
                />
                <aside className="profile-aside">
                  <div className="evidence-panel">
                    <div className="section-heading">
                      <BadgeCheck />
                      <h2>Достижения ФСП</h2>
                    </div>
                    <p>
                      Результаты загружает сервис. Эти поля не редактируются
                      вручную.
                    </p>
                    <span className="demo-source">
                      {data.session.mode === "demo"
                        ? "Демоисточник · mock-fsp"
                        : "Подключение реестра ожидается"}
                    </span>
                    <AchievementList candidate={me} />
                    <button
                      className="button secondary full-width"
                      disabled={busy || data.session.mode === "live"}
                      onClick={() => void mutate("profile/sync", "POST", {})}
                    >
                      <RefreshCw size={16} className={busy ? "spin" : ""} />{" "}
                      Синхронизировать
                    </button>
                    <small>
                      {me.lastSynced
                        ? "Обновлено " + date(me.lastSynced)
                        : data.session.mode === "demo"
                          ? "Данные подготовлены для демонстрации"
                          : "Для импорта нужно подтверждение принадлежности ID ФСП"}
                    </small>
                  </div>
                  <div className="evidence-panel">
                    <h2>Ваши категории</h2>
                    <p>
                      Специализация и грейд по результату теста. Дисциплины ФСП
                      дополняют профиль.
                    </p>
                    {categories(me).map((c) => (
                      <div className="category-proof" key={c.label}>
                        <span>{c.label}</span>
                        <small>{c.basis}</small>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
        {view === "about" && <UpgradeAbout data={data} onNavigate={(v) => navigate(v as View)} />}
      </main>
      <Dialog open={!!declineId} onOpenChange={(open) => { if (!open && !busy) setDeclineId(null); }}>
        <DialogContent className="form-dialog"><DialogHeader><DialogTitle>Отклонить предложение</DialogTitle><DialogDescription>Короткая обратная связь поможет компании понять ваше решение. Причину можно не указывать.</DialogDescription></DialogHeader>
          <label className="field">Причина отказа<textarea rows={4} maxLength={500} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Например, сейчас ищу полностью удалённую работу" /></label>
          <p className="small-note">{declineReason.length}/500 · Причину увидит работодатель, отправивший предложение.</p>
          <div className="button-group"><button className="button secondary" disabled={busy} onClick={() => setDeclineId(null)}>Вернуться</button><button className="button primary" disabled={busy || !declineId} onClick={async () => { if (declineId && await mutate("offers/" + declineId, "PATCH", { status: "declined", ...(declineReason.trim() ? { declineReason: declineReason.trim() } : {}) })) setDeclineId(null); }}>{busy ? "Сохраняем…" : "Отклонить предложение"}</button></div>
        </DialogContent>
      </Dialog>
      {isEmployer && compared.length > 0 && view !== "compare" && (
        <div className="compare-tray">
          <GitCompareArrows size={19} />
          <span>
            В сравнении <strong>{compared.length} из 3</strong>
          </span>
          <button
            className="button primary"
            onClick={() => navigate("compare")}
          >
            Сравнить профили
            <ArrowUpRight size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Очистить сравнение"
            onClick={() => setCompared([])}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <footer>
        <strong>Profectium</strong>
        <button className="text-button" onClick={() => navigate("about")}>
          Как работает подбор
        </button>
        <span>Разработано по кейсу ФСП · MVP 0.5 · 2026</span>
      </footer>
      <Sheet open={!!selected} onOpenChange={(v) => !v && openProfile(null)}>
        <SheetContent
          className="profile-sheet"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("candidate-profile-title")?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle className="sr-only">Профиль специалиста</SheetTitle>
            <SheetDescription className="sr-only">
              Навыки, условия и демонстрационные достижения
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <div className="detail-head">
                <div className="avatar avatar-large">{selected.initials}</div>
                <span className="source-tag">
                  {data.session.mode === "demo"
                    ? "Демопрофиль"
                    : "Профиль кандидата"}
                </span>
                <h2 id="candidate-profile-title" tabIndex={-1}>
                  {selected.fullName}
                </h2>
                <p>{roleLabel(selected.role)}</p>
                <div className="meta">
                  <span>{selected.grade}</span>
                  <span>
                    <MapPin size={14} />
                    {selected.city}
                  </span>
                  <span>{selected.workFormat}</span>
                </div>
                <strong className="detail-salary">
                  {salary(selected.salaryMin, selected.salaryMax)}
                  <small>ожидания в месяц до вычета налогов</small>
                </strong>
              </div>
              <div className="detail-section">
                <button
                  className="button secondary full-width"
                  onClick={() => openStudio(selected.id)}
                >
                  <BadgeCheck size={18} />
                  Паспорт навыков и основания
                </button>
                <h3>
                  О специалисте{" "}
                  <span className="source-tag">Со слов кандидата</span>
                </h3>
                <p>{selected.bio}</p>
                <div className="skills">
                  {selected.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <p className="small-note">
                  Опыт со слов кандидата: {selected.yearsExperience} лет.
                  Категория: {selected.qualification?.role} /{" "}
                  {selected.qualification?.grade}.
                </p>
              </div>
              <div className="detail-section ranking-detail">
                <ScoreBreakdown candidate={selected} job={chosenJob} />
                <h3>Основания оценки</h3>
                <strong className="ranking-total">
                  {rankingScore(selected, chosenJob)} баллов
                </strong>
                {rankingReasons(selected).map((r) => (
                  <p key={r}>{r}</p>
                ))}
                <p className="small-note">
                  {selected.qualification?.synthetic
                    ? "Исходный результат синтетический, для демонстрации."
                    : "Результат самостоятельного теста. Пилотная оценка требует экспертной калибровки."}
                </p>
                <p className="contact-line">
                  {selected.contact
                    ? `Контакт после принятия: ${selected.contact}`
                    : "Контакты откроются после принятия вашего приглашения."}
                </p>
              </div>
              {chosenJob && (
                <div className="detail-section match-detail">
                  <h3>Совпадение с вакансией</h3>
                  <p>{chosenJob.title}</p>
                  {matchCandidate(selected, chosenJob).reasons.map((s) => (
                    <div className="match-line" key={s}>
                      <Check size={15} />
                      {s}
                    </div>
                  ))}
                  {matchCandidate(selected, chosenJob).missing.length > 0 && (
                    <p className="small-note">
                      Стоит уточнить:{" "}
                      {matchCandidate(selected, chosenJob).missing.join(", ")}
                    </p>
                  )}
                </div>
              )}
              <div className="detail-section">
                <h3>
                  <Trophy size={18} /> Достижения{" "}
                  <span className="source-tag">Мок ФСП</span>
                </h3>
                <AchievementList candidate={selected} />
              </div>
              <div className="detail-section">
                <h3>Категории и основания</h3>
                {categories(selected).map((c) => (
                  <div className="category-proof" key={c.label}>
                    <span>{c.label}</span>
                    <small>{c.basis}</small>
                  </div>
                ))}
              </div>
              {isEmployer && (
                <div className="detail-section">
                  <NoteEditor
                    key={selected.id}
                    candidateId={selected.id}
                    note={data.notes.find((n) => n.candidateId === selected.id)}
                    mutate={mutate}
                    busy={busy}
                  />
                </div>
              )}
              <div className="detail-footer">
                {isEmployer ? (
                  <button
                    className="button primary full-width"
                    disabled={selected.available === false}
                    onClick={() => {
                      /*
                       * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
                       * Все права сохранены.
                       *
                       * Автор: Криницин Вячеслав Александрович
                       */
                      setOfferCandidate(selected);
                      openProfile(null);
                    }}
                  >
                    <Mail size={17} /> Пригласить с предложением
                  </button>
                ) : (
                  <button
                    className="button secondary full-width"
                    onClick={() => {
                      openProfile(null);
                      navigate("profile");
                    }}
                  >
                    Мой профиль
                  </button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={mobileFilters} onOpenChange={setMobileFilters}>
        <SheetContent side="left" className="filter-sheet">
          <SheetHeader>
            <SheetTitle className="sr-only">Фильтры специалистов</SheetTitle>
            <SheetDescription className="sr-only">
              Уточните параметры поиска
            </SheetDescription>
          </SheetHeader>
          <div className="filters mobile-filters">
            {filterPanel}
            <button
              className="button primary full-width"
              onClick={() => setMobileFilters(false)}
            >
              Показать {results.length} специалистов
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent className="role-dialog">
          <DialogHeader>
            <DialogTitle>Посмотрите с другой стороны</DialogTitle>
            <DialogDescription>
              Переключайте демороли, чтобы пройти путь работодателя и кандидата.
              Все действия остаются в вашем демопространстве.
            </DialogDescription>
          </DialogHeader>
          <button
            className={"role-employer " + (isEmployer ? "chosen" : "")}
            disabled={busy}
            onClick={async () => {
              if (
                await mutate("session", "POST", {
                  role: "employer",
                  candidateId: data.session.candidateId,
                })
              ) {
                setRoleDialog(false);
                navigate("catalog");
              }
            }}
          >
            <BriefcaseBusiness />
            <span>
              <strong>Работодатель</strong>
              <small>Поиск, вакансии и предложения</small>
            </span>
            {isEmployer && <Check size={18} />}
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              if (
                data.demoPersonas.some((c) => c.id === "demo-new-candidate")
              ) {
                if (
                  await mutate("session", "POST", {
                    role: "candidate",
                    candidateId: "demo-new-candidate",
                  })
                ) {
                  setRoleDialog(false);
                  navigate("assessment");
                }
              } else {
                setRoleDialog(false);
                setOnboarding(true);
              }
            }}
          >
            {data.demoPersonas.some((c) => c.id === "demo-new-candidate")
              ? "Продолжить новый профиль"
              : "Создать нового кандидата и пройти тест"}
          </button>
          <h3 className="role-subtitle">
            Или выберите вымышленного соискателя
          </h3>
          <div className="demo-people">
            {data.demoPersonas.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                onClick={async () => {
                  if (
                    await mutate("session", "POST", {
                      role: "candidate",
                      candidateId: c.id,
                    })
                  ) {
                    setRoleDialog(false);
                    navigate("profile");
                  }
                }}
              >
                <span className="avatar">{c.fullName[0]}</span>
                <span>
                  <strong>{c.fullName}</strong>
                  <small>Демоперсона</small>
                </span>
                {!isEmployer && me?.id === c.id && <Check size={16} />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Onboarding
        open={onboarding}
        busy={busy}
        mutate={mutate}
        onClose={() => setOnboarding(false)}
        onCreated={() => {
          setOnboarding(false);
          navigate("assessment");
        }}
      />
      <JobForm
        company={data.company?.name ?? "Моя компания"}
        open={jobForm}
        onClose={() => setJobForm(false)}
        mutate={mutate}
        busy={busy}
      />
      {offerCandidate && (
        <OfferForm
          key={offerCandidate.id}
          candidate={offerCandidate}
          jobs={jobs}
          initialJobId={chosenJob?.id}
          company={data.company}
          onClose={() => setOfferCandidate(null)}
          mutate={mutate}
          busy={busy}
        />
      )}
      <Dialog open={!!jobDetail} onOpenChange={(v) => !v && setJobDetail(null)}>
        <DialogContent className="form-dialog">
          {jobDetail && (
            <>
              <DialogHeader>
                <DialogTitle>{jobDetail.title}</DialogTitle>
                <DialogDescription>
                  {jobDetail.company} · {jobDetail.city} ·{" "}
                  {jobDetail.workFormat}
                </DialogDescription>
              </DialogHeader>
              <strong className="offer-salary">
                {salary(jobDetail.salaryMin, jobDetail.salaryMax)}
              </strong>
              <p className="muted">
                В месяц до вычета налогов · {jobDetail.grade}
              </p>
              <div className="skills">
                {jobDetail.skills.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <p className="job-description">{jobDetail.description}</p>
              {!isEmployer && (
                <div className="info-box">
                  В этой платформе работодатель первым предлагает вакансию.
                  Поддерживайте профиль актуальным, чтобы вас нашли.
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="stat">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
    </div>
  );
}
function CandidateCard({
  candidate: c,
  index,
  saved,
  canSave,
  busy,
  job,
  onOpen,
  onSave,
  compared,
  onCompare,
}: {
  candidate: Candidate;
  index: number;
  saved: boolean;
  canSave: boolean;
  busy: boolean;
  job?: Job;
  onOpen: () => void;
  onSave: () => void;
  compared: boolean;
  onCompare: () => void;
}) {
  const achievement = c.achievements[0],
    match = job ? matchCandidate(c, job) : null;
  return (
    <article
      className={"candidate-card " + (compared ? "is-compared" : "")}
      style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
    >
      <div className="card-top">
        <span className="card-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className={"avatar avatar-" + (index % 4)}>{c.initials}</span>
        {canSave && (
          <button
            className={"icon-button " + (saved ? "saved" : "")}
            aria-label={
              (saved ? "Убрать из избранного: " : "Сохранить: ") + c.fullName
            }
            aria-pressed={saved}
            disabled={busy}
            onClick={onSave}
          >
            <Bookmark size={20} fill={saved ? "currentColor" : "none"} />
          </button>
        )}
      </div>
      <button className="candidate-name" onClick={onOpen}>
        <h3>{c.fullName}</h3>
      </button>
      <p className="candidate-role">{roleLabel(c.role)}</p>
      <div className="verified-category">
        <BadgeCheck size={24} aria-hidden="true" />
        <div className="verified-category-copy">
          <strong>{c.qualification?.grade}</strong>
          <span>Результат теста</span>
        </div>
        <div className="verified-category-result">
          <strong>{c.qualification?.score}<span>/100</span></strong>
          <span className="verified-category-status">
            {c.qualification?.synthetic ? "Демо" : "Пройден"}
          </span>
        </div>
      </div>
      <div className="meta">
        <span>{c.grade}</span>
        <span>
          <MapPin size={13} />
          {c.city}
        </span>
        <span>{c.workFormat}</span>
      </div>
      <div className="skills">
        {c.skills.slice(0, 4).map((s) => (
          <span key={s}>{s}</span>
        ))}
        {c.skills.length > 4 && <span>+{c.skills.length - 4}</span>}
      </div>
      <div
        className={
          "achievement-preview " + (!achievement ? "no-achievement" : "")
        }
      >
        <Trophy size={17} />
        <span>
          {achievement
            ? achievement.place +
              " место · " +
              (achievement.discipline === "Продуктовое программирование"
                ? "Командное программирование"
                : achievement.discipline === "Алгоритмическое программирование"
                  ? "Алгоритмы"
                  : "Анализ данных")
            : "Без соревновательных достижений"}
          <small>
            {achievement
              ? "Демоисточник · " + achievement.year
              : "Профессиональный опыт в профиле"}
          </small>
        </span>
      </div>
      {match && (
        <div className="match-summary">
          <Check size={14} />
          {match.matched.length} из {job!.skills.length} навыков
          {match.salary ? " · зарплата совпадает" : ""}
        </div>
      )}
      {canSave && (
        <button
          className={"compare-toggle " + (compared ? "selected" : "")}
          aria-pressed={compared}
          onClick={onCompare}
        >
          <GitCompareArrows size={14} />
          {compared ? "Добавлен к сравнению" : "Сравнить"}
        </button>
      )}
      <div className="card-bottom">
        <div>
          <strong>{salary(c.salaryMin, c.salaryMax)}</strong>
          <small>ожидания в месяц до налогов</small>
        </div>
        <button className="button secondary" onClick={onOpen}>
          Профиль
        </button>
      </div>
    </article>
  );
}
function AchievementList({ candidate }: { candidate: Candidate }) {
  return candidate.achievements.length ? (
    <div className="achievement-list">
      {candidate.achievements.map((a) => (
        <div className="achievement" key={a.id}>
          <div className="achievement-place">
            {a.place}
            <span>место</span>
          </div>
          <div>
            <strong>{a.competition}</strong>
            <p>{a.discipline}</p>
            <small>
              {a.year} · {a.participants}{" "}
              {a.teamRole === "Индивидуальный участник"
                ? "участников"
                : "команд"}{" "}
              в зачёте
            </small>
            <p className="team-role">{a.teamRole}</p>
            <span className="demo-source">
              Синтетический результат · {a.source}
            </span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="no-evidence">
      <Trophy size={24} />
      <p>Достижений пока нет</p>
      <small>
        Вы можете получать предложения на основе профессионального профиля.
      </small>
    </div>
  );
}
