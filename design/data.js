/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */
(function () {
  const roles = ['Frontend', 'Backend', 'Fullstack', 'Data Science', 'DevOps', 'QA'];
  const grades = ['Junior', 'Middle', 'Senior'];
  const counts = { Frontend: [14, 23, 9], Backend: [11, 23, 12], Fullstack: [6, 15, 8], 'Data Science': [9, 12, 4], DevOps: [3, 10, 7], QA: [12, 17, 5] };
  const roleRu = { Frontend: 'Frontend-разработчик', Backend: 'Backend-разработчик', Fullstack: 'Fullstack-разработчик', 'Data Science': 'Data Scientist', DevOps: 'DevOps-инженер', QA: 'QA-инженер' };
  const stack = {
    Frontend: ['TypeScript', 'React', 'Next.js', 'Vue', 'CSS', 'Playwright', 'Vite', 'Redux', 'Storybook'],
    Backend: ['Python', 'FastAPI', 'Django', 'Go', 'PostgreSQL', 'Redis', 'Kafka', 'Celery', 'gRPC', 'Docker'],
    Fullstack: ['TypeScript', 'React', 'Node.js', 'NestJS', 'PostgreSQL', 'Vue', 'Python', 'Docker'],
    'Data Science': ['Python', 'SQL', 'pandas', 'scikit-learn', 'CatBoost', 'PyTorch', 'MLflow', 'Airflow'],
    DevOps: ['Linux', 'Kubernetes', 'Terraform', 'Docker', 'Ansible', 'Prometheus', 'GitLab CI', 'Nginx'],
    QA: ['Тест-дизайн', 'Postman', 'SQL', 'Python', 'pytest', 'Playwright', 'Allure', 'REST API']
  };
  const salary = { Junior: [80, 150], Middle: [170, 260], Senior: [280, 400] };
  const years = { Junior: [0, 2], Middle: [2, 5], Senior: [5, 10] };
  const first = ['Анна', 'Глеб', 'Мирон', 'Ксения', 'Олег', 'Дарья', 'Савва', 'Яна', 'Роман', 'Злата', 'Фёдор', 'Майя', 'Егор', 'Лада', 'Платон', 'Вика', 'Арсений', 'Таисия', 'Никита', 'Ульяна'];
  const last = [['Кудрин', 'Кудрина'], ['Ветров', 'Ветрова'], ['Осокин', 'Осокина'], ['Гранин', 'Гранина'], ['Рябов', 'Рябова'], ['Ершов', 'Ершова'], ['Комаров', 'Комарова'], ['Лесков', 'Лескова'], ['Мельник', 'Мельник'], ['Зорин', 'Зорина'], ['Тихонов', 'Тихонова'], ['Сафронов', 'Сафронова']];
  const female = { 'Анна': 1, 'Ксения': 1, 'Дарья': 1, 'Яна': 1, 'Злата': 1, 'Майя': 1, 'Лада': 1, 'Вика': 1, 'Таисия': 1, 'Ульяна': 1 };
  const cities = ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург', 'Томск', 'Самара', 'Пермь', 'Краснодар', 'Иннополис', 'Владивосток', 'Уфа'];
  const formats = ['Удалённо', 'Гибрид', 'Офис'];
  const comps = [
    ['Кубок «Северный круг»', 'Алгоритмическое программирование', 64],
    ['Турнир «Код и команда»', 'Продуктовое программирование', 28],
    ['Хакатон «Открытая задача»', 'Продуктовое программирование', 32],
    ['Лига «Алгоритмический маршрут»', 'Алгоритмическое программирование', 96],
    ['Турнир «Данные и решение»', 'Анализ данных', 44],
    ['Чемпионат «Командный прототип»', 'Продуктовое программирование', 20],
    ['Кубок «Защита периметра»', 'Информационная безопасность', 36]
  ];
  const A = (comp, disc, place, of, year, role) => ({ comp, disc, place, of, year, role });
  const base = [
    { id: 'c01', name: 'Алина Вересова', role: 'Frontend', grade: 'Middle', city: 'Казань', format: 'Удалённо', smin: 180, smax: 230, years: 3, test: 47, skills: ['TypeScript', 'React', 'Next.js', 'CSS', 'Playwright', 'Доступность'], bio: 'Разрабатывала личный кабинет с таблицами, поиском и ролевым доступом. Хочет работать над продуктом, где качество интерфейса проверяют исследованиями и автотестами.', ach: [A('Турнир «Код и команда»', 'Продуктовое программирование', 3, 28, 2025, 'Разработчик интерфейса')] },
    { id: 'c02', name: 'Марк Ладов', role: 'Frontend', grade: 'Junior', city: 'Томск', format: 'Гибрид', smin: 80, smax: 110, years: 1, test: 36, skills: ['JavaScript', 'TypeScript', 'Vue', 'Pinia', 'HTML', 'CSS'], bio: 'Собрал учебную систему записи на мероприятия с календарём и состояниями загрузки. Ищет команду с регулярным ревью кода.', ach: [A('Лига «Алгоритмический маршрут»', 'Алгоритмическое программирование', 18, 96, 2026, 'Индивидуальный участник')] },
    { id: 'c03', name: 'Илья Берестов', role: 'Backend', grade: 'Senior', city: 'Санкт-Петербург', format: 'Удалённо', smin: 300, smax: 380, years: 7, test: 56, skills: ['Go', 'PostgreSQL', 'Redis', 'Kafka', 'gRPC', 'Docker'], bio: 'Проектировал сервисы обработки заказов и идемпотентные операции для очередей событий. Интересуется надёжностью, наблюдаемостью и инженерными практиками.', ach: [A('Кубок «Северный круг»', 'Алгоритмическое программирование', 2, 64, 2024, 'Индивидуальный участник'), A('Турнир «Код и команда»', 'Продуктовое программирование', 3, 28, 2025, 'Разработчик серверной части')] },
    { id: 'c04', name: 'Вера Снежина', role: 'Backend', grade: 'Middle', city: 'Новосибирск', format: 'Гибрид', smin: 190, smax: 250, years: 4, test: 50, skills: ['Python', 'FastAPI', 'Django', 'PostgreSQL', 'Celery', 'Kafka', 'pytest'], bio: 'Разрабатывала API для внутреннего документооборота и фоновые задачи импорта данных. Предпочитает задачи с ясными контрактами, миграциями и интеграционными тестами.', ach: [A('Хакатон «Открытая задача»', 'Продуктовое программирование', 5, 32, 2026, 'Разработчик API'), A('Кубок «Северный круг»', 'Алгоритмическое программирование', 9, 64, 2025, 'Индивидуальный участник')] },
    { id: 'c05', name: 'Денис Кленов', role: 'Fullstack', grade: 'Middle', city: 'Екатеринбург', format: 'Офис', smin: 200, smax: 260, years: 4, test: 46, skills: ['TypeScript', 'React', 'Node.js', 'NestJS', 'PostgreSQL', 'Prisma'], bio: 'Вёл функции от схемы данных до интерфейса в сервисе бронирования оборудования. Любит небольшие продуктовые команды.', ach: [A('Чемпионат «Командный прототип»', 'Продуктовое программирование', 1, 20, 2025, 'Разработчик полного цикла')] },
    { id: 'c06', name: 'Полина Ракитина', role: 'Fullstack', grade: 'Senior', city: 'Москва', format: 'Удалённо', smin: 290, smax: 360, years: 6, test: 55, skills: ['TypeScript', 'Vue', 'Nuxt', 'Python', 'FastAPI', 'PostgreSQL', 'Docker'], bio: 'Развивала B2B-сервис с несколькими организациями, разграничением прав и аудитом действий. Готова отвечать за архитектуру направления.', ach: [A('Хакатон «Открытая задача»', 'Продуктовое программирование', 2, 32, 2026, 'Капитан команды')] },
    { id: 'c07', name: 'Тимур Озеров', role: 'Data Science', grade: 'Middle', city: 'Нижний Новгород', format: 'Удалённо', smin: 210, smax: 280, years: 3, test: 49, skills: ['Python', 'SQL', 'pandas', 'scikit-learn', 'CatBoost', 'MLflow'], bio: 'Строил модели прогноза спроса с временной валидацией и сравнением с базовыми моделями.', ach: [A('Турнир «Данные и решение»', 'Анализ данных', 2, 44, 2025, 'Разработчик моделей')] },
    { id: 'c08', name: 'Ника Белова', role: 'Data Science', grade: 'Junior', city: 'Пермь', format: 'Гибрид', smin: 100, smax: 140, years: 1, test: 38, skills: ['Python', 'SQL', 'pandas', 'NumPy', 'scikit-learn', 'Matplotlib'], bio: 'Готовила наборы данных для классификации обращений и проверяла качество разметки.', ach: [A('Лига «Первый датасет»', 'Анализ данных', 7, 52, 2026, 'Подготовка данных')] },
    { id: 'c09', name: 'Артём Вязов', role: 'DevOps', grade: 'Senior', city: 'Краснодар', format: 'Удалённо', smin: 280, smax: 350, years: 8, test: 54, skills: ['Linux', 'Kubernetes', 'Terraform', 'Docker', 'Prometheus', 'Grafana', 'GitLab CI'], bio: 'Поддерживал инфраструктуру продуктовой команды, автоматизировал развёртывание и восстановление резервных копий.', ach: [] },
    { id: 'c10', name: 'Софья Липина', role: 'DevOps', grade: 'Middle', city: 'Самара', format: 'Гибрид', smin: 190, smax: 250, years: 4, test: 45, skills: ['Linux', 'Docker', 'Ansible', 'Nginx', 'Bash', 'GitHub Actions'], bio: 'Настраивала тестовые окружения, сборку контейнеров и сбор журналов для нескольких сервисов.', ach: [A('Чемпионат «Командный прототип»', 'Продуктовое программирование', 1, 20, 2025, 'Инфраструктура')] },
    { id: 'c11', name: 'Лев Травин', role: 'QA', grade: 'Middle', city: 'Воронеж', format: 'Удалённо', smin: 150, smax: 200, years: 4, test: 44, skills: ['Тест-дизайн', 'Postman', 'SQL', 'Python', 'pytest', 'Allure'], bio: 'Тестировал API и пользовательские сценарии сервиса согласования заявок, поддерживал регрессионный набор.', ach: [] },
    { id: 'c12', name: 'Ева Яснова', role: 'QA', grade: 'Middle', city: 'Санкт-Петербург', format: 'Офис', smin: 170, smax: 220, years: 3, test: 43, skills: ['TypeScript', 'Playwright', 'REST API', 'SQL', 'Тест-дизайн', 'CI/CD'], bio: 'Автоматизировала ключевые пользовательские сценарии и разбирала нестабильные тесты в CI.', ach: [A('Турнир «Код и команда»', 'Продуктовое программирование', 8, 28, 2025, 'Тестирование')] }
  ];
  const needs = [
    { id: 'none', title: 'Без привязки к потребности' },
    { id: 'pay', title: 'Платёжный сервис', role: 'Backend', grade: 'Middle', skills: ['Python', 'PostgreSQL', 'Kafka', 'Redis', 'Docker'] },
    { id: 'web', title: 'Кабинет клиента', role: 'Frontend', grade: 'Middle', skills: ['TypeScript', 'React', 'Playwright', 'CSS'] },
    { id: 'ml', title: 'Прогноз спроса', role: 'Data Science', grade: 'Middle', skills: ['Python', 'SQL', 'CatBoost', 'MLflow'] }
  ];
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function initials(n) { return n.split(' ').map(p => p[0]).join('').slice(0, 2); }
  function fspScore(ach) {
    let s = 0; ach.forEach(a => { s += a.place === 1 ? 12 : a.place === 2 ? 10 : a.place === 3 ? 9 : a.place <= 5 ? 7 : a.place <= 10 ? 5 : 3; });
    return Math.min(20, s);
  }
  function generate(role, grade, i) {
    const r = rng(hash(role + '|' + grade + '|' + i));
    const fn = pick(r, first), ln = pick(r, last);
    const name = fn + ' ' + (female[fn] ? ln[1] : ln[0]);
    const pool = stack[role].slice().sort(() => r() - 0.5);
    const sk = pool.slice(0, 5 + Math.floor(r() * 2));
    const [s0, s1] = salary[grade]; const smin = Math.round((s0 + r() * (s1 - s0) * 0.6) / 10) * 10;
    const [y0, y1] = years[grade];
    const tb = grade === 'Junior' ? 30 : grade === 'Middle' ? 38 : 46;
    const ach = [];
    const nA = r() < 0.38 ? 0 : r() < 0.7 ? 1 : 2;
    for (let k = 0; k < nA; k++) { const c = pick(r, comps); ach.push(A(c[0], c[1], 1 + Math.floor(r() * Math.min(30, c[2])), c[2], 2023 + Math.floor(r() * 4), r() < 0.5 ? 'Индивидуальный участник' : 'Участник команды')); }
    return { id: 'g-' + roles.indexOf(role) + '-' + grades.indexOf(grade) + '-' + i, name, role, grade, city: pick(r, cities), format: pick(r, formats), smin, smax: smin + 40 + Math.round(r() * 5) * 10, years: y0 + Math.floor(r() * (y1 - y0 + 1)), test: tb + Math.floor(r() * 12), skills: sk, bio: 'Синтетический профиль для демонстрации ранжирования внутри категории.', ach, _r: r() };
  }
  function enrich(c, need) {
    const out = Object.assign({}, c);
    out.initials = initials(c.name);
    out.fsp = fspScore(c.ach);
    if (need && need.skills) {
      const m = need.skills.filter(s => c.skills.includes(s));
      out.matched = m; out.missing = need.skills.filter(s => !c.skills.includes(s));
      out.skillFit = Math.round(m.length / need.skills.length * 15);
    } else {
      out.matched = c.skills.filter(s => stack[c.role].includes(s)); out.missing = [];
      out.skillFit = Math.min(15, 6 + out.matched.length * 1.5 | 0);
    }
    out.salaryFit = c.smax <= 260 ? 5 : c.smax <= 320 ? 4 : 3;
    out.total = Math.min(100, c.test + out.fsp + out.skillFit + out.salaryFit);
    out.correct = Math.round(c.test / 10);
    out.salary = c.smin + '–' + c.smax + ' тыс ₽';
    out.roleRu = roleRu[c.role];
    const prize = c.ach.filter(a => a.place <= 3).length;
    out.fspLine = c.ach.length ? (prize ? prize + ' призов' + (prize === 1 ? 'ое место' : 'ых места') + ' ФСП' : c.ach.length + ' старт' + (c.ach.length === 1 ? '' : 'а') + ' ФСП') : 'без истории ФСП';
    out.why = 'Тест ' + c.test + '/60 · ' + out.fspLine + ' · навыки ' + out.skillFit + '/15';
    return out;
  }
  function category(role, grade, needId) {
    if (!roles.includes(role) || !grades.includes(grade)) return [];
    const need = needs.find(n => n.id === needId);
    const real = base.filter(c => c.role === role && c.grade === grade);
    const size = counts[role][grades.indexOf(grade)];
    const gen = []; for (let i = 0; gen.length < size - real.length; i++) gen.push(generate(role, grade, i));
    return real.concat(gen).map(c => enrich(c, need)).sort((a, b) => b.total - a.total);
  }
  function byId(id, needId) {
    const need = needs.find(n => n.id === needId);
    const b = base.find(c => c.id === id);
    if (b) return enrich(b, need);
    const m = /^g-(\d)-(\d)-(\d+)$/.exec(id || '');
    if (m && roles[+m[1]] && grades[+m[2]] && Number.isSafeInteger(+m[3])) return enrich(generate(roles[+m[1]], grades[+m[2]], +m[3]), need);
    return enrich(base[3], need);
  }
  const topics = {
    Frontend: ['Порядок микрозадач', 'Связь label и поля', 'Внешняя ширина блока', 'Снятие обработчика', 'Ключи в списках', 'Расчёт бюджета кадра'],
    Backend: ['Идемпотентный POST', 'Составной индекс', 'Изменяемый аргумент', 'At-least-once в Kafka', 'Расчёт мощности', 'Миграция без простоя'],
    Fullstack: ['Кэш на границе', 'Транзакция и гонка', 'SSR и гидрация', 'Валидация контракта', 'Расчёт мощности', 'Миграция без простоя'],
    'Data Science': ['Утечка в валидации', 'Метрика при дисбалансе', 'Временной сплит', 'Базовая модель', 'Расчёт выборки', 'Дрейф признаков'],
    DevOps: ['Readiness и liveness', 'Откат релиза', 'Лимиты памяти', 'Хранение секретов', 'Расчёт реплик', 'Бэкап и проверка'],
    QA: ['Граничные значения', 'Классы эквивалентности', 'Нестабильный тест', 'Контракт API', 'Расчёт покрытия', 'Приоритизация регресса']
  };
  window.FSP = { roles, grades, counts, roleRu, needs, category, byId, topics, stack, base: base.map(c => ({ id: c.id, name: c.name, role: c.role, grade: c.grade, city: c.city })) };
  window.dispatchEvent(new Event('fsp-data'));
})();
