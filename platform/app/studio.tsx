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
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  FileCheck2,
  FlaskConical,
  GitBranch,
  LockKeyhole,
  MessageSquare,
  Route,
  ScanText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { AppState, Candidate, Offer, Role, Grade } from "@/lib/types";
import { grades, roles } from "@/lib/types";
import type {
  CareerState,
  Proof,
  Brief,
  Terms,
  LabCase,
  Dialogue,
  Verification,
  ProfileControls,
} from "@/lib/career-types";
import { emptyRules } from "@/lib/career-types";
import {
  compareBriefMatches,
  matchBrief,
  normalizeSkill,
  uniqueSkills,
} from "@/lib/career-domain";
import { salary } from "@/lib/domain";
import { useClientNow } from "./use-client-now";

type Section =
  | "briefs"
  | "passport"
  | "lab"
  | "requests"
  | "dialogues"
  | "privacy"
  | "team"
  | "sandbox"
  | "import"
  | "guide";
type Call = (
  path: string,
  method?: string,
  body?: unknown,
  refresh?: boolean,
) => Promise<unknown>;
const formats = ["Удалённо", "Гибрид", "Офис"];
const list = (value: FormDataEntryValue | null) =>
  uniqueSkills(
    String(value ?? "")
      .split(/[,\n]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  );
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const stamp = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const dateInput = (days = 3) =>
  new Date(
    Date.now() + days * 86400000 - new Date().getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
const field = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const callName = (x: string) =>
  ({ yes: "Есть", no: "Нет", discuss: "Обсуждается" })[x] ?? x;
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
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="studio-empty">
      <Route size={28} />
      <p>{children}</p>
    </div>
  );
}
function Intro({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="studio-intro">
      <span className="section-index">{index} / PROFECTIUM</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
const sections: {
  id: Section;
  label: string;
  icon: typeof Route;
  audience?: "candidate" | "employer";
}[] = [
  {
    id: "briefs",
    label: "Задачи и подбор",
    icon: SlidersHorizontal,
    audience: "employer",
  },
  { id: "passport", label: "Паспорт навыков", icon: FileCheck2 },
  {
    id: "lab",
    label: "Инженерная лаборатория",
    icon: Code2,
    audience: "candidate",
  },
  { id: "requests", label: "Проверка навыка", icon: ScanText },
  { id: "dialogues", label: "Условия и диалоги", icon: MessageSquare },
  {
    id: "privacy",
    label: "Видимость и правила",
    icon: LockKeyhole,
    audience: "candidate",
  },
  { id: "team", label: "Карта команды", icon: Users, audience: "employer" },
  {
    id: "sandbox",
    label: "Песочница ФСП",
    icon: FlaskConical,
    audience: "employer",
  },
  { id: "import", label: "Разбор текста", icon: Sparkles },
  { id: "guide", label: "Маршрут знакомства", icon: Route },
];
export function CareerStudio({
  base,
  reload,
  initialCandidate,
  initialOfferId,
  initialSection,
  onOffer,
  onProfile,
  navigate,
}: {
  base: AppState;
  reload: () => Promise<void>;
  initialCandidate?: string | null;
  initialOfferId?: string | null;
  initialSection?: Section;
  onOffer: (c: Candidate) => void;
  onProfile: (id: string) => void;
  navigate: (view: string) => void;
}) {
  const employer = base.session.role === "employer",
    api = base.session.mode === "live" ? "/api/live/v2/" : "/api/v2/";
  const [section, setSection] = useState<Section>(
    initialSection ??
      (initialOfferId
        ? "dialogues"
        : initialCandidate
          ? "passport"
          : employer
            ? "briefs"
            : "passport"),
  );
  const [state, setState] = useState<CareerState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [candidateId, setCandidateId] = useState(
      initialCandidate ?? base.session.candidateId,
    ),
    [briefDraft, setBriefDraft] = useState<Partial<Brief> | null>(null);
  const readState = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(api + "state", {
        cache: "no-store",
        signal,
      });
      const next = (await response.json()) as CareerState & {
        error?: string;
        cases: LabCase[];
      };
      if (!response.ok)
        throw new Error(next.error ?? "Не удалось загрузить пространство");
      return next;
    },
    [api],
  );
  useEffect(() => {
    const controller = new AbortController();
    readState(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setState(next);
          setError("");
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить пространство",
          );
      });
    return () => controller.abort();
  }, [readState]);
  async function refresh() {
    try {
      setState(await readState());
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить пространство",
      );
    }
  }
  const call: Call = async (
    path,
    method = "POST",
    body = {},
    update = true,
  ) => {
    if (busy) return null;
    setBusy(true);
    try {
      const r = await fetch(api + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Session-Revision": String(base.session.revision),
          },
          ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
        }),
        j = (await r.json()) as CareerState & {
          error?: string;
          cases: LabCase[];
        };
      if (!r.ok) throw new Error(j.error ?? "Не удалось выполнить действие");
      if (update) {
        setState(j);
        await reload();
        toast.success("Сохранено");
      }
      return j;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
        { duration: 7000 },
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  const current =
    base.candidates.find((c) => c.id === candidateId) ?? base.candidates[0];
  const currentId = current?.id;
  useEffect(() => {
    if (!employer || section !== "passport" || !currentId) return;
    void fetch(api + "proof-view/" + currentId, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Revision": String(base.session.revision),
      },
      body: "{}",
    }).catch(() => {});
  }, [api, employer, section, currentId, base.session.revision]);
  const go = (id: Section) => {
    setSection(id);
    setError("");
  };
  return (
    <section className="career-studio">
      <header className="studio-header">
        <div>
          <span className="eyebrow">ОТ НАВЫКА К СОГЛАСОВАННЫМ УСЛОВИЯМ</span>
          <h1>
            Подбор и навыки<span>↗</span>
          </h1>
          <p>Факты. Практика. Решение обеих сторон.</p>
        </div>
        <div className="studio-header-mark" aria-hidden="true">
          <GitBranch />
          <span>
            PROOF
            <br />
            TO OPPORTUNITY
          </span>
        </div>
      </header>
      <nav className="studio-tabs" aria-label="Разделы подбора и проверки навыков">
        {sections
          .filter((s) => !s.audience || s.audience === base.session.role)
          .map((s) => (
            <button
              key={s.id}
              className={section === s.id ? "active" : ""}
              onClick={() => go(s.id)}
              aria-current={section === s.id ? "page" : undefined}
            >
              <s.icon size={16} />
              {s.label}
            </button>
          ))}
      </nav>
      {error ? (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => void refresh()}>Повторить</button>
        </div>
      ) : !state ? (
        <div className="studio-empty" aria-live="polite">
          Загружаем рабочее пространство…
        </div>
      ) : (
        <fieldset className="studio-body" disabled={busy} aria-busy={busy}>
          {section === "passport" && (
            <>
              <Intro index="01" title="За каждым навыком — основание">
                Самоописание, пилотный тест, инженерный кейс и результат
                соревнования имеют разную доказательную силу.
              </Intro>
              {employer && (
                <Field label="Профиль">
                  <select
                    value={current?.id ?? ""}
                    onChange={(e) => {
                      setCandidateId(e.target.value);
                      void call(
                        "proof-view/" + e.target.value,
                        "POST",
                        {},
                        false,
                      );
                    }}
                  >
                    {base.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} · {c.role}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {current ? (
                <Passport
                  candidate={current}
                  proofs={state.proofs.filter(
                    (p) => p.candidateId === current.id,
                  )}
                  own={!employer}
                  call={call}
                  onLab={() => go("lab")}
                />
              ) : (
                <Empty>
                  Нет доступных профилей. После успешной проверки и публикации
                  профиль появится в каталоге.
                </Empty>
              )}
            </>
          )}
          {section === "briefs" && (
            <Briefs
              base={base}
              state={state}
              call={call}
              draft={briefDraft}
              onParse={() => go("import")}
              onOffer={onOffer}
              onProfile={onProfile}
            />
          )}
          {section === "lab" && (
            <Laboratory api={api} state={state} call={call} />
          )}
          {section === "requests" && (
            <Requests base={base} state={state} call={call} />
          )}
          {section === "dialogues" && (
            <Dialogues
              base={base}
              state={state}
              call={call}
              initialOfferId={initialOfferId}
            />
          )}
          {section === "privacy" && current && (
            <Privacy
              candidate={current}
              state={state}
              call={call}
              offers={base.offers}
            />
          )}
          {section === "team" && <TeamMap base={base} state={state} />}
          {section === "sandbox" && (
            <Sandbox
              mode={base.session.mode}
              call={call}
              onIntegration={() => navigate("integrations")}
            />
          )}
          {section === "import" && (
            <TextAssistant
              employer={employer}
              candidate={current}
              state={state}
              call={call}
              onBrief={(draft) => {
                setBriefDraft(draft);
                go("briefs");
              }}
            />
          )}
          {section === "guide" && (
            <Guide
              employer={employer}
              mode={base.session.mode}
              go={go}
              navigate={navigate}
            />
          )}
        </fieldset>
      )}
      {busy && (
        <div className="studio-saving" role="status">
          <span />
          Сохраняем на сервере…
        </div>
      )}
    </section>
  );
}

