/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. */
/* Free local language rules and tools backed by the current Profectium session. */
(function () {
  if (window.ProfectiumSearch) return;
  const KEY = 'fsp-search-config', LOG = 'fsp-search-log';
  const DEF = { anonymize: true, budget: 0, features: { search: true, explain: true, drafts: true, rubric: false, resume: true, tasks: true }, checkedAt: '' };
  function clean(c) { return { anonymize: c?.anonymize !== false, budget: 0, checkedAt: c?.checkedAt || '', features: Object.assign({}, DEF.features, c?.features, { rubric: false }) }; }
  function config() { try { return clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return clean({}); } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(clean(c))); } catch (e) {} window.dispatchEvent(new Event('fsp-search-config')); }
  save(config());
  function log() { try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) { return []; } }
  function pushLog(entry) { const l = log(); l.unshift(Object.assign({ at: Date.now(), via: 'локально', method: 'Правила и шаблоны' }, entry)); try { localStorage.setItem(LOG, JSON.stringify(l.slice(0, 40))); } catch (e) {} }
  function label() { return 'Локальные правила · бесплатно'; }
  async function test() { const t0 = performance.now(); const ok = parseQuery('Backend Middle Python удалённо до 260').role === 'Backend'; pushLog({ purpose: 'проверка локальных правил', ms: Math.round(performance.now() - t0), ok }); return { ok, ms: Math.round(performance.now() - t0), text: 'Локальные правила работают; внешних запросов нет' }; }
  const ALIAS = { 'питон': 'Python', 'пайтон': 'Python', 'кафк': 'Kafka', 'постгр': 'PostgreSQL', 'postgres': 'PostgreSQL', 'реакт': 'React', 'кубер': 'Kubernetes', 'k8s': 'Kubernetes', 'докер': 'Docker', 'редис': 'Redis', 'джанго': 'Django', 'тайпскрипт': 'TypeScript', 'ts': 'TypeScript', 'го ': 'Go', 'golang': 'Go', 'вью': 'Vue', 'плейрайт': 'Playwright', 'терраформ': 'Terraform' };
  function parseQuery(q) {
    const F = window.FSP, s = ' ' + q.toLowerCase() + ' ';
    const out = { role: null, grade: null, skills: [], format: null, fsp_only: false, max_salary: null };
    const R = [['Data Science', /data|дата|ml\b|машинн|модел|аналитик данн|catboost|pandas/], ['DevOps', /devops|девопс|кубер|k8s|kubernetes|terraform|инфраструкт|sre/], ['QA', /\bqa\b|тестировщ|тестирован|автотест|playwright/], ['Fullstack', /fullstack|фулл?стек|full-stack/], ['Frontend', /front|фронт|react|реакт|vue|вью|верстк|интерфейс/], ['Backend', /back|бэк|бек|python|питон|go\b|golang|java|kafka|кафк|api|сервер/]];
    for (const [r, re] of R) if (re.test(s)) { out.role = r; break; }
    if (/джун|junior|начина|стаж[её]р/.test(s)) out.grade = 'Junior';
    else if (/сень|синь|senior|ведущ|лид|архитект/.test(s)) out.grade = 'Senior';
    else if (/мидл|middle|мид\b|опытн/.test(s)) out.grade = 'Middle';
    const pool = F ? Object.values(F.stack).flat() : [];
    pool.forEach(k => { if (s.indexOf(k.toLowerCase()) >= 0 && out.skills.indexOf(k) < 0) out.skills.push(k); });
    Object.keys(ALIAS).forEach(a => { if (s.indexOf(a) >= 0 && out.skills.indexOf(ALIAS[a]) < 0) out.skills.push(ALIAS[a]); });
    if (/удал|remote|дистанц/.test(s)) out.format = 'Удалённо'; else if (/гибрид/.test(s)) out.format = 'Гибрид'; else if (/офис/.test(s)) out.format = 'Офис';
    if (/фсп|приз|олимп|соревн|хакатон|чемпион/.test(s)) out.fsp_only = true;
    const m = s.match(/до\s*(\d[\d\s]*)\s*(к|k|тыс|000)?/);
    if (m) { let v = parseInt(m[1].replace(/\s/g, ''), 10); if (v > 2000) v = Math.round(v / 1000); out.max_salary = v; }
    return out;
  }
  async function understand(q) {
    const t0 = performance.now();
    const result = Object.assign(parseQuery(q), { engine: 'локальные правила · бесплатно' });
    pushLog({ purpose: 'поиск в каталоге', ms: Math.round(performance.now() - t0), ok: true });
    return result;
  }
  async function currentState() {
    const api = window.ProfectiumAPI;
    if (!api) throw new Error('Откройте опубликованный сайт и войдите в аккаунт.');
    await api.ready();
    return await api.getState();
  }
  function candidateView(c, anon) {
    const ach = c.achievements || [];
    const score = c.qualification ? Number(c.qualification.score || 0) : 0;
    return { id: c.id, name: anon ? 'Кандидат ' + c.id : c.fullName, role: c.role, grade: c.grade,
      score, test: Math.round(score * 0.6) + '/60', fsp: ach.length + ' демонстрационных достижений',
      skills: c.skills || [], expectations: Math.round(c.salaryMin / 1000) + '–' + Math.round(c.salaryMax / 1000) + ' тыс ₽',
      format: c.workFormat, city: anon ? undefined : c.city, bio: c.bio,
      achievements: ach.map(a => a.place + ' место из ' + a.participants + ', ' + a.competition + ' ' + a.year),
      contacts: 'Контакты не выдаются этим инструментом' };
  }
  function catalogTools(hooks) {
    hooks = hooks || {};
    const F = window.FSP;
    const wrap = (name, fn) => async input => {
      const id = hooks.onCall ? hooks.onCall(name, input || {}) : null;
      const t0 = performance.now();
      try { const out = await fn(input || {}); if (hooks.onResult) hooks.onResult(id, out, false); pushLog({ purpose: name, ms: Math.round(performance.now() - t0), ok: true }); return out; }
      catch (e) { if (hooks.onResult) hooks.onResult(id, String(e.message || e), true); pushLog({ purpose: name, ms: Math.round(performance.now() - t0), ok: false, err: String(e.message || e) }); throw e; }
    };
    return [
      { name: 'list_categories', scope: 'candidates:read', description: 'Категории и количество доступных профилей из текущего серверного каталога.', input_schema: { type: 'object', properties: {} },
        run: wrap('list_categories', async () => { const s = await currentState(); return JSON.stringify(F.roles.map(role => Object.assign({ role }, Object.fromEntries(F.grades.map(g => [g, s.candidates.filter(c => c.role === role && c.grade === g).length]))))); }) },
      { name: 'search_candidates', scope: 'candidates:read', description: 'Поиск доступных кандидатов по категории, навыкам, формату работы и зарплате. Данные берутся с сервера.', input_schema: { type: 'object', properties: { role: { type: 'string', enum: F.roles }, grade: { type: 'string', enum: F.grades }, skills: { type: 'array', items: { type: 'string' } }, fsp_only: { type: 'boolean' }, format: { type: 'string' }, max_salary: { type: 'number' }, limit: { type: 'number' } }, required: ['role', 'grade'] },
        run: wrap('search_candidates', async a => { const s = await currentState(); const list = s.candidates.filter(c => c.role === a.role && c.grade === a.grade && (!a.fsp_only || (c.achievements || []).length) && (!a.format || c.workFormat === a.format) && (!a.max_salary || c.salaryMin <= a.max_salary * 1000));
          const hits = c => (a.skills || []).filter(k => (c.skills || []).some(s => s.toLowerCase() === k.toLowerCase())).length;
          list.sort((a, b) => hits(b) - hits(a) || (b.qualification?.score || 0) - (a.qualification?.score || 0));
          return JSON.stringify(list.slice(0, Math.min(20, Math.max(1, Number(a.limit) || 5))).map(c => candidateView(c, config().anonymize))); }) },
      { name: 'get_candidate', scope: 'candidates:read', description: 'Доступный профиль из текущего серверного каталога. Контакты не возвращаются.', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        run: wrap('get_candidate', async a => { const s = await currentState(); const c = s.candidates.find(c => c.id === a.id); if (!c) throw new Error('Кандидат не найден или недоступен.'); return JSON.stringify(candidateView(c, config().anonymize)); }) },
      { name: 'send_invitation', scope: 'session:employer', confirm: true, description: 'Отправить настоящее приглашение от текущего работодателя только после подтверждения в интерфейсе. Зарплата в тысячах рублей.', input_schema: { type: 'object', properties: { candidate_id: { type: 'string' }, title: { type: 'string' }, salary_from: { type: 'number' }, salary_to: { type: 'number' }, message: { type: 'string' } }, required: ['candidate_id', 'title', 'salary_from', 'salary_to', 'message'] },
        run: wrap('send_invitation', async a => {
          const s = await currentState();
          if (s.session.role !== 'employer') throw new Error('Приглашения отправляет работодатель.');
          if (!Number.isFinite(a.salary_from) || !Number.isFinite(a.salary_to) || a.salary_from <= 0 || a.salary_to < a.salary_from) throw new Error('Проверьте диапазон зарплаты.');
          if (!s.company?.name || !s.company?.contact) throw new Error('Сначала заполните название и контакт компании в Пульте.');
          if (!s.candidates.some(c => c.id === a.candidate_id)) throw new Error('Кандидат недоступен.');
          const ok = hooks.confirm ? await hooks.confirm(a) : false;
          if (!ok) return JSON.stringify({ status: 'rejected_by_human', note: 'Отправка отменена' });
          const id = crypto.randomUUID();
          const result = await window.ProfectiumAPI.request('offers', { method: 'POST', headers: { 'Idempotency-Key': id }, body: { candidateId: a.candidate_id, jobId: '', jobTitle: a.title, employerContact: s.company.contact, salaryMin: Math.round(a.salary_from * 1000), salaryMax: Math.round(a.salary_to * 1000), message: a.message } });
          const fresh = result && Array.isArray(result.offers) ? result : await currentState();
          if (!fresh.offers.some(o => o.id === id)) throw new Error('Сервер не подтвердил отправку. Обновите список приглашений.');
          return JSON.stringify({ status: 'sent', invitation_id: id, note: 'Приглашение сохранено на сервере и доступно кандидату' });
        }) },
      { name: 'list_invitations', scope: 'offers:read', description: 'Настоящие приглашения текущего аккаунта: pending, accepted, declined, withdrawn.', input_schema: { type: 'object', properties: { status: { type: 'string' } } },
        run: wrap('list_invitations', async a => { const s = await currentState(); return JSON.stringify(s.offers.filter(o => !a.status || o.status === a.status || (a.status === 'sent' && o.status === 'pending')).map(o => ({ id: o.id, candidate_id: o.candidateId, title: o.jobTitle, salary: Math.round(o.salaryMin / 1000) + '–' + Math.round(o.salaryMax / 1000), status: o.status }))); }) }
    ];
  }
  window.ProfectiumSearch = { config, save, log, label, test, parseQuery, understand, catalogTools };
})();
