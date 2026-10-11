/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Send,
  Save,
  Eye,
  Copy,
  Download,
  RefreshCw,
  LockKeyhole,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AppState } from "@/lib/types";
import type {
  EmployerTest,
  EmployerTestDefinition,
  EmployerQuestion,
  EmployerTestAttempt,
  EmployerTestAttemptSummary,
  EmployerTestAnswers,
  EmployerTestReview,
  EmployerTestsState,
} from "@/lib/employer-test-types";
import { exampleTest } from "./employer-test-examples";

type Mutation = { test?: EmployerTest; attempt?: EmployerTestAttempt };
type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
const stamp = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const status: Record<EmployerTestAttemptSummary["state"], string> = {
  invited: "Приглашение",
  active: "В процессе",
  submitted: "На проверке",
  reviewed: "Результат готов",
  declined: "Отклонено",
  cancelled: "Отменено",
};
const kinds = {
  single: "Один вариант",
  multiple: "Несколько вариантов",
  text: "Развёрнутый ответ",
};
const dateInput = () =>
  new Date(Date.now() + 7 * 86400000 - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
function definition(t: EmployerTestDefinition): EmployerTestDefinition {
  return {
    title: t.title,
    description: t.description,
    skill: t.skill,
    estimatedMinutes: t.estimatedMinutes,
    passingPercent: t.passingPercent,
    questions: structuredClone(t.questions),
  };
}
function Field({
  title,
  children,
  hint,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="et-field">
      <span>{title}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`et-badge et-${tone}`}>{children}</span>;
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="et-notice">
      <LockKeyhole size={17} />
      <span>{children}</span>
    </div>
  );
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="et-error" role="alert">
      {error}
    </div>
  ) : null;
}
function useUnsaved(dirty: boolean) {
  useEffect(() => {
    const f = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const guard = (event: Event) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    window.addEventListener("profectium:before-navigate", guard);
    return () => {
      window.removeEventListener("beforeunload", f);
      window.removeEventListener("profectium:before-navigate", guard);
    };
  }, [dirty]);
}
function downloadResult(attempt: EmployerTestAttempt) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          assessmentType: "employer-private",
          ...attempt,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `profectium-result-${attempt.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EmployerTestsPanel({ base }: { base: AppState }) {
  const employer = base.session.role === "employer";
  const [state, setState] = useState<EmployerTestsState>({
    tests: [],
    attempts: [],
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [tab, setTab] = useState(employer ? "library" : "attempts"),
    [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<{
    original?: EmployerTest;
    data: EmployerTestDefinition;
    key: string;
  } | null>(null);
  const [chosen, setChosen] = useState<EmployerTest | null>(null),
    [attempt, setAttempt] = useState<EmployerTestAttempt | null>(null);
  const panelKey = editor?.key ?? chosen?.id ?? attempt?.id ?? tab;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [panelKey]);
  const api = useCallback<Api>(
    async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
      const r = await fetch(
        `${base.session.mode === "live" ? "/api/live/v4/" : "/api/v4/"}${path}`,
        {
          method,
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Revision": String(base.session.revision),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const j = (await r.json()) as T & { error?: string };
      if (!r.ok) {
        const e = new Error(
          j.error || "Не удалось выполнить запрос",
        ) as Error & { status: number };
        e.status = r.status;
        throw e;
      }
      return j as T;
    },
    [base.session.mode, base.session.revision],
  );
  const refresh = useCallback(async () => {
    try {
      setState(await api<EmployerTestsState>("state"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    let active = true;
    void api<EmployerTestsState>("state")
      .then((s) => {
        if (active) {
          setState(s);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const openAttempt = async (id: string) => {
    try {
      const j = await api<{ attempt: EmployerTestAttempt }>(`attempts/${id}`);
      setAttempt(j.attempt);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const updateAttempt = useCallback((a: EmployerTestAttempt) => {
    setAttempt((current) =>
      current?.id === a.id && current.revision <= a.revision ? a : current,
    );
    setState((s) => ({
      ...s,
      attempts: s.attempts.map((x) =>
        x.id === a.id && x.revision <= a.revision ? a : x,
      ),
    }));
  }, []);
  if (editor)
    return (
      <TestEditor
        key={editor.key}
        original={editor.original}
        initial={editor.data}
        api={api}
        onClose={() => {
          setEditor(null);
          void refresh();
        }}
        onSaved={(t) => {
          setChosen(t);
          setEditor(null);
          void refresh();
        }}
      />
    );
  if (chosen)
    return (
      <TestDetail
        test={chosen}
        base={base}
        api={api}
        onClose={() => {
          setChosen(null);
          void refresh();
        }}
        onEdit={() => {
          setEditor({
            original: chosen,
            data: definition(chosen),
            key: chosen.id,
          });
          setChosen(null);
        }}
        onClone={() => {
          setEditor({
            data: {
              ...definition(chosen),
              title: `${chosen.title.slice(0, 100)} · копия`,
            },
            key: crypto.randomUUID(),
          });
          setChosen(null);
        }}
        onChange={(t) => {
          setChosen(t);
          void refresh();
        }}
        onInvited={(a) => {
          setChosen(null);
          setAttempt(a);
          setTab("attempts");
          void refresh();
        }}
      />
    );
  if (attempt)
    return (
      <AttemptDetail
        key={attempt.id}
        attempt={attempt}
        employer={employer}
        candidateName={
          base.candidates.find((c) => c.id === attempt.candidateId)?.fullName
        }
        api={api}
        onChange={updateAttempt}
        onClose={() => {
          setAttempt(null);
          void refresh();
        }}
      />
    );
  const completed = state.attempts.filter((a) => a.result?.final).length;
  const waiting = state.attempts.filter(
    (a) => a.state === "submitted" && !a.result?.final,
  ).length;
  const visible = state.attempts.filter(
    (a) =>
      filter === "all" ||
      (filter === "pending"
        ? ["invited", "active"].includes(a.state)
        : filter === "review"
          ? a.state === "submitted"
          : !!a.result?.final),
  );
  return (
    <section className="et-workspace">
      <div className="et-heading">
        <div>
          <span className="eyebrow">ПРАКТИКА → ДИАЛОГ</span>
          <h1>
            {employer ? "Тесты для вашей команды" : "Тесты от работодателей"}
          </h1>
          <p>
            {employer
              ? "Проверьте навыки на задачах, близких к работе. Задайте критерии заранее и дайте кандидату содержательную обратную связь."
              : "Все приглашения, сохранённые ответы и подробные результаты — в одном месте. Критерии открыты до начала теста."}
          </p>
        </div>
        {employer && (
          <button
            className="primary-button"
            onClick={() =>
              setEditor({
                key: crypto.randomUUID(),
                data: {
                  title: "",
                  description: "",
                  skill: "",
                  estimatedMinutes: 20,
                  passingPercent: 70,
                  questions: [],
                },
              })
            }
          >
            <Plus size={18} />
            Создать тест
          </button>
        )}
      </div>
      <div className="et-stats">
        <div>
          <ListChecks />
          <strong>
            {employer
              ? state.tests.filter((t) => t.state === "published").length
              : state.attempts.filter(
                  (a) => a.state === "invited" && !a.expired,
                ).length}
          </strong>
          <span>{employer ? "Опубликовано тестов" : "Новых приглашений"}</span>
        </div>
        <div>
          <Clock3 />
          <strong>{waiting}</strong>
          <span>Ожидают ручной проверки</span>
        </div>
        <div>
          <FileCheck2 />
          <strong>{completed}</strong>
          <span>Готовых результатов</span>
        </div>
      </div>
      <Notice>
        Результат видят только участники приглашения. Тест работодателя не
        меняет категорию и грейд платформы; для них есть отдельное
        квалификационное тестирование.
      </Notice>
      <div className="et-toolbar">
        <div className="et-tabs" aria-label="Раздел тестов">
          {employer && (
            <button
              aria-pressed={tab === "library"}
              onClick={() => setTab("library")}
            >
              Библиотека тестов
            </button>
          )}
          <button
            aria-pressed={tab === "attempts"}
            onClick={() => setTab("attempts")}
          >
            {employer ? "Приглашения и результаты" : "Мои приглашения"}
            <span>{state.attempts.length}</span>
          </button>
        </div>
        <button className="text-button" onClick={() => void refresh()}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <p className="et-empty" role="status">
          Загружаем тесты…
        </p>
      ) : tab === "library" && employer ? (
        <>
          <div className="et-examples">
            <div>
              <Badge tone="violet">БЫСТРЫЙ СТАРТ</Badge>
              <h2>Начните с инженерного кейса</h2>
              <p>
                Три редактируемых примера. В каждом — автоматическая проверка и
                задача с прозрачной рубрикой для эксперта.
              </p>
            </div>
            <div>
              {(["Backend", "Frontend", "QA"] as const).map((direction) => (
                <button
                  key={direction}
                  onClick={() =>
                    setEditor({
                      data: exampleTest(direction),
                      key: crypto.randomUUID(),
                    })
                  }
                >
                  {direction}
                  <ArrowUp size={17} />
                </button>
              ))}
            </div>
          </div>
          <div className="et-card-grid">
            {state.tests.map((t) => (
              <button
                className="et-test-card"
                key={t.id}
                onClick={() => setChosen(t)}
              >
                <div>
                  <Badge tone={t.state === "published" ? "green" : "neutral"}>
                    {
                      {
                        draft: "Черновик",
                        published: "Опубликован",
                        archived: "В архиве",
                      }[t.state]
                    }
                  </Badge>
                  <span>{t.skill}</span>
                </div>
                <h2>{t.title}</h2>
                <p>
                  {t.description || "Добавьте описание и критерии в редакторе."}
                </p>
                <footer>
                  <span>
                    {t.questions.length} заданий · ~{t.estimatedMinutes} мин
                  </span>
                  <strong>Порог {t.passingPercent}%</strong>
                </footer>
              </button>
            ))}
          </div>
          {!state.tests.length && (
            <p className="et-empty">
              Пока нет сохранённых тестов. Создайте свой или адаптируйте пример
              выше.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="et-filter-row">
            <Field title="Показать приглашения">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Все статусы</option>
                <option value="pending">Приглашены и проходят</option>
                <option value="review">На ручной проверке</option>
                <option value="final">Результат готов</option>
              </select>
            </Field>
            <small>Приглашения обновляются кнопкой «Обновить».</small>
          </div>
          <div className="et-attempts">
            {visible.map((a) => (
              <button
                className="et-attempt-row"
                key={a.id}
                onClick={() => void openAttempt(a.id)}
              >
                <div className="et-row-icon">
                  {a.result?.final ? <FileCheck2 /> : <Send />}
                </div>
                <div>
                  <h3>{a.title}</h3>
                  <p>
                    {employer
                      ? (base.candidates.find((c) => c.id === a.candidateId)
                          ?.fullName ?? "Кандидат")
                      : a.employerName}{" "}
                    · {a.skill}
                  </p>
                  <small>
                    Срок: {stamp(a.dueAt)} · {a.questionCount} заданий
                  </small>
                </div>
                <div>
                  <Badge
                    tone={
                      a.result?.final ? "green" : a.expired ? "amber" : "violet"
                    }
                  >
                    {a.expired && !a.result ? "Срок истёк" : status[a.state]}
                  </Badge>
                  {a.result?.final && (
                    <strong className="et-row-score">
                      {a.result.percent}%
                    </strong>
                  )}
                  {a.result && !a.result.final && (
                    <small>Проверить: {a.result.pendingReview}</small>
                  )}
                </div>
              </button>
            ))}
          </div>
          {!visible.length && (
            <div className="et-empty">
              <ListChecks size={30} />
              <h2>
                {employer
                  ? "Здесь появятся ответы кандидатов"
                  : "Приглашений пока нет"}
              </h2>
              <p>
                {employer
                  ? "Опубликуйте тест и пригласите специалиста из его карточки в библиотеке тестов."
                  : "Работодатель сам выбирает специалиста и отправляет ему тест. Никаких обязательных заданий без приглашения."}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */
function QuestionPreview({
  questions,
}: {
  questions:
    | EmployerTestDefinition["questions"]
    | EmployerTestAttempt["questions"];
}) {
  return (
    <div className="et-question-list">
      {questions.map((q, i) => (
        <section className="et-question" key={q.id}>
          <div className="et-question-top">
            <Badge>
              {i + 1} / {questions.length}
            </Badge>
            <span>
              {kinds[q.kind]} · {q.points} баллов
            </span>
          </div>
          <h3>{q.prompt || "Текст задания"}</h3>
          {q.kind === "text" ? (
            <div className="et-rubric">
              <strong>Критерии оценки</strong>
              <p>{q.rubric || "Укажите критерии для кандидата."}</p>
            </div>
          ) : (
            <ul className="et-preview-options">
              {q.options.map((o) => (
                <li key={o.id}>
                  <span
                    className={
                      q.kind === "single" ? "et-radio-dot" : "et-check-dot"
                    }
                  />
                  {o.label || "Вариант ответа"}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function TestEditor({
  original,
  initial,
  api,
  onClose,
  onSaved,
}: {
  original?: EmployerTest;
  initial: EmployerTestDefinition;
  api: Api;
  onClose: () => void;
  onSaved: (t: EmployerTest) => void;
}) {
  const [data, setData] = useState(initial),
    [saved, setSaved] = useState(original),
    [savedJson, setSavedJson] = useState(
      original ? JSON.stringify(initial) : "",
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [leave, setLeave] = useState(false),
    [conflict, setConflict] = useState(false);
  const id = useRef(original?.id ?? crypto.randomUUID());
  const dirty = JSON.stringify(data) !== savedJson;
  useUnsaved(dirty || busy);
  const patch = (p: Partial<EmployerTestDefinition>) =>
    setData((d) => ({ ...d, ...p }));
  const question = (id: string, p: Partial<EmployerQuestion>) =>
    setData((d) => ({
      ...d,
      questions: d.questions.map((q) => (q.id === id ? { ...q, ...p } : q)),
    }));
  const add = (kind: EmployerQuestion["kind"]) =>
    patch({
      questions: [
        ...data.questions,
        {
          id: crypto.randomUUID(),
          kind,
          prompt: "",
          points: kind === "text" ? 10 : 5,
          options:
            kind === "text"
              ? []
              : [
                  { id: crypto.randomUUID(), label: "" },
                  { id: crypto.randomUUID(), label: "" },
                ],
          correctOptionIds: [],
          explanation: "",
          rubric: "",
        },
      ],
    });
  const save = async (publish = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<Mutation>(
        saved ? `tests/${id.current}` : "tests",
        saved ? "PUT" : "POST",
        saved ? { revision: saved.revision, data } : { id: id.current, data },
      );
      if (!r.test) throw new Error("Сервер не вернул тест");
      setSaved(r.test);
      setSavedJson(JSON.stringify(data));
      if (publish) {
        const pub = await api<Mutation>(`tests/${id.current}`, "PATCH", {
          revision: r.test.revision,
          action: "publish",
        });
        if (pub.test) {
          toast.success("Тест опубликован. Можно приглашать кандидатов.");
          onSaved(pub.test);
        }
      } else toast.success("Черновик сохранён");
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error & { status?: number }).status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  };
  const total = data.questions.reduce((s, q) => s + q.points, 0);
  return (
    <section className="et-workspace">
      <button
        className="text-button et-back"
        disabled={busy}
        onClick={() => (dirty ? setLeave(true) : onClose())}
      >
        <ArrowLeft size={16} />К библиотеке
      </button>
      <div className="et-heading">
        <div>
          <span className="eyebrow">
            КОНСТРУКТОР / {saved ? "СОХРАНЁННЫЙ ЧЕРНОВИК" : "НОВЫЙ ТЕСТ"}
          </span>
          <h1>
            {preview
              ? "Как тест увидит кандидат"
              : "Задача. Критерии. Результат."}
          </h1>
          <p>
            Опишите реальную рабочую ситуацию. Ответы на выбор проверит система,
            развёрнутые — вы по заранее заданной рубрике.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => setPreview(!preview)}
        >
          <Eye size={17} />
          {preview ? "Вернуться к редактору" : "Вид кандидата"}
        </button>
      </div>
      <ErrorBox error={error} />
      {conflict && (
        <div className="et-conflict">
          <h2>Черновик изменился в другой вкладке</h2>
          <p>
            Ваши правки сохранены на экране. Сохраните их отдельной копией,
            чтобы не перезаписать изменения коллеги.
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              id.current = crypto.randomUUID();
              setSaved(undefined);
              setSavedJson("");
              setConflict(false);
              setError("");
            }}
          >
            Продолжить как новый черновик
          </button>
        </div>
      )}
      <fieldset className="et-editor-fields" disabled={busy || conflict}>
        {preview ? (
          <>
            <section className="et-surface">
              <h2>{data.title || "Название теста"}</h2>
              <p>{data.description}</p>
              <div className="et-meta">
                <span>~{data.estimatedMinutes} мин</span>
                <span>Порог {data.passingPercent}%</span>
                <span>{total} баллов</span>
              </div>
            </section>
            <QuestionPreview questions={data.questions} />
          </>
        ) : (
          <>
            <section className="et-surface et-editor-meta">
              <Field title="Название теста">
                <input
                  value={data.title}
                  maxLength={120}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Например, Backend · надёжность API"
                />
              </Field>
              <div className="et-form-grid">
                <Field title="Навык / направление">
                  <input
                    value={data.skill}
                    maxLength={80}
                    onChange={(e) => patch({ skill: e.target.value })}
                    placeholder="Backend / SQL"
                  />
                </Field>
                <Field
                  title="Оценочное время, минут"
                  hint="Ориентир для кандидата, без скрытого таймера."
                >
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={data.estimatedMinutes}
                    onChange={(e) =>
                      patch({ estimatedMinutes: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field title="Порог прохождения, %">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={data.passingPercent}
                    onChange={(e) =>
                      patch({ passingPercent: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field title="Зачем этот тест и что нужно сделать">
                <textarea
                  rows={3}
                  value={data.description}
                  maxLength={3000}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Контекст задачи, ожидаемый результат и разрешённые инструменты"
                />
              </Field>
            </section>
            {data.questions.map((q, i) => (
              <section className="et-question et-editor-question" key={q.id}>
                <div className="et-question-top">
                  <Badge tone="violet">Задание {i + 1}</Badge>
                  <span>{kinds[q.kind]}</span>
                  <div className="et-icon-actions">
                    <button
                      aria-label={`Задание ${i + 1} вверх`}
                      disabled={i === 0}
                      onClick={() => {
                        const a = [...data.questions];
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                        patch({ questions: a });
                      }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      aria-label={`Задание ${i + 1} вниз`}
                      disabled={i === data.questions.length - 1}
                      onClick={() => {
                        const a = [...data.questions];
                        [a[i + 1], a[i]] = [a[i], a[i + 1]];
                        patch({ questions: a });
                      }}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      aria-label={`Удалить задание ${i + 1}`}
                      onClick={() =>
                        patch({
                          questions: data.questions.filter(
                            (x) => x.id !== q.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <Field title={`Формулировка задания ${i + 1}`}>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={q.prompt}
                    onChange={(e) => question(q.id, { prompt: e.target.value })}
                  />
                </Field>
                <Field title={`Максимум баллов за задание ${i + 1}`}>
                  <input
                    className="et-points-input"
                    type="number"
                    min={1}
                    max={20}
                    value={q.points}
                    onChange={(e) =>
                      question(q.id, { points: Number(e.target.value) })
                    }
                  />
                </Field>
                {q.kind === "text" ? (
                  <Field
                    title="Рубрика ручной проверки"
                    hint="Кандидат увидит эти критерии до начала. Укажите, за что начисляется каждый балл."
                  >
                    <textarea
                      rows={3}
                      value={q.rubric}
                      maxLength={2000}
                      onChange={(e) =>
                        question(q.id, { rubric: e.target.value })
                      }
                    />
                  </Field>
                ) : (
                  <>
                    <p className="et-help">
                      Отметьте правильные варианты.{" "}
                      {q.kind === "multiple"
                        ? "Баллы начисляются только за точный набор без лишних ответов."
                        : "Правильным должен быть ровно один вариант."}
                    </p>
                    <div className="et-options-editor">
                      {q.options.map((o, j) => (
                        <div key={o.id}>
                          <input
                            aria-label={`Правильный вариант ${j + 1} задания ${i + 1}`}
                            type={q.kind === "single" ? "radio" : "checkbox"}
                            name={`key-${q.id}`}
                            checked={q.correctOptionIds.includes(o.id)}
                            onChange={(e) =>
                              question(q.id, {
                                correctOptionIds:
                                  q.kind === "single"
                                    ? [o.id]
                                    : e.target.checked
                                      ? [...q.correctOptionIds, o.id]
                                      : q.correctOptionIds.filter(
                                          (x) => x !== o.id,
                                        ),
                              })
                            }
                          />
                          <input
                            aria-label={`Вариант ${j + 1} задания ${i + 1}`}
                            maxLength={500}
                            value={o.label}
                            onChange={(e) =>
                              question(q.id, {
                                options: q.options.map((x) =>
                                  x.id === o.id
                                    ? { ...x, label: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                          <button
                            aria-label={`Удалить вариант ${j + 1} задания ${i + 1}`}
                            disabled={q.options.length <= 2}
                            onClick={() =>
                              question(q.id, {
                                options: q.options.filter((x) => x.id !== o.id),
                                correctOptionIds: q.correctOptionIds.filter(
                                  (x) => x !== o.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      disabled={q.options.length >= 6}
                      onClick={() =>
                        question(q.id, {
                          options: [
                            ...q.options,
                            { id: crypto.randomUUID(), label: "" },
                          ],
                        })
                      }
                    >
                      <Plus size={15} />
                      Добавить вариант
                    </button>
                    <Field title="Объяснение после отправки ответа">
                      <textarea
                        rows={2}
                        value={q.explanation}
                        maxLength={2000}
                        onChange={(e) =>
                          question(q.id, { explanation: e.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
              </section>
            ))}
            <div className="et-add-question">
              <strong>Добавить задание</strong>
              {(Object.keys(kinds) as EmployerQuestion["kind"][]).map((k) => (
                <button
                  className="secondary-button"
                  key={k}
                  disabled={data.questions.length >= 20}
                  onClick={() => add(k)}
                >
                  <Plus size={16} />
                  {kinds[k]}
                </button>
              ))}
              <small>
                {data.questions.length} / 20 заданий · {total} баллов
              </small>
            </div>
          </>
        )}
      </fieldset>
      <Notice>
        После публикации содержание фиксируется. Для изменений создайте копию:
        уже отправленные приглашения сохранят свои задания и критерии.
      </Notice>
      <div className="et-savebar">
        <span aria-live="polite">
          {busy
            ? "Сохраняем…"
            : dirty
              ? "Есть несохранённые изменения"
              : "Черновик сохранён"}
        </span>
        <button
          className="secondary-button"
          disabled={busy || conflict}
          onClick={() => void save()}
        >
          <Save size={17} />
          Сохранить черновик
        </button>
        <button
          className="primary-button"
          disabled={busy || conflict}
          onClick={() => void save(true)}
        >
          <CheckCircle2 size={17} />
          Опубликовать
        </button>
      </div>
      <Confirm
        open={leave}
        onOpenChange={setLeave}
        title="Выйти из редактора?"
        description="Несохранённые изменения будут потеряны. Можно вернуться и сохранить черновик."
        action="Выйти без сохранения"
        onConfirm={onClose}
      />
    </section>
  );
}

function Confirm({
  open,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="et-dialog-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Назад
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={onConfirm}
          >
            {action}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestDetail({
  test,
  base,
  api,
  onClose,
  onEdit,
  onClone,
  onChange,
  onInvited,
}: {
  test: EmployerTest;
  base: AppState;
  api: Api;
  onClose: () => void;
  onEdit: () => void;
  onClone: () => void;
  onChange: (t: EmployerTest) => void;
  onInvited: (a: EmployerTestAttempt) => void;
}) {
  const [candidate, setCandidate] = useState(""),
    [due, setDue] = useState(dateInput),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [archive, setArchive] = useState(false);
  const inviteId = useRef(crypto.randomUUID());
  const invite = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<Mutation>(`tests/${test.id}/invitations`, "POST", {
        id: inviteId.current,
        candidateId: candidate,
        dueAt: new Date(due).toISOString(),
        revision: test.revision,
      });
      if (r.attempt) {
        toast.success("Приглашение отправлено");
        onInvited(r.attempt);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="et-workspace">
      <button className="text-button et-back" onClick={onClose}>
        <ArrowLeft size={16} />К библиотеке
      </button>
      <div className="et-heading">
        <div>
          <Badge tone={test.state === "published" ? "green" : "neutral"}>
            {
              {
                draft: "Черновик",
                published: "Опубликован",
                archived: "Архив",
              }[test.state]
            }
          </Badge>
          <h1>{test.title}</h1>
          <p>{test.description}</p>
        </div>
        <div className="et-actions">
          {test.state === "draft" && (
            <button className="primary-button" onClick={onEdit}>
              Продолжить редактирование
            </button>
          )}
          <button className="secondary-button" onClick={onClone}>
            <Copy size={17} />
            Создать копию
          </button>
        </div>
      </div>
      <div className="et-meta">
        <span>{test.skill}</span>
        <span>~{test.estimatedMinutes} минут</span>
        <span>{test.questions.length} заданий</span>
        <span>Порог {test.passingPercent}%</span>
        <span>{test.questions.reduce((s, q) => s + q.points, 0)} баллов</span>
      </div>
      <ErrorBox error={error} />
      {test.state === "published" && (
        <form
          className="et-surface et-invite-form"
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
        >
          <div>
            <h2>Пригласить специалиста</h2>
            <p>
              Кандидат получит личное приглашение и увидит критерии до начала.
            </p>
          </div>
          <Field title="Специалист">
            <select
              required
              value={candidate}
              onChange={(e) => {
                setCandidate(e.target.value);
                inviteId.current = crypto.randomUUID();
              }}
            >
              <option value="">Выберите кандидата</option>
              {base.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} · {c.role} {c.grade}
                </option>
              ))}
            </select>
          </Field>
          <Field
            title="Принять ответы до"
            hint="Местное время. От 1 часа до 30 дней."
          >
            <input
              required
              type="datetime-local"
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
                inviteId.current = crypto.randomUUID();
              }}
            />
          </Field>
          <button className="primary-button" disabled={busy || !candidate}>
            <Send size={17} />
            Отправить приглашение
          </button>
        </form>
      )}
      <h2 className="et-section-title">Предпросмотр заданий</h2>
      <QuestionPreview questions={test.questions} />
      {test.state === "published" && (
        <button className="text-button" onClick={() => setArchive(true)}>
          Архивировать тест
        </button>
      )}
      <Confirm
        open={archive}
        onOpenChange={setArchive}
        title="Архивировать тест?"
        description="Новые приглашения станут недоступны. Ранее приглашённые кандидаты смогут закончить свои тесты."
        action="Архивировать"
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          void api<Mutation>(`tests/${test.id}`, "PATCH", {
            revision: test.revision,
            action: "archive",
          })
            .then((r) => {
              if (r.test) onChange(r.test);
              setArchive(false);
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
    </section>
  );
}

function AttemptDetail({
  attempt,
  employer,
  candidateName,
  api,
  onChange,
  onClose,
}: {
  attempt: EmployerTestAttempt;
  employer: boolean;
  candidateName?: string;
  api: Api;
  onChange: (a: EmployerTestAttempt) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<"decline" | "cancel" | null>(null),
    [leave, setLeave] = useState(false);
  const change = async (
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<Mutation>(`attempts/${attempt.id}`, "PATCH", {
        revision: attempt.revision,
        action,
        ...extra,
      });
      if (r.attempt) onChange(r.attempt);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!employer && attempt.state === "active")
    return (
      <AnswerWorkspace
        attempt={attempt}
        api={api}
        onChange={onChange}
        onClose={onClose}
      />
    );
  return (
    <section className="et-workspace">
      <button
        className="text-button et-back"
        disabled={busy}
        onClick={() => {
          if (
            window.dispatchEvent(
              new Event("profectium:before-navigate", { cancelable: true }),
            )
          )
            onClose();
          else setLeave(true);
        }}
      >
        <ArrowLeft size={16} />К приглашениям
      </button>
      <div className="et-heading">
        <div>
          <span className="eyebrow">
            {employer ? (candidateName ?? "КАНДИДАТ") : attempt.employerName}
          </span>
          <h1>{attempt.title}</h1>
          <p>{attempt.description}</p>
        </div>
        <Badge tone={attempt.result?.final ? "green" : "violet"}>
          {status[attempt.state]}
        </Badge>
      </div>
      <div className="et-meta">
        <span>{attempt.questionCount} заданий</span>
        <span>~{attempt.estimatedMinutes} минут</span>
        <span>Порог {attempt.passingPercent}%</span>
        <span>Срок: {stamp(attempt.dueAt)}</span>
      </div>
      <ErrorBox error={error} />
      {attempt.result ? (
        <ResultView
          attempt={attempt}
          employer={employer}
          api={api}
          onChange={onChange}
        />
      ) : (
        <>
          <section className="et-surface et-invitation">
            <h2>
              {attempt.state === "invited"
                ? "Перед началом"
                : attempt.state === "active"
                  ? "Кандидат выполняет задания"
                  : "Приглашение закрыто"}
            </h2>
            <p>
              {employer
                ? "Черновики ответов приватны. Вы получите ответы только после отправки кандидатом или завершения по дедлайну."
                : "Ответы сохраняются автоматически. Можно прерваться и вернуться до дедлайна. Задания с вариантами проверяются автоматически; за развёрнутые ответы баллы выставит работодатель."}
            </p>
            <p>
              Оценочное время — ориентир, а не таймер. После дедлайна
              учитываются только уже сохранённые ответы. Результат не изменяет
              квалификационный грейд.
            </p>
            {!employer && attempt.state === "invited" && (
              <div className="et-actions">
                <button
                  className="primary-button"
                  disabled={busy || attempt.expired}
                  onClick={() => void change("start")}
                >
                  <ListChecks size={18} />
                  {attempt.expired ? "Срок приглашения истёк" : "Начать тест"}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setConfirm("decline")}
                >
                  Отклонить
                </button>
              </div>
            )}
            {employer && ["invited", "active"].includes(attempt.state) && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setConfirm("cancel")}
              >
                Отменить приглашение
              </button>
            )}
          </section>
          <h2 className="et-section-title">Задания и критерии</h2>
          <QuestionPreview questions={attempt.questions} />
        </>
      )}
      <Confirm
        open={leave}
        onOpenChange={setLeave}
        title="Выйти без публикации оценки?"
        description="Введённые баллы и комментарии не сохранятся. Вернитесь к форме, чтобы завершить проверку."
        action="Выйти без сохранения"
        onConfirm={onClose}
      />
      <Confirm
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={
          confirm === "cancel"
            ? "Отменить приглашение?"
            : "Отклонить приглашение?"
        }
        description="Приглашение закроется. История останется доступна обеим сторонам."
        action="Подтвердить"
        busy={busy}
        onConfirm={() => {
          if (confirm) void change(confirm);
        }}
      />
    </section>
  );
}

function AnswerWorkspace({
  attempt,
  api,
  onChange,
  onClose,
}: {
  attempt: EmployerTestAttempt;
  api: Api;
  onChange: (a: EmployerTestAttempt) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<EmployerTestAnswers>(attempt.answers),
    [savedJson, setSavedJson] = useState(JSON.stringify(attempt.answers)),
    [saveState, setSaveState] = useState("Ответы сохранены"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [submitOpen, setSubmitOpen] = useState(false),
    [leave, setLeave] = useState(false),
    [conflict, setConflict] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = useRef(answers),
    saved = useRef(savedJson),
    revision = useRef(attempt.revision),
    inFlight = useRef<Promise<boolean> | null>(null),
    blocked = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expired = now >= Date.parse(attempt.dueAt);
  const dirty = JSON.stringify(answers) !== savedJson;
  useUnsaved(dirty || busy);
  const saveLatest = useCallback(async (): Promise<boolean> => {
    if (blocked.current) return false;
    while (inFlight.current) {
      const ok = await inFlight.current;
      if (!ok) return false;
    }
    if (blocked.current) return false;
    const snapshot = JSON.stringify(current.current);
    if (snapshot === saved.current) return true;
    setSaveState("Сохраняем ответы…");
    const operation = (async () => {
      try {
        const r = await api<Mutation>(`attempts/${attempt.id}`, "PATCH", {
          revision: revision.current,
          action: "save",
          answers: JSON.parse(snapshot),
        });
        if (!r.attempt) throw new Error("Не удалось подтвердить сохранение");
        if (!mounted.current) return false;
        revision.current = r.attempt.revision;
        saved.current = snapshot;
        setSavedJson(snapshot);
        setSaveState("Ответы сохранены");
        setError("");
        onChange(r.attempt);
        return true;
      } catch (e) {
        if (!mounted.current) return false;
        const err = e as Error & { status?: number };
        setError(err.message);
        setSaveState("Ответы пока не сохранены");
        if (err.status === 409) {
          blocked.current = true;
          setConflict(true);
        }
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = operation;
    return operation;
  }, [api, attempt.id, onChange]);
  useEffect(() => {
    if (!dirty || expired || conflict) return;
    const timer = setTimeout(() => void saveLatest(), 700);
    return () => clearTimeout(timer);
  }, [answers, dirty, expired, conflict, saveLatest]);
  const answer = (id: string, value: string | string[]) => {
    const next = { ...current.current, [id]: value };
    current.current = next;
    setAnswers(next);
    setSaveState("Есть несохранённые ответы");
  };
  const filled = attempt.questions.filter((q) =>
    Array.isArray(answers[q.id])
      ? (answers[q.id] as string[]).length > 0
      : !!String(answers[q.id] ?? "").trim(),
  ).length;
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!expired && !(await saveLatest())) {
        setSubmitOpen(false);
        return;
      }
      const r = await api<Mutation>(`attempts/${attempt.id}`, "PATCH", {
        revision: revision.current,
        action: "submit",
        ...(!expired ? { answers: current.current } : {}),
      });
      if (r.attempt) {
        saved.current = JSON.stringify(current.current);
        setSavedJson(saved.current);
        setSubmitOpen(false);
        onChange(r.attempt);
        toast.success("Ответы отправлены");
      }
    } catch (e) {
      setSubmitOpen(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  return (
    <section className="et-workspace">
      <button
        className="text-button et-back"
        disabled={busy}
        onClick={() => (dirty ? setLeave(true) : onClose())}
      >
        <ArrowLeft size={16} />К приглашениям
      </button>
      <div className="et-heading">
        <div>
          <span className="eyebrow">
            {attempt.employerName} / {attempt.skill}
          </span>
          <h1>{attempt.title}</h1>
          <p>{attempt.description}</p>
        </div>
        <Badge tone={expired ? "amber" : "violet"}>
          {expired ? "Дедлайн прошёл" : `До ${stamp(attempt.dueAt)}`}
        </Badge>
      </div>
      <div className="et-progress">
        <div>
          <strong>
            {filled} из {attempt.questions.length}
          </strong>
          <span>
            заданий с ответом · ~{attempt.estimatedMinutes} минут на весь тест
          </span>
        </div>
        <progress
          max={attempt.questions.length}
          value={filled}
          aria-label="Прогресс ответов"
        />
        <nav aria-label="Перейти к заданию">
          {attempt.questions.map((q, i) => (
            <a
              key={q.id}
              href={`#task-${q.id}`}
              className={
                Array.isArray(answers[q.id])
                  ? (answers[q.id] as string[]).length
                    ? "answered"
                    : ""
                  : String(answers[q.id] ?? "").trim()
                    ? "answered"
                    : ""
              }
            >
              {i + 1}
            </a>
          ))}
        </nav>
      </div>
      <ErrorBox error={error} />
      {conflict && (
        <div className="et-conflict">
          <h2>Ответы изменились в другой вкладке</h2>
          <p>
            Ваш текст остаётся на экране. Скопируйте нужные фрагменты перед
            загрузкой серверной версии. Продолжение возможно после обновления.
          </p>
          <button
            className="secondary-button"
            onClick={() =>
              void api<{ attempt: EmployerTestAttempt }>(
                `attempts/${attempt.id}`,
              )
                .then(({ attempt: a }) => {
                  current.current = a.answers;
                  saved.current = JSON.stringify(a.answers);
                  revision.current = a.revision;
                  setAnswers(a.answers);
                  setSavedJson(saved.current);
                  blocked.current = false;
                  setConflict(false);
                  setError("");
                  setSaveState("Загружена сохранённая версия");
                  onChange(a);
                })
                .catch((e) => setError(e.message))
            }
          >
            Загрузить сохранённую версию
          </button>
        </div>
      )}
      {expired && (
        <Notice>
          Время приёма ответов истекло. Можно получить результат по последним
          сохранённым ответам; изменения после дедлайна не учитываются.
        </Notice>
      )}
      <div className="et-question-list">
        {attempt.questions.map((q, i) => (
          <fieldset
            id={`task-${q.id}`}
            className="et-question"
            key={q.id}
            disabled={busy || expired || conflict}
          >
            <legend>
              Задание {i + 1} · {q.points} баллов
            </legend>
            <div className="et-question-top">
              <Badge>{kinds[q.kind]}</Badge>
            </div>
            <h2>{q.prompt}</h2>
            {q.kind === "text" ? (
              <>
                <div className="et-rubric">
                  <strong>Критерии оценки</strong>
                  <p>{q.rubric}</p>
                </div>
                <Field
                  title={`Ответ на задание ${i + 1}`}
                  hint={`${String(answers[q.id] ?? "").length} / 6000 символов`}
                >
                  <textarea
                    rows={7}
                    maxLength={6000}
                    value={String(answers[q.id] ?? "")}
                    onChange={(e) => answer(q.id, e.target.value)}
                    placeholder="Опишите решение и ход рассуждений…"
                  />
                </Field>
              </>
            ) : (
              <>
                <p className="et-help">
                  {q.kind === "single"
                    ? "Выберите один вариант."
                    : "Выберите все подходящие варианты. Баллы начисляются за точный набор."}
                </p>
                <div className="et-answer-options">
                  {q.options.map((o) => {
                    const values = Array.isArray(answers[q.id])
                      ? (answers[q.id] as string[])
                      : [];
                    return (
                      <label
                        key={o.id}
                        className={values.includes(o.id) ? "selected" : ""}
                      >
                        <input
                          type={q.kind === "single" ? "radio" : "checkbox"}
                          name={`answer-${q.id}`}
                          checked={values.includes(o.id)}
                          onChange={(e) =>
                            answer(
                              q.id,
                              q.kind === "single"
                                ? [o.id]
                                : e.target.checked
                                  ? [...values, o.id]
                                  : values.filter((x) => x !== o.id),
                            )
                          }
                        />
                        <span>{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </fieldset>
        ))}
      </div>
      <div className="et-savebar">
        <span aria-live="polite">{saveState}</span>
        <button
          className="secondary-button"
          disabled={busy || expired || conflict}
          onClick={() => void saveLatest()}
        >
          <Save size={17} />
          Сохранить
        </button>
        <button
          className="primary-button"
          disabled={busy || conflict}
          onClick={() => setSubmitOpen(true)}
        >
          <Send size={17} />
          {expired ? "Получить результат" : "Завершить тест"}
        </button>
      </div>
      <Confirm
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Отправить ответы?"
        description={`${expired ? "Будут оценены последние сохранённые ответы." : `Заполнено ${filled} из ${attempt.questions.length} заданий. ${filled < attempt.questions.length ? "Пропущенные задания получат 0 баллов." : "Все задания заполнены."}`} После отправки ответы нельзя изменить. Развёрнутые ответы проверит работодатель.`}
        action="Отправить на проверку"
        busy={busy}
        onConfirm={() => void submit()}
      />
      <Confirm
        open={leave}
        onOpenChange={setLeave}
        title="Есть несохранённые ответы"
        description="Останьтесь и сохраните ответы. При выходе несохранённые изменения пропадут."
        action="Выйти без сохранения"
        onConfirm={onClose}
      />
    </section>
  );
}

function ResultView({
  attempt,
  employer,
  api,
  onChange,
}: {
  attempt: EmployerTestAttempt;
  employer: boolean;
  api: Api;
  onChange: (a: EmployerTestAttempt) => void;
}) {
  const result = attempt.result!;
  useEffect(() => {
    if (result.final) window.scrollTo({ top: 0, behavior: "instant" });
  }, [result.final]);
  const [reviews, setReviews] = useState<
      Record<string, { points: string; feedback: string }>
    >({}),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const manual = attempt.questions.filter((q) => q.kind === "text");
  useUnsaved(
    !result.final && (busy || !!feedback || Object.keys(reviews).length > 0),
  );
  const review = async () => {
    setBusy(true);
    setError("");
    try {
      const entries: EmployerTestReview[] = manual.map((q) => ({
        questionId: q.id,
        points: Number(reviews[q.id]?.points),
        feedback: reviews[q.id]?.feedback ?? "",
      }));
      if (
        manual.some(
          (q) => !reviews[q.id]?.points && reviews[q.id]?.points !== "0",
        )
      )
        throw new Error(
          "Оцените каждое развёрнутое задание, включая ответы на 0 баллов.",
        );
      const r = await api<Mutation>(`attempts/${attempt.id}`, "PATCH", {
        revision: attempt.revision,
        action: "review",
        reviews: entries,
        feedback,
      });
      if (r.attempt) {
        onChange(r.attempt);
        toast.success("Оценка сохранена и доступна кандидату");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className={`et-result ${result.final ? "is-final" : ""}`}>
        <div className="et-result-score">
          <strong>
            {result.final ? result.percent : "…"}
            <small>{result.final ? "%" : ""}</small>
          </strong>
          <span>
            {result.final
              ? `${result.earnedPoints} из ${result.maxPoints} баллов`
              : `${result.earnedPoints} баллов уже начислено`}
          </span>
        </div>
        <div>
          <Badge
            tone={result.final ? (result.passed ? "green" : "amber") : "violet"}
          >
            {result.final
              ? result.passed
                ? "Порог достигнут"
                : "Порог не достигнут"
              : "Ожидает ручной проверки"}
          </Badge>
          <h2>{result.final ? "Результат теста" : "Автопроверка завершена"}</h2>
          <p>
            {result.final
              ? `Порог работодателя — ${attempt.passingPercent}%. Этот результат относится только к данному тесту.`
              : `Развёрнутых ответов на проверке: ${result.pendingReview}. Итоговый процент и прохождение появятся после оценки работодателя.`}
          </p>
          {attempt.expired && (
            <p>Дедлайн истёк: оценены последние сохранённые ответы.</p>
          )}
          {result.feedback && <blockquote>{result.feedback}</blockquote>}
          <small>
            Отправлено: {attempt.submittedAt ? stamp(attempt.submittedAt) : "—"}
            {attempt.reviewedAt
              ? ` · Проверено: ${stamp(attempt.reviewedAt)}`
              : ""}
          </small>
        </div>
      </section>
      <div className="et-toolbar">
        <h2>Разбор по заданиям</h2>
        <button
          className="secondary-button"
          onClick={() => downloadResult(attempt)}
        >
          <Download size={17} />
          Скачать результат JSON
        </button>
      </div>
      <ErrorBox error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void review();
        }}
      >
        <fieldset className="et-review-form" disabled={busy}>
          <div className="et-question-list">
            {attempt.questions.map((q, i) => {
              const b = result.breakdown.find((x) => x.questionId === q.id);
              const a = attempt.answers[q.id];
              const selected = Array.isArray(a)
                ? q.options
                    .filter((o) => a.includes(o.id))
                    .map((o) => o.label)
                    .join("\n")
                : a;
              return (
                <section className="et-question" key={q.id}>
                  <div className="et-question-top">
                    <Badge>
                      Задание {i + 1} · {kinds[q.kind]}
                    </Badge>
                    <strong>
                      {b?.points ?? "Ожидает оценки"}
                      {b?.points != null ? ` / ${q.points} баллов` : ""}
                    </strong>
                  </div>
                  <h3>{q.prompt}</h3>
                  {q.kind === "text" && (
                    <div className="et-rubric">
                      <strong>Критерии</strong>
                      <p>{q.rubric}</p>
                    </div>
                  )}
                  <div className="et-given-answer">
                    <strong>Ответ кандидата</strong>
                    <p>{selected || "Ответ не дан"}</p>
                  </div>
                  {b?.feedback && (
                    <div className="et-answer-feedback">
                      <CheckCircle2 size={17} />
                      <p>{b.feedback}</p>
                    </div>
                  )}
                  {employer && !result.final && q.kind === "text" && (
                    <div className="et-review-fields">
                      <Field
                        title={`Баллы за задание ${i + 1}`}
                        hint={`От 0 до ${q.points}`}
                      >
                        <input
                          required
                          type="number"
                          min={0}
                          max={q.points}
                          step={1}
                          value={reviews[q.id]?.points ?? ""}
                          onChange={(e) =>
                            setReviews((r) => ({
                              ...r,
                              [q.id]: {
                                feedback: r[q.id]?.feedback ?? "",
                                points: e.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field
                        title={`Обратная связь по заданию ${i + 1}`}
                        hint="Поясните оценку по рубрике, минимум 5 символов."
                      >
                        <textarea
                          required
                          minLength={5}
                          maxLength={2000}
                          rows={3}
                          value={reviews[q.id]?.feedback ?? ""}
                          onChange={(e) =>
                            setReviews((r) => ({
                              ...r,
                              [q.id]: {
                                points: r[q.id]?.points ?? "",
                                feedback: e.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          {employer && !result.final && (
            <section className="et-surface">
              <h2>Завершить проверку</h2>
              <p>
                После публикации баллы и комментарии увидит кандидат. Итоговую
                оценку нельзя перезаписать.
              </p>
              <Field
                title="Общая обратная связь"
                hint="Минимум 10 символов. Отметьте сильные стороны и следующий шаг."
              >
                <textarea
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </Field>
              <button className="primary-button" disabled={busy}>
                <FileCheck2 size={17} />
                Опубликовать результат
              </button>
            </section>
          )}
        </fieldset>
      </form>
      <Notice>
        Тест отражает оценку по критериям конкретного работодателя. Он не
        изменяет грейд, не раскрывает контакты кандидата и не заменяет
        предложение с прозрачной зарплатой.
      </Notice>
    </>
  );
}
