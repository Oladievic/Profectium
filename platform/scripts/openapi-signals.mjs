/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
// Contract for the implemented v3 handlers. No external feed is fetched by this module.
// Integrate by calling addSignalsApi(spec) after addCareerApi(spec).
export function addSignalsApi(spec) {
  spec.components ??= {};
  spec.components.schemas ??= {};
  spec.paths ??= {};
  spec.info ??= {};
  const schemas = spec.components.schemas;
  const ref = (name) => ({ $ref: "#/components/schemas/" + name });
  const str = { type: "string" };
  const bool = { type: "boolean" };
  const rev = { type: "integer", minimum: 0 };
  const uuid = { type: "string", format: "uuid" };
  const timestamp = { type: "string", format: "date-time" };
  const text = (max, min = 0) => ({
    type: "string",
    maxLength: max,
    minLength: min,
  });
  const array = (items, extras = {}) => ({ type: "array", items, ...extras });
  const obj = (properties, required = Object.keys(properties)) => ({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  });
  const enums = (values) => ({ type: "string", enum: values });
  const roles = [
    "Frontend",
    "Backend",
    "Fullstack",
    "Data Science",
    "DevOps",
    "QA",
  ];
  const grades = ["Junior", "Middle", "Senior"];
  const formats = ["Удалённо", "Гибрид", "Офис"];
  const record = {
    id: str,
    revision: rev,
    createdAt: timestamp,
    candidateId: str,
    employerId: str,
  };
  const money = { type: "integer", minimum: 10000, maximum: 2000000 };
  const nullableMoney = { anyOf: [money, { type: "null" }] };
  const safeUrl = {
    ...text(800, 8),
    format: "uri",
    description:
      "HTTP(S) без логина и пароля; обработчик также отклоняет ряд локальных адресов. URL не загружается сервером. Это не проверка доступности или прав на источник.",
  };

  schemas.SignalFilters = obj({
    query: text(100),
    role: enums(["all", ...roles]),
    grade: enums(["all", ...grades]),
    format: enums(["all", ...formats]),
    maxSalary: {
      type: "string",
      pattern: "^(|[1-9]\\d{0,6})$",
      description:
        "Пустая строка или положительное целое в строке, не выше 2000000.",
    },
    hasAchievements: bool,
    discipline: {
      ...text(100, 1),
      description: "all либо точное название дисциплины.",
    },
    jobId: {
      ...text(100),
      description:
        "all или пустая строка — без вакансии. Иначе доступная активная вакансия обычного каталога.",
    },
    sort: enums(["relevance", "salary", "experience"]),
  });
  schemas.SignalRadarInput = obj({
    title: text(80, 3),
    filters: ref("SignalFilters"),
  });
  schemas.SignalRadarCreate = obj({ id: uuid, data: ref("SignalRadarInput") });
  schemas.SignalRadarPatch = {
    ...obj(
      {
        revision: rev,
        action: enums(["acknowledge", "pause", "resume", "edit"]),
        data: ref("SignalRadarInput"),
      },
      ["revision", "action"],
    ),
    description:
      "Для edit поле data обязательно. acknowledge и edit обновляют просмотренный снимок. pause влияет на счётчик внимания, пересчёт состояния продолжается.",
    allOf: [
      {
        if: { properties: { action: { const: "edit" } }, required: ["action"] },
        then: { required: ["data"] },
      },
    ],
  };
  schemas.SignalRadarView = obj({
    ...record,
    ...schemas.SignalRadarInput.properties,
    checkedAt: timestamp,
    paused: bool,
    total: { type: "integer", minimum: 0, maximum: 500 },
    added: array(str, { maxItems: 500 }),
    changed: array(str, { maxItems: 500 }),
    removed: { type: "integer", minimum: 0, maximum: 500 },
    ids: array(str, { maxItems: 500 }),
  });
  schemas.SignalRadarView.description =
    "До 500 текущих доступных профилей; прежние значения и ID исчезнувших профилей не возвращаются. Сохранённый seen не входит в ответ.";

  schemas.SignalSourceInput = obj({
    name: text(100, 3),
    website: safeUrl,
    category: enums(["company", "board", "community", "internship"]),
  });
  schemas.SignalSource = obj({
    ...record,
    ...schemas.SignalSourceInput.properties,
    active: bool,
  });
  schemas.SignalFeedItem = {
    ...obj({
      externalId: text(100, 1),
      title: text(140, 3),
      company: text(120, 2),
      url: safeUrl,
      role: enums(roles),
      grade: enums(grades),
      workFormat: enums(formats),
      employment: enums(["job", "internship"]),
      salaryMin: nullableMoney,
      salaryMax: nullableMoney,
      skills: array(text(50, 1), { maxItems: 20 }),
      description: text(2000, 20),
      publishedAt: {
        ...timestamp,
        description:
          "Дата с часовым поясом, не позднее текущего времени более чем на 5 минут.",
      },
    }),
    description:
      "Все поля обязательны. Обе границы зарплаты null либо обе целые; salaryMax >= salaryMin. Домен url должен совпасть с hostname источника. Материал остаётся приватным.",
    oneOf: [
      {
        properties: {
          salaryMin: { type: "null" },
          salaryMax: { type: "null" },
        },
      },
      { properties: { salaryMin: money, salaryMax: money } },
    ],
  };
  schemas.SignalListing = obj({
    ...record,
    ...schemas.SignalFeedItem.properties,
    sourceId: uuid,
    fingerprint: str,
    review: enums(["pending", "accepted", "rejected"]),
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    history: array(
      obj({
        at: timestamp,
        fields: array(enums(Object.keys(schemas.SignalFeedItem.properties))),
      }),
      { maxItems: 10 },
    ),
  });
  schemas.SignalListing.description =
    "Приватный материал работодателя. accepted означает ручное решение владельца, не публикацию или верификацию компании. История содержит имена изменённых полей, не прежние значения.";

  schemas.SignalImportLine = obj(
    {
      index: { type: "integer", minimum: 0 },
      status: enums(["new", "changed", "unchanged", "invalid", "duplicate"]),
      errors: array(str),
      warnings: array(str),
      id: str,
      expectedRevision: {
        type: "integer",
        minimum: -1,
        description: "-1 означает отсутствие записи на момент предпросмотра.",
      },
      item: ref("SignalFeedItem"),
      fingerprint: str,
      changedFields: array(
        enums(Object.keys(schemas.SignalFeedItem.properties)),
      ),
    },
    ["index", "status", "errors", "warnings"],
  );
  schemas.SignalImportRun = obj(
    {
      ...record,
      sourceId: uuid,
      sourceRevision: rev,
      phase: enums(["preview", "committed"]),
      expiresAt: timestamp,
      rows: array(ref("SignalImportLine"), { minItems: 1, maxItems: 20 }),
      committedAt: timestamp,
    },
    [
      ...Object.keys(record),
      "sourceId",
      "sourceRevision",
      "phase",
      "expiresAt",
      "rows",
    ],
  );
  schemas.SignalImportRun.description =
    "Сохраняемый приватный протокол. Предпросмотр действует 15 минут и не изменяет listings; mutationNonce в ответ не передаётся.";
  schemas.SignalImportPreviewInput = obj({
    sourceId: uuid,
    sourceRevision: rev,
    items: array(
      {},
      {
        minItems: 1,
        maxItems: 20,
        description:
          "Каждый элемент проверяется отдельно по SignalFeedItem. Ошибочные элементы допустимы в запросе предпросмотра и возвращаются как invalid; поэтому items не ограничен только валидным FeedItem.",
      },
    ),
  });

  schemas.SignalActionTask = obj({
    id: str,
    kind: enums(["request", "dialogue"]),
    title: str,
    detail: str,
    dueAt: timestamp,
    targetId: str,
    done: bool,
  });
  schemas.SignalActionTask.description =
    "Производная карточка доступного действия. done — личная отметка текущей стороны, а не статус исходного объекта.";
  schemas.SignalsState = obj({
    radars: array(ref("SignalRadarView"), { maxItems: 20 }),
    sources: array(ref("SignalSource"), { maxItems: 20 }),
    listings: array(ref("SignalListing"), { maxItems: 500 }),
    imports: array(ref("SignalImportRun"), { maxItems: 10 }),
    plans: array({}, { maxItems: 0, deprecated: true, description: "Всегда пустой массив для совместимости со старыми клиентами." }),
    tasks: array(ref("SignalActionTask")),
    generatedAt: timestamp,
  });
  schemas.SignalsState.description =
    "Кандидат получает пустые radars/sources/listings/imports. Задачи ограничены доступными проверками навыков и диалогами. Демо и live изолированы.";

  const json = (schema) => ({ "application/json": { schema } });
  const errorDescriptions = {
    400: "Некорректное тело запроса",
    401: "Требуется сессия",
    403: "Роль или Origin не разрешают действие",
    404: "Запись или маршрут недоступны",
    409: "Конфликт версии, срока или перехода; перечитайте состояние",
    413: "Тело запроса превышает 32768 байт",
    415: "Требуется application/json",
    422: "Некорректная схема или превышен лимит",
    429: "Слишком много изменений",
    500: "Внутренняя ошибка",
    503: "Рабочая среда недоступна",
  };
  const errors = (mutation) =>
    Object.fromEntries(
      (mutation
        ? [400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 503]
        : [401, 403, 404, 409, 422, 500, 503]
      ).map((n) => [
        String(n),
        {
          description: errorDescriptions[n],
          content: json(ref("Error")),
        },
      ]),
    );
  const revisionHeader = {
    name: "X-Session-Revision",
    in: "header",
    required: true,
    schema: str,
    description:
      "Текущая session.revision из v1/state той же области. JSON revision относится к конкретной записи.",
  };
  const originHeader = {
    name: "Origin",
    in: "header",
    required: true,
    schema: { type: "string", format: "uri" },
    description:
      "Должен точно совпасть с origin URL запроса. Браузер устанавливает этот заголовок самостоятельно.",
  };
  const pathId = { name: "id", in: "path", required: true, schema: str };
  function route(path, method, summary, options = {}) {
    const mutation = method !== "get";
    const {
      input,
      output = ref("SignalsState"),
      created = false,
      description = "",
      parameters = [],
      mediaType = "application/json",
      filename,
      example,
    } = options;
    const successful = {
      description: filename ? "Скачиваемый снимок" : "Успешно",
      content: {
        [mediaType]: {
          schema: output,
          ...(example ? { example } : {}),
        },
      },
      ...(filename
        ? {
            headers: {
              "Content-Disposition": {
                schema: { type: "string" },
                description: 'attachment; filename="' + filename + '"',
              },
              "Cache-Control": {
                schema: { type: "string", const: "no-store" },
              },
            },
          }
        : {}),
    };
    for (const prefix of ["/api/v3", "/api/live/v3"]) {
      const live = prefix.includes("/live/");
      spec.paths[prefix + path] ??= {};
      spec.paths[prefix + path][method] = {
        tags: ["Signals v3"],
        summary,
        description:
          "Сессионный API платформы. Интеграционный read-only Bearer key не разрешает этот контракт. " +
          (live
            ? "Подтверждённое рабочее членство. "
            : "Личная демопесочница. ") +
          (mutation
            ? "Точный Origin и X-Session-Revision; тело JSON до 32768 байт. Лимит изменений: 100 на минутный интервал владельца. "
            : "") +
          description,
        security: [{ platformSession: [] }],
        parameters: [
          ...(path.includes("{id}") ? [pathId] : []),
          ...(mutation ? [originHeader, revisionHeader] : []),
          ...parameters,
        ],
        ...(input
          ? { requestBody: { required: true, content: json(input) } }
          : {}),
        responses: {
          [created ? "201" : "200"]: successful,
          ...errors(mutation),
        },
      };
    }
  }

  route(
    "/state",
    "get",
    "Доступные радары, приватные материалы и действия",
    {
      description:
        "Состояние пересчитывает дельту радаров и сроки при чтении. Прежнее содержание исчезнувших профилей не возвращается.",
    },
  );
  route("/calendar", "get", "Скачать ICS текущих неотмеченных действий", {
    output: str,
    mediaType: "text/calendar",
    filename: "profectium-actions.ics",
    description:
      "Все текущие неотмеченные доступные задачи. UTC-события на 30 минут являются маркерами сроков; нет отправки приглашений или автоматической синхронизации.",
  });
  route("/export", "get", "Скачать CSV текущего поиска без контактных полей", {
    output: str,
    mediaType: "text/csv",
    filename: "profectium-candidates.csv",
    description:
      "Только работодатель; до 500 текущих доступных профилей, явный перечень колонок, фильтры и время снимка, UTF-8 BOM, разделитель ;, защита формул. Неактивная указанная вакансия вызывает 409.",
    parameters: [
      {
        name: "filters",
        in: "query",
        required: false,
        content: { "application/json": { schema: ref("SignalFilters") } },
        description:
          "URL-кодированный JSON. При отсутствии применяются defaultFilters обычного каталога.",
      },
    ],
  });
  route(
    "/radars",
    "post",
    "Сохранить радар и отметить текущую выборку просмотренной",
    {
      input: ref("SignalRadarCreate"),
      created: true,
      description:
        "Только работодатель; до 20 радаров. Все заполненные фильтры применяются вместе. Повтор занятого UUID не создаёт ещё один радар.",
    },
  );
  route("/radars/{id}", "patch", "Изменить радар, просмотр или паузу", {
    input: ref("SignalRadarPatch"),
    description:
      "Только владелец. revision обязательна; edit требует data. acknowledge/edit сохраняют текущий снимок. Удаление не предусмотрено.",
  });
  route("/sources", "post", "Создать приватный источник работодателя", {
    input: obj({ id: uuid, data: ref("SignalSourceInput") }),
    created: true,
    description:
      "До 20 источников. active=true при создании. Добавление ссылки не вызывает сетевой запрос и не доказывает владение сайтом.",
  });
  route("/sources/{id}", "patch", "Включить или приостановить свой источник", {
    input: obj({ revision: rev, active: bool }),
    description:
      "Изменение revision источника делает прежний неподтверждённый предпросмотр неактуальным.",
  });
  route(
    "/imports/preview",
    "post",
    "Сохранить приватный предпросмотр JSON без изменения входящих",
    {
      input: ref("SignalImportPreviewInput"),
      output: obj({ preview: ref("SignalImportRun") }),
      created: true,
      description:
        "До 20 строк; источник активен и sourceRevision точна. Строки проверяются отдельно; invalid/duplicate остаются в протоколе. Канонический URL должен принадлежать hostname источника. Протокол действует 15 минут; материалы не публикуются.",
    },
  );
  route(
    "/imports/{id}/commit",
    "post",
    "Подтвердить корректные строки сохранённого предпросмотра",
    {
      input: obj({ revision: rev }),
      description:
        "Только владелец. Повтор committed возвращает текущее состояние без нового импорта. Перед batch проверяются источник, версии материалов, URL-коллизии и предел 500 записей. Изменённые строки требуют новой ручной проверки; неизменённые сохраняют содержание и review. Отсутствующие строки не закрываются.",
    },
  );
  route(
    "/listings/{id}",
    "patch",
    "Записать ручную проверку приватного материала",
    {
      input: obj({
        revision: rev,
        review: enums(["pending", "accepted", "rejected"]),
      }),
      description:
        "Только работодатель-владелец. accepted не публикует материал и не подтверждает компанию. Адаптация в собственный бриф выполняется через существующий v2/briefs.",
    },
  );
  route(
    "/tasks",
    "post",
    "Отметить доступное действие для себя или вернуть его",
    {
      input: obj({ taskId: text(250, 3), done: bool }),
      description:
        "ID должен присутствовать в текущей очереди. Отметка принадлежит текущей стороне; не завершает исходный запрос или диалог. JSON revision здесь не передаётся.",
    },
  );
  spec.tags ??= [];
  if (!spec.tags.some((tag) => tag.name === "Signals v3")) {
    spec.tags.push({
      name: "Signals v3",
      description:
        "Радары, личные сроки, экспорты и приватный JSON-импорт.",
    });
  }
  spec.info.version = "0.5.0";
}
