/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
// The v4 contract exposes answer keys only in the author's private test definition.
export function addEmployerTestsApi(spec) {
  const schemas = spec.components.schemas;
  const ref = (name) => ({ $ref: "#/components/schemas/" + name });
  const str = { type: "string" };
  const bool = { type: "boolean" };
  const revision = { type: "integer", minimum: 0 };
  const uuid = { type: "string", format: "uuid" };
  const timestamp = { type: "string", format: "date-time" };
  const nullableTimestamp = { type: ["string", "null"], format: "date-time" };
  const text = (maxLength, minLength = 0) => ({ type: "string", minLength, maxLength });
  const enumeration = (...values) => ({ type: "string", enum: values });
  const array = (items, options = {}) => ({ type: "array", items, ...options });
  const object = (properties, required = Object.keys(properties)) => ({
    type: "object", properties, required, additionalProperties: false,
  });
  const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
  const itemId = {
    type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$",
    not: { enum: ["__proto__", "prototype", "constructor"] },
    description: "Уникальный внутри своего набора идентификатор, 1–80 ASCII-символов; служебные имена объектов запрещены.",
  };
  const questionPublic = {
    id: itemId,
    kind: enumeration("single", "multiple", "text"),
    prompt: text(2000),
    points: { type: "integer", minimum: 1, maximum: 20 },
    options: array(object({ id: itemId, label: text(500) }), { maxItems: 6 }),
    rubric: text(2000),
  };
  schemas.EmployerQuestionPublic = {
    ...object(questionPublic),
    description: "Публичная форма вопроса в адресной попытке. Не содержит ключей или авторских объяснений. Критерии открытого вопроса доступны кандидату до отправки.",
  };
  schemas.EmployerQuestionAuthor = {
    ...object({
      ...questionPublic,
      correctOptionIds: array(itemId, { maxItems: 6, uniqueItems: true }),
      explanation: text(2000),
    }),
    description: "Только работодатель-автор. ID вопросов/вариантов уникальны. Ключи ссылаются на существующие options; single допускает максимум один ключ, text требует пустые options и correctOptionIds. Для публикации prompt≥5; text: rubric≥10; выбор: ≥2 непустых различных без учёта регистра варианта и ≥1 ключ. Черновик может быть незавершённым.",
  };
  schemas.EmployerTestDefinition = {
    ...object({
      title: text(120, 3),
      description: text(3000),
      skill: text(80, 2),
      estimatedMinutes: { type: "integer", minimum: 5, maximum: 180 },
      passingPercent: { type: "integer", minimum: 1, maximum: 100 },
      questions: array(ref("EmployerQuestionAuthor"), { maxItems: 20 }),
    }),
    description: "Определение частного теста работодателя. Пустой набор вопросов допустим лишь в черновике; публикация требует хотя бы один полностью заполненный вопрос. estimatedMinutes — ожидаемые трудозатраты, не отдельный таймер; жёсткий срок попытки — dueAt. Результат не меняет платформенную qualification.",
  };
  schemas.EmployerTest = object({
    ...schemas.EmployerTestDefinition.properties,
    id: uuid,
    revision,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: nullableTimestamp,
    state: enumeration("draft", "published", "archived"),
  });
  schemas.EmployerTestAnswers = {
    type: "object", maxProperties: 20, propertyNames: itemId,
    additionalProperties: {
      oneOf: [text(6000), array(itemId, { maxItems: 6, uniqueItems: true })],
    },
    description: "Ключ — ID вопроса. single/multiple: массив ID вариантов (single максимум один); text: строка до 6000 символов. Неизвестные вопросы/варианты, повторения или неверный тип дают 422. Пропущенные ответы нормализуются в [] или пустую строку. Общий JSON-запрос v4 ограничен 256 KiB.",
    example: { question_1: ["option_2"], question_2: "Объяснение выбранного подхода" },
  };
  schemas.EmployerTestResult = {
    ...object({
      earnedPoints: { type: "integer", minimum: 0, maximum: 400 },
      maxPoints: { type: "integer", minimum: 1, maximum: 400 },
      percent: { type: ["number", "null"], minimum: 0, maximum: 100 },
      passed: { type: ["boolean", "null"] },
      pendingReview: { type: "integer", minimum: 0, maximum: 20 },
      final: bool,
      feedback: text(3000),
      breakdown: array(object({
        questionId: itemId,
        points: { type: ["integer", "null"], minimum: 0, maximum: 20 },
        maxPoints: { type: "integer", minimum: 1, maximum: 20 },
        correct: { type: ["boolean", "null"] },
        feedback: text(2000),
        manual: bool,
      }), { minItems: 1, maxItems: 20 }),
    }),
    description: "Single/multiple дают полный вес лишь при точном совпадении набора ключей; иначе 0, без частичных баллов. Text ожидает ручной оценки (points/correct=null); даже пустой открытый ответ требует review. До всех ручных оценок final=false, percent/passed=null. Процент округлён до 2 знаков только для отображения, порог проверяется по точному отношению. После финализации результат неизменяем, подробности доступны только двум участникам.",
  };
  const attemptSummary = {
    id: uuid,
    revision,
    createdAt: timestamp,
    updatedAt: timestamp,
    testId: uuid,
    testRevision: revision,
    title: text(120, 3),
    skill: text(80, 2),
    employerId: str,
    employerName: str,
    candidateId: str,
    dueAt: timestamp,
    estimatedMinutes: { type: "integer", minimum: 5, maximum: 180 },
    questionCount: { type: "integer", minimum: 1, maximum: 20 },
    state: enumeration("invited", "active", "submitted", "reviewed", "declined", "cancelled"),
    startedAt: nullableTimestamp,
    submittedAt: nullableTimestamp,
    reviewedAt: nullableTimestamp,
    expired: bool,
    savedAnswers: { type: "integer", minimum: 0, maximum: 20 },
    result: nullable(ref("EmployerTestResult")),
  };
  schemas.EmployerTestAttemptSummary = {
    ...object(attemptSummary),
    description: "Снимок версии теста при приглашении, видимый только адресату и отправителю. Работодателю до отправки кандидатом savedAnswers=0 и result=null. После dueAt активная попытка завершается по последним сохранённым ответам при следующем чтении/действии; незапущенное приглашение остаётся invited с expired=true.",
  };
  schemas.EmployerTestAttempt = {
    ...object({
      ...attemptSummary,
      description: text(3000),
      passingPercent: { type: "integer", minimum: 1, maximum: 100 },
      questions: array(ref("EmployerQuestionPublic"), { minItems: 1, maxItems: 20 }),
      answers: ref("EmployerTestAnswers"),
    }),
    description: "Никогда не содержит correctOptionIds/explanation определения. Кандидат читает свои ответы; работодатель получает answers={} до submitted/reviewed. Правила оценивания не меняют основной грейд, не раскрывают контакт и не публикуют результат в общий каталог.",
  };
  schemas.EmployerTestsState = object({
    tests: array(ref("EmployerTest"), { maxItems: 100 }),
    attempts: array(ref("EmployerTestAttemptSummary")),
  });
  schemas.EmployerTestCreate = object({ id: uuid, data: ref("EmployerTestDefinition") });
  schemas.EmployerTestEdit = object({ revision, data: ref("EmployerTestDefinition") });
  schemas.EmployerTestAction = object({ revision, action: enumeration("publish", "archive") });
  schemas.EmployerTestInvitation = {
    ...object({ id: uuid, revision, candidateId: text(100, 1), dueAt: timestamp }),
    description: "revision — текущая ревизия опубликованного теста. dueAt от текущего момента +1 час до +30 дней включительно. Один тест можно назначить одному кандидату один раз, включая отменённые/завершённые попытки; для нового прохождения создаётся новый тест.",
  };
  const simpleAction = (action) => object({ revision, action: { const: action } });
  schemas.EmployerAttemptAction = {
    oneOf: [
      simpleAction("start"),
      object({ revision, action: { const: "save" }, answers: ref("EmployerTestAnswers") }),
      object({ revision, action: { const: "submit" }, answers: ref("EmployerTestAnswers") }, ["revision", "action"]),
      simpleAction("decline"),
      simpleAction("cancel"),
      object({
        revision,
        action: { const: "review" },
        feedback: text(3000, 10),
        reviews: array(object({
          questionId: itemId,
          points: { type: "integer", minimum: 0, maximum: 20 },
          feedback: text(2000, 5),
        }), { minItems: 1, maxItems: 20 }),
      }),
    ],
    discriminator: { propertyName: "action" },
    description: "revision — актуальная ревизия попытки, не теста и не сессии. Кандидат: start/save/submit/decline; работодатель: cancel/review. submit без answers использует сохранённый черновик. review должен содержать каждый открытый вопрос ровно один раз, points не выше веса вопроса. Клиентские score/result/qualification запрещены.",
  };
  schemas.EmployerTestResponse = object({ test: ref("EmployerTest") });
  schemas.EmployerAttemptResponse = object({ attempt: ref("EmployerTestAttempt") });

  const errorDescriptions = {
    400: "Пустой запрос или некорректный JSON",
    401: "Нет доверенной пользовательской сессии",
    403: "Недопустимые роль, Origin или отсутствует подтверждённое live-членство",
    404: "Запись отсутствует/принадлежит другому участнику либо обработка данных кандидата отключена",
    409: "Устаревшая ревизия, конфликт состояния/ID, закрытый срок, повторное назначение или превышен лимит записей",
    413: "JSON-тело больше 262144 байт (256 KiB)",
    415: "Content-Type должен содержать application/json",
    422: "Некорректные поля, ключи, ответы, дата или ручные оценки",
    429: "Превышен часовой лимит действий",
    500: "Внутренняя ошибка; результат операции следует перепроверить чтением",
  };
  const jsonContent = (schema) => ({ "application/json": { schema } });
  const reply = (schema, description) => ({
    description, content: jsonContent(schema),
    headers: {
      "Cache-Control": { schema: { type: "string", const: "no-store" } },
      "X-Content-Type-Options": { schema: { type: "string", const: "nosniff" } },
    },
  });
  const errors = Object.fromEntries(Object.entries(errorDescriptions)
    .map(([code, description]) => [code, reply(ref("Error"), description)]));
  function route(path, method, name, summary, output, { input, description = "", created = false } = {}) {
    for (const [prefix, mode] of [["/api/v4", "Demo"], ["/api/live/v4", "Live"]]) {
      const parameters = [];
      if (path.includes("{id}")) parameters.push({ name: "id", in: "path", required: true, schema: uuid });
      if (method !== "get") parameters.push(
        { name: "Origin", in: "header", required: true, schema: { type: "string", format: "uri" }, description: "Точный origin этого приложения; браузер передаёт автоматически." },
        { name: "X-Session-Revision", in: "header", required: true, schema: { type: "string", pattern: "^(0|[1-9][0-9]*)$" }, description: "Точная строковая ревизия session из v1/state. Не равна ревизии теста/попытки в body." },
      );
      spec.paths[prefix + path] ??= {};
      spec.paths[prefix + path][method] = {
        tags: ["Employer tests v4"],
        operationId: `employerTests${mode}${name}`,
        summary,
        description: description + " " + (mode === "Live"
          ? "Рабочий режим требует членства с подтверждённым email и закреплённой роли."
          : "Демонстрационный режим изолирован по владельцу песочницы.") +
          " JSON до 256 KiB; чтение/изменения только участникам. API-ключи /connect не дают доступ к этим методам.",
        security: [{ platformSession: [] }],
        ...(parameters.length ? { parameters } : {}),
        ...(input ? { requestBody: { required: true, content: jsonContent(ref(input)) } } : {}),
        responses: {
          200: reply(ref(output), created ? "Идентичный повтор: сохранённая запись" : "Актуальное состояние"),
          ...(created ? { 201: reply(ref(output), "Создано") } : {}),
          ...errors,
        },
      };
    }
  }
  route("/state", "get", "State", "Тесты работодателя и адресные попытки", "EmployerTestsState", {
    description: "Работодатель видит свои определения и назначенные им попытки; кандидат — tests=[] и только свои попытки. При отключённом processing попытка исключается. Чтение может завершить просроченные active-попытки исключительно по ранее сохранённым ответам.",
  });
  route("/tests", "post", "Create", "Сохранить черновик теста работодателя", "EmployerTestResponse", {
    input: "EmployerTestCreate", created: true,
    description: "Только работодатель. До 100 тестов на владельца, включая архив; до 30 созданий в час. UUID в body — ключ повтора: одинаковый черновик возвращается без новой записи, изменённое содержимое/состояние даёт 409. Порядок определения значим при проверке идентичности.",
  });
  route("/tests/{id}", "get", "Read", "Прочитать собственный тест с ключами ответов", "EmployerTestResponse", {
    description: "Только автор-работодатель. Кандидат не может читать определение или его ключи; он получает безопасный снимок через attempts/{id}.",
  });
  route("/tests/{id}", "put", "Edit", "Изменить свой черновик по ревизии", "EmployerTestResponse", {
    input: "EmployerTestEdit",
    description: "Только draft. Публикация делает определение неизменяемым; новая версия создаётся отдельным POST. Успех увеличивает revision на 1. Устаревшая ревизия не перезаписывает данные.",
  });
  route("/tests/{id}", "patch", "PublishArchive", "Опубликовать готовый тест или перенести в архив", "EmployerTestResponse", {
    input: "EmployerTestAction",
    description: "publish допустим лишь для draft после проверки всех вопросов. archive допустим для draft/published. Архив не удаляет снимки уже назначенных попыток и не отменяет их; новые назначения из архива запрещены. Возобновление/удаление теста не поддерживается.",
  });
  route("/tests/{id}/invitations", "post", "Invite", "Назначить опубликованный тест конкретному кандидату", "EmployerAttemptResponse", {
    input: "EmployerTestInvitation", created: true,
    description: "Только автор. Кандидат должен быть доступен, иметь согласия processing/publication и категорию. Сохраняется неизменяемый снимок теста/ключей. До 500 попыток работодателя и до 100 назначений в час; одна пара test/candidate на работодателя. Идентичный UUID/testRevision/candidate/dueAt возвращает прежнюю запись. Приглашение на тест не заменяет зарплатное предложение и не раскрывает контакты.",
  });
  route("/attempts/{id}", "get", "Attempt", "Прочитать свою попытку, ответы и доступный результат", "EmployerAttemptResponse", {
    description: "Только кандидат-адресат или отправитель. До сдачи работодатель не читает ответы и даже количество заполненных вопросов. Просроченная active-попытка завершается по последнему сохранению; неполученные сервером локальные изменения не учитываются.",
  });
  route("/attempts/{id}", "patch", "AttemptAction", "Начать, сохранить, отправить, отменить или оценить попытку", "EmployerAttemptResponse", {
    input: "EmployerAttemptAction",
    description: "До 1200 изменений в час на аккаунт. Кандидат: invited→start→active, active→save/submit, invited/active→decline. Работодатель: invited/active→cancel; submitted с ожидаемой ручной оценкой→review→reviewed. Submit может быть неполным; ответы на выбор проверяет сервер, все text-вопросы оценивает автор. При отсутствии text результат сразу reviewed. Повтор start для active возвращает текущую запись; повтор submit с идентичными нормализованными ответами (или без answers) возвращает результат, другой payload даёт 409. Просроченный submit возвращает результат последнего сохранения. Итог нельзя переписать. Обработка профиля и ревизии перепроверяются при записи.",
  });
  spec.tags ??= [];
  spec.tags.push({
    name: "Employer tests v4",
    description: "Приватный конструктор тестов, адресное прохождение, автопроверка и ручная оценка. Результаты не меняют платформенный грейд.",
  });
  spec.info.description += " /api/v4 и /api/live/v4: авторские тесты работодателя, неизменяемые снимки назначений, закрытые ключи, ревизии черновиков и адресные результаты. Qualification-тесты v1 также используют draftRevision для защиты ответов между вкладками.";
}
