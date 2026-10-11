/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
// Contract for the implemented /v2 handlers. No credentials or fixture answer keys.
export function addCareerApi(spec) {
  const schemas = spec.components.schemas,
    ref = (n) => ({ $ref: "#/components/schemas/" + n });
  const str = { type: "string" },
    bool = { type: "boolean" },
    rev = { type: "integer", minimum: 0 },
    uuid = { type: "string", format: "uuid" },
    timestamp = { type: "string", format: "date-time" };
  const text = (max, min = 0) => ({
    type: "string",
    maxLength: max,
    minLength: min,
  });
  const array = (items) => ({ type: "array", items });
  const obj = (properties, required = Object.keys(properties)) => ({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  });
  const skills = { ...array(text(80, 1)), maxItems: 20 },
    format = { enum: ["Удалённо", "Гибрид", "Офис"] },
    onCall = { enum: ["yes", "no", "discuss"] },
    money = { type: "integer", minimum: 10000, maximum: 2000000 };
  const baseTerms = {
    salaryMin: money,
    salaryMax: money,
    workFormat: format,
    coreHours: text(100),
    onCall,
  };
  schemas.CareerTerms = obj({
    ...baseTerms,
    firstMonths: text(2000, 10),
    interviewSteps: text(1000),
    reviewProcess: text(1000),
    mentoring: text(500),
  });
  schemas.IncomingRules = obj({
    minimumSalary: { type: "integer", minimum: 0, maximum: 2000000 },
    formats: { ...array(format), maxItems: 3 },
    coreHours: text(100),
    onCall,
    strict: bool,
    interests: skills,
  });
  schemas.ProfileControls = obj({
    anonymous: bool,
    rules: ref("IncomingRules"),
  });
  schemas.BriefInput = obj({
    title: text(100, 3),
    role: {
      enum: [
        "Frontend",
        "Backend",
        "Fullstack",
        "Data Science",
        "DevOps",
        "QA",
      ],
    },
    outcomes: { ...array(text(400, 5)), minItems: 1, maxItems: 6 },
    mandatory: skills,
    desirable: skills,
    trainable: skills,
    coveredSkills: skills,
    ...baseTerms,
  });
  schemas.CareerBrief = obj({
    ...schemas.BriefInput.properties,
    id: str,
    revision: rev,
    updatedAt: timestamp,
    createdAt: timestamp,
    candidateId: str,
    employerId: str,
  });
  // Optional in storage/API for existing needs; the new UI requires an explicit grade.
  const briefGrade = {
    type: "string", enum: ["Junior", "Middle", "Senior"],
    description: "Требуемый подтверждённый грейд. Отсутствие сохраняет старую потребность без ограничения уровня. Самоописанный грейд кандидата не используется.",
  };
  schemas.BriefInput.properties.grade = briefGrade;
  schemas.CareerBrief.properties.grade = briefGrade;
  schemas.ProofInput = obj({
    title: text(120, 3),
    skill: text(80, 2),
    summary: text(1000, 10),
    artifact: text(6000, 10),
    published: bool,
  });
  schemas.SkillProof = obj(
    {
      ...schemas.ProofInput.properties,
      id: str,
      candidateId: str,
      kind: { enum: ["self", "assessment", "competition", "case"] },
      source: str,
      status: { enum: ["claimed", "recorded", "evaluated"] },
      createdAt: timestamp,
      synthetic: bool,
      limits: str,
      score: { type: "integer", minimum: 0, maximum: 100 },
      revision: rev,
      employerId: str,
    },
    [
      "id",
      "candidateId",
      "title",
      "skill",
      "kind",
      "summary",
      "artifact",
      "source",
      "status",
      "createdAt",
      "published",
      "synthetic",
      "limits",
    ],
  );
  const record = {
    id: str,
    revision: rev,
    createdAt: timestamp,
    candidateId: str,
    employerId: str,
  };
  schemas.VerificationCreate = obj({
    id: uuid,
    candidateId: text(80, 1),
    skill: text(80, 2),
    title: text(120, 3),
    criteria: text(2000, 20),
    estimatedMinutes: { type: "integer", minimum: 5, maximum: 45 },
    dueAt: timestamp,
  });
  schemas.SkillVerification = obj({
    ...schemas.VerificationCreate.properties,
    ...record,
    state: {
      enum: ["requested", "submitted", "reviewed", "declined", "cancelled"],
    },
    response: str,
    proofId: str,
    feedback: str,
    decision: { enum: ["confirmed", "more-evidence", ""] },
  });
  schemas.VisibilityGrant = obj({
    ...record,
    fields: {
      ...array({ enum: ["identity", "artifacts"] }),
      minItems: 1,
      maxItems: 2,
    },
    expiresAt: timestamp,
    revoked: bool,
    recipientName: str,
  });
  schemas.LabCase = obj({
    id: str,
    skill: str,
    role: str,
    title: str,
    summary: str,
    scenario: str,
    artifact: str,
    requirements: array(str),
    estimatedMinutes: { type: "integer" },
    decisions: array(
      obj({
        id: str,
        prompt: str,
        options: array(obj({ id: str, label: str, patch: str })),
      }),
    ),
    rubric: array(obj({ id: str, label: str, maxPoints: { type: "integer" } })),
  });
  schemas.LabRun = obj({
    ...record,
    caseId: str,
    caseTitle: str,
    answers: { type: "object", additionalProperties: str },
    explanation: str,
    published: bool,
    artifact: str,
    score: { type: "integer" },
    feedback: array(obj({ prompt: str, correct: bool, explanation: str })),
    executedCode: { const: false },
  });
  const participant = { enum: ["employer", "candidate"] };
  schemas.CareerDialogue = obj({
    ...record,
    offerId: str,
    terms: ref("CareerTerms"),
    turn: participant,
    agreed: bool,
    versions: array(
      obj({
        version: { type: "integer" },
        by: participant,
        at: timestamp,
        terms: ref("CareerTerms"),
        note: str,
      }),
    ),
    events: array(
      obj(
        {
          id: str,
          at: timestamp,
          by: participant,
          kind: { enum: ["message", "step", "feedback", "agreement"] },
          text: str,
          dueAt: timestamp,
        },
        ["id", "at", "by", "kind", "text"],
      ),
    ),
  });
  schemas.CareerState = obj({
    briefs: array(ref("CareerBrief")),
    proofs: array(ref("SkillProof")),
    requests: array(ref("SkillVerification")),
    grants: array(ref("VisibilityGrant")),
    runs: array(ref("LabRun")),
    dialogues: array(ref("CareerDialogue")),
    recipients: array(obj({ id: str, name: str })),
    controls: { anyOf: [ref("ProfileControls"), { type: "null" }] },
    candidateRevision: rev,
    views: array(
      obj({ id: str, at: timestamp, employer: str, candidateId: str }),
    ),
  });
  const content = (s) => ({ "application/json": { schema: s } }),
    idParam = { name: "id", in: "path", required: true, schema: str },
    revisionHeader = {
      name: "X-Session-Revision",
      in: "header",
      required: true,
      schema: str,
      description:
        "Текущая session.revision из v1/state. JSON revision — версия конкретной записи; значения не взаимозаменяемы.",
    };
  const error = Object.fromEntries(
    [401, 403, 404, 409, 413, 415, 422, 429, 500].map((n) => [
      n,
      { description: "Ошибка " + n, content: content(ref("Error")) },
    ]),
  );
  function route(
    path,
    method,
    summary,
    input,
    out = ref("CareerState"),
    created = false,
  ) {
    const mutation = method !== "get",
      op = {
        tags: ["Career v2"],
        summary,
        description:
          "Сессия Profectium. " +
          (mutation
            ? "Точный same-origin Origin, X-Session-Revision; JSON revision требуется для изменения существующей записи. Конфликт возвращает 409; перечитайте состояние перед повтором. "
            : "") +
          "Данные ограничены участниками взаимодействия. Демоданные не являются реестром ФСП.",
        security: [{ platformSession: [] }],
        parameters: [
          ...(path.includes("{id}") ? [idParam] : []),
          ...(mutation ? [revisionHeader] : []),
        ],
        responses: {
          [created ? "201" : "200"]: {
            description: "Успешно",
            content: content(out),
          },
          ...error,
        },
        ...(input
          ? { requestBody: { required: true, content: content(input) } }
          : {}),
      };
    for (const prefix of ["/api/v2", "/api/live/v2"]) {
      spec.paths[prefix + path] ??= {};
      spec.paths[prefix + path][method] = {
        ...op,
        description:
          op.description +
          (prefix.includes("live")
            ? " Требуется подтверждённое рабочее членство."
            : " Личная демопесочница."),
      };
    }
  }
  route(
    "/state",
    "get",
    "Рабочее пространство: собственные и доступные записи",
  );
  route(
    "/proofs/{id}",
    "get",
    "Паспорт доступного кандидата; identity и artifacts независимы",
    undefined,
    obj({ proofs: array(ref("SkillProof")) }),
  );
  route(
    "/proofs",
    "post",
    "Добавить самоописание и артефакт; оценку нельзя подделать",
    obj({ id: uuid, data: ref("ProofInput") }),
    undefined,
    true,
  );
  route(
    "/proofs/{id}",
    "patch",
    "Изменить публикацию своего артефакта",
    obj({ revision: rev, published: bool }),
  );
  route(
    "/briefs",
    "post",
    "Создать личную потребность работодателя",
    obj({ id: uuid, data: ref("BriefInput") }),
    undefined,
    true,
  );
  route(
    "/briefs/{id}",
    "put",
    "Обновить потребность с точной версией",
    obj({ id: uuid, revision: rev, data: ref("BriefInput") }),
  );
  route(
    "/controls",
    "put",
    "Настроить обезличивание и строгие правила приглашений",
    obj({ revision: rev, data: ref("ProfileControls") }),
  );
  route(
    "/parse",
    "post",
    "Извлечь редактируемый черновик по словарю без сохранения",
    obj({ kind: { enum: ["brief", "resume"] }, text: text(12000, 20) }),
    obj({
      kind: { enum: ["brief", "resume"] },
      engine: { const: "rules" },
      skills: array(str),
      role: str,
      workFormat: format,
      outcomes: array(str),
      warnings: array(str),
    }),
  );
  route(
    "/resume-import",
    "post",
    "Подтверждённое кандидатом обновление самоописания без изменения категории",
    obj({
      revision: rev,
      skills: { ...array(text(50, 1)), minItems:1, maxItems: 20 },
      bio: text(2000, 20),
    }),
  );
  route(
    "/lab",
    "get",
    "Каталог двенадцати инженерных кейсов",
    undefined,
    obj({
      cases: array(
        obj({
          id: str,
          role: str,
          title: str,
          summary: str,
          estimatedMinutes: { type: "integer" },
        }),
      ),
      method: str,
    }),
  );
  route(
    "/lab/{id}",
    "get",
    "Кейс без правильных ответов и пояснений",
    undefined,
    obj({ case: ref("LabCase") }),
  );
  route(
    "/lab/{id}",
    "post",
    "Оценить выбор исправлений и сохранить разбор; код не исполняется",
    obj({
      id: uuid,
      answers: { type: "object", additionalProperties: text(100, 1) },
      explanation: text(3000, 20),
      published: bool,
    }),
    undefined,
    true,
  );
  // An exact lab retry returns 200, while the initial write returns 201.
  for (const prefix of ["/api/v2", "/api/live/v2"])
    spec.paths[prefix + "/lab/{id}"].post.responses["200"] = {
      description: "Повтор исходного запроса без новой попытки",
      content: content(ref("CareerState")),
    };
  route(
    "/requests",
    "post",
    "Запросить один навык: 5–45 минут, срок от часа до 30 дней",
    ref("VerificationCreate"),
    undefined,
    true,
  );
  route(
    "/requests/{id}",
    "patch",
    "Ответить, отказаться, оценить или отменить собственный запрос",
    obj(
      {
        revision: rev,
        action: { enum: ["submit", "decline", "review", "cancel"] },
        response: text(2000),
        proofId: text(100),
        feedback: text(2000),
        decision: { enum: ["confirmed", "more-evidence"] },
      },
      ["revision", "action"],
    ),
  );
  route(
    "/grants",
    "post",
    "Раскрыть identity и/или artifacts выбранной компании на 1–30 дней",
    obj({
      id: uuid,
      employerId: text(150, 1),
      fields: {
        ...array({ enum: ["identity", "artifacts"] }),
        minItems: 1,
        maxItems: 2,
      },
      expiresInDays: { type: "integer", minimum: 1, maximum: 30 },
    }),
    undefined,
    true,
  );
  route(
    "/grants/{id}",
    "patch",
    "Отозвать своё разрешение, в том числе после отключения обработки",
    obj({ revision: rev }),
  );
  route(
    "/proof-view/{id}",
    "post",
    "Записать открытие паспорта интерфейсом; не полный журнал API",
    obj({}),
    obj({ recorded: bool }),
  );
  route(
    "/dialogues/{id}",
    "post",
    "Открыть согласование pending предложения от своего работодателя",
    obj({ terms: ref("CareerTerms") }),
    undefined,
    true,
  );
  route(
    "/dialogues/{id}",
    "patch",
    "Встречные условия, согласование или общая запись; принимает только кандидат",
    obj(
      {
        revision: rev,
        action: { enum: ["propose", "agree", "message", "step", "feedback"] },
        terms: ref("CareerTerms"),
        note: text(2000),
        dueAt: timestamp,
      },
      ["revision", "action"],
    ),
  );
  route(
    "/sandbox",
    "post",
    "Синтетический сценарий ФСП; только demo employer, без сети и импорта",
    obj({ scenario: { enum: ["success", "timeout", "partial", "changed"] } }),
    obj({
      scenario: str,
      status: str,
      records: { type: "integer" },
      message: str,
      synthetic: { const: true },
      networkRequest: { const: false },
      imported: { const: false },
      at: timestamp,
    }),
  );
  spec.paths["/api/live/v2/sandbox"].post.responses = { 403: error["403"] };
  schemas.Offer.properties.workFormat = format;
  schemas.Offer.properties.coreHours = text(100);
  schemas.Offer.properties.onCall = onCall;
  schemas.Offer.properties.hasDialogue = bool;
  Object.assign(schemas.OfferInput.properties,{workFormat:{...format,default:'Удалённо'},coreHours:{...text(100),default:''},onCall:{...onCall,default:'discuss'}});
  const connected=spec.paths['/api/connect/v1/candidates'].get.responses['200'].content['application/json'].schema.properties.items.items;
  Object.assign(connected.properties,{incomingRules:ref('IncomingRules'),isAnonymous:bool});
  const connectedOffers=spec.paths['/api/connect/v1/offers'].get.responses['200'].content['application/json'].schema.properties.items.items;
  Object.assign(connectedOffers.properties,{workFormat:format,coreHours:text(100),onCall,hasDialogue:bool});
  schemas.Candidate.properties.incomingRules = ref("IncomingRules");
  schemas.Candidate.properties.isAnonymous = bool;
  schemas.Candidate.properties.controls = ref("ProfileControls");
  for (const prefix of ["/api/v1", "/api/live/v1"]) {
    const input =
      spec.paths[prefix + "/offers"]?.post?.requestBody?.content?.[
        "application/json"
      ]?.schema;
    if (input?.properties)
      Object.assign(input.properties, {
        workFormat: { ...format, default: "Удалённо" },
        coreHours: { ...text(100), default: "" },
        onCall: { ...onCall, default: "discuss" },
      });
  }
  spec.info.version = "0.4.0";
}
