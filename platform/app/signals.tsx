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
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Download,
  Inbox,
  Layers3,
  Radio,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { AppState, Filters } from "@/lib/types";
import type {
  SignalsState,
  ImportRun,
  Listing,
} from "@/lib/signals-types";
import {
  feedExample,
  listingQuality,
  sourceSuggestions,
} from "@/lib/signals-domain";
import { salary } from "@/lib/domain";
export type SignalsSection = "tasks" | "radars" | "sources";
const date = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const input = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
const empty: SignalsState = {
  radars: [],
  sources: [],
  listings: [],
  imports: [],
  plans: [],
  tasks: [],
  generatedAt: "",
};
export function SignalsPanel({
  base,
  filters,
  initialSection = "tasks",
  onApply,
  onProfile,
  onStudio,
  onNavigate,
}: {
  base: AppState;
  filters: Filters;
  initialSection?: SignalsSection;
  onApply: (f: Filters) => void;
  onProfile: (id: string) => void;
  onStudio: (offerId?: string) => void;
  onNavigate: (s: string) => void;
}) {
  const [data, setData] = useState(empty),
    [section, setSection] = useState<SignalsSection>(initialSection),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [taskFilter, setTaskFilter] = useState("open"),
    [sourceId, setSourceId] = useState(""),
    [raw, setRaw] = useState(""),
    [preview, setPreview] = useState<ImportRun | null>(null),
    [listFilter, setListFilter] = useState("pending"),
    [employment, setEmployment] = useState("all"),
    [template, setTemplate] = useState<Listing | null>(null);
  const api = base.session.mode === "live" ? "/api/live/v3/" : "/api/v3/",
    employer = base.session.role === "employer";
  const readState = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(api + "state", {
        cache: "no-store",
        signal,
      });
      const value = (await response.json()) as SignalsState & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(value.error ?? "Не удалось загрузить пульт");
      return value;
    },
    [api],
  );
  async function load() {
    const value = await readState();
    setData(value);
    setReady(true);
    setError("");
    return value;
  }
  useEffect(() => {
    const controller = new AbortController();
    readState(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setReady(true);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "Ошибка загрузки");
      });
    return () => controller.abort();
  }, [readState]);
  async function call(
    path: string,
    body: unknown,
    method = "POST",
    refresh = true,
  ) {
    if (busy) return null;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(api + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Session-Revision": String(base.session.revision),
          },
          body: JSON.stringify(body),
        }),
        v = (await r.json()) as SignalsState & {
          error?: string;
          preview: ImportRun;
        };
      if (!r.ok) throw new Error(v.error);
      if (refresh) await load();
      return v;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось выполнить действие";
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function download(path: string, name: string) {
    setBusy(true);
    try {
      const r = await fetch(api + path, { cache: "no-store" });
      if (!r.ok)
        throw new Error(((await r.json()) as { error?: string }).error);
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка выгрузки");
    } finally {
      setBusy(false);
    }
  }
  const now = data.generatedAt ? Date.parse(data.generatedAt) : 0;
  const tasks = data.tasks.filter((t) =>
    taskFilter === "done"
      ? t.done
      : !t.done &&
        (taskFilter === "overdue"
          ? Date.parse(t.dueAt) < now
          : taskFilter === "week"
            ? Date.parse(t.dueAt) >= now &&
              Date.parse(t.dueAt) < now + 7 * 86400000
            : true),
  );
  const activeRadars = data.radars.filter((r) => !r.paused),
    unseen = activeRadars.reduce(
      (s, r) => s + r.added.length + r.changed.length,
      0,
    );
  const tabs: [SignalsSection, string, ReactNode][] = [
    ["tasks", "Ближайшее", <CalendarDays key="t" size={17} />],
    ...(employer
      ? ([
          ["radars", "Радары поиска", <Radio key="r" size={17} />],
          ["sources", "Источники и импорт", <Layers3 key="s" size={17} />],
        ] as [SignalsSection, string, ReactNode][])
      : []),
  ];
  async function createSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      id = crypto.randomUUID();
    const result = await call("sources", {
      id,
      data: {
        name: input(f, "name"),
        website: input(f, "website"),
        category: input(f, "category"),
      },
    });
    if (result) {
      setSourceId(id);
      toast.success("Источник добавлен. Загрузите разрешённую JSON-выгрузку.");
    }
  }
  async function sample() {
    const id = crypto.randomUUID(),
      result = await call("sources", {
        id,
        data: {
          name: "Учебная выгрузка · вымышленные вакансии",
          website: "https://careers.example.org",
          category: "company",
        },
      });
    if (result) {
      setSourceId(id);
      setPreview(null);
      setRaw(
        JSON.stringify(
          {
            ...feedExample,
            items: feedExample.items.map((x) => ({
              ...x,
              publishedAt: new Date(Date.now() - 86400000).toISOString(),
            })),
          },
          null,
          2,
        ),
      );
    }
  }
  async function inspect() {
    let parsed;
    try {
      parsed = JSON.parse(raw);
      if (
        !parsed ||
        Array.isArray(parsed) ||
        !Array.isArray(parsed.items) ||
        Object.keys(parsed).some((k) => k !== "items")
      )
        throw new Error();
    } catch {
      setError(
        "Ожидается объект JSON с единственным полем items — массивом записей.",
      );
      return;
    }
    const source = data.sources.find((s) => s.id === sourceId);
    if (!source) {
      setError("Выберите источник");
      return;
    }
    const v = await call(
      "imports/preview",
      { sourceId, sourceRevision: source.revision, items: parsed.items },
      "POST",
      false,
    );
    if (v) setPreview(v.preview);
  }
  async function makeBrief(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!template) return;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch(
          (base.session.mode === "live" ? "/api/live/v2/" : "/api/v2/") +
            "briefs",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-Revision": String(base.session.revision),
            },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              data: {
                title: input(f, "title"),
                role: template.role,
                outcomes: input(f, "outcomes")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                mandatory: input(f, "skills")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                desirable: [],
                trainable: [],
                coveredSkills: [],
                salaryMin: Number(input(f, "salaryMin")),
                salaryMax: Number(input(f, "salaryMax")),
                workFormat: template.workFormat,
                coreHours: "",
                onCall: "discuss",
              },
            }),
          },
        ),
        v = (await r.json()) as SignalsState & {
          error?: string;
          preview: ImportRun;
        };
      if (!r.ok) throw new Error(v.error);
      setTemplate(null);
      toast.success(
        "Ваша потребность создана. Откройте «Подбор и навыки» для подбора.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="signals-shell" aria-label="Пульт подбора">
      <div className="signals-heading">
        <div>
          <p className="signals-kicker">PROFECTIUM / РАБОЧИЙ ПУЛЬТ</p>
          <h1>Важное — вовремя.</h1>
          <p>Поиск, сроки и договорённости в одном рабочем ритме.</p>
        </div>
        <button
          className="studio-btn secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void load()
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <RefreshCw size={16} /> Обновить
        </button>
      </div>
      <div className="signals-metrics">
        <button
          onClick={() => {
            setSection("tasks");
            setTaskFilter("overdue");
          }}
        >
          <span>Требуют внимания</span>
          <strong>
            {data.tasks
              .filter((t) => !t.done && Date.parse(t.dueAt) < now)
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>срок уже наступил</small>
        </button>
        <button onClick={() => setSection(employer ? "radars" : "tasks")}>
          <span>{employer ? "Изменения в радарах" : "Ближайшие действия"}</span>
          <strong>
            {(employer ? unseen : data.tasks.filter((t) => !t.done).length)
              .toString()
              .padStart(2, "0")}
          </strong>
          <small>
            {employer
              ? "новые и изменённые профили"
              : "только ваши доступные данные"}
          </small>
        </button>
      </div>
      <nav className="signals-tabs" aria-label="Разделы пульта">
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            aria-pressed={section === id}
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="signals-error" role="alert">
          {error}
        </div>
      )}
      {!ready && !error && <p role="status">Загружаем доступные записи…</p>}
      {section === "tasks" && (
        <>
          <div className="signals-section-title">
            <div>
              <h2>Ближайшие действия</h2>
              <p>Сроки проверок навыков и согласованные следующие шаги.</p>
            </div>
            <button
              className="studio-btn secondary"
              disabled={busy || !data.tasks.some((t) => !t.done)}
              onClick={() =>
                void download("calendar", "profectium-actions.ics")
              }
            >
              <Download size={16} /> В календарь
            </button>
          </div>
          <div className="signals-filterbar">
            {[
              ["open", "Открытые"],
              ["overdue", "Просроченные"],
              ["week", "Ближайшие 7 дней"],
              ["done", "Отмеченные мной"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={taskFilter === id}
                onClick={() => setTaskFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="signals-task-list">
            {tasks.map((t) => (
              <article
                key={t.id}
                className={
                  "signals-task " +
                  (!t.done && Date.parse(t.dueAt) < now ? "overdue" : "")
                }
              >
                <div className="signals-date">
                  <CalendarDays size={20} />
                  <time dateTime={t.dueAt}>{date(t.dueAt)}</time>
                </div>
                <div>
                  <span className="signals-kicker">
                    {t.kind === "request"
                      ? "ПРОВЕРКА НАВЫКА"
                      : "ОБЩИЙ ШАГ"}
                  </span>
                  <h3>{t.title}</h3>
                  <p>{t.detail}</p>
                </div>
                <div className="signals-actions">
                  <button
                    className="studio-btn secondary"
                    onClick={() =>
                      onStudio(
                        t.kind === "dialogue" ? t.targetId : undefined,
                      )
                    }
                  >
                    Открыть
                  </button>
                  <button
                    disabled={busy}
                    className="signals-link"
                    onClick={() =>
                      void call("tasks", { taskId: t.id, done: !t.done })
                    }
                  >
                    {t.done ? "Вернуть в список" : "Отметить для себя"}
                  </button>
                </div>
              </article>
            ))}
            {!tasks.length && (
              <Empty
                icon={<CalendarDays />}
                title="Здесь спокойно"
                text="В этой группе нет действий. Сроки появятся после запроса проверки навыка или согласования следующего шага в диалоге."
              />
            )}
          </div>
          <p className="signals-footnote">
            Личная отметка не завершает действие за другую сторону. Файл
            календаря — снимок открытых сроков без контактов; автоматической
            синхронизации нет.
          </p>
        </>
      )}
      {section === "radars" && employer && (
        <>
          <div className="signals-section-title">
            <div>
              <h2>Поиск, который помнит условия</h2>
              <p>
                Все условия применяются вместе. Новое сравнивается с последним
                просмотренным снимком.
              </p>
            </div>
            <button
              className="studio-btn secondary"
              disabled={busy}
              onClick={() =>
                void download(
                  "export?filters=" +
                    encodeURIComponent(JSON.stringify(filters)),
                  "profectium-candidates.csv",
                )
              }
            >
              <Download size={16} /> CSV текущего поиска
            </button>
          </div>
          <form
            className="signals-save-radar"
            onSubmit={(e) => {
              /*
               * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
               * Все права сохранены.
               *
               * Автор: Криницин Вячеслав Александрович
               */
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void call("radars", {
                id: crypto.randomUUID(),
                data: { title: input(f, "title"), filters },
              }).then((r) => {
                if (r)
                  toast.success(
                    "Радар сохранён. Текущие профили отмечены просмотренными.",
                  );
              });
            }}
          >
            <div>
              <strong>Условия текущего каталога</strong>
              <p>{filterLabel(filters)}</p>
              <button
                type="button"
                className="signals-link"
                onClick={() => onApply(filters)}
              >
                Изменить в каталоге
              </button>
            </div>
            <Field label="Название радара">
              <input
                name="title"
                required
                minLength={3}
                maxLength={80}
                placeholder="Например, Frontend для продуктовой команды"
              />
            </Field>
            <button className="studio-btn" disabled={busy}>
              <Radio size={17} /> Сохранить поиск
            </button>
          </form>
          <div className="signals-card-grid">
            {data.radars.map((r) => (
              <article
                className={"signals-card " + (r.paused ? "muted" : "")}
                key={r.id}
              >
                <div className="signals-row">
                  <Radio size={22} />
                  <span className="signals-badge">
                    {r.paused ? "Пауза" : "Активен"}
                  </span>
                </div>
                <h3>{r.title}</h3>
                <p>{filterLabel(r.filters)}</p>
                <div className="signals-radar-count">
                  <strong>{r.total}</strong>
                  <span>доступных профилей</span>
                </div>
                <div className="signals-delta">
                  <span>+{r.added.length} новых</span>
                  <span>{r.changed.length} изменились</span>
                  <span>{r.removed} больше не подходят</span>
                </div>
                <p className="signals-footnote">
                  Снимок: {date(r.checkedAt)}. Исчезнувшие профили не
                  раскрываются.
                </p>
                <div className="signals-actions">
                  <button
                    className="studio-btn secondary"
                    onClick={() => onApply(r.filters)}
                  >
                    Применить
                  </button>
                  <button
                    disabled={busy}
                    className="studio-btn secondary"
                    onClick={() =>
                      void call(
                        "radars/" + r.id,
                        { revision: r.revision, action: "acknowledge" },
                        "PATCH",
                      )
                    }
                  >
                    Просмотрено
                  </button>
                  <button
                    disabled={busy}
                    className="signals-link"
                    onClick={() =>
                      void call(
                        "radars/" + r.id,
                        {
                          revision: r.revision,
                          action: r.paused ? "resume" : "pause",
                        },
                        "PATCH",
                      )
                    }
                  >
                    {r.paused ? "Возобновить" : "Пауза"}
                  </button>
                </div>
                <details className="signals-radar-edit">
                  <summary>Название и условия</summary>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void call(
                        "radars/" + r.id,
                        {
                          revision: r.revision,
                          action: "edit",
                          data: {
                            title: input(form, "title"),
                            filters: form.has("replaceFilters")
                              ? filters
                              : r.filters,
                          },
                        },
                        "PATCH",
                      );
                    }}
                  >
                    <Field label="Название сохранённого поиска">
                      <input
                        name="title"
                        defaultValue={r.title}
                        minLength={3}
                        maxLength={80}
                        required
                      />
                    </Field>
                    <label className="signals-replace-filters">
                      <input type="checkbox" name="replaceFilters" /> Заменить
                      условия текущими фильтрами каталога
                    </label>
                    <p className="signals-footnote">
                      Сохранение создаст новый просмотренный снимок. Текущие
                      фильтры: {filterLabel(filters)}.
                    </p>
                    <button className="studio-btn secondary" disabled={busy}>
                      Сохранить изменения
                    </button>
                  </form>
                </details>
                {(r.added.length > 0 || r.changed.length > 0) && !r.paused && (
                  <div className="signals-matches">
                    {[...r.added, ...r.changed].slice(0, 5).map((id) => {
                      const c = base.candidates.find((x) => x.id === id);
                      return c ? (
                        <button key={id} onClick={() => onProfile(id)}>
                          {c.fullName} · {c.qualification?.role}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
          {!data.radars.length && (
            <Empty
              icon={<Radio />}
              title="Сохраните первый радар"
              text="Выберите фильтры в каталоге и дайте поиску имя. Изменения рассчитываются при открытии или обновлении пульта; письма не отправляются."
            />
          )}
          <p className="signals-footnote">
            До 20 радаров. Пауза убирает изменения из счётчика внимания. Экспорт
            содержит до 500 текущих доступных профилей, без контактов и закрытых
            артефактов.
          </p>
        </>
      )}
      {section === "sources" && employer && (
        <>
          <div className="signals-section-title">
            <div>
              <h2>Сначала источник. Затем доверие.</h2>
              <p>
                Добавьте разрешённую выгрузку, проверьте строки и только потом
                используйте их для своей потребности.
              </p>
            </div>
            <button
              className="studio-btn secondary"
              disabled={busy}
              onClick={() => void sample()}
            >
              Учебный пример
            </button>
          </div>
          <div className="signals-source-types">
            {sourceSuggestions.map((s) => (
              <div key={s.category}>
                <strong>{s.name}</strong>
                <p>{s.note}</p>
              </div>
            ))}
          </div>
          <details className="signals-disclosure">
            <summary>Добавить источник</summary>
            <form className="signals-form-grid" onSubmit={createSource}>
              <Field label="Название">
                <input name="name" required minLength={3} maxLength={100} />
              </Field>
              <Field
                label="Сайт источника"
                hint="Публичная ссылка без ключей и паролей."
              >
                <input
                  name="website"
                  type="url"
                  required
                  placeholder="https://careers.company.ru"
                />
              </Field>
              <Field label="Тип">
                <select name="category">
                  <option value="company">Карьерный сайт компании</option>
                  <option value="board">Площадка вакансий</option>
                  <option value="community">Сообщество</option>
                  <option value="internship">Стажировки</option>
                </select>
              </Field>
              <button className="studio-btn" disabled={busy}>
                Добавить
              </button>
            </form>
          </details>
          <div className="signals-source-list">
            {data.sources.map((s) => (
              <article key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {new URL(s.website).hostname}
                    </a>{" "}
                    · {data.listings.filter((x) => x.sourceId === s.id).length}{" "}
                    записей · {s.active ? "Включён" : "Приостановлен"}
                  </p>
                </div>
                <button
                  className="signals-link"
                  disabled={busy}
                  onClick={() =>
                    void call(
                      "sources/" + s.id,
                      { revision: s.revision, active: !s.active },
                      "PATCH",
                    )
                  }
                >
                  {s.active ? "Приостановить" : "Включить"}
                </button>
              </article>
            ))}
          </div>
          <div className="signals-import-grid">
            <div className="signals-card">
              <h3>JSON-выгрузка</h3>
              <Field label="Источник">
                <select
                  value={sourceId}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Выберите источник</option>
                  {data.sources
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Данные для проверки"
                hint="Объект {items: […]}, до 20 строк и 32 КБ. Предпросмотр ничего не публикует."
              >
                <textarea
                  rows={10}
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setPreview(null);
                  }}
                  spellCheck={false}
                />
              </Field>
              <button
                className="studio-btn"
                disabled={busy || !sourceId || !raw}
                onClick={() => void inspect()}
              >
                <ShieldCheck size={17} /> Проверить выгрузку
              </button>
              <details>
                <summary>Контракт и подключение по API</summary>
                <p>
                  POST /api/v3/imports/preview → POST
                  /api/v3/imports/&#123;id&#125;/commit. Для рабочего аккаунта
                  префикс /api/live/v3. Нужны сессия и её revision; read-only
                  ключ интеграции не разрешает импорт.
                </p>
                <a href="/openapi.json" target="_blank" rel="noreferrer">
                  Открыть OpenAPI
                </a>
                <p>
                  Сервер не скачивает страницы по ссылкам. Повторное получение
                  данных выполняет ваш разрешённый источник или коннектор.
                </p>
              </details>
            </div>
            <div className="signals-card">
              <h3>Предпросмотр</h3>
              {preview ? (
                <>
                  <p>
                    Действует до {date(preview.expiresAt)}. Корректные строки
                    будут сохранены во входящих.
                  </p>
                  <div className="signals-import-lines">
                    {preview.rows.map((r) => (
                      <article key={r.index}>
                        <strong>
                          #{r.index + 1} ·{" "}
                          {r.item?.title ?? "Некорректная строка"}
                        </strong>
                        <span
                          className={
                            "signals-badge " +
                            (["invalid", "duplicate"].includes(r.status)
                              ? "warn"
                              : "")
                          }
                        >
                          {
                            {
                              new: "Новая",
                              changed: "Изменена",
                              unchanged: "Без изменений",
                              invalid: "Ошибка",
                              duplicate: "Дубль",
                            }[r.status]
                          }
                        </span>
                        {r.changedFields?.length ? (
                          <p>Изменились: {r.changedFields.join(", ")}</p>
                        ) : null}
                        {[...r.errors, ...r.warnings].map((t, i) => (
                          <p key={i}>{t}</p>
                        ))}
                      </article>
                    ))}
                  </div>
                  <button
                    className="studio-btn"
                    disabled={
                      busy ||
                      preview.phase === "committed" ||
                      !preview.rows.some((r) =>
                        ["new", "changed", "unchanged"].includes(r.status),
                      )
                    }
                    onClick={() =>
                      void call("imports/" + preview.id + "/commit", {
                        revision: preview.revision,
                      }).then((r) => {
                        if (r) {
                          setPreview({ ...preview, phase: "committed" });
                          toast.success(
                            "Входящие обновлены. Проверьте записи перед использованием.",
                          );
                        }
                      })
                    }
                  >
                    Импортировать{" "}
                    {
                      preview.rows.filter((r) =>
                        ["new", "changed", "unchanged"].includes(r.status),
                      ).length
                    }{" "}
                    строк
                  </button>
                  <p className="signals-footnote">
                    Ошибки и дубли пропускаются. Отсутствующие строки не
                    считаются закрытыми вакансиями.
                  </p>
                </>
              ) : (
                <Empty
                  icon={<Inbox />}
                  title="Здесь появится результат"
                  text="Проверяем схему, даты, домен, зарплатную вилку, повтор ID и канонической ссылки. Похожие названия требуют ручного решения."
                />
              )}
            </div>
          </div>
          <div className="signals-section-title">
            <div>
              <h2>Входящие материалы</h2>
              <p>
                Данные исходной выгрузки, не подтверждение открытого найма или
                владения компанией.
              </p>
            </div>
            <div className="signals-select-row">
              <Field label="Проверка">
                <select
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                >
                  <option value="pending">На проверке</option>
                  <option value="accepted">Проверено мной</option>
                  <option value="rejected">Отклонено</option>
                  <option value="all">Все</option>
                </select>
              </Field>
              <Field label="Тип занятости">
                <select
                  value={employment}
                  onChange={(e) => setEmployment(e.target.value)}
                >
                  <option value="all">Все</option>
                  <option value="job">Работа</option>
                  <option value="internship">Стажировка</option>
                </select>
              </Field>
            </div>
          </div>
          <div className="signals-card-grid">
            {data.listings
              .filter(
                (l) =>
                  (listFilter === "all" || l.review === listFilter) &&
                  (employment === "all" || l.employment === employment),
              )
              .map((l) => {
                const q = listingQuality(l, now);
                /*
                 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
                 * Все права сохранены.
                 *
                 * Автор: Криницин Вячеслав Александрович
                 */
                return (
                  <article key={l.id} className="signals-card">
                    <div className="signals-row">
                      <span className="signals-badge">
                        {l.employment === "internship"
                          ? "Стажировка"
                          : "Работа"}{" "}
                        · {l.grade}
                      </span>
                      <span
                        className={"signals-badge " + (q.stale ? "warn" : "")}
                      >
                        {q.stale
                          ? "Дата старше 30 дней"
                          : "Дата в пределах 30 дней"}
                      </span>
                    </div>
                    <h3>{l.title}</h3>
                    <p>
                      {l.company} · {l.role} · {l.workFormat}
                    </p>
                    <strong>
                      {l.salaryMin !== null && l.salaryMax !== null
                        ? salary(l.salaryMin, l.salaryMax)
                        : "Зарплата не указана"}
                    </strong>
                    <p>{l.description}</p>
                    <div
                      className="signals-quality"
                      aria-label="Полнота исходных данных"
                    >
                      {q.checks.map((c) => (
                        <span key={c.label} className={c.ok ? "ok" : ""}>
                          {c.ok ? "✓" : "?"} {c.label}
                        </span>
                      ))}
                    </div>
                    <p className="signals-footnote">
                      Полнота: {q.filled}/{q.total}. Это качество заполнения, не
                      рейтинг работодателя. Публикация: {date(l.publishedAt)}.
                      Получено: {date(l.lastSeenAt)}.
                    </p>
                    <a href={l.url} target="_blank" rel="noreferrer noopener">
                      Открыть первоисточник
                    </a>
                    <div className="signals-actions">
                      <button
                        className="studio-btn secondary"
                        disabled={busy || l.review === "accepted"}
                        onClick={() =>
                          void call(
                            "listings/" + l.id,
                            { revision: l.revision, review: "accepted" },
                            "PATCH",
                          )
                        }
                      >
                        Проверено мной
                      </button>
                      <button
                        className="signals-link"
                        disabled={busy || l.review === "rejected"}
                        onClick={() =>
                          void call(
                            "listings/" + l.id,
                            { revision: l.revision, review: "rejected" },
                            "PATCH",
                          )
                        }
                      >
                        Отклонить
                      </button>
                      {l.review === "rejected" && (
                        <button
                          className="signals-link"
                          disabled={busy}
                          onClick={() =>
                            void call(
                              "listings/" + l.id,
                              { revision: l.revision, review: "pending" },
                              "PATCH",
                            )
                          }
                        >
                          Вернуть
                        </button>
                      )}
                    </div>
                    <button
                      className="studio-btn"
                      disabled={l.review !== "accepted" || l.salaryMin === null}
                      onClick={() => setTemplate(l)}
                    >
                      Адаптировать в свою потребность
                    </button>
                    {l.salaryMin === null && (
                      <p className="signals-footnote">
                        Для потребности нужны обе границы зарплаты. Уточните их
                        и повторите импорт.
                      </p>
                    )}
                    {l.history.length > 0 && (
                      <details>
                        <summary>
                          История изменений · {l.history.length}
                        </summary>
                        {l.history.map((h, i) => (
                          <p key={i}>
                            {date(h.at)}: {h.fields.join(", ")}
                          </p>
                        ))}
                      </details>
                    )}
                  </article>
                );
              })}
          </div>
          {template && (
            <div className="signals-card signals-template">
              <h3>Ваша потребность по мотивам материала</h3>
              <p>
                Источник: {template.company}. Проверьте задачи и условия для
                своей компании. Чужая вакансия не публикуется от вашего имени.
              </p>
              <form onSubmit={makeBrief} className="signals-form-grid">
                <Field label="Название потребности">
                  <input
                    name="title"
                    defaultValue={template.title.slice(0, 100)}
                    required
                    minLength={3}
                    maxLength={100}
                  />
                </Field>
                <Field label="Обязательные навыки через запятую">
                  <input
                    name="skills"
                    defaultValue={template.skills.join(", ")}
                  />
                </Field>
                <Field label="Задачи и ожидаемые результаты, по одному в строке">
                  <textarea
                    name="outcomes"
                    required
                    minLength={5}
                    defaultValue={template.description.slice(0, 400)}
                  />
                </Field>
                <Field label="Зарплата от, ₽">
                  <input
                    name="salaryMin"
                    type="number"
                    min={10000}
                    max={2000000}
                    required
                    defaultValue={template.salaryMin ?? ""}
                  />
                </Field>
                <Field label="Зарплата до, ₽">
                  <input
                    name="salaryMax"
                    type="number"
                    min={10000}
                    max={2000000}
                    required
                    defaultValue={template.salaryMax ?? ""}
                  />
                </Field>
                <div className="signals-actions">
                  <button className="studio-btn" disabled={busy}>
                    Создать мою потребность
                  </button>
                  <button
                    className="signals-link"
                    type="button"
                    onClick={() => setTemplate(null)}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          )}
          <p className="signals-footnote">
            Совпадения объединяются только по устойчивому ID внутри источника.
            Ссылки очищаются от рекламных меток; похожие названия не сливаются
            автоматически. Справочная идея каталога:{" "}
            <a
              href="https://github.com/404-Hub/it-vacancy-source-list"
              target="_blank"
              rel="noreferrer"
            >
              список ИТ-источников
            </a>
            .
          </p>
        </>
      )}
      <div className="signals-footer">
        <span>
          <ShieldCheck size={15} /> Только доступные вам данные
        </span>
        <span>
          {data.generatedAt ? "Обновлено " + date(data.generatedAt) : ""}
        </span>
        <button className="signals-link" onClick={() => onNavigate("studio")}>
          Перейти в «Подбор и навыки»
        </button>
      </div>
    </section>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="signals-empty">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function filterLabel(f: Filters) {
  return (
    [
      f.query && "Поиск: " + f.query,
      f.role !== "all" && f.role,
      f.grade !== "all" && f.grade,
      f.format !== "all" && f.format,
      f.maxSalary && "до " + f.maxSalary + " ₽",
      f.hasAchievements && "с достижениями",
      f.discipline !== "all" && f.discipline,
      f.jobId && f.jobId !== "all" && "по выбранной вакансии",
    ]
      .filter(Boolean)
      .join(" · ") || "Все доступные категории и форматы"
  );
}
