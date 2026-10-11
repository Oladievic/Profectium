/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
export function addPublicAuthApi(spec) {
  spec.components.securitySchemes.platformSession = {
    type: "apiKey", in: "cookie", name: "profectium_session",
    description: "Самостоятельная публичная установка (PUBLIC_DEMO_AUTH=true): HttpOnly-сессия регистрации, входа или гостевого режима. Подтверждение email не требуется. В прежнем локальном режиме имя cookie определяется локальным адаптером.",
  };
  const user = {
    type: "object", required: ["userId", "email", "fullName", "displayName", "role", "guest"],
    properties: {
      userId: { type: "string" }, email: { type: "string", format: "email" },
      fullName: { type: "string" }, displayName: { type: "string" },
      role: { enum: ["candidate", "employer"] }, guest: { type: "boolean" },
    },
  };
  const response = { type: "object", properties: {
    user: { anyOf: [user, { type: "null" }] }, emailVerificationRequired: { const: false },
  } };
  const json = (schema) => ({ "application/json": { schema } });
  const origin = { name: "Origin", in: "header", required: true, schema: { type: "string" }, description: "Точный origin сайта." };
  const fields = { email: { type: "string", format: "email", maxLength: 150 }, password: { type: "string", minLength: 6, maxLength: 128 } };
  const bodies = {
    register: { ...fields, fullName: { type: "string", minLength: 2, maxLength: 80 }, role: { enum: ["candidate", "employer"] } },
    login: { ...fields, password: { type: "string", minLength: 1, maxLength: 128 } },
  };
  for (const [action, summary] of Object.entries({ register: "Регистрация без подтверждения email", login: "Вход по email и паролю", guest: "Создать изолированное гостевое демо", logout: "Завершить текущую сессию", session: "Прочитать текущую сессию" })) {
    const status = ["register", "guest"].includes(action) ? "201" : "200";
    const operation = {
      summary, security: [],
      description: "Доступно при PUBLIC_DEMO_AUTH=true. Пароли и сессии не возвращаются в JSON. Сессия устанавливается или удаляется заголовком Set-Cookie. Зарегистрированные пользователи работают в общем пространстве, гости — в личном демо.",
      ...(action !== "session" ? { parameters: [origin] } : {}),
      ...(bodies[action] ? { requestBody: { required: true, content: json({ type: "object", properties: bodies[action], required: Object.keys(bodies[action]), additionalProperties: false }) } } : {}),
      responses: {
        [status]: { description: "Успешно", content: json(action === "logout" ? { type: "object", properties: { ok: { const: true } } } : response) },
        ...Object.fromEntries([401,403,404,409,422,429,503].map((code) => [code, { description: "Ошибка", content: json({ $ref: "#/components/schemas/Error" }) }])),
      },
    };
    spec.paths[`/api/auth/${action}`] = { [action === "session" ? "get" : "post"]: operation };
  }
  for (const [path, methods] of Object.entries(spec.paths)) {
    if (!path.startsWith("/api/live/")) continue;
    for (const operation of Object.values(methods)) {
      if (typeof operation?.description === "string") operation.description = operation.description.replace(
        "Требуется рабочее членство с подтверждённым email.",
        "Требуется рабочее членство. В публичном демонстрационном режиме оно создаётся сразу при регистрации без подтверждения email.",
      );
    }
  }
}
