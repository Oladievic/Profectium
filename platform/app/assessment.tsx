/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowRight,
  Timer,
  ShieldCheck,
  Download,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, Picker } from "./ui";
import {
  grades,
  roles,
  type Candidate,
  type AppState,
  type Grade,
  type Role,
  type Assessment,
  type Company,
} from "@/lib/types";
import { toast } from "sonner";
export type Mutation = (
  path: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
) => Promise<boolean>;
const date = (v: string) => new Date(v).toLocaleDateString("ru-RU");
// The parent retains unsaved answer objects across navigation. Retain their base revision too.
const answerRevisions = new WeakMap<Record<string, string>, { attemptId: string; revision: number }>();
export function AssessmentPanel({
  data,
  mutate,
  busy,
  drafts,
  onAnswersChange,
  onNavigate,
}: {
  data: AppState;
  mutate: Mutation;
  busy: boolean;
  drafts: Record<string, Record<string, string>>;
  onAnswersChange: (id: string, answers: Record<string, string>) => void;
  onNavigate?: (view: "profile" | "tests") => void;
}) {
  const c = data.candidates[0];
  const [role, setRole] = useState<Role>(c?.role ?? "Frontend"),
    [grade, setGrade] = useState<Grade>(
      (grades as readonly string[]).includes(c?.grade)
        ? (c.grade as Grade)
        : "Junior",
    ),
    [industry, setIndustry] = useState("ИТ-продукты"),
    [jobId, setJobId] = useState("none");
  const [now, setNow] = useState(() => Date.now());
  const history = data.assessments;
  const active = history.find((a) => a.status === "active");
  const latest = history.find((a) => a.status !== "active");
  const recent = history.find(
    (a) =>
      a.role === role &&
      a.grade === grade &&
      a.status !== "active" &&
      Date.parse(a.createdAt) + 86400000 > now,
  );
  const retryAt = recent
    ? new Date(Date.parse(recent.createdAt) + 86400000)
    : null;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const blocked =
    c?.qualification &&
    (c.qualification.role !== role || c.qualification.grade !== grade) &&
    Date.parse(c.qualification.nextChangeAt) > now;
  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate("assessments", "POST", {
      role,
      grade,
      industry,
      motivation: f.get("motivation"),
      ...(jobId === "none" ? {} : { jobId }),
    });
  }
  if (!c) return null;
  const qualification = c.qualification;
  const categoryLocked = !!qualification && Date.parse(qualification.nextChangeAt) > now;
  const categoryWindow = qualification
    ? Math.max(1, Date.parse(qualification.nextChangeAt) - Date.parse(qualification.passedAt))
    : 1;
  const categoryProgress = qualification
    ? Math.max(0, Math.min(100, ((now - Date.parse(qualification.passedAt)) / categoryWindow) * 100))
    : 0;
  const nextGrade = qualification && qualification.grade !== "Senior"
    ? grades[grades.indexOf(qualification.grade) + 1]
    : null;
  const stepIndex = active ? 2 : latest?.status === "passed" ? 3 : 0;
  function focusSetup(targetGrade?: Grade) {
    if (targetGrade) {
      setJobId("none");
      setRole(qualification?.role ?? c.role);
      setGrade(targetGrade);
    }
    const target = document.getElementById(active ? "assessment-attempt" : "assessment-setup");
    target?.scrollIntoView({ block: "start", behavior: "auto" });
    target?.focus({ preventScroll: true });
  }
  return (
    <div className="assessment-page">
      <section className="upgrade-hero upgrade-assessment-hero" aria-labelledby="assessment-title">
        <div className="upgrade-hero-grid">
          <div className="upgrade-hero-copy">
            <div className="upgrade-kicker">{qualification ? "Ваша категория · результат проверки" : "Профиль → опрос → проверка → категория"}</div>
            <h1 id="assessment-title">
              {qualification ? <>{qualification.role}<br /><em>·</em> {qualification.grade}</> : <>Подтвердите<br />свой уровень<em>.</em></>}
            </h1>
            <p>{qualification
              ? `${qualification.synthetic ? "Демонстрационный результат" : "Подтверждено тестом"} · ${date(qualification.passedAt)} · ${qualification.score}/100`
              : "Работодатель увидит категорию по результату теста. Опыт в резюме остаётся вашим самоописанием."}</p>
            <div className="button-group">
              <button type="button" className="button primary" onClick={() => focusSetup(!active && !categoryLocked ? nextGrade ?? undefined : undefined)}>
                {active ? "Продолжить тест" : nextGrade && !categoryLocked ? `Проверить уровень ${nextGrade}` : "Выбрать направление теста"}<ArrowRight size={17} />
              </button>
              {onNavigate && <button type="button" className="button upgrade-outline-button" onClick={() => onNavigate("profile")}>Мой профиль и видимость</button>}
            </div>
          </div>
          <ol className="upgrade-grade-path" aria-label="Уровни и подтверждения">
            {grades.map((g) => {
              const passed = history.find((a) => a.role === (qualification?.role ?? role) && a.grade === g && a.status === "passed");
              const current = qualification?.grade === g;
              return <li key={g} data-current={current} data-confirmed={!!passed || current}>
                <span className="upgrade-grade-node" aria-hidden="true" />
                <strong>{g}</strong>
                <small>{current ? `Сейчас · ${date(qualification.passedAt)}` : passed ? `Пройден · ${date(passed.completedAt ?? passed.createdAt)}` : "Пока не подтверждён"}</small>
              </li>;
            })}
          </ol>
        </div>
        <div className="upgrade-grade-window">
          <span className="upgrade-kicker">Смена категории · по правилам теста</span>
          <Progress value={categoryProgress} aria-label="Интервал до следующей смены категории" />
          <p>{qualification
            ? categoryLocked ? `Следующая смена доступна ${date(qualification.nextChangeAt)}. Текущий уровень можно проверить повторно.` : "Интервал смены завершён. Можно выбрать новый уровень. Неудачная попытка сохранит категорию."
            : "Выберите специализацию и грейд. Первая категория появится после успешного теста."}</p>
        </div>
      </section>
      <ol className="upgrade-assessment-steps" aria-label="Этапы подтверждения категории">
        {["Специализация", "Грейд", "Проверка", "Категория"].map((label, i) => <li key={label} data-current={i === stepIndex} data-complete={i < stepIndex} aria-current={i === stepIndex ? "step" : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{label}</li>)}
      </ol>
      <div className="assessment-layout">
        <section>
          {latest && !active && (
            <div
              className={"assessment-card result-card " + latest.status}
              aria-live="polite"
            >
              <div className="section-heading">
                <h2>
                  {latest.status === "passed"
                    ? "Уровень подтверждён"
                    : latest.status === "expired"
                      ? "Время попытки истекло"
                      : "Уровень пока не подтверждён"}
                </h2>
                <strong>{latest.score ?? "—"}/100</strong>
              </div>
              <p>
                {latest.role} · {latest.grade}.{" "}
                {latest.status === "passed"
                  ? "Категория обновлена автоматически."
                  : "Предыдущая категория сохранена. Если категории ещё нет, вы можете добровольно выбрать уровень ниже."}
              </p>
              {latest.status === "passed" &&
                latest.grade !== "Senior" &&
                (latest.score ?? 0) >= 83 && (
                  <p>
                    Сильный результат. Следующий уровень можно проверить после
                    даты доступной смены категории.
                  </p>
                )}
              <div className="feedback-grid">
                {latest.feedback?.map((f, i) => (
                  <div key={i}>
                    <span className={f.correct ? "correct" : "needs-work"}>
                      {f.correct ? "✓" : "○"}
                    </span>
                    {f.topic}
                  </div>
                ))}
              </div>
            </div>
          )}
          {active ? (
            <TestAttempt
              key={active.id}
              attempt={active}
              mutate={mutate}
              busy={busy}
              now={now}
              mode={data.session.mode}
              answers={drafts[active.id] ?? active.draftAnswers ?? {}}
              setAnswers={(answers) => onAnswersChange(active.id, answers)}
            />
          ) : (
            <form className="assessment-card form-grid upgrade-assessment-form" id="assessment-setup" tabIndex={-1} onSubmit={start}>
              <div className="section-heading">
                <h2>01 / Выберите направление</h2>
                <span className="source-tag">Опрос перед тестом</span>
              </div>
              <Field label="Отрасль">
                <Picker
                  label="Отрасль тестирования"
                  value={industry}
                  onChange={setIndustry}
                  options={[
                    "ИТ-продукты",
                    "Финтех",
                    "Образование",
                    "Промышленность",
                    "Электронная коммерция",
                  ]}
                />
              </Field>
              <Field
                label="Пример потребности работодателя"
                hint="Можно выбрать самостоятельно. Потребность задаёт специализацию и уровень; структура оценки остаётся сопоставимой."
              >
                <Picker
                  label="Потребность для теста"
                  value={jobId}
                  onChange={(v) => {
                    setJobId(v);
                    const j = data.jobs.find((j) => j.id === v);
                    if (j) {
                      setRole(j.role);
                      setGrade(j.grade as Grade);
                    }
                  }}
                  options={[
                    { value: "none", label: "Свой выбор направления" },
                    ...data.jobs
                      .filter(
                        (j) =>
                          j.status === "active" &&
                          grades.includes(j.grade as Grade),
                      )
                      .map((j) => ({ value: j.id, label: j.title })),
                  ]}
                />
              </Field>
              {jobId !== "none" && (
                <p className="info-box">
                  {data.jobs.find((j) => j.id === jobId)?.skills.join(" · ")}
                </p>
              )}
              <div className="form-row">
                <Field label="Специализация">
                  <Picker
                    label="Направление тестирования"
                    disabled={jobId !== "none"}
                    value={role}
                    onChange={(v) => setRole(v as Role)}
                    options={[...roles]}
                  />
                </Field>
                <Field label="Предполагаемый уровень">
                  <Picker
                    label="Уровень тестирования"
                    disabled={jobId !== "none"}
                    value={grade}
                    onChange={(v) => setGrade(v as Grade)}
                    options={[...grades]}
                  />
                </Field>
              </div>
              <Field
                label="Какие задачи вы уже решали?"
                hint="Ответ сохраняется в истории опроса и не добавляет баллов к тесту."
              >
                <textarea
                  name="motivation"
                  required
                  minLength={10}
                  maxLength={500}
                  rows={3}
                  placeholder="Опишите проект, свою роль и результат"
                />
              </Field>
              <div className="assessment-rules">
                <span>
                  <Timer size={18} />
                  30 минут
                </span>
                <span>6 заданий</span>
                <span>Минимум 4 из 6, включая 3 из 4 профессиональных</span>
              </div>
              {blocked && (
                <p className="info-box">
                  Следующая смена категории:{" "}
                  {date(c.qualification!.nextChangeAt)}. Можно проверить текущий
                  уровень.
                </p>
              )}
              {!c.privacy?.processing && (
                <p className="info-box">
                  Сначала сохраните согласие на обработку данных в профиле.
                </p>
              )}
              {retryAt && (
                <p className="info-box">
                  Повтор этого направления и уровня:{" "}
                  {retryAt.toLocaleString("ru-RU")}. До этого результат
                  сохранён.
                </p>
              )}
              <button
                className="button primary"
                disabled={
                  busy || !!blocked || !!retryAt || !c.privacy?.processing
                }
              >
                Начать тест <ArrowRight size={17} />
              </button>
            </form>
          )}
          <div className="assessment-card">
            <h2>История опросов и тестов</h2>
            {history.length ? (
              history.map((a) => (
                <details className="history-attempt" key={a.id}>
                  <summary>
                    <span>
                      {a.role} · {a.grade}
                    </span>
                    <span>
                      {a.status === "active"
                        ? "В процессе"
                        : a.status === "passed"
                          ? "Пройден"
                          : a.status === "expired"
                            ? "Время истекло"
                            : "Не пройден"}
                      {a.score !== undefined ? ` · ${a.score}/100` : ""}
                    </span>
                    <time>{date(a.createdAt)}</time>
                  </summary>
                  <p>
                    {a.industry} · {a.motivation}
                  </p>
                  {a.jobTitle && <p>Потребность: {a.jobTitle}</p>}
                  {a.status !== "active" && <AttemptFeedback attempt={a} />}
                  <small>
                    Структура оценки {a.blueprint}. Результат завершённой
                    попытки не редактируется.
                  </small>
                </details>
              ))
            ) : (
              <p className="muted">
                Здесь появятся ваши попытки. Демоисходные результаты не выдаются
                за пройденные вами тесты.
              </p>
            )}
          </div>
        </section>
        <aside>
          <div className="qualification-card">
            <ShieldCheck />
            <span className="eyebrow">ВАША КАТЕГОРИЯ</span>
            <h2>
              {c.qualification
                ? `${c.qualification.role} / ${c.qualification.grade}`
                : "Ещё не присвоена"}
            </h2>
            <p>
              {c.qualification
                ? `${c.qualification.score}/100 · ${c.qualification.synthetic ? "демонстрационный результат" : "ваш результат"}`
                : "Пройдите опрос и тест. До этого профиль не попадёт в каталог работодателя."}
            </p>
            {c.qualification && (
              <small>
                Следующая смена: {date(c.qualification.nextChangeAt)}
              </small>
            )}
          </div>
          {onNavigate && <div className="assessment-card upgrade-employer-task-link">
            <span className="section-index">ПРАКТИКА ОТ КОМПАНИЙ</span>
            <h3>Тесты работодателей</h3>
            <p>Личные приглашения, задания и обратная связь компании. Результаты этих тестов не меняют вашу категорию.</p>
            <button type="button" className="button secondary full-width" onClick={() => onNavigate("tests")}>Открыть приглашения <ArrowRight size={16} /></button>
          </div>}
          <div className="assessment-card">
            <h3>Сопоставимость важнее случайности</h3>
            <p>
              У каждого уровня одна структура: два параметрических задания и
              четыре профессиональных сценария из банка. Числа, состав и порядок
              вариантов меняются, правила оценивания — нет.
            </p>
            <p>
              Это пилотная оценка, а не сертификат профессиональной
              квалификации. Для её калибровки нужны реальные прохождения и
              экспертная оценка.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function AttemptFeedback({ attempt: a }: { attempt: Assessment }) {
  const totalCorrect = a.feedback?.filter((f) => f.correct).length ?? 0;
  const professional = a.questions.filter((q) => q.kind === "professional");
  const professionalCorrect = a.questions.filter((q, i) => q.kind === "professional" && a.feedback?.[i]?.correct).length;
  return <div>
    <p>Верных ответов: {totalCorrect} из {a.questions.length}. Профессиональный блок: {professionalCorrect} из {professional.length}.</p>
    <p className="small-note">Для подтверждения: минимум {a.rubric?.minimumTotal ?? 4} верных ответов, из них {a.rubric?.minimumProfessional ?? 3} профессиональных.</p>
    {a.status === "expired" && <p className="info-box">Время истекло. Оценён последний сохранённый черновик. Поздние ответы не учитываются; категория не присваивается.</p>}
    {a.completedAt && <p className="small-note">Завершено: {new Date(a.completedAt).toLocaleString("ru-RU")}</p>}
    {a.questions.map((q, i) => <div className="test-question" key={q.id}>
      <strong>{i + 1}. {q.topic} · {a.feedback?.[i]?.correct ? "Верно" : a.answers?.[q.id] ? "Нужно повторить" : "Без ответа"}</strong>
      <p>{q.prompt}</p>
      <p>Ваш ответ: {q.options.find((o) => o.id === a.answers?.[q.id])?.text ?? "Не сохранён"}</p>
    </div>)}
  </div>;
}
export function TestAttempt({
  attempt: a,
  mutate,
  busy,
  now,
  answers,
  setAnswers,
  mode,
}: {
  attempt: Assessment;
  mutate: Mutation;
  busy: boolean;
  now: number;
  answers: Record<string, string>;
  setAnswers: (answers: Record<string, string>) => void;
  mode: "demo" | "live";
}) {
  const [confirm, setConfirm] = useState(false);
  const [draftRevision, setDraftRevision] = useState(() => {
    const base = answerRevisions.get(answers);
    return base?.attemptId === a.id ? base.revision : a.draftRevision ?? 0;
  });
  const [problem, setProblem] = useState(false);
  const [serverAttempt, setServerAttempt] = useState<Assessment | null>(null);
  const [checking, setChecking] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const questionNodes = useRef<(HTMLFieldSetElement | null)[]>([]);
  const expiryRequested = useRef(false);
  const expired = now >= Date.parse(a.expiresAt);
  function chooseAnswers(next: Record<string, string>, revision = draftRevision) {
    answerRevisions.set(next, { attemptId: a.id, revision });
    setAnswers(next);
  }
  function focusQuestion(index: number) {
    setActiveQuestion(index);
    questionNodes.current[index]?.scrollIntoView({ block: "start", behavior: "auto" });
    questionNodes.current[index]?.focus({ preventScroll: true });
  }
  function chooseWithKeyboard(e: KeyboardEvent<HTMLFieldSetElement>, index: number) {
    if (busy || expired || confirm || activeQuestion !== index || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.nativeEvent.isComposing) return;
    const target = e.target;
    if (!(target instanceof HTMLElement) || target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='dialog']")) return;
    const key = e.key.toLowerCase();
    const optionIndex = /^[1-4]$/.test(key) ? Number(key) - 1 : ["a", "b", "c", "d"].indexOf(key);
    const question = a.questions[index];
    const option = question.options[optionIndex];
    if (!option) return;
    e.preventDefault();
    chooseAnswers({ ...answers, [question.id]: option.id });
  }
  useEffect(() => {
    if (!expired || busy || expiryRequested.current) return;
    expiryRequested.current = true;
    void mutate("state", "GET");
  }, [expired, busy, mutate]);
  async function save(revision = draftRevision) {
    const ok = await mutate("assessments/" + a.id + "/draft", "PUT", { answers, revision });
    setProblem(!ok);
    if (ok) {
      answerRevisions.set(answers, { attemptId: a.id, revision: revision + 1 });
      setDraftRevision(revision + 1);
      setServerAttempt(null);
    }
  }
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  async function inspectSaved() {
    setChecking(true);
    try {
      const r = await fetch((mode === "live" ? "/api/live/v1" : "/api/v1") + "/state", { cache: "no-store" });
      if (!r.ok) throw new Error("Не удалось загрузить сохранённую версию");
      const state = await r.json() as AppState;
      const latest = state.assessments.find((attempt) => attempt.id === a.id);
      if (!latest) throw new Error("Попытка больше недоступна");
      setServerAttempt(latest);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить черновик");
    } finally { setChecking(false); }
  }
  const count = Object.keys(answers).length;
  const seconds = Math.max(
    0,
    Math.min(1800, Math.ceil((Date.parse(a.expiresAt) - now) / 1000)),
  );
  return (
    <div className="assessment-card upgrade-test-attempt" id="assessment-attempt" tabIndex={-1}>
      <div className="test-sticky">
        <div className="section-heading">
          <h2>
            {a.role} / {a.grade}
          </h2>
          <span className="timer">
            <Timer size={16} />
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        </div>
        <Progress
          value={(count / a.questions.length) * 100}
          aria-label="Прогресс тестирования"
        />
        <p className="small-note">
          Ответов: {count} из {a.questions.length}.{" "}
          {seconds === 0
            ? "Время истекло. Сервер оценивает последний сохранённый черновик; поздние ответы не учитываются."
            : "Сохраните черновик перед закрытием страницы. Несохранённые изменения остаются только в этой вкладке."}
        </p>
        <nav className="upgrade-question-map" aria-label="Карта заданий">
          {a.questions.map((q, i) => <button type="button" key={q.id} onClick={() => focusQuestion(i)} aria-label={`Перейти к вопросу ${i + 1}${answers[q.id] ? ", ответ выбран" : ", без ответа"}`} aria-current={activeQuestion === i ? "step" : undefined} data-answered={!!answers[q.id]}>{i + 1}<span aria-hidden="true">{answers[q.id] ? "✓" : "·"}</span></button>)}
        </nav>
        <p className="upgrade-keyboard-note">В выбранном вопросе: <kbd>1</kbd>–<kbd>4</kbd> или <kbd>A</kbd>–<kbd>D</kbd> — выбрать ответ. Все задания доступны ниже.</p>
      </div>
      {a.questions.map((q, i) => (
        <fieldset className="test-question upgrade-active-question" key={q.id} tabIndex={0} ref={(node) => { questionNodes.current[i] = node; }} data-current={activeQuestion === i} onFocusCapture={() => setActiveQuestion(i)} onPointerDown={() => setActiveQuestion(i)} onKeyDown={(e) => chooseWithKeyboard(e, i)}>
          <legend>
            <span>
              {String(i + 1).padStart(2, "0")} / {q.topic}
              {q.kind === "professional" ? " · профессиональный блок" : ""}
            </span>
            {q.prompt}
          </legend>
          <RadioGroup
            value={answers[q.id] ?? ""}
            onValueChange={(v) => chooseAnswers({ ...answers, [q.id]: v })}
            aria-label={`Вопрос ${i + 1}`}
            disabled={busy || expired}
          >
            {q.options.map((o, optionIndex) => (
              <label
                className={
                  "answer-option " + (answers[q.id] === o.id ? "selected" : "")
                }
                key={o.id}
              >
                <RadioGroupItem value={o.id} />
                <span className="upgrade-option-key" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span>
                <span>{o.text}</span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      ))}
      <button
        className="button secondary full-width"
        disabled={busy || expired}
        onClick={() => void save()}
      >
        Сохранить черновик
      </button>
      <p className="small-note">
        Сохранённые ответы восстановятся после обновления страницы. Время теста
        продолжает идти.
      </p>
      {problem && <div className="info-box" role="alert">
        <p>Сохранить или отправить ответы не удалось. Изменения этой вкладки остались на экране. При конфликте вкладок сначала сравните сохранённую версию; повторное нажатие не заменит её автоматически.</p>
        <button type="button" className="button secondary" disabled={busy || checking} onClick={() => void inspectSaved()}>Проверить сохранённую версию</button>
      </div>}
      {serverAttempt && <div className="info-box">
        {serverAttempt.status === "active" ? <>
          <p>На сервере: {Object.keys(serverAttempt.draftAnswers ?? {}).length} ответов, версия {serverAttempt.draftRevision ?? 0}. В этой вкладке: {count}. Выберите, какие ответы сохранить.</p>
          <details><summary>Сравнить ответы</summary>{a.questions.map((q) => <p key={q.id}><strong>{q.topic}</strong><br />Сервер: {q.options.find((o) => o.id === serverAttempt.draftAnswers?.[q.id])?.text ?? "Нет ответа"}<br />Эта вкладка: {q.options.find((o) => o.id === answers[q.id])?.text ?? "Нет ответа"}</p>)}</details>
          <div className="button-group">
            <button type="button" className="button secondary" disabled={busy || expired} onClick={() => { chooseAnswers(serverAttempt.draftAnswers ?? {}, serverAttempt.draftRevision ?? 0); setDraftRevision(serverAttempt.draftRevision ?? 0); setServerAttempt(null); setProblem(false); }}>Использовать сохранённые ответы</button>
            <button type="button" className="button secondary" disabled={busy || expired} onClick={() => void save(serverAttempt.draftRevision ?? 0)}>Заменить черновик ответами этой вкладки</button>
          </div>
        </> : <p>Попытка уже завершена. Её результат нельзя перезаписать. <button className="button secondary" disabled={busy} onClick={() => void mutate("state", "GET")}>Показать результат</button></p>}
      </div>}
      {expired && <button className="button secondary full-width" disabled={busy} onClick={() => void mutate("state", "GET")}>Получить результат сохранённых ответов</button>}
      <button
        className="button primary full-width"
        disabled={busy || expired || count !== a.questions.length}
        onClick={() => setConfirm(true)}
      >
        Завершить тест
      </button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить ответы?</DialogTitle>
            <DialogDescription>
              После отправки ответы и результат этой попытки нельзя изменить.
              Неудачная попытка не понижает текущую категорию.
            </DialogDescription>
          </DialogHeader>
          <div className="button-group">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Проверить ещё раз
            </button>
            <button
              className="button primary"
              disabled={busy || expired}
              onClick={async () => {
                if (await mutate("assessments/" + a.id, "POST", { answers, revision: draftRevision }))
                  setConfirm(false);
                else { setConfirm(false); setProblem(true); }
              }}
            >
              Отправить на проверку
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function CompanyForm({
  company,
  mutate,
  busy,
}: {
  company: Company;
  mutate: Mutation;
  busy: boolean;
}) {
  return (
    <form
      className="assessment-card form-grid company-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await mutate("company", "PATCH", Object.fromEntries(f));
      }}
    >
      <h1>
        Ваша команда<span>.</span>
      </h1>
      <p className="muted">
        Эти сведения видит кандидат в приглашении. Проверка юридического лица в
        демоверсии не выполняется.
      </p>
      <Field label="Название компании">
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={company.name}
        />
      </Field>
      <Field label="Направление деятельности">
        <input
          name="industry"
          required
          minLength={2}
          maxLength={100}
          defaultValue={company.industry}
        />
      </Field>
      <Field label="О компании и команде">
        <textarea
          name="description"
          required
          minLength={20}
          maxLength={2000}
          rows={5}
          defaultValue={company.description}
        />
      </Field>
      <Field label="Как с вами связаться">
        <input
          name="contact"
          required
          minLength={5}
          maxLength={150}
          defaultValue={company.contact}
        />
      </Field>
      <button className="button primary" disabled={busy}>
        Сохранить компанию
      </button>
    </form>
  );
}
export function Onboarding({
  open,
  onClose,
  onCreated,
  mutate,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  mutate: Mutation;
  busy: boolean;
}) {
  const [processing, setProcessing] = useState(false),
    [publication, setPublication] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="form-dialog">
        <DialogHeader>
          <DialogTitle>Начните путь кандидата</DialogTitle>
          <DialogDescription>
            Создайте новый демопрофиль и пройдите тест самостоятельно.
            Используйте вымышленные данные. Адрес здесь является контактом;
            отправка письма и проверка почты ещё не подключены.
          </DialogDescription>
        </DialogHeader>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await mutate("onboarding", "POST", {
                fullName: f.get("fullName"),
                contact: f.get("contact"),
                processing,
                publication,
              })
            )
              onCreated();
          }}
        >
          <Field label="Имя и фамилия">
            <input
              name="fullName"
              required
              minLength={3}
              maxLength={80}
              placeholder="Алексей Примеров"
            />
          </Field>
          <Field label="Email для связи">
            <input
              name="contact"
              required
              type="email"
              maxLength={150}
              placeholder="alex@example.test"
            />
          </Field>
          <label className="check-row">
            <Checkbox
              checked={processing}
              onCheckedChange={(v) => setProcessing(v === true)}
            />
            <span>
              Согласен на обработку введённых данных в демопространстве
            </span>
          </label>
          <label className="check-row">
            <Checkbox
              checked={publication}
              onCheckedChange={(v) => setPublication(v === true)}
            />
            <span>
              Разрешаю показ профиля работодателю после прохождения теста
            </span>
          </label>
          <button className="button primary" disabled={busy || !processing}>
            Создать демопрофиль <ArrowRight size={16} />
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function PdfButton({ candidate }: { candidate: Candidate }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { downloadProfile } = await import("@/lib/profile-pdf");
          await downloadProfile(candidate);
        } catch {
          toast.error("Не удалось сформировать PDF. Повторите попытку.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={16} />
      {busy ? "Формируем PDF…" : "Скачать профиль PDF"}
    </button>
  );
}
