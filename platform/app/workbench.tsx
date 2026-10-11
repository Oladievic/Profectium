/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

"use client";
import { AssistantConnection } from "./assistant-connection";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useClientNow } from "./use-client-now";
import {
  KeyRound,
  ShieldCheck,
  BarChart3,
  BookOpen,
  Check,
  Copy,
  Plug,
  Mail,
  ClipboardList,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, Picker, EmptyState } from "./ui";
import type { AppState, Candidate, Job, HiringNote } from "@/lib/types";
import {
  evidencePoints,
  matchCandidate,
  rankingScore,
  salary,
} from "@/lib/domain";
import type { Mutation } from "./assessment";
import { toast } from "sonner";
const date = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
export function WorkHeading({
  title,
  description,
  kicker,
}: {
  title: string;
  description: string;
  kicker: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{kicker}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
type MemberInfo = {
  full_name: string;
  email: string;
  role: "candidate" | "employer";
  verified_at: string;
};
type AccountInfo = {
  member: MemberInfo | null;
  emailDeliveryConfigured: boolean;
  publicAuth?: boolean;
  guest?: boolean;
  emailVerificationRequired?: boolean;
};
type ChallengeInfo = { challengeId: string; email: string; expiresAt: string };
type AccountPost = {
  error?: string;
  member?: MemberInfo;
  challengeId?: string;
  email?: string;
  expiresAt?: string;
};
export function AccountPanel() {
  const [info, setInfo] = useState<AccountInfo | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [role, setRole] = useState("candidate"),
    [consent, setConsent] = useState(false),
    [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const next = (await response.json()) as AccountInfo & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(next.error ?? "Не удалось загрузить аккаунт");
        if (!controller.signal.aborted) setInfo(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить аккаунт",
          );
      });
    return () => controller.abort();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const body = challenge
        ? {
            action: "verify",
            challengeId: challenge.challengeId,
            code: f.get("code"),
          }
        : {
            action: "request",
            email: f.get("email"),
            role,
            fullName: f.get("fullName"),
            processing: consent,
          };
      const r = await fetch("/api/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = (await r.json()) as AccountPost;
      if (!r.ok) throw new Error(j.error ?? "Не удалось выполнить действие");
      if (challenge) {
        if (!j.member)
          throw new Error("Сервер не вернул подтверждённый аккаунт");
        setInfo({ member: j.member, emailDeliveryConfigured: true });
        setChallenge(null);
      } else {
        if (!j.challengeId || !j.email || !j.expiresAt)
          throw new Error("Сервер не вернул параметры подтверждения");
        setChallenge({
          challengeId: j.challengeId,
          email: j.email,
          expiresAt: j.expiresAt,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/auth/logout", { method: "POST" });
      if (!result.ok) throw new Error("Не удалось выйти. Попробуйте снова.");
      window.location.assign(new URL("/signin", window.location.origin).href);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось выйти.");
      setBusy(false);
    }
  }
  return (
    <>
      <WorkHeading
        kicker="PROFECTIUM / АККАУНТ"
        title="Два режима. Чёткие границы"
        description="В демо можно попробовать обе стороны. Рабочий аккаунт закрепляет одну роль и объединяет участников в общем каталоге."
      />
      <div className="workbench-grid">
        <section className="assessment-card">
          <h2>
            <ShieldCheck size={22} /> Рабочий аккаунт
          </h2>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {info?.member ? (
            <>
              <div className="status-pill">
                <Check size={15} />
                {info.publicAuth ? "Аккаунт готов к работе" : "Email подтверждён"}
              </div>
              <h3>{info.member.full_name}</h3>
              <p>{info.member.email}</p>
              <p>
                Роль:{" "}
                {info.member.role === "employer"
                  ? "Работодатель"
                  : "Соискатель"}{" "}
                {info.member.verified_at ? ` · ${date(info.member.verified_at)}` : " · Без подтверждения почты"}
              </p>
              <Link
                prefetch={false}
                className="button primary"
                href="/?mode=live"
                onNavigate={(event) => {
                  event.preventDefault();
                  window.location.assign(
                    new URL("/?mode=live", window.location.origin).href,
                  );
                }}
              >
                Открыть рабочее пространство
              </Link>
              {info.publicAuth && <button type="button" className="button secondary" disabled={busy} onClick={() => void signOut()}>Выйти из аккаунта</button>}
            </>
          ) : info?.publicAuth ? (
            <>
              <div className="status-pill"><Check size={15} />Гостевое демопространство</div>
              <p>Тестовая организация и все демонстрационные данные доступны. Можно переключать роли и пробовать основные сценарии.</p>
              <p>Создайте аккаунт, чтобы публиковать свой профиль, создавать вакансии и взаимодействовать с другими участниками. Можно использовать вымышленные данные; подтверждать почту не нужно.</p>
              <a className="button primary" href="/signin?mode=register">Создать аккаунт</a>
              <button type="button" className="button secondary" disabled={busy} onClick={() => void signOut()}>Выйти из демо</button>
            </>
          ) : info ? (
            <>
              <p>
                Сначала вход в аккаунт, затем проверка владения email. Роль
                рабочего аккаунта не меняется демопереключателем.
              </p>
              {!info.emailDeliveryConfigured ? (
                <div className="connection-status">
                  <Mail />
                  <div>
                    <strong>Нужен почтовый провайдер</strong>
                    <p>
                      Механизм одноразового кода реализован. Для доставки
                      администратор должен подключить API почты и
                      подтверждённого отправителя. До этого рабочая регистрация
                      недоступна.
                    </p>
                  </div>
                </div>
              ) : (
                <form className="form-grid" onSubmit={submit}>
                  {challenge ? (
                    <>
                      <p>
                        Код отправлен на {challenge.email}. Срок действия — до{" "}
                        {date(challenge.expiresAt)}.
                      </p>
                      <Field label="Код из письма">
                        <input
                          name="code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          placeholder="6 цифр"
                        />
                      </Field>
                      <button className="button primary" disabled={busy}>
                        Подтвердить email
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setChallenge(null)}
                      >
                        Изменить адрес / запросить новый код
                      </button>
                    </>
                  ) : (
                    <>
                      <Field label="Имя или название команды">
                        <input
                          name="fullName"
                          required
                          minLength={3}
                          maxLength={80}
                        />
                      </Field>
                      <Field label="Email">
                        <input
                          name="email"
                          type="email"
                          required
                          maxLength={150}
                        />
                      </Field>
                      <Field label="Ваша роль">
                        <Picker
                          label="Роль рабочего аккаунта"
                          value={role}
                          onChange={setRole}
                          options={[
                            { value: "candidate", label: "Соискатель" },
                            { value: "employer", label: "Работодатель" },
                          ]}
                        />
                      </Field>
                      <label className="check-row">
                        <Checkbox
                          checked={consent}
                          onCheckedChange={(v) => setConsent(v === true)}
                        />
                        <span>
                          Согласен на обработку данных для создания аккаунта и
                          отправку письма с кодом
                        </span>
                      </label>
                      <button
                        className="button primary"
                        disabled={busy || !consent}
                      >
                        Получить код
                      </button>
                    </>
                  )}
                </form>
              )}
            </>
          ) : (
            <p>Загружаем статус аккаунта…</p>
          )}
        </section>
        <aside className="assessment-card">
          <h2>Демопространство</h2>
          <p>
            12 синтетических профилей, вымышленные соревнования, вакансии и
            свободное переключение ролей. Действия сохраняются отдельно для
            вашего входа.
          </p>
          <Link
            prefetch={false}
            className="button secondary"
            href="/?mode=demo&view=catalog"
            onNavigate={(event) => {
              event.preventDefault();
              window.location.assign(
                new URL("/?mode=demo&view=catalog", window.location.origin).href,
              );
            }}
          >
            Открыть демонстрацию
          </Link>
          <div className="evidence-ledger">
            <div>
              <strong>Демо</strong>
              <span>
                Можно изучить продукт без реальных персональных данных
              </span>
            </div>
            <div>
              <strong>Рабочий режим</strong>
              <span>
                Отдельные аккаунты, фиксированная роль, приватные предложения
                каждой компании
              </span>
            </div>
            <div>
              <strong>Публикация</strong>
              <span>
                Для кандидата выключена по умолчанию. Включается в профиле после
                теста
              </span>
            </div>
          </div>
          <p className="small-note">
            Доступ к этому стенду сейчас ограничен владельцем. Для пилота с
            другими участниками нужно отдельно настроить аудиторию сайта.
          </p>
        </aside>
      </div>
    </>
  );
}
type KeyInfo = {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};
type IntegrationInfo = {
  keys: KeyInfo[];
  fsp: { configured: boolean; tokenConfigured: boolean };
  events: { event: string; entity_id: string; created_at: string }[];
};
type IntegrationReply = {
  error?: string;
  token?: string;
  count?: number;
  ok?: boolean;
  id?: string;
  expiresAt?: string;
};
export function IntegrationsPanel({ data }: { data: AppState }) {
  const now = useClientNow();
  const [info, setInfo] = useState<IntegrationInfo | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(""),
    [revoke, setRevoke] = useState<KeyInfo | null>(null),
    [scopes, setScopes] = useState(["candidates:read", "jobs:read"]),
    [probe, setProbe] = useState("");
  const endpoint = "/api/integrations?mode=" + data.session.mode;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const next = (await response.json()) as IntegrationInfo & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(next.error ?? "Не удалось загрузить интеграции");
      return next;
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setInfo(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить интеграции",
          );
      });
    return () => controller.abort();
  }, [load]);
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Revision": String(data.session.revision),
          },
          body: JSON.stringify(body),
        }),
        j = (await r.json()) as IntegrationReply;
      if (!r.ok) throw new Error(j.error ?? "Ошибка интеграции");
      setInfo(await load());
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка интеграции");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkHeading
        kicker="PROFECTIUM / ИНТЕГРАЦИИ"
        title="Подключите свои инструменты"
        description="Выдавайте ограниченный доступ для ATS и аналитики. Проверяйте контракт внешнего провайдера достижений до импорта."
      />
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <AssistantConnection key={data.session.mode} mode={data.session.mode} />
      <div className="workbench-grid">
        <section className="assessment-card">
          <h2>
            <KeyRound size={22} />
            Ключи API
          </h2>
          <p>
            Только чтение выбранных ресурсов, срок до 90 дней, отзыв в любой
            момент. Контакты кандидатов, сообщения и ответы тестов не
            экспортируются.
          </p>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = await act({
                action: "create",
                name: f.get("name"),
                expiresInDays: Number(f.get("days")),
                scopes,
              });
              /*
               * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
               * Все права сохранены.
               *
               * Автор: Криницин Вячеслав Александрович
               */
              if (r?.token) setToken(r.token);
            }}
          >
            <Field label="Название интеграции">
              <input
                name="name"
                minLength={3}
                maxLength={60}
                placeholder="Например, аналитика команды"
                required
              />
            </Field>
            <Field label="Срок действия, дней">
              <input
                name="days"
                type="number"
                min={1}
                max={90}
                defaultValue={30}
                required
              />
            </Field>
            <div className="scope-list">
              {[
                ["candidates:read", "Каталог кандидатов"],
                ["jobs:read", "Мои вакансии"],
                ["offers:read", "Статусы моих предложений"],
              ].map(([value, label]) => (
                <label className="check-row" key={value}>
                  <Checkbox
                    checked={scopes.includes(value)}
                    onCheckedChange={(v) =>
                      setScopes(
                        v === true
                          ? [...scopes, value]
                          : scopes.filter((s) => s !== value),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <button
              className="button primary"
              disabled={busy || !scopes.length}
            >
              Создать ключ
            </button>
          </form>
          {info?.keys.length ? (
            <div className="keys-list">
              {info.keys.map((k) => (
                <div className="key-row" key={k.id}>
                  <div>
                    <strong>{k.name}</strong>
                    <small>
                      {k.revoked_at
                        ? "Отозван"
                        : now !== null && Date.parse(k.expires_at) < now
                          ? "Истёк"
                          : "До " + date(k.expires_at)}{" "}
                      · {k.scopes.join(", ")}
                    </small>
                    <small>
                      Последний запрос:{" "}
                      {k.last_used_at ? date(k.last_used_at) : "ещё не было"}
                    </small>
                  </div>
                  {!k.revoked_at && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setRevoke(k)}
                    >
                      Отозвать
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Действующих интеграций пока нет.</p>
          )}
        </section>
        <aside>
          <section className="assessment-card">
            <h2>
              <Plug size={22} />
              Достижения ФСП
            </h2>
            <div className="status-pill">
              {info?.fsp.configured
                ? "HTTP-провайдер настроен"
                : "Сейчас используется мок"}
            </div>
            <p>
              Подключение задаётся администратором: адрес HTTPS, разрешённый
              домен и серверный токен. Здесь можно проверить структуру ответа
              без записи в профиль.
            </p>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await act({
                  action: "probe",
                  participantId: new FormData(e.currentTarget).get(
                    "participantId",
                  ),
                });
                if (typeof r?.count === "number")
                  setProbe(
                    `Контракт корректен. Достижений: ${r.count}. Принадлежность ID не подтверждена.`,
                  );
              }}
            >
              <Field label="ID для проверки контракта">
                <input
                  name="participantId"
                  pattern="[A-Za-z0-9_-]{1,80}"
                  required
                  placeholder="participant-123"
                />
              </Field>
              <button
                className="button secondary"
                disabled={busy || !info?.fsp.configured}
              >
                Проверить провайдера
              </button>
            </form>
            {probe && <p className="info-box">{probe}</p>}
            <p className="small-note">
              Это предварительный контракт, не официальный API ФСП. Импорт в
              рабочие профили закрыт до появления механизма проверки
              принадлежности ID.
            </p>
          </section>
          <section className="assessment-card">
            <h2>Быстрый старт</h2>
            <p>
              <code>GET /api/connect/v1/candidates?limit=25</code>
            </p>
            <p>
              <code>Authorization: Bearer YOUR_API_KEY</code>
            </p>
            <p>
              До 60 запросов в минуту на ключ. Ключ даёт доступ только к выбранным ресурсам.
            </p>
            <a
              className="text-button"
              href="/openapi.json"
              target="_blank"
              rel="noreferrer"
            >
              Открыть OpenAPI
            </a>
            <p className="small-note">
              Секреты хранятся только на сервере интеграции. В браузерный код
              внешних сайтов их помещать нельзя.
            </p>
          </section>
        </aside>
      </div>
      <section className="assessment-card">
        <h2>Журнал доступа</h2>
        {info?.events.length ? (
          info.events.map((e, i) => (
            <div className="audit-row" key={i}>
              <code>{e.event}</code>
              <span>{date(e.created_at)}</span>
            </div>
          ))
        ) : (
          <p className="muted">
            Здесь появятся создание и отзыв ключей. Значения секретов не
            записываются.
          </p>
        )}
      </section>
      <Dialog open={!!token} onOpenChange={(v) => !v && setToken("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ключ создан</DialogTitle>
            <DialogDescription>
              Скопируйте ключ сейчас. Повторно показать его нельзя: на сервере
              хранится только хеш.
            </DialogDescription>
          </DialogHeader>
          <code className="token-box">{token}</code>
          <button
            className="button primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(token);
                toast.success("Ключ скопирован");
              } catch {
                toast.error("Выделите и скопируйте ключ вручную");
              }
            }}
          >
            <Copy size={16} />
            Скопировать
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!revoke} onOpenChange={(v) => !v && setRevoke(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отозвать ключ «{revoke?.name}»?</DialogTitle>
            <DialogDescription>
              Интеграция перестанет получать данные. Для повторного подключения
              нужно создать новый ключ.
            </DialogDescription>
          </DialogHeader>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              if (await act({ action: "revoke", id: revoke?.id }))
                setRevoke(null);
            }}
          >
            Отозвать ключ
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ScoreBreakdown({
  candidate: c,
  job,
}: {
  candidate: Candidate;
  job?: Job;
}) {
  const m = job ? matchCandidate(c, job) : null;
  const items = [
    [
      "Тест · результат сервера",
      Number(((c.qualification?.score ?? 0) * 0.6).toFixed(1)),
      60,
    ],
    ["Достижения ФСП · демоданные", evidencePoints(c), 20],
    [
      "Навыки · заявлены в резюме",
      m
        ? Number(
            ((15 * m.matched.length) / Math.max(job!.skills.length, 1)).toFixed(
              1,
            ),
          )
        : 0,
      15,
    ],
    ["Зарплатные ожидания", m?.salary ? 5 : 0, 5],
  ] as const;
  return (
    <div className="score-breakdown">
      <div className="section-heading">
        <h3>Из чего сложился подбор</h3>
        <strong>{rankingScore(c, job)} баллов</strong>
      </div>
      {items.map(([label, value, max]) => (
        <div className="score-row" key={label}>
          <div>
            <span>{label}</span>
            <b>
              {value}/{max}
            </b>
          </div>
          <Progress value={(value / max) * 100} aria-label={label} />
        </div>
      ))}
      <p className="small-note">
        Итог округлён до целого. Баллы помогают сравнивать внутри категории. Это
        не вероятность успешного найма.{" "}
        {job
          ? "Учитывается выбранная вакансия."
          : "Выберите вакансию, чтобы учесть навыки и зарплату."}
      </p>
    </div>
  );
}
export function ComparePanel({
  candidates,
  job,
  onOpen,
  onRemove,
}: {
  candidates: Candidate[];
  job?: Job;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const differs = (key: "conditions" | "skills" | "category") =>
    !differencesOnly ||
    new Set(
      candidates.map((c) =>
        key === "conditions"
          ? `${c.salaryMin}:${c.salaryMax}:${c.city}:${c.workFormat}`
          : key === "skills"
            ? [...c.skills].sort().join("|")
            : `${c.qualification?.role}:${c.qualification?.grade}`,
      ),
    ).size > 1;
  const same =
    new Set(
      candidates.map(
        (c) => c.qualification?.role + ":" + c.qualification?.grade,
      ),
    ).size <= 1;
  return (
    <>
      <WorkHeading
        kicker="PROFECTIUM / СРАВНЕНИЕ"
        title="Решение на одинаковых основаниях"
        description="До трёх специалистов рядом: результат проверки, заявленные навыки, условия и вопросы для разговора."
      />
      {!candidates.length ? (
        <EmptyState
          title="Добавьте специалистов к сравнению"
          description="Нажмите «Сравнить» на карточке в каталоге."
        />
      ) : (
        <>
          {!same && (
            <p className="info-box">
              У выбранных профилей разные категории. Сравнивайте требования
              роли, а не только итоговый балл.
            </p>
          )}
          <label className="checkline section-space">
            <input
              type="checkbox"
              checked={differencesOnly}
              onChange={(e) => setDifferencesOnly(e.target.checked)}
            />
            Скрыть совпадающие условия, категорию и навыки
          </label>
          <div className="compare-grid">
            {candidates.map((c) => (
              <article className="assessment-card compare-column" key={c.id}>
                <button className="text-button" onClick={() => onRemove(c.id)}>
                  Убрать из сравнения
                </button>
                <h2>{c.fullName}</h2>
                {differs("category") && (
                  <p>
                    {c.qualification?.role} / {c.qualification?.grade}
                  </p>
                )}
                <div className="status-pill">
                  {c.qualification?.synthetic
                    ? "Исходная демооценка"
                    : "Самостоятельная попытка"}{" "}
                  · {c.qualification?.score}/100
                </div>
                <ScoreBreakdown candidate={c} job={job} />
                {differs("conditions") && (
                  <>
                    <h3>Условия</h3>
                    <p>{salary(c.salaryMin, c.salaryMax)}</p>
                    <p>
                      {c.city} · {c.workFormat}
                    </p>
                  </>
                )}
                {differs("skills") && (
                  <>
                    <h3>Заявленные навыки</h3>
                    <div className="skills">
                      {c.skills.map((s) => (
                        <span key={s}>{s}</span>
                      ))}
                    </div>
                  </>
                )}
                {job && (
                  <>
                    <h3>Уточнить по вакансии</h3>
                    <p>
                      {matchCandidate(c, job).missing.join(", ") ||
                        "Все требуемые навыки указаны. Проверьте глубину на интервью."}
                    </p>
                  </>
                )}
                <h3>На интервью</h3>
                <p>
                  Попросите разобрать рабочий пример с {c.skills[0]}:
                  ограничения, личный вклад, проверка результата и
                  альтернативное решение.
                </p>
                <button
                  className="button secondary full-width"
                  onClick={() => onOpen(c.id)}
                >
                  Открыть профиль
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
export function NoteEditor({
  candidateId,
  note,
  mutate,
  busy,
}: {
  candidateId: string;
  note?: HiringNote;
  mutate: Mutation;
  busy: boolean;
}) {
  const [stage, setStage] = useState(note?.stage ?? "shortlist"),
    [text, setText] = useState(note?.text ?? ""),
    [revision, setRevision] = useState(note?.revision ?? 0);
  return (
    <form
      className="form-grid private-note"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await mutate("notes/" + candidateId, "PUT", { stage, text, revision })
        )
          setRevision(revision + 1);
      }}
    >
      <h3>
        <ClipboardList size={19} /> Заметка команды
      </h3>
      <p className="small-note">
        Видна только вашему аккаунту работодателя. Записывайте рабочие примеры и
        вопросы по компетенциям.
      </p>
      <Field label="Этап знакомства">
        <Picker
          label="Этап знакомства"
          value={stage}
          onChange={(v) => setStage(v as HiringNote["stage"])}
          options={[
            { value: "shortlist", label: "В подборке" },
            { value: "screening", label: "Первичный разговор" },
            { value: "interview", label: "Интервью" },
            { value: "decision", label: "Обсуждение решения" },
          ]}
        />
      </Field>
      <Field label="Наблюдения и вопросы">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Какой проект разобрать, какие условия уточнить…"
        />
      </Field>
      <button className="button secondary" disabled={busy}>
        Сохранить заметку
      </button>
    </form>
  );
}
export function HiringBoard({
  data,
  onOpen,
}: {
  data: AppState;
  onOpen: (id: string) => void;
}) {
  const stages = [
    ["shortlist", "В подборке"],
    ["screening", "Первичный разговор"],
    ["interview", "Интервью"],
    ["decision", "Обсуждение решения"],
  ];
  const selected = data.candidates.filter(
    (c) =>
      data.favorites.includes(c.id) ||
      data.notes.some((n) => n.candidateId === c.id),
  );
  /*
   * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
   * Все права сохранены.
   *
   * Автор: Криницин Вячеслав Александрович
   */
  return (
    <>
      <WorkHeading
        kicker="PROFECTIUM / РАБОЧАЯ ПОДБОРКА"
        title="От первого интереса до разговора"
        description="Сохранённые специалисты и заметки команды. Этапы обновляются в профиле; статусы предложений приходят из реальных действий в этом пространстве."
      />
      <div className="pipeline-grid">
        {stages.map(([key, label]) => (
          <section className="pipeline-column" key={key}>
            <h2>
              {label}
              <span>
                {
                  selected.filter(
                    (c) =>
                      (data.notes.find((n) => n.candidateId === c.id)?.stage ??
                        "shortlist") === key,
                  ).length
                }
              </span>
            </h2>
            {selected
              .filter(
                (c) =>
                  (data.notes.find((n) => n.candidateId === c.id)?.stage ??
                    "shortlist") === key,
              )
              .map((c) => (
                <button
                  className="pipeline-person"
                  key={c.id}
                  onClick={() => onOpen(c.id)}
                >
                  <strong>{c.fullName}</strong>
                  <span>
                    {c.qualification?.role} · {c.qualification?.grade}
                  </span>
                  <small>
                    {data.notes.find((n) => n.candidateId === c.id)?.text ||
                      "Добавьте вопросы для знакомства"}
                  </small>
                  <span className="source-tag">
                    {data.offers.some(
                      (o) => o.candidateId === c.id && o.status === "accepted",
                    )
                      ? "Есть принятое предложение"
                      : data.offers.some(
                            (o) =>
                              o.candidateId === c.id && o.status === "pending",
                          )
                        ? "Ожидаем ответ"
                        : "Предложение можно отправить"}
                  </span>
                </button>
              ))}
            {!selected.some(
              (c) =>
                (data.notes.find((n) => n.candidateId === c.id)?.stage ??
                  "shortlist") === key,
            ) && <p className="muted">Пока пусто</p>}
          </section>
        ))}
      </div>
    </>
  );
}
export function InsightsPanel({ data }: { data: AppState }) {
  const answered = data.offers.filter((o) =>
      ["accepted", "declined"].includes(o.status),
    ).length,
    accepted = data.offers.filter((o) => o.status === "accepted").length;
  const counts = new Map<string, number>();
  for (const c of data.candidates) {
    const key = `${c.qualification?.role} / ${c.qualification?.grade}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (
    <>
      <WorkHeading
        kicker="PROFECTIUM / ОБЗОР"
        title="Состояние вашего подбора"
        description="Числа рассчитаны по данным текущего пространства. Они описывают работу сервиса и не доказывают сокращение сроков найма."
      />
      <div className="metrics-v3">
        {[
          ["Доступных профилей", data.candidates.length],
          [
            "Без истории ФСП",
            data.candidates.filter((c) => !c.achievements.length).length,
          ],
          ["Ответили на предложение", answered],
          ["Приняли предложение", accepted],
        ].map(([label, value]) => (
          <div className="metric-v3" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="workbench-grid">
        <section className="assessment-card">
          <h2>
            <BarChart3 size={22} /> Покрытие категорий
          </h2>
          {[...counts].map(([label, n]) => (
            <div className="category-bar" key={label}>
              <div>
                <span>{label}</span>
                <b>{n}</b>
              </div>
              <Progress
                value={(100 * n) / Math.max(data.candidates.length, 1)}
                aria-label={label}
              />
            </div>
          ))}
          {!counts.size && (
            <p>Каталог появится после регистрации и тестирования кандидатов.</p>
          )}
        </section>
        <section className="assessment-card">
          <h2>Как интерпретировать результат</h2>
          <div className="evidence-ledger">
            <div>
              <strong>Ответили / отправлено</strong>
              <span>
                {answered} / {data.offers.length}. Отозванные предложения
                включены в число отправленных.
              </span>
            </div>
            <div>
              <strong>Приняли / ответили</strong>
              <span>
                {accepted} / {answered}.{" "}
                {answered
                  ? "Показывает интерес к условиям, не факт трудоустройства."
                  : "Пока нет ответов — конверсия не определена."}
              </span>
            </div>
            <div>
              <strong>Без ФСП</strong>
              <span>
                Отсутствие соревновательной истории не блокирует присвоение
                категории или участие в поиске.
              </span>
            </div>
          </div>
          <p className="small-note">
            В демопространстве все исходные записи синтетические. Для оценки
            качества найма нужен пилот с независимой разметкой и реальными
            исходами.
          </p>
        </section>
      </div>
    </>
  );
}
export function CareerPanel({
  data,
  mutate,
  busy,
}: {
  data: AppState;
  mutate: Mutation;
  busy: boolean;
}) {
  const c = data.candidates[0];
  if (!c) return null;
  const latest = data.assessments.find((a) => a.status !== "active"),
    gaps =
      latest?.feedback?.filter((f) => !f.correct).map((f) => f.topic) ?? [];
  const resource =
    c.role === "DevOps"
      ? [
          "Kubernetes: практические руководства",
          "https://kubernetes.io/docs/tutorials/",
        ]
      : c.role === "Data Science"
        ? [
            "scikit-learn: оценка моделей",
            "https://scikit-learn.org/stable/model_selection.html",
          ]
        : c.role === "QA"
          ? [
              "Playwright: практика тестирования",
              "https://playwright.dev/docs/intro",
            ]
          : c.role === "Backend"
            ? [
                "FastAPI: построение API",
                "https://fastapi.tiangolo.com/tutorial/",
              ]
            : [
                "MDN: веб-разработка",
                "https://developer.mozilla.org/en-US/docs/Learn_web_development",
              ];
  const tasks = [
    {
      id: "project-proof",
      title: "Разберите один свой проект",
      description:
        "Запишите задачу, ограничения, ваш личный вклад, альтернативы и измеримый результат. Покажите код или воспроизводимый пример.",
    },
    {
      id: "role-practice",
      title: "Сделайте маленькую практическую работу",
      description:
        "Выберите задачу по специализации, добавьте обработку ошибок и проверку граничных случаев. Зафиксируйте, как проверяли решение.",
    },
    ...gaps.slice(0, 4).map((topic) => ({
      id: topic,
      title: "Повторите: " + topic,
      description:
        "Разберите принцип, придумайте новый пример и объясните решение своими словами. Отметка здесь не меняет результат теста.",
    })),
    {
      id: "profile-context",
      title: "Проверьте профиль и условия",
      description:
        "Уточните стек, формат работы, зарплатные ожидания и контакт. Не публикуйте контакты в открытом описании.",
    },
  ];
  const done = c.learningCompleted ?? [];
  return (
    <>
      <WorkHeading
        kicker="PROFECTIUM / РАЗВИТИЕ"
        title="Следующий шаг уже понятен"
        description="План опирается на ваш профиль и ошибки последней попытки. Это инструмент подготовки; выполненные пункты отмечаете вы сами."
      />
      <div className="workbench-grid">
        <section className="assessment-card">
          <div className="section-heading">
            <h2>
              <BookOpen size={22} />
              План подготовки
            </h2>
            <strong>
              {tasks.filter((t) => done.includes(t.id)).length}/{tasks.length}
            </strong>
          </div>
          <Progress
            value={
              (100 * tasks.filter((t) => done.includes(t.id)).length) /
              tasks.length
            }
            aria-label="Прогресс плана развития"
          />
          {tasks.map((t) => (
            <label className="learning-task" key={t.id}>
              <Checkbox
                checked={done.includes(t.id)}
                disabled={busy}
                onCheckedChange={(v) =>
                  void mutate("learning", "PATCH", {
                    completed:
                      v === true
                        ? [...done, t.id]
                        : done.filter((x) => x !== t.id),
                  })
                }
              />
              <span>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
              </span>
            </label>
          ))}
        </section>
        <aside>
          <section className="qualification-card">
            <span className="eyebrow">ТЕКУЩЕЕ ОСНОВАНИЕ</span>
            <h2>
              {c.qualification
                ? `${c.qualification.role} / ${c.qualification.grade}`
                : "Категория не присвоена"}
            </h2>
            <p>
              {c.qualification
                ? `${c.qualification.score}/100 · ${c.qualification.synthetic ? "синтетическая исходная оценка" : "пилотный тест"}`
                : "Пройдите опрос и тест, чтобы профиль появился в каталоге."}
            </p>
          </section>
          <section className="assessment-card">
            <h2>Материал для самостоятельной работы</h2>
            <a
              href={resource[1]}
              target="_blank"
              rel="noreferrer"
              className="text-button"
            >
              {resource[0]}
            </a>
            <p>
              Официальная документация. Выбирайте темы под задачи своей роли;
              чтение материала не считается проверкой навыка.
            </p>
            <h3>Что можно показать работодателю</h3>
            <p>
              Результат теста, историю, свой проект и PDF-профиль. Отделяйте
              подтверждённый результат от самоописания.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
