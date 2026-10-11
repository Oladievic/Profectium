/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import { defaultFilters, type Filters, type Grade, type Role } from "./types";

export type SearchIntent = {
  filters: Filters;
  skills: string[];
  remainingTerms: string[];
  warnings: string[];
  blocking: string[];
  inferredRole: boolean;
  canApply: boolean;
};

const rolePatterns: [Role, RegExp][] = [
  ["Frontend", /\bfront[ -]?end\b|фронт[еэ]нд(?:ер|а|разработчик)?|фронтенд-разработчик/gu],
  ["Backend", /\bback[ -]?end\b|б[еэ]к[еэ]нд(?:ер|а|разработчик)?|бэкенд-разработчик/gu],
  ["Fullstack", /\bfull[ -]?stack\b|фулл?ст[еэ]к(?:а|разработчик)?/gu],
  ["Data Science", /\bdata\s+(?:science|scientist)\b|\bml(?:-engineer)?\b|дата[ -]са[йе]н[тс]\p{L}*|машинн\p{L}*\s+обучени\p{L}*/gu],
  ["DevOps", /\bdevops\b|\bsre\b|девопс\p{L}*/gu],
  ["QA", /\bqa\b|тестировщик\p{L}*/gu],
];
const gradePatterns: [Grade, RegExp][] = [
  ["Junior", /\bjunior\b|джуниор\p{L}*|джун\p{L}*|стажер\p{L}*/gu],
  ["Middle", /\bmiddle\b|мидд?л\p{L}*/gu],
  ["Senior", /\bsenior\b|сеньор\p{L}*|синьор\p{L}*|сеньер\p{L}*/gu],
];
const skillAliases: [string, string[], Role?][] = [
  ["JavaScript", ["javascript", "js", "джаваскрипт"]],
  ["TypeScript", ["typescript", "ts", "тайпскрипт"]],
  ["Python", ["python", "питон", "пайтон"], "Backend"],
  ["Go", ["go", "golang", "голанг"], "Backend"],
  ["Java", ["java", "джава"], "Backend"],
  ["React", ["react", "react.js", "реакт"], "Frontend"],
  ["Vue", ["vue", "vue.js", "вью"], "Frontend"],
  ["Next.js", ["next.js", "nextjs"]],
  ["Node.js", ["node.js", "nodejs", "node"]],
  ["PostgreSQL", ["postgresql", "postgres", "постгрес"]],
  ["SQL", ["sql"]], ["Kafka", ["kafka", "кафка"]],
  ["Redis", ["redis", "редис"]], ["Django", ["django", "джанго"]],
  ["FastAPI", ["fastapi"]], ["Docker", ["docker", "докер"]],
  ["Kubernetes", ["kubernetes", "k8s", "кубер", "кубернетес"]],
  ["Terraform", ["terraform", "терраформ"]], ["Linux", ["linux", "линукс"]],
  ["Playwright", ["playwright", "плейрайт"]], ["pytest", ["pytest"]],
  ["HTML", ["html"]], ["CSS", ["css"]], ["Git", ["git", "гит"]],
  ["C++", ["c++", "си++"]], ["C#", ["c#", "csharp"]],
  ["Rust", ["rust", "раст"]], ["PHP", ["php"]],
  ["pandas", ["pandas"]], ["PyTorch", ["pytorch"]],
  ["CatBoost", ["catboost"]], ["scikit-learn", ["scikit-learn"]],
];
const boundary = (source: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, "gu");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Local, deterministic query interpretation. Unknown terms stay in the text filter. */
export function parseSearchIntent(input: string): SearchIntent {
  const filters: Filters = { ...defaultFilters };
  const warnings: string[] = [], blocking: string[] = [], skills: string[] = [];
  let rest = input.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
  let inferredRole = false;
  if (!rest) return { filters, skills, remainingTerms: [], warnings, blocking: ["Введите запрос для поиска."], inferredRole, canApply: false };
  if (rest.length > 500) blocking.push("Запрос слишком длинный. Оставьте до 500 символов с ключевыми условиями.");
  if (boundary("или|or").test(rest)) blocking.push("Поиск применяет все условия одновременно. Для альтернатив «или» выполните отдельные поиски или оставьте один вариант.");
  if (boundary("не|без|кроме|not|except").test(rest)) blocking.push("Исключения и отрицания не поддерживаются. Укажите нужные условия без «не», «без» или «кроме».");
  const take = (pattern: RegExp) => {
    const matches = [...rest.matchAll(pattern)];
    if (matches.length) rest = rest.replace(pattern, " ");
    return matches;
  };
  const foundRoles = rolePatterns.filter(([, pattern]) => take(boundary(pattern.source)).length).map(([value]) => value);
  const foundGrades = gradePatterns.filter(([, pattern]) => take(boundary(pattern.source)).length).map(([value]) => value);
  if (foundRoles.length === 1) filters.role = foundRoles[0];
  if (foundRoles.length > 1) blocking.push("Указано несколько специализаций. Выберите одну категорию для этого поиска.");
  if (foundGrades.length === 1) filters.grade = foundGrades[0];
  if (foundGrades.length > 1) blocking.push("Указано несколько грейдов. Выберите один грейд или уберите их из запроса.");
  const formats: string[] = [];
  if (take(boundary("удален\\p{L}*|remote|дистанцион\\p{L}*")).length) formats.push("Удалённо");
  if (take(boundary("гибрид\\p{L}*|hybrid")).length) formats.push("Гибрид");
  if (take(boundary("офис\\p{L}*|office|onsite|on-site")).length) formats.push("Офис");
  if (formats.length === 1) filters.format = formats[0];
  if (formats.length > 1) blocking.push("Указано несколько форматов работы. Оставьте один формат или выберите «Любой» в обычных фильтрах.");

  const amount = "(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)";
  const unit = "\\s*(тыс\\.?|[кk]|руб(?:лей|ля|ль)?\\.?|₽)?";
  if (new RegExp(`(?:от\\s*${amount}|\\d+\\s*[-–—]\\s*\\d+)\\s*(?:тыс|[кk]|руб|₽)`, "u").test(rest)) blocking.push("Сейчас доступен только верхний бюджет «до … ₽». Нижнюю границу или диапазон уточните в обычном запросе к кандидату.");
  const budget = new RegExp(`(?<![\\p{L}\\p{N}_])(?:до|бюджет(?:ом)?|under|max)\\s*${amount}${unit}(?![\\p{L}\\p{N}_])`, "gu");
  const budgets = take(budget);
  const bareBudget = new RegExp(`(?<![\\p{L}\\p{N}_])${amount}\\s*(тыс\\.?|[кk]|руб(?:лей|ля|ль)?\\.?|₽)(?![\\p{L}\\p{N}_])`, "gu");
  const bareBudgets = take(bareBudget);
  if (bareBudgets.length) warnings.push("Сумма без «до» прочитана как верхняя граница бюджета. Проверьте её перед применением.");
  budgets.push(...bareBudgets);
  const parsedBudgets = budgets.map((m) => {
    const value = Number(m[1].replace(/[ \u00a0]/g, "").replace(",", "."));
    const suffix = m[2] || "";
    if (!suffix && value < 1000) {
      warnings.push(`«${m[1]}» без единицы прочитано как ${value} ₽. Для тысяч напишите «${m[1]} тыс».`);
    }
    return Math.round(value * (/^(?:тыс|к|k)/.test(suffix) ? 1000 : 1));
  });
  if (parsedBudgets.length > 1) blocking.push("Указано несколько границ бюджета. Оставьте одну верхнюю границу «до … ₽».");
  if (parsedBudgets.length === 1) {
    const value = parsedBudgets[0];
    if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000_000) blocking.push("Укажите бюджет от 1 до 10 000 000 ₽ в месяц.");
    else filters.maxSalary = String(value);
  }
  if (take(boundary("фсп|fsp|соревновани\\p{L}*|олимпиад\\p{L}*|хакатон\\p{L}*")).length) filters.hasAchievements = true;
  const inferredRoles: Role[] = [];
  const aliasToSkill = new Map(skillAliases.flatMap(([skill, aliases]) => aliases.map((alias) => [alias, skill] as const)));
  const foundSkills = new Set(take(boundary([...aliasToSkill.keys()].sort((a, b) => b.length - a.length).map(escape).join("|"))).map((match) => aliasToSkill.get(match[0])));
  for (const [skill, , role] of skillAliases) {
    if (foundSkills.has(skill)) {
      skills.push(skill);
      if (role) inferredRoles.push(role);
    }
  }
  // Skills are intentionally not converted to a category: Python is used by Backend, ML and QA.
  // A suggestion is transparent and does not silently narrow the search.
  if (!foundRoles.length && new Set(inferredRoles).size === 1) {
    inferredRole = true;
    warnings.push(`Стек может относиться к ${inferredRoles[0]}, но специализация не задана. Сохранён поиск по всем категориям.`);
  }
  take(boundary("ищу|ищем|найти|найди|покажи|нужен|нужна|нужны|нужного|специалист\\p{L}*|разработчик\\p{L}*|инженер\\p{L}*|кандидат\\p{L}*|сотрудник\\p{L}*|программист\\p{L}*|уровня|грейд(?:а|ом)?|на|по|с|со|s|и|and|в|для|опытом|опыт|знанием|знаниями|навыками|умеет|стеком|стек|работы|работать|работой|бюджетом|зарплатой|зарплата|рублей|руб|rur|rub|месяц|месяце|мес|участия|участием|достижениями|подтвержденными"));
  const remainingTerms = [...new Set(rest.replace(/[,;:!?()«»“”"\[\]]/g, " ").replace(/(^|\s)[\-–—./]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean))];
  if (remainingTerms.length) warnings.push(`Осталось в текстовом поиске: ${remainingTerms.join(", ")}. Эти слова должны встречаться в профиле; специальные условия из них не выводились.`);
  filters.query = [...skills, ...remainingTerms].join(" ");
  if (skills.length > 1) warnings.push("Указанные навыки ищутся вместе: нужны все слова запроса. Поиск проверяет текст профиля и стек, а не наличие сертификата по каждому навыку.");
  if (filters.maxSalary) warnings.push("Бюджет сравнивается с нижней границей ожиданий кандидата, в ₽ за месяц до вычета налогов.");
  return { filters, skills, remainingTerms, warnings, blocking, inferredRole, canApply: blocking.length === 0 };
}
