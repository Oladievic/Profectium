/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import { writeFile } from "node:fs/promises";
import {addSignalsApi} from './openapi-signals.mjs';
import {addCareerApi} from './openapi-career.mjs';
import {addEmployerTestsApi} from './openapi-employer-tests.mjs';
import {addPublicAuthApi} from './openapi-public-auth.mjs';
const ref = (name) => ({ $ref: "#/components/schemas/" + name });
const str = { type: "string" },
  number = { type: "integer" },
  money = { type: "integer", minimum: 10000, maximum: 2000000 };
const role = {
  type: "string",
  enum: ["Frontend", "Backend", "Fullstack", "Data Science", "DevOps", "QA"],
};
const base = {
  role,
  grade: { type: "string", enum: ["Junior", "Middle", "Senior"] },
  city: { type: "string", minLength: 2, maxLength: 60 },
  workFormat: { type: "string", enum: ["Удалённо", "Гибрид", "Офис"] },
  salaryMin: money,
  salaryMax: money,
  skills: {
    type: "array",
    minItems: 1,
    maxItems: 20,
    items: { type: "string", minLength: 1, maxLength: 50 },
  },
};
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const content = (schema) => ({ "application/json": { schema } });
const reply = (schema, description = "Успешно") => ({
  description,
  content: content(schema),
});
const header = (name, description) => ({
  name,
  in: "header",
  required: true,
  schema: str,
  description,
});
const revision = header(
  "X-Session-Revision",
  "Ревизия session из GET /state. Устаревшая вкладка получает 409.",
);
const idempotency = header(
  "Idempotency-Key",
  "UUID v4, сохраняемый при повторе операции. Другой payload с тем же ключом отклоняется.",
);
const id = { name: "id", in: "path", required: true, schema: str };
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 415, 422, 429, 502, 503].map((n) => [
    String(n),
    reply(ref("Error"), "Ошибка " + n),
  ]),
);
function operation(
  summary,
  schema = ref("AppState"),
  input,
  parameters = [],
  created = false,
) {
  return {
    summary,
    security: [{ platformSession: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(input
      ? { requestBody: { required: true, content: content(input) } }
      : {}),
    responses: {
      [created ? "201" : "200"]: reply(schema),
      ...errors,
      ...(created
        ? { 200: reply(schema, "Результат повторного запроса") }
        : {}),
    },
  };
}
const schemas = {
  Error: object(
    {
      error: str,
      fields: {
        type: "object",
        additionalProperties: { type: "array", items: str },
      },
    },
    ["error"],
  ),
  Achievement: object({
    id: str,
    competition: str,
    discipline: str,
    place: number,
    participants: number,
    year: number,
    teamRole: str,
    source: { const: "mock-fsp" },
  }),
  Candidate: object(
    {
      id: str,
      fullName: str,
      initials: str,
      ...base,
      yearsExperience: { type: "number", minimum: 0, maximum: 50 },
      bio: str,
      achievements: { type: "array", items: ref("Achievement") },
      available: { type: "boolean" },
      revision: number,
      lastSynced: { type: "string", format: "date-time" },
    },
    [
      "id",
      "fullName",
      "initials",
      ...Object.keys(base),
      "yearsExperience",
      "bio",
      "achievements",
      "available",
      "revision",
    ],
  ),
  ProfileInput: object({
    fullName: { type: "string", minLength: 3, maxLength: 80 },
    ...base,
    yearsExperience: { type: "number", minimum: 0, maximum: 50 },
    bio: { type: "string", minLength: 20, maxLength: 3000 },
    available: { type: "boolean" },
  }),
  JobInput: object({
    title: { type: "string", minLength: 3, maxLength: 100 },
    company: { type: "string", minLength: 2, maxLength: 80 },
    ...base,
    description: { type: "string", minLength: 30, maxLength: 5000 },
  }),
  Job: object({
    id: str,
    title: str,
    company: str,
    ...base,
    description: str,
    status: { enum: ["active", "archived"] },
    createdAt: { type: "string", format: "date-time" },
  }),
  OfferInput: object({
    candidateId: str,
    jobId: str,
    salaryMin: money,
    salaryMax: money,
    message: { type: "string", minLength: 20, maxLength: 2000 },
  }),
  Offer: object({
    id: str,
    candidateId: str,
    jobId: str,
    jobTitle: str,
    company: str,
    salaryMin: money,
    salaryMax: money,
    message: str,
    status: { enum: ["pending", "accepted", "declined", "withdrawn"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  }),
  Session: object({
    role: { enum: ["employer", "candidate"] },
    candidateId: str,
    revision: number,
    mode: { enum: ["demo", "live"] },
  }),
  AppState: object({
    candidates: { type: "array", items: ref("Candidate") },
    jobs: { type: "array", items: ref("Job") },
    offers: { type: "array", items: ref("Offer") },
    favorites: { type: "array", items: str },
    session: ref("Session"),
  }),
};
const list = (name) => object({ items: { type: "array", items: ref(name) } });
const boolean = { type: "boolean" },
  timestamp = { type: "string", format: "date-time" };
const grade = { type: "string", enum: ["Junior", "Middle", "Senior"] };
schemas.Privacy = object(
  {
    processing: boolean,
    publication: boolean,
    showAchievements: boolean,
    consentAt: timestamp,
  },
  ["processing", "publication", "showAchievements"],
);
schemas.Qualification = object({
  role,
  grade,
  score: { type: "integer", minimum: 0, maximum: 100 },
  passedAt: timestamp,
  nextChangeAt: timestamp,
  attemptId: str,
  synthetic: boolean,
});
schemas.Question = object({
  id: { type: "string", format: "uuid" },
  topic: str,
  prompt: str,
  kind: { enum: ["general", "professional"] },
  options: {
    type: "array",
    minItems: 4,
    maxItems: 4,
    items: object({ id: { type: "string", format: "uuid" }, text: str }),
  },
});
schemas.Assessment = object(
  {
    id: str,
    role,
    grade,
    industry: str,
    motivation: str,
    jobId: str,
    jobTitle: str,
    status: { enum: ["active", "passed", "failed", "expired"] },
    createdAt: timestamp,
    expiresAt: timestamp,
    completedAt: timestamp,
    score: number,
    feedback: {
      type: "array",
      items: object({ topic: str, correct: boolean }),
    },
    questions: { type: "array", items: ref("Question") },
    answers: { type: "object", additionalProperties: str },
    blueprint: str,
  },
  [
    "id",
    "role",
    "grade",
    "industry",
    "motivation",
    "status",
    "createdAt",
    "expiresAt",
    "questions",
    "blueprint",
  ],
);
schemas.AssessmentInput = object(
  {
    role,
    grade,
    industry: { type: "string", minLength: 2, maxLength: 80 },
    motivation: { type: "string", minLength: 10, maxLength: 500 },
    jobId: str,
  },
  ["role", "grade", "industry", "motivation"],
);
schemas.Company = object({
  name: { type: "string", minLength: 2, maxLength: 80 },
  industry: { type: "string", minLength: 2, maxLength: 100 },
  description: { type: "string", minLength: 20, maxLength: 2000 },
  contact: { type: "string", minLength: 5, maxLength: 150 },
});
Object.assign(schemas.Candidate.properties, {
  contact: str,
  softSkills: { type: "array", items: str },
  fspId: str,
  privacy: ref("Privacy"),
  qualification: ref("Qualification"),
});
Object.assign(schemas.ProfileInput.properties, {
  contact: { type: "string", maxLength: 150 },
  softSkills: {
    type: "array",
    maxItems: 12,
    items: { type: "string", minLength: 1, maxLength: 60 },
  },
  fspId: { type: "string", maxLength: 80, pattern: "^[a-zA-Z0-9_-]*$" },
  privacy: object({
    processing: boolean,
    publication: boolean,
    showAchievements: boolean,
  }),
});
Object.assign(schemas.OfferInput.properties, {
  jobTitle: { type: "string", minLength: 3, maxLength: 100 },
  employerContact: { type: "string", minLength: 5, maxLength: 150 },
});
schemas.OfferInput.required = [
  "candidateId",
  "salaryMin",
  "salaryMax",
  "message",
  "employerContact",
];
schemas.OfferInput.description =
  "jobId необязателен. Без него требуется jobTitle. Компания берётся из сохранённого профиля работодателя.";
Object.assign(schemas.Offer.properties, {
  declineReason: { type: "string", minLength: 1, maxLength: 500, description: "Необязательная причина отказа кандидата. Сохраняется только для declined; внешние пробелы удаляются." },
  employerContact: str,
  candidateContact: str,
});
Object.assign(schemas.AppState.properties, {
  assessments: { type: "array", items: ref("Assessment") },
  company: ref("Company"),
  demoPersonas: { type: "array", items: object({ id: str, fullName: str }) },
});
schemas.AppState.required.push("assessments", "company", "demoPersonas");
const spec = {
  openapi: "3.1.0",
  info: {
    title: "Profectium API",
    version: "0.3.0",
    description:
      "Рабочий демонстрационный контракт. Все соревнования, компании и профили синтетические. Это НЕ официальный API ФСП. Денежные диапазоны — RUB в месяц до налогов; salaryMax >= salaryMin. Все запросы (кроме health) требуют платформенную сессию. Публичный сервер проверяет HttpOnly cookie собственной авторизации. У мутаций обязателен same-origin Origin. Максимальный JSON body: 32 KiB для v1–v3; 256 KiB для v4 (включая live). Данные изолированы по владельцу. GET /state используется клиентом; для небольшого демонабора пагинации нет.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/onboarding": {
      post: operation(
        "Создать единственный новый демопрофиль без категории; email не подтверждается",
        ref("AppState"),
        object({
          fullName: { type: "string", minLength: 3, maxLength: 80 },
          contact: { type: "string", format: "email" },
          processing: { const: true },
          publication: boolean,
        }),
        [revision],
        true,
      ),
    },
    "/company": {
      patch: operation(
        "Обновить профиль своей демокомпании",
        ref("AppState"),
        ref("Company"),
        [revision],
      ),
    },
    "/assessments": {
      post: operation(
        "Начать тест: 30 минут, 6 заданий, повтор через 24 часа; смена категории через 90 дней",
        ref("AppState"),
        ref("AssessmentInput"),
        [revision],
        true,
      ),
    },
    "/assessments/{id}": {
      post: operation(
        "Сдать ответы один раз: минимум 4/6 и 3/4 профессиональных ответа; старые попытки сохраняют свою рубрику; одинаковый повтор идемпотентен",
        ref("AppState"),
        object({
          answers: {
            type: "object",
            minProperties: 6,
            maxProperties: 6,
            propertyNames: { format: "uuid" },
            additionalProperties: { type: "string", format: "uuid" },
          },
          revision: {
            type: "integer", minimum: 0, default: 0,
            description: "Текущая Assessment.draftRevision; при пропуске принимается 0 для старых клиентов. Несовпадение активного черновика даёт 409. Идентичный повтор завершённой попытки возвращает сохранённый результат; после срока оцениваются только ранее сохранённые ответы.",
          },
        }, ["answers"]),
        [id, revision],
      ),
    },
    "/health": {
      get: {
        summary: "Проверка приложения (без проверки БД)",
        security: [],
        responses: {
          200: reply(
            object({ status: str, mode: str, fsp: str, version: str }),
          ),
        },
      },
    },
    "/state": { get: operation("Полное состояние личного демопространства") },
    "/session": {
      post: operation(
        "Переключить демороль",
        ref("AppState"),
        object({ role: { enum: ["employer", "candidate"] }, candidateId: str }),
        [revision],
      ),
    },
    "/candidates": {
      get: operation(
        "Поиск доступных специалистов",
        object({
          items: { type: "array", items: ref("Candidate") },
          source: { enum: ["synthetic","member-profiles"] },
        }),
        undefined,
        [
          { name: "q", in: "query", schema: str },
          { name: "role", in: "query", schema: role },
          { name: "achievements", in: "query", schema: { type: "boolean" } },
        ],
      ),
    },
    "/candidates/{id}": {
      get: operation("Профиль кандидата", ref("Candidate"), undefined, [id]),
    },
    "/jobs": {
      get: operation("Список вакансий", list("Job")),
      post: operation(
        "Создать вакансию (работодатель)",
        ref("AppState"),
        ref("JobInput"),
        [revision, idempotency],
        true,
      ),
    },
    "/jobs/{id}": {
      patch: operation(
        "Архивировать или возобновить вакансию",
        ref("AppState"),
        object({ status: { enum: ["active", "archived"] } }),
        [id, revision],
      ),
    },
    "/favorites/{id}": {
      put: operation(
        "Добавить кандидата в избранное",
        ref("AppState"),
        undefined,
        [id, revision],
      ),
      delete: operation(
        "Удалить кандидата из избранного",
        ref("AppState"),
        undefined,
        [id, revision],
      ),
    },
    "/offers": {
      get: operation("Предложения (кандидат видит только свои)", list("Offer")),
      post: operation(
        "Отправить предложение с зарплатой",
        ref("AppState"),
        ref("OfferInput"),
        [revision, idempotency],
        true,
      ),
    },
    "/offers/{id}": {
      patch: operation(
        "Ответить на предложение или отозвать его",
        ref("AppState"),
        { oneOf: [
          object({ status: { enum: ["accepted", "withdrawn"] } }),
          object({ status: { const: "declined" }, declineReason: { type: "string", minLength: 1, maxLength: 500, description: "Необязательно. Сервер удаляет внешние пробелы." } }, ["status"]),
        ] },
        [id, revision],
      ),
    },
    "/profile": {
      patch: operation(
        "Обновить свой демопрофиль",
        ref("AppState"),
        ref("ProfileInput"),
        [
          revision,
          header(
            "If-Match",
            "Текущее значение revision профиля. Достижения не принимаются в body.",
          ),
        ],
      ),
    },
    "/profile/sync": {
      post: operation(
        "Синхронизировать достижения из мока ФСП",
        ref("AppState"),
        undefined,
        [revision],
      ),
    },
    "/fsp/participants/{id}": {
      get: operation(
        "Демонстрационный адаптер достижений",
        object({
          participantId: str,
          source: { const: "mock-fsp" },
          synthetic: { const: true },
          achievements: { type: "array", items: ref("Achievement") },
        }),
        undefined,
        [id],
      ),
    },
  },
  components: {
    securitySchemes: {
      platformSession: {
        type: "apiKey",
        in: "cookie",
        name: "platform-session",
        description:
          "Публичная сессия использует HttpOnly cookie profectium_session; ключ REST API применяется отдельно от пользовательского входа.",
      },
    },
    schemas,
  },
};

// Version 0.3: explicit absolute paths for isolated demo, shared live and scoped connectors.
schemas.HiringNote = object({
  candidateId: str,
  stage: { enum: ["shortlist", "screening", "interview", "decision"] },
  text: str,
  revision: number,
  updatedAt: timestamp,
});
schemas.AppState.properties.notes = { type: "array", items: ref("HiringNote") };
schemas.AppState.required.push("notes");
schemas.Candidate.properties.learningCompleted = { type: "array", items: str };
schemas.Job.properties.employerId = str;
schemas.Offer.properties.employerId = str;
schemas.Assessment.properties.draftAnswers = {
  type: "object",
  additionalProperties: str,
};
schemas.Assessment.properties.draftRevision = {
  type: "integer", minimum: 0,
  description: "Ревизия сохранённого черновика. Для старой записи без поля считать 0. Передавать в body сохранения и завершения; успешное сохранение увеличивает её на 1.",
};
schemas.Assessment.properties.rubric = object({
  minimumTotal: number,
  minimumProfessional: number,
  bankVersion: str,
});
schemas.Member = object({
  owner: str,
  role: { enum: ["candidate", "employer"] },
  candidate_id: str,
  email: { type: "string", format: "email" },
  full_name: str,
  verified_at: timestamp,
  revision: number,
});
schemas.ApiKey = object({
  id: str,
  name: str,
  scopes: {
    type: "array",
    items: { enum: ["candidates:read", "jobs:read", "offers:read"] },
  },
  created_at: timestamp,
  expires_at: timestamp,
  revoked_at: { type: ["string", "null"] },
  last_used_at: { type: ["string", "null"] },
});
spec.paths["/notes/{id}"] = {
  put: operation(
    "Личная заметка работодателя; revision=0 при создании, затем ревизия записи",
    ref("AppState"),
    object({
      stage: { enum: ["shortlist", "screening", "interview", "decision"] },
      text: { type: "string", maxLength: 2000 },
      revision: { type: "integer", minimum: 0 },
    }),
    [id, revision],
  ),
};
spec.paths["/learning"] = {
  patch: operation(
    "Сохранить самостоятельные отметки плана; квалификация не меняется",
    ref("AppState"),
    object({
      completed: {
        type: "array",
        maxItems: 24,
        items: { type: "string", maxLength: 100 },
      },
    }),
    [revision],
  ),
};
spec.paths["/assessments/{id}/draft"] = {
  put: operation(
    "Сохранить частичные ответы своей активной попытки; срок теста не продлевается",
    ref("AppState"),
    object({
      answers: {
        type: "object",
        maxProperties: 6,
        propertyNames: { format: "uuid" },
        additionalProperties: { type: "string", format: "uuid" },
      },
      revision: {
        type: "integer", minimum: 0, default: 0,
        description: "Assessment.draftRevision; пропуск равен 0. Защищает ответы от перезаписи устаревшей вкладкой. Конфликт — 409, ответы не изменяются.",
      },
    }, ["answers"]),
    [id, revision],
  ),
};
const demoPaths = spec.paths;
spec.paths = {};
spec.servers = [{ url: "/" }];
for (const [path, methods] of Object.entries(demoPaths)) {
  spec.paths["/api/v1" + path] = methods;
  if (
    !["/session", "/onboarding", "/profile/sync"].includes(path) &&
    !path.startsWith("/fsp/")
  )
    spec.paths["/api/live/v1" + path] = structuredClone(methods);
}
spec.info.description = "Profectium. Demo /api/v1 — изолированная песочница с синтетическими данными. Live /api/live/v1 — общие кандидаты и фиксированная роль, вакансии и предложения принадлежат работодателю. Публичный сервер использует регистрацию Profectium и HttpOnly cookie; подтверждение email не требуется. Мутации: same-origin Origin, X-Session-Revision; профиль также If-Match. JSON: 32 KiB для v1–v3, 256 KiB для v4. RUB в месяц до налогов; salaryMax >= salaryMin. FSP — предварительный HTTP-контракт и демоданные, не официальный API. API /connect использует отдельные ключи чтения; контакты и ответы тестов исключены.";
spec.components.securitySchemes.integrationKey = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "pf_ + 64 hex characters",
  description:
    "Одноразово показанный ключ раздела Интеграции; хранится SHA-256, срок до 90 дней",
};
const scopes = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  items: { enum: ["candidates:read", "jobs:read", "offers:read"] },
};
const mode = {
  name: "mode",
  in: "query",
  schema: { enum: ["demo", "live"], default: "demo" },
};
const accountResponse = object({
  member: { anyOf: [ref("Member"), { type: "null" }] },
  emailDeliveryConfigured: boolean,
  identityProvider: str,
});
spec.paths["/api/account"] = {
  get: operation(
    "Статус закреплённого рабочего аккаунта и доставки email",
    accountResponse,
  ),
  post: operation(
    "Запросить одноразовый код или подтвердить email; требуется действующая сессия",
    {},
    {
      oneOf: [
        object({
          action: { const: "request" },
          email: { type: "string", format: "email", maxLength: 150 },
          role: { enum: ["candidate", "employer"] },
          fullName: { type: "string", minLength: 3, maxLength: 80 },
          processing: { const: true },
        }),
        object({
          action: { const: "verify" },
          challengeId: { type: "string", format: "uuid" },
          code: { type: "string", pattern: "^\\d{6}$" },
        }),
      ],
    },
  ),
};
spec.paths["/api/account"].post.responses["201"] = reply(
  object({ challengeId: str, email: str, expiresAt: timestamp }),
  "Код отправлен",
);
spec.paths["/api/account"].post.responses["200"] = reply(
  object({ member: ref("Member") }),
  "Email подтверждён",
);
spec.paths["/api/integrations"] = {
  get: operation(
    "Ключи и журнал своего работодателя; значения секретов никогда не возвращаются",
    object({
      keys: { type: "array", items: ref("ApiKey") },
      fsp: object({
        configured: boolean,
        tokenConfigured: boolean,
        provider: str,
        identityLinkConfigured: { const: false },
      }),
      events: {
        type: "array",
        items: object({ event: str, entity_id: str, created_at: timestamp }),
      },
    }),
    undefined,
    [mode],
  ),
  post: operation(
    "Создать/отозвать ключ либо проверить контракт провайдера ФСП",
    {},
    {
      oneOf: [
        object({
          action: { const: "create" },
          name: { type: "string", minLength: 3, maxLength: 60 },
          scopes,
          expiresInDays: { type: "integer", minimum: 1, maximum: 90 },
        }),
        object({
          action: { const: "revoke" },
          id: { type: "string", format: "uuid" },
        }),
        object({
          action: { const: "probe" },
          participantId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,80}$" },
        }),
      ],
    },
    [mode, revision],
  ),
};
spec.paths["/api/integrations"].post.responses["201"] = reply(
  object({ id: str, token: str, expiresAt: timestamp }),
  "Ключ: показать один раз",
);
schemas.SearchIntent = object({
  filters: object({
    query: str,
    role: { enum: ["all", "Frontend", "Backend", "Fullstack", "Data Science", "DevOps", "QA"] },
    grade: { enum: ["all", "Junior", "Middle", "Senior"] },
    format: { enum: ["all", "Удалённо", "Гибрид", "Офис"] },
    maxSalary: { type: "string", description: "Пустая строка либо верхний бюджет 1–10000000 RUB/месяц. Сравнивается с нижней границей ожиданий кандидата." },
    hasAchievements: boolean,
    discipline: { const: "all" }, jobId: { const: "all" }, sort: { const: "relevance" },
  }),
  skills: { type: "array", items: str },
  remainingTerms: { type: "array", items: str },
  warnings: { type: "array", items: str },
  blocking: { type: "array", items: str },
  inferredRole: boolean,
  canApply: boolean,
});
spec.paths["/api/assistant/search"] = {
  get: operation(
    "Статус встроенного разбора поискового запроса; только работодатель",
    object({
      configured: boolean,
      engine: str, notice: str,
      maxQueryLength: { const: 500 }, requestsPerMinute: { const: 10 }, requestsPerDay: { const: 100 },
    }),
    undefined, [mode],
  ),
  post: operation(
    "Разобрать введённый запрос встроенными правилами в черновик фильтров",
    object({ intent: ref("SearchIntent"), engine: str }),
    { ...object({ query: { type: "string", minLength: 1, maxLength: 500 }, consent: { const: true } }), required: ["query"] },
    [mode, revision, header("Origin", "Должен совпадать с origin приложения; запросы с другого сайта отклоняются.")],
  ),
};
spec.paths["/api/assistant/search"].get.description = "Действующая сессия работодателя. Встроенный словарь и правила доступны без дополнительной конфигурации. Cache-Control: no-store.";
spec.paths["/api/assistant/search"].post.description = "Нужна сессия работодателя, same-origin Origin и актуальная ревизия. Тело до 4096 байт, query до 500 символов; необязательное consent:true сохранено для совместимости. Встроенный словарь и правила; внешних запросов нет. 10 запросов/минуту и 100/сутки на аккаунт. Журнал хранит только факт операции. OR, отрицания и несколько категорий требуют уточнения. Фильтры применяются отдельно; метод не отправляет приглашения и не меняет квалификацию. Ошибки 401/403/409/413/422/429; 503 при внутреннем сбое.";
for (const resource of ["candidates", "jobs", "offers"]) {
  const key =
    resource === "candidates"
      ? "Candidate"
      : resource === "jobs"
        ? "Job"
        : "Offer";
  const dto = structuredClone(schemas[key]);
  for (const field of [
    "contact",
    "privacy",
    "fspId",
    "candidateContact",
    "employerContact",
    "message",
  ]) {
    delete dto.properties[field];
    dto.required = dto.required.filter((x) => x !== field);
  }
  const op = operation(
    "Только чтение: " + resource + "; scope " + resource + ":read",
    object({
      items: { type: "array", items: dto },
      total: number,
      nextOffset: { type: ["integer", "null"] },
      mode: { enum: ["demo", "live"] },
      version: str,
      privacy: str,
    }),
    undefined,
    [
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      {
        name: "offset",
        in: "query",
        schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
      },
    ],
  );
  op.security = [{ integrationKey: [] }];
  spec.paths["/api/connect/v1/" + resource] = { get: op };
}
for (const [path, methods] of Object.entries(spec.paths))
  for (const op of Object.values(methods)) {
    if (path.startsWith("/api/live/")) {
      op.summary = op.summary
        .replace("демопространства", "рабочего пространства")
        .replace("демопрофиль", "профиль")
        .replace("демокомпании", "компании");
      op.description =
        "Требуется рабочее членство с подтверждённым email. Роль закреплена; кандидат видит только свои данные, работодатель — только свои вакансии и предложения.";
    }
  }

addCareerApi(spec);
addSignalsApi(spec);
addEmployerTestsApi(spec);
addPublicAuthApi(spec);
await writeFile("public/openapi.json", JSON.stringify(spec, null, 2) + "\n");
console.log("OpenAPI generated: " + Object.keys(spec.paths).length + " paths");