function ProofCard({
  proof: p,
  onVisibility,
}: {
  proof: Proof;
  onVisibility?: () => void;
}) {
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  return (
    <details className={"proof-card proof-" + p.kind}>
      <summary>
        <span className="proof-node">
          <FileCheck2 size={17} />
        </span>
        <span>
          <span className="proof-source">
            {p.kind === "self"
              ? "ЗАЯВЛЕНО"
              : p.kind === "assessment"
                ? "ПИЛОТНЫЙ ТЕСТ"
                : p.kind === "case"
                  ? "ИНЖЕНЕРНЫЙ КЕЙС"
                  : "СОРЕВНОВАНИЕ"}
            {p.synthetic ? " · ДЕМО" : ""}
          </span>
          <strong>{p.title}</strong>
          <small>{p.summary}</small>
        </span>
        <ChevronRight size={18} />
      </summary>
      <div className="proof-detail">
        <dl>
          <div>
            <dt>Источник</dt>
            <dd>{p.source}</dd>
          </div>
          <div>
            <dt>Дата записи</dt>
            <dd>{stamp(p.createdAt)}</dd>
          </div>
          <div>
            <dt>Навык / область</dt>
            <dd>{p.skill}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>
              {p.status === "claimed"
                ? "Самоописание"
                : p.status === "evaluated"
                  ? "Проверено по методике"
                  : "Запись источника"}
            </dd>
          </div>
        </dl>
        <p className="proof-limit">{p.limits}</p>
        <pre>{p.artifact}</pre>
        {onVisibility && (
          <button className="button secondary" onClick={onVisibility}>
            {p.published
              ? "Скрыть артефакт от работодателей"
              : "Опубликовать артефакт"}
          </button>
        )}
      </div>
    </details>
  );
}
function Passport({
  candidate: c,
  proofs,
  own,
  call,
  onLab,
}: {
  candidate: Candidate;
  proofs: Proof[];
  own: boolean;
  call: Call;
  onLab: () => void;
}) {
  const [tab, setTab] = useState<"all" | "evaluated" | "self">("all");
  const filtered = proofs.filter(
    (p) =>
      tab === "all" ||
      (tab === "evaluated" ? p.status === "evaluated" : p.status === "claimed"),
  );
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (
      await call("proofs", "POST", {
        id: crypto.randomUUID(),
        data: {
          title: field(f, "title"),
          skill: field(f, "skill"),
          summary: field(f, "summary"),
          artifact: field(f, "artifact"),
          published: f.get("published") === "on",
        },
      })
    )
      form.reset();
  }
  return (
    <div className="studio-split">
      <aside className="passport-identity">
        <div className="passport-avatar">{c.initials}</div>
        <span className="section-index">ПРОФИЛЬ / {c.id.slice(-6)}</span>
        <h3>{c.fullName}</h3>
        <p>
          {c.qualification
            ? `${c.qualification.role} · ${c.qualification.grade}`
            : "Категория ещё не получена"}
        </p>
        <div className="passport-category">
          <ShieldCheck size={19} />
          <span>
            {c.qualification
              ? "Категория по пилотной проверке"
              : "Нужна профессиональная проверка"}
            <small>
              Достижения дополняют профиль и не повышают грейд автоматически.
            </small>
          </span>
        </div>
        <h4>Заявленные навыки</h4>
        <div className="skill-cloud">
          {c.skills.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <p className="small-note">
          Наличие навыка в списке само по себе не означает подтверждение.
        </p>
        {own && (
          <button className="button primary" onClick={onLab}>
            Добавить практику <ArrowUpRight size={16} />
          </button>
        )}
      </aside>
      <div>
        <div className="studio-toolbar">
          <h3>
            Лента подтверждений{" "}
            <span className="count-pill">{proofs.length}</span>
          </h3>
          <div className="segmented">
            {(["all", "evaluated", "self"] as const).map((t, i) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {["Все", "Проверки", "Заявлено"][i]}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className="proof-timeline">
            {filtered.map((p) => (
              <ProofCard
                key={p.id}
                proof={p}
                onVisibility={
                  own && p.revision !== undefined
                    ? () =>
                        void call("proofs/" + p.id, "PATCH", {
                          revision: p.revision,
                          published: !p.published,
                        })
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <Empty>В этой группе пока нет подтверждений.</Empty>
        )}
        {own && (
          <details className="studio-editor">
            <summary>
              Добавить проект или артефакт <span>+</span>
            </summary>
            <form className="studio-form" onSubmit={add}>
              <div className="studio-row">
                <Field label="Название">
                  <input name="title" required minLength={3} maxLength={120} />
                </Field>
                <Field label="Основной навык">
                  <input
                    name="skill"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Например, React"
                  />
                </Field>
              </div>
              <Field label="Что сделали лично">
                <textarea
                  name="summary"
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={3}
                />
              </Field>
              <Field
                label="Артефакт или ссылка и описание"
                hint="Сохраняется как самоописание. Ссылки автоматически не открываются и не проверяются."
              >
                <textarea
                  name="artifact"
                  required
                  minLength={10}
                  maxLength={6000}
                  rows={5}
                />
              </Field>
              <label className="checkline">
                <input type="checkbox" name="published" defaultChecked />
                Показывать работодателям, которым доступен паспорт
              </label>
              <button className="button primary">Сохранить артефакт</button>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}

function Briefs({
  base,
  state,
  call,
  draft,
  onParse,
  onOffer,
  onProfile,
}: {
  base: AppState;
  state: CareerState;
  call: Call;
  draft: Partial<Brief> | null;
  onParse: () => void;
  onOffer: (c: Candidate) => void;
  onProfile: (id: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [relaxed, setRelaxed] = useState<string[]>([]),
    [edit, setEdit] = useState<Brief | null>(null),
    [create, setCreate] = useState(!!draft);
  const b = state.briefs.find((b) => b.id === selected) ?? state.briefs[0];
  const matches = b
    ? base.candidates
        .map((c) => matchBrief(c, b, state.proofs, relaxed))
        .sort(compareBriefMatches)
    : [];
  const baseline = b
    ? base.candidates.filter((c) => matchBrief(c, b, state.proofs).compatible)
        .length
    : 0;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      id = edit?.id ?? crypto.randomUUID();
    const result = await call(
      "briefs" + (edit ? "/" + id : ""),
      edit ? "PUT" : "POST",
      {
        id,
        ...(edit ? { revision: edit.revision } : {}),
        data: {
          title: field(f, "title"),
          role: field(f, "role"),
          ...(field(f, "grade") ? { grade: field(f, "grade") } : {}),
          outcomes: lines(f.get("outcomes")),
          mandatory: list(f.get("mandatory")),
          desirable: list(f.get("desirable")),
          trainable: list(f.get("trainable")),
          coveredSkills: list(f.get("coveredSkills")),
          salaryMin: Number(f.get("salaryMin")),
          salaryMax: Number(f.get("salaryMax")),
          workFormat: field(f, "workFormat"),
          coreHours: field(f, "coreHours"),
          onCall: field(f, "onCall"),
        },
      },
    );
    if (result) {
      setSelected(id);
      setCreate(false);
      setEdit(null);
      setRelaxed([]);
    }
  }
  const d = edit ?? draft;
  return (
    <>
      <Intro index="02" title="Кого требуют ваши задачи?">
        Опишите результат первых 90 дней. Разделите обязательное, желательное и
        то, чему готовы научить.
      </Intro>
      <div className="studio-toolbar">
        <div className="brief-picker">
          {state.briefs.map((b) => (
            <button
              className={
                b.id === (selected || state.briefs[0]?.id) ? "active" : ""
              }
              key={b.id}
              onClick={() => {
                setSelected(b.id);
                setRelaxed([]);
              }}
            >
              {b.title}
            </button>
          ))}
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEdit(null);
            setCreate(!create);
          }}
        >
          Новая потребность +
        </button>
        <button className="button secondary" onClick={onParse}>
          Из текста
        </button>
      </div>
      {(create || edit) && (
        <form
          className="studio-form studio-surface"
          key={edit?.id ?? JSON.stringify(draft)}
          onSubmit={save}
        >
          <div className="studio-row">
            <Field label="Название">
              <input
                name="title"
                required
                minLength={3}
                maxLength={100}
                defaultValue={d?.title ?? ""}
                placeholder="Разработчик для платёжного сервиса"
              />
            </Field>
            <Field label="Специализация">
              <select name="role" defaultValue={d?.role ?? "Backend"}>
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Подтверждённый грейд"
              hint="Подбор использует результат теста кандидата, а не уровень из резюме."
            >
              <select
                name="grade"
                required={!edit}
                defaultValue={d?.grade ?? ""}
              >
                <option value="">
                  {edit ? "Грейд не задан" : "Выберите грейд"}
                </option>
                {grades.map((grade) => (
                  <option key={grade}>{grade}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Результаты первых 90 дней — каждый с новой строки">
            <textarea
              name="outcomes"
              required
              maxLength={2400}
              rows={3}
              defaultValue={d?.outcomes?.join("\n") ?? ""}
              placeholder="Снизить число ошибок в платежах\nВнедрить мониторинг API"
            />
          </Field>
          <div className="studio-triple">
            {(
              [
                ["mandatory", "Обязательно"],
                ["desirable", "Будет плюсом"],
                ["trainable", "Готовы научить"],
              ] as const
            ).map(([key, label]) => (
              <Field label={label} key={key} hint="Через запятую">
                <input
                  name={key}
                  maxLength={1000}
                  defaultValue={d?.[key]?.join(", ") ?? ""}
                />
              </Field>
            ))}
          </div>
          <Field label="Навыки, которые уже есть в команде">
            <input
              name="coveredSkills"
              maxLength={1000}
              defaultValue={d?.coveredSkills?.join(", ") ?? ""}
              placeholder="PostgreSQL, Docker"
            />
          </Field>
          <TermsFields brief initial={d} />
          <div className="studio-actions">
            <button className="button primary">Сохранить и подобрать</button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setCreate(false);
                setEdit(null);
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {!b && !create ? (
        <Empty>
          Создайте первую потребность или разберите текст вакансии. Подбор
          начнётся с реальных задач команды.
        </Empty>
      ) : (
        b && (
          <>
            <div className="brief-summary studio-surface">
              <div>
                <span className="section-index">ПЕРВЫЕ 90 ДНЕЙ</span>
                <h3>{b.title}</h3>
                <ul>
                  {b.outcomes.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <p>
                  {b.role} · {b.grade ?? "Все подтверждённые грейды"} ·{" "}
                  {salary(b.salaryMin, b.salaryMax)} · {b.workFormat} ·{" "}
                  {b.coreHours || "Часы обсуждаются"}
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setEdit(b);
                  /*
                   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
                   * Все права сохранены.
                   *
                   * Автор: Криницин Вячеслав Александрович
                   */
                  setCreate(false);
                }}
              >
                Редактировать
              </button>
            </div>
            <div className="relaxation">
              <div>
                <span className="section-index">СЦЕНАРИЙ ПОИСКА</span>
                <h3>
                  {matches.filter((m) => m.compatible).length}{" "}
                  <span>из {base.candidates.length} доступных профилей</span>
                </h3>
                <p>
                  Было {baseline} при всех требованиях. Снимите одно условие и
                  оцените изменение на текущих данных.
                </p>
              </div>
              <div className="skill-cloud">
                {b.mandatory.map((s) => (
                  <button
                    key={s}
                    className={relaxed.includes(s) ? "relaxed" : ""}
                    aria-pressed={relaxed.includes(s)}
                    onClick={() =>
                      setRelaxed((r) =>
                        r.includes(s) ? r.filter((x) => x !== s) : [...r, s],
                      )
                    }
                  >
                    {relaxed.includes(s)
                      ? "Допустим пробел: "
                      : "Обязательно: "}
                    {s}
                  </button>
                ))}
              </div>
              <small>
                Симуляция не меняет сохранённую потребность. Демоисточники не
                считаются доказанным навыком. При равном соответствии выше
                профиль с более сильным результатом теста и достижениями ФСП.
              </small>
            </div>
            <div className="brief-results">
              {matches.map((m) => (
                <article className="brief-match" key={m.candidate.id}>
                  <div className="studio-toolbar">
                    <div>
                      <h3>{m.candidate.fullName}</h3>
                      <p>
                        {m.candidate.role} · {m.candidate.grade} ·{" "}
                        {salary(m.candidate.salaryMin, m.candidate.salaryMax)}
                      </p>
                    </div>
                    <span
                      className={"match-status " + (m.compatible ? "good" : "")}
                    >
                      {m.compatible ? "Условия совпадают" : "Нужно уточнение"}
                    </span>
                  </div>
                  <div className="requirement-strip">
                    {m.requirements.map((r) => (
                      <span key={r.skill} data-status={r.status}>
                        {r.status === "evidence"
                          ? "✓"
                          : r.status === "declared"
                            ? "◐"
                            : "○"}{" "}
                        {r.skill}
                        <small>
                          {r.status === "evidence"
                            ? "есть проверка"
                            : r.status === "declared"
                              ? "заявлено"
                              : "нет основания"}
                        </small>
                      </span>
                    ))}
                  </div>
                  {!!m.conditions.length && (
                    <p className="small-note">{m.conditions.join(" · ")}</p>
                  )}
                  <div className="studio-actions">
                    <button
                      className="text-button"
                      onClick={() => onProfile(m.candidate.id)}
                    >
                      Открыть профиль ↗
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => onOffer(m.candidate)}
                    >
                      Предложить условия
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <details className="studio-editor">
              <summary>Вопросы для обсуждения задач</summary>
              <div className="studio-form">
                {b.outcomes.map((x, i) => (
                  <p key={i}>
                    <b>{i + 1}.</b> Как бы вы подошли к задаче «{x}»? Какие
                    ограничения, риски и критерии успеха уточнили бы в первую
                    очередь?
                  </p>
                ))}
                <small>
                  Шаблоны привязаны к задачам. Они помогают разговору и не
                  оценивают личность кандидата.
                </small>
              </div>
            </details>
          </>
        )
      )}
    </>
  );
}

function TermsFields({
  initial,
  brief = false,
}: {
  initial?: Partial<Terms> | Partial<Brief> | null;
  brief?: boolean;
}) {
  return (
    <>
      <div className="studio-triple">
        <Field label="Зарплата от, ₽ до налогов">
          <input
            name="salaryMin"
            type="number"
            required
            min={10000}
            max={2000000}
            step={1000}
            defaultValue={initial?.salaryMin ?? 150000}
          />
        </Field>
        <Field label="Зарплата до, ₽ до налогов">
          <input
            name="salaryMax"
            type="number"
            required
            min={10000}
            max={2000000}
            step={1000}
            defaultValue={initial?.salaryMax ?? 250000}
          />
        </Field>
        <Field label="Формат">
          <select
            name="workFormat"
            defaultValue={initial?.workFormat ?? "Удалённо"}
          >
            {formats.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="studio-row">
        <Field label="Общие рабочие часы и часовой пояс">
          <input
            name="coreHours"
            maxLength={100}
            defaultValue={initial?.coreHours ?? ""}
            placeholder="11:00–16:00 МСК"
          />
        </Field>
        <Field label="Дежурства">
          <select name="onCall" defaultValue={initial?.onCall ?? "discuss"}>
            <option value="discuss">Обсудим</option>
            <option value="no">Нет</option>
            <option value="yes">Есть</option>
          </select>
        </Field>
      </div>
      {!brief && (
        <>
          {(
            [
              ["firstMonths", "Задачи первых 90 дней", 2000],
              ["interviewSteps", "Этапы знакомства и отбора", 1000],
              ["reviewProcess", "Пересмотр зарплаты", 1000],
              ["mentoring", "Поддержка и наставничество", 500],
            ] as const
          ).map(([key, label, max]) => (
            <Field label={label} key={key}>
              <textarea
                name={key}
                rows={2}
                maxLength={max}
                required={key === "firstMonths"}
                minLength={key === "firstMonths" ? 10 : undefined}
                defaultValue={(initial as Partial<Terms>)?.[key] ?? ""}
              />
            </Field>
          ))}
        </>
      )}
    </>
  );
}
const readTerms = (f: FormData): Terms => ({
  salaryMin: Number(f.get("salaryMin")),
  salaryMax: Number(f.get("salaryMax")),
  workFormat: field(f, "workFormat"),
  coreHours: field(f, "coreHours"),
  onCall: field(f, "onCall") as Terms["onCall"],
  firstMonths: field(f, "firstMonths"),
  interviewSteps: field(f, "interviewSteps"),
  reviewProcess: field(f, "reviewProcess"),
  mentoring: field(f, "mentoring"),
});

function Laboratory({
  api,
  state,
  call,
}: {
  api: string;
  state: CareerState;
  call: Call;
}) {
  const [cases, setCases] = useState<
      Pick<LabCase, "id" | "title" | "role" | "summary" | "estimatedMinutes">[]
    >([]),
    [task, setTask] = useState<LabCase | null>(null),
    [error, setError] = useState(""),
    [role, setRole] = useState("all");
  useEffect(() => {
    let active = true;
    fetch(api + "lab")
      .then(async (r) => {
        const j = (await r.json()) as CareerState & {
          error?: string;
          cases: LabCase[];
        };
        if (!r.ok) throw new Error(j.error);
        if (active) setCases(j.cases);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api]);
  async function open(id: string) {
    const r = (await call("lab/" + id, "GET", undefined, false)) as {
      case: LabCase;
    } | null;
    if (r) setTask(r.case);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!task) return;
    const f = new FormData(e.currentTarget);
    if (
      await call("lab/" + task.id, "POST", {
        id: crypto.randomUUID(),
        answers: Object.fromEntries(
          task.decisions.map((q) => [q.id, f.get(q.id)]),
        ),
        explanation: field(f, "explanation"),
        published: f.get("published") === "on",
      })
    )
      setTask(null);
  }
  return (
    <>
      <Intro index="03" title="Практика, которую можно показать">
        Разберите инженерную ситуацию, выберите исправления и объясните решение.
        Сервер проверит выбор по ключу и сохранит артефакт.
      </Intro>
      <div className="method-strip">
        <Code2 />
        <p>
          Это разбор подготовленных кейсов. Код не запускается; свободный
          комментарий не получает автоматическую оценку. Результат не меняет
          профессиональный грейд.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {task ? (
        <form
          className="studio-form studio-surface lab-task"
          key={task.id}
          onSubmit={submit}
        >
          <div className="studio-toolbar">
            <div>
              <span className="section-index">
                {task.role} / ≈ {task.estimatedMinutes} МИН
              </span>
              <h3>{task.title}</h3>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => setTask(null)}
            >
              К списку
            </button>
          </div>
          <p>{task.scenario}</p>
          <pre className="code-artifact">{task.artifact}</pre>
          <h4>Что должно получиться</h4>
          <ul>
            {task.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {task.decisions.map((q, i) => (
            <fieldset className="lab-decision" key={q.id}>
              <legend>
                {i + 1}. {q.prompt}
              </legend>
              {q.options.map((o) => (
                <label key={o.id}>
                  <input type="radio" name={q.id} value={o.id} required />
                  <span>
                    <b>{o.label}</b>
                    <pre>{o.patch}</pre>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          <Field label="Объясните решение и оставшиеся риски">
            <textarea
              name="explanation"
              required
              minLength={20}
              maxLength={3000}
              rows={4}
            />
          </Field>
          <label className="checkline">
            <input name="published" type="checkbox" defaultChecked />
            Показывать результат в паспорте
          </label>
          <button className="button primary">
            Проверить решения и сохранить
          </button>
        </form>
      ) : (
        <>
          <div className="studio-toolbar">
            <h3>{cases.length} инженерных кейсов</h3>
            <Field label="Специализация">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="all">Все</option>
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="lab-grid">
            {cases
              .filter((c) => role === "all" || c.role === role)
              .map((c, i) => (
                <button
                  className="lab-card"
                  key={c.id}
                  onClick={() => void open(c.id)}
                >
                  <span className="section-index">
                    {String(i + 1).padStart(2, "0")} / {c.role}
                  </span>
                  <h3>{c.title}</h3>
                  <p>{c.summary}</p>
                  <footer>
                    ≈ {c.estimatedMinutes} мин <ArrowUpRight size={20} />
                  </footer>
                </button>
              ))}
          </div>
        </>
      )}
      {!!state.runs.length && (
        <section className="section-space">
          <h3>Ваши разборы</h3>
          {state.runs.map((run) => (
            <details className="studio-editor" key={run.id}>
              <summary>
                {run.caseTitle}
                <span>{run.score}/100</span>
              </summary>
              <div className="studio-form">
                <p>
                  {stamp(run.createdAt)} · Проверен выбор исправлений. Код не
                  исполнялся.
                </p>
                {run.feedback.map((f, i) => (
                  <div
                    className="lab-feedback"
                    data-correct={f.correct}
                    key={i}
                  >
                    <b>
                      {f.correct ? "✓" : "○"} {f.prompt}
                    </b>
                    <p>{f.explanation}</p>
                  </div>
                ))}
                <h4>Ваше объяснение</h4>
                <p className="preserve-lines">{run.explanation}</p>
                <pre>{run.artifact}</pre>
              </div>
            </details>
          ))}
        </section>
      )}
    </>
  );
}

const requestStatus: Record<string, string> = {
  requested: "Ожидает ответа",
  submitted: "На рассмотрении",
  reviewed: "Есть обратная связь",
  declined: "Кандидат отказался",
  cancelled: "Отменён",
};
function Requests({
  base,
  state,
  call,
}: {
  base: AppState;
  state: CareerState;
  call: Call;
}) {
  const employer = base.session.role === "employer";
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await call("requests", "POST", {
      id: crypto.randomUUID(),
      candidateId: field(f, "candidateId"),
      skill: field(f, "skill"),
      title: field(f, "title"),
      criteria: field(f, "criteria"),
      estimatedMinutes: Number(f.get("estimatedMinutes")),
      dueAt: new Date(field(f, "dueAt")).toISOString(),
    });
  }
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  return (
    <>
      <Intro index="04" title="Один пробел — одна проверка">
        Запросите недостающее подтверждение с понятным критерием и ограничением
        времени. Кандидат может приложить готовый артефакт или отказаться.
      </Intro>
      {employer && (
        <details className="studio-editor">
          <summary>
            Запросить подтверждение <span>+</span>
          </summary>
          <form className="studio-form" onSubmit={create}>
            <div className="studio-row">
              <Field label="Кандидат">
                <select name="candidateId" required>
                  {base.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Навык">
                <input
                  name="skill"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Например, SQL"
                />
              </Field>
            </div>
            <Field label="Краткая задача">
              <input name="title" required minLength={3} maxLength={120} />
            </Field>
            <Field label="Материал, ожидаемый результат и критерий принятия">
              <textarea
                name="criteria"
                required
                minLength={20}
                maxLength={2000}
                rows={4}
                placeholder="На учебном примере объясните причину медленного запроса. Достаточно плана и одного исправления. Критерий: учтены индекс и объём выборки."
              />
            </Field>
            <div className="studio-row">
              <Field label="Ожидаемое время, минут">
                <input
                  name="estimatedMinutes"
                  type="number"
                  required
                  min={5}
                  max={45}
                  defaultValue={20}
                />
              </Field>
              <Field label="Ответ до">
                <input
                  name="dueAt"
                  type="datetime-local"
                  required
                  defaultValue={dateInput()}
                />
              </Field>
            </div>
            <p className="small-note">
              Используйте учебные или обезличенные материалы. Запрос не
              предназначен для бесплатного выполнения коммерческой работы.
            </p>
            <button className="button primary">Отправить запрос</button>
          </form>
        </details>
      )}
      {!state.requests.length ? (
        <Empty>
          Запросов пока нет. Здесь появятся критерии, ответы и обратная связь по
          каждому навыку.
        </Empty>
      ) : (
        state.requests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            employer={employer}
            candidate={base.candidates.find((c) => c.id === r.candidateId)}
            proofs={state.proofs.filter((p) => p.candidateId === r.candidateId)}
            call={call}
          />
        ))
      )}
    </>
  );
}
function RequestCard({
  request: r,
  employer,
  candidate,
  proofs,
  call,
}: {
  request: Verification;
  employer: boolean;
  candidate?: Candidate;
  proofs: Proof[];
  call: Call;
}) {
  const now = useClientNow();
  const expired = now !== null && Date.parse(r.dueAt) < now,
    open = ["requested", "submitted"].includes(r.state);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await call("requests/" + r.id, "PATCH", {
      revision: r.revision,
      action: employer ? "review" : "submit",
      ...(employer
        ? { feedback: field(f, "feedback"), decision: field(f, "decision") }
        : { response: field(f, "response"), proofId: field(f, "proofId") }),
    });
  }
  return (
    <article className="studio-surface request-card">
      <div className="studio-toolbar">
        <div>
          <span className="section-index">
            {r.skill} · {r.estimatedMinutes} МИН
          </span>
          <h3>{r.title}</h3>
          <p>
            {candidate?.fullName ?? "Профиль участника"} · до {stamp(r.dueAt)}
          </p>
        </div>
        <span className="match-status">
          {expired && open ? "Срок истёк" : requestStatus[r.state]}
        </span>
      </div>
      <p className="preserve-lines">{r.criteria}</p>
      {r.response && (
        <div className="response-block">
          <h4>Ответ кандидата</h4>
          <p className="preserve-lines">{r.response}</p>
        </div>
      )}
      {r.feedback && (
        <div className="response-block">
          <h4>
            {r.decision === "confirmed"
              ? "Работодатель принял подтверждение"
              : "Нужно уточнение"}
          </h4>
          <p className="preserve-lines">{r.feedback}</p>
          <small>
            Это мнение конкретного работодателя; общий грейд не изменён.
          </small>
        </div>
      )}
      {((!employer && open && !expired) ||
        (employer && r.state === "submitted")) && (
        <form className="studio-form" onSubmit={submit}>
          {employer ? (
            <>
              <Field label="Предметная обратная связь">
                <textarea
                  name="feedback"
                  minLength={20}
                  maxLength={2000}
                  required
                  rows={3}
                />
              </Field>
              <Field label="Решение">
                <select name="decision">
                  <option value="confirmed">Подтверждения достаточно</option>
                  <option value="more-evidence">Нужно уточнение</option>
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Ваш ответ">
                <textarea
                  name="response"
                  minLength={20}
                  maxLength={2000}
                  required
                  rows={3}
                  defaultValue={
                    r.response.split("\n\nПриложено кандидатом:")[0]
                  }
                />
              </Field>
              <Field label="Приложить подтверждение">
                <select name="proofId">
                  <option value="">Без вложения</option>
                  {proofs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="small-note">
                Выбранный артефакт будет передан этому работодателю вместе с
                ответом, включая его текст.
              </p>
            </>
          )}
          <button className="button primary">
            {employer ? "Отправить обратную связь" : "Отправить ответ"}
          </button>
        </form>
      )}
      {open && (employer || !expired) && (
        <button
          className="text-button"
          onClick={() =>
            void call("requests/" + r.id, "PATCH", {
              revision: r.revision,
              action: employer ? "cancel" : "decline",
            })
          }
        >
          {employer ? "Отменить запрос" : "Отказаться от проверки"}
        </button>
      )}
    </article>
  );
}

function Privacy({
  candidate: c,
  state,
  call,
  offers,
}: {
  candidate: Candidate;
  state: CareerState;
  call: Call;
  offers: Offer[];
}) {
  const [draft, setDraft] = useState<ProfileControls>(
      state.controls ?? { anonymous: false, rules: emptyRules },
    ),
    [recipient, setRecipient] = useState(state.recipients[0]?.id ?? "");
  const now = useClientNow();
  const active = state.grants.filter(
    (g) =>
      g.employerId === recipient &&
      !g.revoked &&
      now !== null &&
      Date.parse(g.expiresAt) > now,
  );
  const identity =
      !state.controls?.anonymous ||
      active.some((g) => g.fields.includes("identity")),
    artifacts =
      !state.controls?.anonymous ||
      active.some((g) => g.fields.includes("artifacts"));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const controls = {
      anonymous: draft.anonymous,
      rules: {
        minimumSalary: Number(f.get("minimumSalary")),
        formats: f.getAll("formats").map(String),
        coreHours: field(f, "coreHours"),
        onCall: field(f, "onCall"),
        interests: list(f.get("interests")),
        strict: f.get("strict") === "on",
      },
    };
    await call("controls", "PUT", {
      revision: state.candidateRevision,
      data: controls,
    });
  }
  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await call("grants", "POST", {
      id: crypto.randomUUID(),
      employerId: recipient,
      fields: f.getAll("fields"),
      expiresInDays: Number(f.get("days")),
    });
  }
  return (
    <>
      <Intro index="05" title="Вы определяете границы">
        Скрывайте личные сведения, задавайте условия входящих предложений и
        раскрывайте артефакты выбранной компании на ограниченный срок.
      </Intro>
      <div className="studio-split">
        <form
          className="studio-form studio-surface"
          onSubmit={save}
          key={state.candidateRevision}
        >
          <h3>Правила профиля</h3>
          <label className="checkline">
            <input
              type="checkbox"
              checked={draft.anonymous}
              onChange={(e) =>
                setDraft((d) => ({ ...d, anonymous: e.target.checked }))
              }
            />
            Обезличить профиль для работодателей
          </label>
          <p className="small-note">
            Имя, город, описание и спортивные записи скрываются. Узкая
            комбинация опыта и навыков всё ещё может сделать человека
            узнаваемым.
          </p>
          <Field label="Предложения от, ₽ до налогов">
            <input
              name="minimumSalary"
              type="number"
              min={0}
              max={2000000}
              required
              defaultValue={state.controls?.rules.minimumSalary ?? 0}
            />
          </Field>
          <div>
            <span className="field-title">Подходящие форматы</span>
            <div className="studio-actions">
              {formats.map((x) => (
                <label className="checkline" key={x}>
                  <input
                    type="checkbox"
                    name="formats"
                    value={x}
                    defaultChecked={state.controls?.rules.formats.includes(x)}
                  />
                  {x}
                </label>
              ))}
            </div>
          </div>
          <Field
            label="Общие рабочие часы и часовой пояс"
            hint="В строгом режиме требуется точное совпадение записи часов."
          >
            <input
              name="coreHours"
              maxLength={100}
              defaultValue={state.controls?.rules.coreHours ?? ""}
            />
          </Field>
          <Field label="Дежурства">
            <select
              name="onCall"
              defaultValue={state.controls?.rules.onCall ?? "discuss"}
            >
              <option value="discuss">Обсуждаются</option>
              <option value="no">Не рассматриваю</option>
              <option value="yes">Готов рассмотреть</option>
            </select>
          </Field>
          <Field label="Интересующие задачи / области">
            <input
              name="interests"
              maxLength={1000}
              defaultValue={state.controls?.rules.interests.join(", ") ?? ""}
            />
          </Field>
          <label className="checkline">
            <input
              name="strict"
              type="checkbox"
              defaultChecked={state.controls?.rules.strict}
            />
            Строго проверять условия перед отправкой предложения
          </label>
          <button className="button primary">Сохранить правила</button>
        </form>
        <div>
          <div className="visibility-preview">
            <span className="section-index">
              ПРЕДПРОСМОТР СОХРАНЁННЫХ ПРАВИЛ
            </span>
            <h3>{identity ? c.fullName : "Специалист " + c.id.slice(-6)}</h3>
            <p>
              {c.role} · {c.grade} · {salary(c.salaryMin, c.salaryMax)}
            </p>
            <ul>
              <li>
                {identity
                  ? "Имя и описание доступны"
                  : "Имя, город и описание скрыты"}
              </li>
              <li>
                {artifacts
                  ? "Опубликованные артефакты доступны"
                  : "Артефакты скрыты"}
              </li>
              <li>
                Категория и заявленные навыки доступны при публикации профиля
              </li>
              <li>
                Контакт — только компании с принятым приглашением и действующим
                согласием на обработку
              </li>
            </ul>
            <small>
              Показаны правила для выбранной ниже компании. Публикацией и
              согласием на обработку вы управляете в основном профиле.
            </small>
          </div>
          <form className="studio-form studio-surface" onSubmit={grant}>
            <h3>Адресное раскрытие</h3>
            <Field label="Компания">
              <select
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
              >
                {state.recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="checkline">
              <input
                name="fields"
                type="checkbox"
                value="identity"
                defaultChecked
              />
              Имя, описание и разрешённые спортивные записи
            </label>
            <label className="checkline">
              <input
                name="fields"
                type="checkbox"
                value="artifacts"
                defaultChecked
              />
              Опубликованные артефакты
            </label>
            <Field label="На сколько дней">
              <input
                name="days"
                type="number"
                min={1}
                max={30}
                required
                defaultValue={7}
              />
            </Field>
            <button className="button secondary" disabled={!recipient}>
              Предоставить доступ
            </button>
            <small>
              Разрешение не раскрывает контакт и не обходит отключённую
              публикацию профиля.
            </small>
          </form>
        </div>
      </div>
      <div className="studio-duo">
        <section className="studio-surface">
          <h3>Выданные разрешения</h3>
          {state.grants.length ? (
            state.grants.map((g) => (
              <div className="grant-row" key={g.id}>
                <div>
                  <b>{g.recipientName}</b>
                  <p>
                    {g.fields
                      .map((f) =>
                        f === "identity" ? "Личные сведения" : "Артефакты",
                      )
                      .join(" + ")}{" "}
                    · до {stamp(g.expiresAt)}
                  </p>
                </div>
                {g.revoked ||
                (now !== null && Date.parse(g.expiresAt) <= now) ? (
                  <span className="small-note">
                    {g.revoked ? "Отозвано" : "Истекло"}
                  </span>
                ) : (
                  <button
                    className="text-button"
                    onClick={() =>
                      void call("grants/" + g.id, "PATCH", {
                        revision: g.revision,
                      })
                    }
                  >
                    Отозвать
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>Адресных разрешений пока нет.</p>
          )}
          <small>
            Отзыв закрывает последующие просмотры через сервис; уже полученные
            копии удалить у получателя невозможно.
          </small>
        </section>
        <section className="studio-surface">
          <h3>Зарегистрированные открытия паспорта</h3>
          {state.views.length ? (
            state.views.map((v) => (
              <div className="grant-row" key={v.id}>
                <b>{v.employer}</b>
                <time>{stamp(v.at)}</time>
              </div>
            ))
          ) : (
            <p>Открытий через этот раздел пока не зарегистрировано.</p>
          )}
          <small>
            Учитывается не более одного открытия компанией в день. Это история
            действий интерфейса, не полный журнал чтений через API. Принятых
            предложений: {offers.filter((o) => o.status === "accepted").length}.
          </small>
        </section>
      </div>
    </>
  );
}

/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */
function Dialogues({
  base,
  state,
  call,
  initialOfferId,
}: {
  base: AppState;
  state: CareerState;
  call: Call;
  initialOfferId?: string | null;
}) {
  const [selected, setSelected] = useState(
      initialOfferId ?? base.offers[0]?.id ?? "",
    ),
    [compare, setCompare] = useState<string[]>([]),
    [differences, setDifferences] = useState(true);
  const offer = base.offers.find((o) => o.id === selected) ?? base.offers[0],
    dialogue = state.dialogues.find((d) => d.offerId === offer?.id),
    employer = base.session.role === "employer";
  const options = base.offers.filter((o) =>
    state.dialogues.some((d) => d.offerId === o.id),
  );
  const compared = options.filter((o) => compare.includes(o.id));
  const rows: [keyof Terms, string][] = [
    ["salaryMin", "Зарплата от, ₽"],
    ["salaryMax", "Зарплата до, ₽"],
    ["workFormat", "Формат"],
    ["coreHours", "Общие часы"],
    ["onCall", "Дежурства"],
    ["firstMonths", "Первые 90 дней"],
    ["interviewSteps", "Этапы"],
    ["reviewProcess", "Пересмотр зарплаты"],
    ["mentoring", "Наставничество"],
  ];
  const initial: Partial<Terms> = dialogue?.terms ?? {
    salaryMin: offer?.salaryMin,
    salaryMax: offer?.salaryMax,
    workFormat: offer?.workFormat ?? "Удалённо",
    coreHours: offer?.coreHours ?? "",
    onCall: offer?.onCall ?? "discuss",
    firstMonths: offer?.message,
  };
  async function begin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (offer)
      await call("dialogues/" + offer.id, "POST", {
        terms: readTerms(new FormData(e.currentTarget)),
      });
  }
  return (
    <>
      <Intro index="06" title="Условия, о которых договорились">
        Зарплата, задачи, часы и этапы отбора собраны в одном месте. Встречное
        предложение сохраняет историю; окончательное принятие всегда остаётся за
        кандидатом.
      </Intro>
      {!offer ? (
        <Empty>
          Сначала отправьте приглашение из каталога. Здесь появятся переговоры
          по нему.
        </Empty>
      ) : (
        <>
          <Field label="Предложение">
            <select
              value={offer.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {base.offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.company} · {o.jobTitle} ·{" "}
                  {base.candidates.find((c) => c.id === o.candidateId)
                    ?.fullName ?? "Кандидат"}
                </option>
              ))}
            </select>
          </Field>
          <div className="offer-overview">
            <span className="section-index">{offer.company}</span>
            <h3>{offer.jobTitle}</h3>
            <p>
              {salary(offer.salaryMin, offer.salaryMax)} ·{" "}
              {offer.status === "pending"
                ? "Ожидает решения"
                : offer.status === "accepted"
                  ? "Принято"
                  : offer.status === "declined"
                    ? "Отклонено"
                    : "Отозвано"}
            </p>
          </div>
          {dialogue ? (
            <DialoguePanel
              key={dialogue.id}
              dialogue={dialogue}
              offer={offer}
              role={base.session.role}
              call={call}
            />
          ) : employer && offer.status === "pending" ? (
            <form className="studio-form studio-surface" onSubmit={begin}>
              <h3>Раскройте условия для переговоров</h3>
              <TermsFields initial={initial} />
              <button className="button primary">
                Открыть согласование условий
              </button>
            </form>
          ) : (
            <Empty>
              {offer.status === "pending"
                ? "Работодатель ещё не добавил подробные условия. Приглашение доступно в разделе «Предложения»."
                : "По этому приглашению согласование не открывалось."}
            </Empty>
          )}
        </>
      )}
      {options.length >= 2 && (
        <section className="section-space">
          <div className="studio-toolbar">
            <h3>Сравнить предложения</h3>
            <label className="checkline">
              <input
                type="checkbox"
                checked={differences}
                onChange={(e) => setDifferences(e.target.checked)}
              />
              Только различия
            </label>
          </div>
          <div className="skill-cloud">
            {options.map((o) => (
              <button
                key={o.id}
                aria-pressed={compare.includes(o.id)}
                className={compare.includes(o.id) ? "selected" : ""}
                onClick={() =>
                  setCompare((ids) =>
                    ids.includes(o.id)
                      ? ids.filter((id) => id !== o.id)
                      : ids.length < 3
                        ? [...ids, o.id]
                        : ids,
                  )
                }
              >
                {o.company} · {o.jobTitle}
              </button>
            ))}
          </div>
          {compared.length >= 2 ? (
            <div className="table-scroll">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th>Условие</th>
                    {compared.map((o) => (
                      <th key={o.id}>
                        {o.company}
                        <small>{o.jobTitle}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter(
                      ([key]) =>
                        !differences ||
                        new Set(
                          compared.map(
                            (o) =>
                              state.dialogues.find((d) => d.offerId === o.id)!
                                .terms[key],
                          ),
                        ).size > 1,
                    )
                    .map(([key, label]) => (
                      <tr key={key}>
                        <th>{label}</th>
                        {compared.map((o) => (
                          <td key={o.id}>
                            {key === "onCall"
                              ? callName(
                                  state.dialogues.find(
                                    (d) => d.offerId === o.id,
                                  )!.terms[key],
                                )
                              : String(
                                  state.dialogues.find(
                                    (d) => d.offerId === o.id,
                                  )!.terms[key] || "Не указано",
                                )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small-note">Выберите два или три предложения.</p>
          )}
        </section>
      )}
    </>
  );
}
function DialoguePanel({
  dialogue: d,
  offer,
  role,
  call,
}: {
  dialogue: Dialogue;
  offer: Offer;
  role: "candidate" | "employer";
  call: Call;
}) {
  const now = useClientNow();
  const [counter, setCounter] = useState(false),
    turn = d.turn === role && offer.status === "pending";
  async function propose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await call("dialogues/" + d.id, "PATCH", {
        revision: d.revision,
        action: "propose",
        terms: readTerms(f),
        note: field(f, "note"),
      })
    )
      setCounter(false);
  }
  async function message(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      action = field(f, "action");
    if (
      await call("dialogues/" + d.id, "PATCH", {
        revision: d.revision,
        action,
        note: field(f, "note"),
        ...(action === "step"
          ? { dueAt: new Date(field(f, "dueAt")).toISOString() }
          : {}),
      })
    )
      form.reset();
  }
  return (
    <div className="studio-split dialogue-layout">
      <div>
        <div className="terms-sheet">
          <span className="section-index">
            ВЕРСИЯ {d.versions.length} /{" "}
            {d.agreed
              ? "СОГЛАСОВАНО"
              : offer.status === "pending"
                ? "ОТВЕТ " +
                  (d.turn === "candidate" ? "КАНДИДАТА" : "РАБОТОДАТЕЛЯ")
                : "ПРЕДЛОЖЕНИЕ ЗАКРЫТО"}
          </span>
          <h3>
            {salary(d.terms.salaryMin, d.terms.salaryMax)}
            <small>в месяц, до вычета налогов</small>
          </h3>
          <dl>
            <div>
              <dt>Формат</dt>
              <dd>{d.terms.workFormat}</dd>
            </div>
            <div>
              <dt>Общие часы</dt>
              <dd>{d.terms.coreHours || "Не указаны"}</dd>
            </div>
            <div>
              <dt>Дежурства</dt>
              <dd>{callName(d.terms.onCall)}</dd>
            </div>
            {(
              [
                ["firstMonths", "Первые 90 дней"],
                ["interviewSteps", "Этапы"],
                ["reviewProcess", "Пересмотр зарплаты"],
                ["mentoring", "Наставничество"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{d.terms[key] || "Не указано"}</dd>
              </div>
            ))}
          </dl>
          {turn && (
            <div className="studio-actions">
              <button
                className="button primary"
                onClick={() =>
                  void call("dialogues/" + d.id, "PATCH", {
                    revision: d.revision,
                    action: "agree",
                  })
                }
              >
                {role === "candidate"
                  ? "Принять условия и открыть контакт"
                  : "Согласовать встречные условия"}
              </button>
              <button
                className="button secondary"
                onClick={() => setCounter(!counter)}
              >
                Предложить изменения
              </button>
            </div>
          )}
          {offer.status === "accepted" && (
            <p className="success-note">
              <Check size={17} />
              Кандидат принял предложение. Контакт доступен компании при
              действующем согласии на обработку.
            </p>
          )}
        </div>
        {counter && turn && (
          <form
            className="studio-form studio-surface"
            onSubmit={propose}
            key={d.revision}
          >
            <h3>Встречные условия</h3>
            <TermsFields initial={d.terms} />
            <Field label="Что меняете и почему">
              <textarea
                name="note"
                minLength={10}
                maxLength={2000}
                required
                rows={3}
              />
            </Field>
            <button className="button primary">
              Отправить встречные условия
            </button>
          </form>
        )}
        <details className="studio-editor">
          <summary>
            История условий <span>{d.versions.length}</span>
          </summary>
          <div className="version-history">
            {[...d.versions].reverse().map((v, i, vs) => {
              const prev = vs[i + 1]?.terms;
              const changed = prev
                ? Object.keys(v.terms).filter(
                    (k) => v.terms[k as keyof Terms] !== prev[k as keyof Terms],
                  )
                : [];
              return (
                <article key={v.version}>
                  <b>
                    v{v.version} ·{" "}
                    {v.by === "candidate" ? "Кандидат" : "Работодатель"}
                  </b>
                  <time>{stamp(v.at)}</time>
                  <p>{v.note}</p>
                  <p>
                    {salary(v.terms.salaryMin, v.terms.salaryMax)} ·{" "}
                    {v.terms.workFormat} ·{" "}
                    {v.terms.coreHours || "Часы не указаны"}
                  </p>
                  <details>
                    <summary>
                      {prev
                        ? `Изменено полей: ${changed.length}`
                        : "Полные условия"}
                    </summary>
                    <dl>
                      {Object.entries(v.terms).map(([k, value]) => (
                        <div key={k}>
                          <dt>
                            {
                              {
                                salaryMin: "Зарплата от",
                                salaryMax: "Зарплата до",
                                workFormat: "Формат",
                                coreHours: "Часы",
                                onCall: "Дежурства",
                                firstMonths: "90 дней",
                                interviewSteps: "Этапы",
                                reviewProcess: "Пересмотр",
                                mentoring: "Наставничество",
                              }[k]
                            }
                          </dt>
                          <dd
                            className={
                              changed.includes(k) ? "changed-value" : ""
                            }
                          >
                            {k === "onCall"
                              ? callName(String(value))
                              : String(value) || "Не указано"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </article>
              );
            })}
          </div>
        </details>
      </div>
      <div className="shared-timeline">
        <h3>Общая история общения</h3>
        <p className="small-note">
          Эти сообщения видят обе стороны. Личные заметки работодателя остаются
          в подборке.
        </p>
        {d.events.length ? (
          d.events.map((e) => (
            <article key={e.id}>
              <span className="section-index">
                {e.by === "candidate" ? "КАНДИДАТ" : "РАБОТОДАТЕЛЬ"} /{" "}
                {stamp(e.at)}
              </span>
              <b>
                {e.kind === "step"
                  ? "Следующий шаг"
                  : e.kind === "feedback"
                    ? "Обратная связь"
                    : e.kind === "agreement"
                      ? "Согласование"
                      : "Сообщение"}
              </b>
              <p className="preserve-lines">{e.text}</p>
              {e.dueAt && (
                <time
                  className={
                    now !== null && Date.parse(e.dueAt) < now ? "overdue" : ""
                  }
                >
                  Срок: {stamp(e.dueAt)}
                </time>
              )}
            </article>
          ))
        ) : (
          <p>Сообщений пока нет.</p>
        )}
        <form className="studio-form" onSubmit={message}>
          <Field label="Тип записи">
            <select name="action">
              <option value="message">Сообщение</option>
              <option value="step">Следующий шаг</option>
              {role === "employer" && (
                <option value="feedback">Обратная связь</option>
              )}
            </select>
          </Field>
          <Field label="Текст">
            <textarea
              name="note"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
            />
          </Field>
          <Field label="Срок следующего шага">
            <input
              name="dueAt"
              type="datetime-local"
              defaultValue={dateInput()}
            />
          </Field>
          <button className="button secondary">Добавить в общую историю</button>
        </form>
      </div>
    </div>
  );
}

function TeamMap({ base, state }: { base: AppState; state: CareerState }) {
  const [briefId, setBriefId] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    b = state.briefs.find((x) => x.id === briefId) ?? state.briefs[0];
  const chosen = base.candidates.filter((c) => ids.includes(c.id));
  const needs = b ? uniqueSkills([...b.mandatory, ...b.desirable]) : [];
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  return (
    <>
      <Intro index="07" title="Команда вокруг задачи">
        Посмотрите, какие требования уже закрывает команда и что добавит
        выбранный специалист. Карта описывает навыки, не психологическую
        совместимость.
      </Intro>
      {!b ? (
        <Empty>
          Сначала сохраните потребность в разделе «Задачи и подбор».
        </Empty>
      ) : (
        <>
          <Field label="Задача команды">
            <select value={b.id} onChange={(e) => setBriefId(e.target.value)}>
              {state.briefs.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </Field>
          <p className="small-note">
            Выберите до четырёх профилей. Основание каждого совпадения показано
            в ячейке.
          </p>
          <div className="skill-cloud">
            {base.candidates.map((c) => (
              <button
                key={c.id}
                className={ids.includes(c.id) ? "selected" : ""}
                aria-pressed={ids.includes(c.id)}
                onClick={() =>
                  setIds((ids) =>
                    ids.includes(c.id)
                      ? ids.filter((id) => id !== c.id)
                      : ids.length < 4
                        ? [...ids, c.id]
                        : ids,
                  )
                }
              >
                {c.fullName}
              </button>
            ))}
          </div>
          <div className="table-scroll">
            <table className="studio-table coverage-table">
              <thead>
                <tr>
                  <th>Требование</th>
                  <th>Текущая команда</th>
                  {chosen.map((c) => (
                    <th key={c.id}>{c.fullName}</th>
                  ))}
                  <th>Оставшийся пробел</th>
                </tr>
              </thead>
              <tbody>
                {needs.map((skill) => {
                  const covered = b.coveredSkills.some(
                    (s) => normalizeSkill(s) === normalizeSkill(skill),
                  );
                  const found = chosen.map((c) => ({
                    c,
                    declared: c.skills.some(
                      (s) => normalizeSkill(s) === normalizeSkill(skill),
                    ),
                    proof: state.proofs.some(
                      (p) =>
                        p.candidateId === c.id &&
                        normalizeSkill(p.skill) === normalizeSkill(skill) &&
                        p.status === "evaluated" &&
                        !p.synthetic &&
                        (p.kind !== "case" || p.score === 100),
                    ),
                  }));
                  return (
                    <tr key={skill}>
                      <th>
                        {skill}
                        {b.mandatory.includes(skill) && (
                          <small>Обязательно</small>
                        )}
                      </th>
                      <td>{covered ? "◐ Заявлено командой" : "—"}</td>
                      {found.map((f) => (
                        <td key={f.c.id} data-covered={f.declared || f.proof}>
                          {f.proof
                            ? "✓ Есть проверка"
                            : f.declared
                              ? "◐ Заявлено"
                              : "—"}
                        </td>
                      ))}
                      <td>
                        {covered || found.some((f) => f.declared || f.proof)
                          ? "Уточнить глубину и вклад"
                          : "Нужно покрытие"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="method-strip">
            <Users />
            <p>
              Самоописание помогает увидеть распределение навыков. Для решения о
              найме проверяйте глубину опыта и доступность человека; числового
              «индекса совместимости» здесь нет.
            </p>
          </div>
        </>
      )}
    </>
  );
}
function Sandbox({
  mode,
  call,
  onIntegration,
}: {
  mode: string;
  call: Call;
  onIntegration: () => void;
}) {
  const [result, setResult] = useState<{
    status: string;
    records: number;
    message: string;
    at: string;
  } | null>(null);
  return (
    <>
      <Intro
        index="08"
        title="Источник может ошибаться. Система должна выдержать."
      >
        Проиграйте типовые ответы реестра ФСП и посмотрите ожидаемую реакцию
        сервиса.
      </Intro>
      <div className="method-strip">
        <FlaskConical />
        <p>
          Локальные сценарии с синтетическими ответами. Сеть не вызывается,
          записи профиля не меняются. Настоящий контракт и проверка
          принадлежности ID потребуются для реального импорта.
        </p>
      </div>
      <div className="sandbox-grid">
        {(
          [
            [
              "success",
              "Корректный ответ",
              "Структура заполнена; две записи доступны для проверки.",
            ],
            [
              "timeout",
              "Источник недоступен",
              "Таймаут не должен обнулять сохранённые достижения.",
            ],
            [
              "partial",
              "Неполная запись",
              "Обязательная дисциплина отсутствует.",
            ],
            [
              "changed",
              "Изменённый результат",
              "Источник пересмотрел место участника.",
            ],
          ] as const
        ).map(([id, title, desc], i) => (
          <button
            key={id}
            className="lab-card"
            disabled={mode !== "demo"}
            onClick={async () => {
              const r = await call("sandbox", "POST", { scenario: id }, false);
              if (r) setResult(r as typeof result);
            }}
          >
            <span className="section-index">SCENARIO 0{i + 1}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
            <footer>
              Проиграть <ArrowUpRight />
            </footer>
          </button>
        ))}
      </div>
      {mode !== "demo" && (
        <p className="small-note">Сценарии доступны в демопространстве.</p>
      )}
      {result && (
        <div className="sandbox-result" role="status">
          <span className="section-index">
            СИНТЕТИЧЕСКИЙ ОТВЕТ / {stamp(result.at)}
          </span>
          <h3>{result.message}</h3>
          <p>
            Статус: {result.status} · записей в сценарии: {result.records} ·
            импортировано: 0
          </p>
        </div>
      )}
      <button className="button secondary" onClick={onIntegration}>
        Перейти к API и настройкам подключения <ArrowUpRight size={16} />
      </button>
    </>
  );
}
function TextAssistant({
  employer,
  candidate,
  state,
  call,
  onBrief,
}: {
  employer: boolean;
  candidate?: Candidate;
  state: CareerState;
  call: Call;
  onBrief: (draft: Partial<Brief>) => void;
}) {
  const [result, setResult] = useState<{
      skills: string[];
      role: Role;
      workFormat: string;
      outcomes: string[];
      warnings: string[];
    } | null>(null),
    [source, setSource] = useState("");
  async function parse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await call(
      "parse",
      "POST",
      { kind: employer ? "brief" : "resume", text: source },
      false,
    );
    if (r) setResult(r as typeof result);
  }
  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (employer)
      onBrief({
        title: field(f, "title"),
        role: field(f, "role") as Role,
        grade: field(f, "grade") as Grade,
        mandatory: list(f.get("skills")),
        outcomes: lines(f.get("outcomes")),
        workFormat: field(f, "workFormat"),
      });
    else
      await call("resume-import", "POST", {
        revision: state.candidateRevision,
        skills: list(f.get("skills")),
        bio: field(f, "bio"),
      });
  }
  return (
    <>
      <Intro index="09" title="Из текста — в понятную структуру">
        Вставьте{" "}
        {employer ? "описание задач или вакансию" : "описание опыта из резюме"}.
        Сервис предложит черновик; вы проверите и отредактируете поля перед
        сохранением.
      </Intro>
      <div className="method-strip">
        <ScanText />
        <p>
          Работает по встроенному словарю и правилам. Не проверяет
          правдивость текста и не присваивает грейд. Проверьте черновик
          перед сохранением.
        </p>
      </div>
      <div className="studio-duo">
        <form className="studio-form studio-surface" onSubmit={parse}>
          <Field label={employer ? "Исходное описание" : "Текст вашего резюме"}>
            <textarea
              minLength={20}
              maxLength={12000}
              rows={13}
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={
                employer
                  ? "Нужен Backend-разработчик. Python, FastAPI, PostgreSQL. Удалённо. В первые три месяца…"
                  : "Разрабатываю на React и TypeScript. В проекте отвечал за…"
              }
            />
          </Field>
          <button className="button primary">Разобрать текст</button>
        </form>
        {result ? (
          <form
            className="studio-form studio-surface"
            onSubmit={apply}
            key={JSON.stringify(result)}
          >
            <h3>Проверьте черновик</h3>
            <Field
              label="Навыки через запятую"
              hint="До 20 навыков, не более 50 символов каждый"
            >
              <input
                name="skills"
                maxLength={1800}
                defaultValue={result.skills.join(", ")}
              />
            </Field>
            {employer ? (
              <>
                <Field label="Название потребности">
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={100}
                    defaultValue={"Специалист " + result.role}
                  />
                </Field>
                <Field label="Специализация">
                  <select name="role" defaultValue={result.role}>
                    {roles.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Подтверждённый грейд"
                  hint="Выберите требуемый уровень; разбор текста не присваивает его кандидату."
                >
                  <select name="grade" required defaultValue="">
                    <option value="">Выберите грейд</option>
                    {grades.map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Формат">
                  <select name="workFormat" defaultValue={result.workFormat}>
                    {formats.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ожидаемые результаты — каждый с новой строки">
                  <textarea
                    name="outcomes"
                    required
                    rows={4}
                    defaultValue={result.outcomes.join("\n")}
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Описание опыта"
                hint="Заменит описание и список заявленных навыков вашего профиля после подтверждения."
              >
                <textarea
                  name="bio"
                  required
                  minLength={20}
                  maxLength={2000}
                  rows={6}
                  defaultValue={source.slice(0, 2000) || candidate?.bio}
                />
              </Field>
            )}
            <p className="small-note">{result.warnings.join(" ")}</p>
            <button className="button primary">
              {employer
                ? "Перенести в форму потребности"
                : "Подтверждаю: сохранить самоописание"}
            </button>
          </form>
        ) : (
          <Empty>
            Справа появятся распознанные поля. Исходный текст рассматривается
            как данные, а не команды сервису.
          </Empty>
        )}
      </div>
    </>
  );
}
function Guide({
  employer,
  mode,
  go,
  navigate,
}: {
  employer: boolean;
  mode: string;
  go: (s: Section) => void;
  navigate: (view: string) => void;
}) {
  const steps = employer
    ? [
        {
          title: "Сформулируйте задачу",
          text: "Опишите первые 90 дней и разделите требования. Ослабьте один фильтр и сравните состав выборки.",
          section: "briefs",
        },
        {
          title: "Посмотрите на основания",
          text: "Откройте паспорт специалиста. Различите самоописание, пилотную проверку и синтетический результат ФСП.",
          section: "passport",
        },
        {
          title: "Уточните один пробел",
          text: "Отправьте короткий запрос с ясным критерием. В демо переключитесь на кандидата и ответьте.",
          section: "requests",
        },
        {
          title: "Договоритесь об условиях",
          text: "Создайте приглашение из каталога, затем откройте согласование. Проверьте встречное предложение и историю.",
          section: "dialogues",
        },
        {
          title: "Испытайте отказ источника",
          text: "Проиграйте таймаут и неполный ответ. Песочница покажет ожидаемую реакцию без изменения профилей.",
          section: "sandbox",
        },
      ]
    : [
        {
          title: "Соберите паспорт",
          text: "Добавьте описание собственного вклада и артефакт проекта.",
          section: "passport",
        },
        {
          title: "Покажите способ мышления",
          text: "Разберите инженерный кейс, сохраните исправления и поясните риски.",
          section: "lab",
        },
        {
          title: "Задайте границы",
          text: "Включите обезличивание, укажите правила приглашений и срок адресного доступа.",
          section: "privacy",
        },
        {
          title: "Обсудите предложение",
          text: "Сравните условия, отправьте встречный вариант и примите итоговый только по своему решению.",
          section: "dialogues",
        },
      ];
  return (
    <>
      <Intro index="10" title="Маршрут от первого факта до решения">
        Это навигация по рабочим функциям. Шаги не подменяются постановочными
        результатами и не выполняют действия за вас.
      </Intro>
      <div className="guide-route">
        {steps.map((s, i) => (
          <button key={s.section} onClick={() => go(s.section as Section)}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
            <ArrowUpRight />
          </button>
        ))}
      </div>
      <div className="method-strip">
        <ShieldCheck />
        <p>
          {mode === "demo"
            ? "Вы в личной демопесочнице. Профили и соревнования вымышлены; обе стороны можно проверить через переключение демороли."
            : "Вы в рабочем режиме. Роль закреплена за аккаунтом; данные доступны только участникам взаимодействия."}
        </p>
      </div>
      <button
        className="button secondary"
        onClick={() => navigate(employer ? "catalog" : "profile")}
      >
        Вернуться к {employer ? "каталогу" : "профилю"}
      </button>
    </>
  );
}
