/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. */
(function () {
  if (window.ProfectiumAPI) return;
  const listeners = new Set();
  let initialization, loading, queue = Promise.resolve();
  const roles = ['Frontend', 'Backend', 'Fullstack', 'Data Science', 'DevOps', 'QA'];
  const grades = ['Junior', 'Middle', 'Senior'];
  const roleRu = { Frontend: 'Frontend-разработчик', Backend: 'Backend-разработчик', Fullstack: 'Fullstack-разработчик', 'Data Science': 'Data Scientist', DevOps: 'DevOps-инженер', QA: 'QA-инженер' };
  const landing = '/Лендинг.dc.html';
  const isLanding = () => location.pathname === '/' || /(?:Лендинг\.dc\.html|signin|index\.html)$/.test(decodeURI(location.pathname));
  const api = window.ProfectiumAPI = {
    user: null, state: null, mode: 'live',
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ready() {
      if (!initialization) initialization = (async () => {
        const result = await json('/api/auth/session');
        api.user = result.user;
        if (!api.user) {
          if (!isLanding()) location.replace(landing + '?return_to=' + encodeURIComponent(location.pathname + location.search));
          throw new Error('Войдите или откройте гостевое демо.');
        }
        const selected = new URLSearchParams(location.search).get('mode');
        if (selected === 'demo' || selected === 'live') sessionStorage.setItem('profectium-space', selected);
        api.mode = api.user.guest ? 'demo' : sessionStorage.getItem('profectium-space') === 'demo' ? 'demo' : 'live';
        return api.getState();
      })().catch(error => { initialization = null; throw error; });
      return initialization;
    },
    async getState() {
      if (!api.user) return api.ready();
      if (!loading) loading = json(base() + '/state').then(apply).finally(() => { loading = null; });
      return loading;
    },
    request(path, options = {}) {
      const execute = async () => {
        await api.ready();
        const method = options.method || 'GET';
        const url = path.startsWith('/api/') ? path : base() + '/' + path.replace(/^\//, '');
        if (!url.startsWith('/api/') || url.includes('://')) throw new Error('Недопустимый адрес API.');
        const headers = { 'Content-Type': 'application/json', 'X-Session-Revision': String(api.state.session.revision), ...options.headers };
        if (method === 'POST' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID();
        const result = await json(url, { method, headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
        if (result.session && Array.isArray(result.candidates)) apply(result);
        else if (method !== 'GET') await api.getState();
        return result;
      };
      if ((options.method || 'GET') === 'GET') return execute();
      const next = queue.then(execute, execute);
      queue = next.catch(() => {});
      return next;
    },
    async ensureRole(role) {
      await api.ready();
      if (api.state.session.role === role) return api.state;
      if (api.mode !== 'demo') throw new Error(role === 'candidate' ? 'Эта страница для кандидата. Откройте кабинет работодателя или гостевое демо.' : 'Эта страница для работодателя. Откройте свой кабинет или гостевое демо.');
      return api.request('session', { method: 'POST', body: { role, candidateId: api.state.session.candidateId || api.state.demoPersonas[0]?.id || api.state.candidates[0]?.id } });
    },
    async auth(action, body = {}) {
      const result = await json('/api/auth/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      api.user = result.user;
      api.state = null;
      initialization = null;
      sessionStorage.setItem('profectium-space', result.user.guest ? 'demo' : 'live');
      await api.ready();
      return result;
    },
    async logout() {
      await json('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      sessionStorage.removeItem('profectium-space');
      location.assign(landing);
    },
    home() { return api.state?.session.role === 'candidate' ? '/Кабинет-кандидата.dc.html' : '/Пульт.dc.html'; },
    async setMode(mode) {
      sessionStorage.setItem('profectium-space', mode);
      const role = mode === 'live' ? api.user?.role : api.state?.session.role;
      const home = role === 'candidate' ? '/Кабинет-кандидата.dc.html' : '/Пульт.dc.html';
      location.assign(home + '?mode=' + mode);
    },
    toCandidate(raw, needId) {
      if (!raw) return null;
      const job = api.state?.jobs.find(j => j.id === needId) || window.FSP?.needs.find(n => n.id === needId && Array.isArray(n.skills));
      const skills = raw.skills || [];
      const matched = job ? job.skills.filter(s => skills.some(t => t.toLowerCase() === s.toLowerCase())) : [];
      const ach = (raw.achievements || []).map(a => ({ comp: a.competition, disc: a.discipline, place: a.place, of: a.participants, year: a.year, role: a.teamRole }));
      const test = Math.round((raw.qualification?.score || 0) * .6);
      const fsp = ach.length ? Math.min(20, 8 + ach.length * 2 + (ach.some(a => a.place <= 3) ? 6 : 0)) : 0;
      const skillFit = job ? Math.round(15 * matched.length / Math.max(1, job.skills.length)) : 0;
      const salaryFit = job && raw.salaryMin <= job.salaryMax && raw.salaryMax >= job.salaryMin ? 5 : 0;
      const fspLine = ach.length ? ach.length + ' достижений ФСП · демоисточник' : 'без истории ФСП';
      return { ...raw, name: raw.fullName, role: raw.qualification?.role || raw.role, grade: raw.qualification?.grade || raw.grade,
        format: raw.workFormat, smin: raw.salaryMin / 1000, smax: raw.salaryMax / 1000, years: raw.yearsExperience,
        initials: raw.initials || raw.fullName.split(/\s+/).map(s => s[0]).slice(0, 2).join(''),
        test, ach, skills, fsp, matched, missing: job ? job.skills.filter(s => !matched.includes(s)) : [], skillFit, salaryFit,
        total: test + fsp + skillFit + salaryFit, correct: Math.round((raw.qualification?.score || 0) * .06), roleRu: roleRu[raw.role], fspLine,
        salary: raw.salaryMin / 1000 + '–' + raw.salaryMax / 1000 + ' тыс ₽', why: 'Тест ' + test + '/60 · ' + fspLine + ' · навыки ' + skillFit + '/15' };
    }
  };
  function base() { return api.mode === 'live' ? '/api/live/v1' : '/api/v1'; }
  async function json(url, options) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    let result;
    try { result = await response.json(); } catch { throw new Error('Сервер временно недоступен. Обновите страницу.'); }
    if (!response.ok) {
      if (response.status === 401 && !isLanding()) location.replace(landing);
      throw new Error(result.error || 'Не удалось выполнить действие.');
    }
    return result;
  }
  function apply(state) {
    api.state = state;
    mapFSP();
    for (const listener of listeners) { try { listener(state); } catch (e) { console.error(e); } }
    window.dispatchEvent(new Event('profectium-state'));
    updateControls();
    return state;
  }
  function mapFSP() {
    if (!window.FSP) return;
    const F = window.FSP, candidates = api.state?.candidates || [];
    const available = candidates.filter(c => c.qualification && c.available !== false && c.privacy?.publication !== false);
    F.roles = roles; F.grades = grades; F.roleRu = roleRu;
    F.counts = Object.fromEntries(roles.map(role => [role, grades.map(grade => available.filter(c => (c.qualification?.role || c.role) === role && (c.qualification?.grade || c.grade) === grade).length)]));
    F.needs = [{ id: 'none', title: 'Без привязки к потребности' }, ...(api.state?.jobs || []).filter(j => j.status === 'active').map(j => ({ ...j }))];
    F.category = (role, grade, need) => available.filter(c => (c.qualification?.role || c.role) === role && (c.qualification?.grade || c.grade) === grade).map(c => api.toCandidate(c, need)).sort((a, b) => b.total - a.total);
    F.byId = (id, need) => api.toCandidate(candidates.find(c => c.id === id), need);
    F.base = candidates.map(c => api.toCandidate(c));
  }
  function updateControls() {
    const host = document.querySelector('.fsp-header-controls');
    if (!host || !api.user) return;
    const sessionKey = JSON.stringify([api.user.userId, api.mode, api.state?.session.role, api.state?.session.candidateId]);
    const existing = host.querySelector('[data-public-session]');
    if (existing?.dataset.sessionKey === sessionKey) return;
    existing?.remove();
    const box = document.createElement('div');
    box.dataset.publicSession = 'true';
    box.dataset.sessionKey = sessionKey;
    box.style.cssText = "display:flex;align-items:center;gap:8px;font:11px 'JetBrains Mono',monospace;white-space:nowrap";
    const badge = document.createElement('span');
    badge.textContent = api.mode === 'demo' ? 'ДЕМО' : api.user.fullName;
    badge.title = api.user.email;
    box.append(badge);
    if (api.mode === 'demo' && api.state?.session.role === 'candidate') {
      const personas = document.createElement('select');
      personas.setAttribute('aria-label', 'Демопрофиль кандидата');
      personas.style.cssText = 'max-width:150px;background:#26272D;border:1px solid #5B5D65;color:#EDEDED;border-radius:4px;padding:5px;font:inherit';
      for (const person of api.state.demoPersonas || []) {
        const option = document.createElement('option'); option.value = person.id; option.textContent = person.fullName; personas.append(option);
      }
      personas.value = api.state.session.candidateId;
      personas.onchange = async () => {
        personas.disabled = true;
        try { await api.request('session', { method: 'POST', body: { role: 'candidate', candidateId: personas.value } }); location.reload(); }
        catch (e) { personas.disabled = false; window.FX?.toast(e.message); }
      };
      box.append(personas);
    }
    if (!api.user.guest) {
      const mode = document.createElement('button'); mode.textContent = api.mode === 'demo' ? 'Мой кабинет' : 'Демо';
      mode.style.cssText = 'background:transparent;border:1px solid #5B5D65;color:#EDEDED;border-radius:4px;padding:6px;cursor:pointer';
      mode.onclick = () => api.setMode(api.mode === 'demo' ? 'live' : 'demo'); box.append(mode);
    }
    const logout = document.createElement('button'); logout.textContent = 'Выйти';
    logout.style.cssText = 'background:transparent;border:1px solid #5B5D65;color:#EDEDED;border-radius:4px;padding:6px;cursor:pointer';
    logout.onclick = () => api.logout().catch(e => window.FX?.toast(e.message)); box.append(logout); host.append(box);
  }
  window.addEventListener('fsp-data', mapFSP);
  if (window.FSP) mapFSP();
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(updateControls).observe(document.body, { childList: true, subtree: true });
    if (!isLanding()) api.ready().catch(e => { window.FX?.toast(e.message); });
    else if (new URLSearchParams(location.search).get('view')) {
      const views = { catalog: 'Каталог', company: 'Пульт', jobs: 'Пульт', offers: 'Приглашения', assessments: 'Тестирование', profile: 'Кабинет-кандидата', workbench: 'Интеграции' };
      const view = views[new URLSearchParams(location.search).get('view')];
      if (view) api.ready().then(() => location.replace('/' + view + '.dc.html')).catch(() => {});
    }
  });
})();
