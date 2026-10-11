/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. */
(function () {
  const mono = "'JetBrains Mono',monospace";
  const date = value => value ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const initials = value => String(value || '').trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2);
  const amount = value => Number(value || 0) / 1000;
  const pay = offer => amount(offer.salaryMin) + '–' + amount(offer.salaryMax);
  const statuses = { pending: 'Ожидает ответа', accepted: 'Принято', declined: 'Отклонено', withdrawn: 'Отозвано' };
  const seg = on => ({ height: 36, padding: '0 14px', whiteSpace: 'nowrap', border: 0, borderRadius: 4, font: 'inherit', fontSize: 14, cursor: 'pointer', background: on ? '#FFFFFF' : 'transparent', color: on ? '#1B1C21' : '#5B5D65', fontWeight: on ? 600 : 400 });
  const button = { height: 40, padding: '0 16px', border: 0, borderRadius: 4, background: '#402FFF', color: '#FFFFFF', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
  const chip = status => ({ fontFamily: mono, fontSize: 11, padding: '4px 8px', borderRadius: 3, whiteSpace: 'nowrap', fontWeight: 600, background: status === 'accepted' ? '#402FFF' : '#EFEFEC', color: status === 'accepted' ? '#FFFFFF' : '#5B5D65' });
  function common(component) {
    return {
      backendLoading: !!component.state.backendLoading,
      backendError: component.state.backendError || '',
      backendBusy: !!component.state.backendBusy,
      backendMessage: component.state.backendMessage || '',
      refresh: () => component._refreshBackend && component._refreshBackend(),
    };
  }
  async function connect(component, role, accept) {
    component._backendAlive = true;
    component._acceptBackend = snapshot => {
      if (!component._backendAlive || !snapshot || !snapshot.session) return;
      component.setState(Object.assign({ backend: snapshot, backendLoading: false, backendError: '' }, accept ? accept(snapshot) : {}));
    };
    component._refreshBackend = async () => {
      try { component._acceptBackend(await window.ProfectiumAPI.getState()); }
      catch (error) { if (component._backendAlive) component.setState({ backendLoading: false, backendError: error.message }); }
    };
    component.setState({ backendLoading: true });
    try {
      const api = window.ProfectiumAPI;
      if (!api) throw new Error('Соединение с платформой недоступно. Обновите страницу.');
      await api.ready();
      component._acceptBackend(role ? await api.ensureRole(role) : await api.getState());
      if (!component._backendAlive) return;
      component._unsubscribeBackend = api.subscribe(component._acceptBackend);
      window.addEventListener('focus', component._refreshBackend);
    } catch (error) {
      if (component._backendAlive) component.setState({ backendLoading: false, backendError: error.message });
    }
  }
  function disconnect(component) {
    component._backendAlive = false;
    if (component._unsubscribeBackend) component._unsubscribeBackend();
    window.removeEventListener('focus', component._refreshBackend);
  }
  async function mutate(component, path, method, body, message, after) {
    if (component._backendMutating) return;
    component._backendMutating = true;
    component.setState({ backendBusy: true, backendError: '', backendMessage: '', err: '' });
    try {
      const identity = path + ':' + JSON.stringify(body);
      const keys = component._mutationKeys || (component._mutationKeys = new Map());
      if (method === 'POST' && !keys.has(identity)) keys.set(identity, crypto.randomUUID());
      await window.ProfectiumAPI.request(path, { method, body, headers: method === 'POST' ? { 'Idempotency-Key': keys.get(identity) } : {} });
      keys.delete(identity);
      const snapshot = window.ProfectiumAPI.state || await window.ProfectiumAPI.getState();
      component._acceptBackend(snapshot);
      component.setState({ backendMessage: message || 'Сохранено на сервере.' });
      if (after) after(snapshot);
    } catch (error) {
      component.setState({ backendError: error.message, err: error.message });
    } finally { component._backendMutating = false; component.setState({ backendBusy: false }); }
  }
  function invite(component, candidate) {
    const s = component.state;
    if (!candidate || !s.backend) return;
    const minimum = Number(s.fMin) * 1000, maximum = Number(s.fMax) * 1000;
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 10000 || maximum < minimum || maximum > 2000000) {
      component.setState({ err: 'Укажите зарплату от 10 до 2000 тыс ₽; верхняя граница не меньше нижней.' }); return;
    }
    return mutate(component, 'offers', 'POST', {
      candidateId: candidate.id, jobId: s.fVac === 'none' ? '' : s.fVac,
      jobTitle: s.fTitle.trim(), employerContact: s.fContact.trim(),
      salaryMin: minimum, salaryMax: maximum, message: s.fText.trim(), workFormat: candidate.format || 'Удалённо',
    }, 'Приглашение отправлено и сохранено.', () => {
      component.setState({ drawer: null, toast: 'Приглашение отправлено · ' + s.fMin + '–' + s.fMax + ' тыс ₽' });
      clearTimeout(component._toast); component._toast = setTimeout(() => component.setState({ toast: '' }), 4200);
    });
  }
  function invitationValues(component) {
    const s = component.state, snapshot = s.backend;
    const employer = snapshot && snapshot.session.role === 'employer';
    const offers = snapshot ? snapshot.offers : [];
    const list = offers.filter(offer => s.tab === 'accepted' ? offer.status === 'accepted' : s.tab === 'archive' ? ['declined', 'withdrawn'].includes(offer.status) : true);
    const selected = list.find(offer => offer.id === s.sel) || list[0];
    const candidate = selected && snapshot.candidates.find(item => item.id === selected.candidateId);
    const title = offer => employer ? ((snapshot.candidates.find(item => item.id === offer.candidateId) || {}).fullName || 'Кандидат #' + offer.candidateId.slice(-6)) : offer.company;
    const expectationMin = candidate ? amount(candidate.salaryMin) : selected ? amount(selected.salaryMin) : 0;
    const expectationMax = candidate ? amount(candidate.salaryMax) : selected ? amount(selected.salaryMax) : 0;
    const axisMin = Math.max(0, Math.floor(Math.min(expectationMin, selected ? amount(selected.salaryMin) : 0) / 50) * 50 - 50);
    const axisMax = Math.ceil(Math.max(expectationMax, selected ? amount(selected.salaryMax) : 0) / 50) * 50 + 50;
    const pos = value => Math.max(0, Math.min(100, (value - axisMin) / Math.max(1, axisMax - axisMin) * 100));
    const overlap = selected && amount(selected.salaryMax) >= expectationMin && amount(selected.salaryMin) <= expectationMax;
    const stepDot = on => ({ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: on ? '#402FFF' : '#FFFFFF', border: '2px solid ' + (on ? '#402FFF' : '#A3A5AD') });
    const change = status => selected && mutate(component, 'offers/' + encodeURIComponent(selected.id), 'PATCH', Object.assign({ status }, status === 'declined' ? { declineReason: s.reason } : {}), 'Ответ сохранён. Обе стороны видят новый статус.', () => component.setState({ declining: false }));
    return Object.assign(common(component), {
      pageTitle: employer ? 'Ваши приглашения' : 'Вас пригласили', pageCrumb: employer ? 'Работодатель / приглашения' : 'Кабинет кандидата / приглашения',
      homeHref: employer ? 'Пульт.dc.html' : 'Кабинет-кандидата.dc.html', homeLabel: employer ? 'Пульт' : 'Моя категория', secondHref: employer ? 'Каталог.dc.html' : 'Тестирование.dc.html', secondLabel: employer ? 'Каталог' : 'Тестирование', currentRole: employer ? 'Работодатель' : 'Кандидат', otherRole: employer ? 'Кандидат' : 'Работодатель', otherRoleHref: employer ? 'Кабинет-кандидата.dc.html' : 'Пульт.dc.html',
      newCount: offers.filter(offer => offer.status === 'pending').length,
      tabs: [['inbox', 'Все', offers.length], ['accepted', 'Принятые', offers.filter(offer => offer.status === 'accepted').length], ['archive', 'Архив', offers.filter(offer => ['declined', 'withdrawn'].includes(offer.status)).length]].map(([key, text, count]) => ({ t: text, n: count, style: seg(s.tab === key), pick: () => component.setState({ tab: key, sel: null, declining: false }) })),
      isInbox: !!selected, isApps: false, isArchive: false, empty: !selected && !s.backendLoading,
      list: list.map(offer => ({ company: title(offer), initials: initials(title(offer)), role: offer.jobTitle, sal: pay(offer), sent: date(offer.createdAt), statusLabel: statuses[offer.status], chip: chip(offer.status), mono: { width: 28, height: 28, borderRadius: 4, display: 'grid', placeItems: 'center', fontFamily: mono, fontSize: 11, background: '#402FFF', color: '#FFFFFF' }, style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px', borderRadius: 8, cursor: 'pointer', font: 'inherit', textAlign: 'left', background: offer.id === selected.id ? '#1B1C21' : '#FFFFFF', color: offer.id === selected.id ? '#FFFFFF' : '#1B1C21', border: 0 }, pick: () => component.setState({ sel: offer.id, declining: false }) })),
      selId: selected ? selected.id : '',
      d: selected ? {
        company: title(selected), initials: initials(title(selected)), domain: employer ? selected.company : 'Предложение компании', sent: date(selected.createdAt), role: selected.jobTitle, sal: pay(selected), statusLabel: statuses[selected.status], chip: chip(selected.status),
        fit: candidate ? (overlap ? 'Пересекается с ожиданиями' : 'Вне зарплатных ожиданий') : 'Условия предложения', fitStyle: { fontSize: 14, fontWeight: 600, padding: '8px 12px', borderRadius: 4, background: '#ECEAFF', color: '#2A1BD9' },
        expBar: { position: 'absolute', top: 14, height: 13, left: pos(expectationMin) + '%', width: (pos(expectationMax) - pos(expectationMin)) + '%', border: '2px solid #1B1C21', borderRadius: 2, background: '#FFFFFF' },
        offBar: { position: 'absolute', top: 17, height: 7, left: pos(amount(selected.salaryMin)) + '%', width: (pos(amount(selected.salaryMax)) - pos(amount(selected.salaryMin))) + '%', background: '#402FFF', borderRadius: 2 },
        expLabel: { position: 'absolute', top: -2, left: pos(expectationMin) + '%', fontFamily: mono, fontSize: 11, color: '#1B1C21', whiteSpace: 'nowrap' }, expText: (candidate ? 'ожидания ' : 'предложение ') + expectationMin + '–' + expectationMax, axisMin, axisMax,
        terms: [{ k: 'Формат', v: selected.workFormat || 'Обсуждается' }, { k: 'Рабочие часы', v: selected.coreHours || 'Обсуждаются' }, { k: 'Стек', v: candidate ? candidate.skills.join(', ') : 'Уточняется с кандидатом' }, { k: 'Основание', v: selected.jobId ? 'Опубликованная вакансия' : 'Адресное предложение без вакансии' }],
        text: selected.message, hasTask: false,
        track: [{ t: 'Отправлено', at: date(selected.createdAt), dot: stepDot(true), line: true }, { t: selected.status === 'pending' ? 'Ожидает ответа' : statuses[selected.status], at: selected.status === 'pending' ? '—' : date(selected.updatedAt), dot: stepDot(selected.status !== 'pending'), line: false }],
        canAnswer: !employer && selected.status === 'pending' && !s.backendBusy, canWithdraw: employer && selected.status === 'pending' && !s.backendBusy,
        isAccepted: selected.status === 'accepted', isDeclined: selected.status === 'declined', reason: selected.declineReason || 'причина не указана', contact: selected.employerContact || 'Не указан', candidateContact: selected.candidateContact || (candidate && candidate.contact) || 'Контакт не предоставлен',
      } : {},
      notDeclining: !s.declining, declining: !!s.declining, accept: () => change('accepted'), withdraw: () => change('withdrawn'),
      startDecline: () => component.setState({ declining: true }), cancelDecline: () => component.setState({ declining: false }), decline: () => change('declined'),
      reasons: ['Зарплата ниже ожиданий', 'Не подходит формат', 'Не мой стек', 'Уже нашёл работу'].map(text => ({ t: text, pick: () => component.setState({ reason: text }), style: Object.assign({}, seg(s.reason === text), { border: '1px solid #CFCFCB' }) })), apps: [],
    });
  }
  function dashboardValues(component) {
    const s = component.state, snapshot = s.backend || { candidates: [], offers: [], jobs: [], company: {} };
    const offers = snapshot.offers || [], jobs = snapshot.jobs || [], candidates = snapshot.candidates || [];
    const companyDraft = s.companyDraft || snapshot.company || {}, jobDraft = s.jobDraft || {};
    const filtered = offers.filter(offer => s.filter === 'wait' ? offer.status === 'pending' : s.filter === 'accepted' ? offer.status === 'accepted' : s.filter === 'declined' ? ['declined', 'withdrawn'].includes(offer.status) : true);
    const accepted = offers.filter(offer => offer.status === 'accepted');
    const field = (kind, key) => event => component.setState({ [kind]: Object.assign({}, kind === 'companyDraft' ? companyDraft : jobDraft, { [key]: event.target.value }) });
    const fields = (kind, data, definitions) => definitions.map(([key, label, type]) => ({ key, label, type: type || 'text', value: data[key] || '', change: field(kind, key) }));
    const go = offer => { window.location.href = 'Приглашения.dc.html?id=' + encodeURIComponent(offer.id); };
    const dot = color => ({ width: 8, height: 8, borderRadius: '50%', background: color });
    return Object.assign(common(component), {
      employerReady: !!s.backend && s.backend.session.role === 'employer',
      today: new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }),
      headline: accepted.length + ' принятых приглашений',
      kpis: [{ t: 'Кандидатов в каталоге', v: candidates.length, dot: dot('#9A92FF') }, { t: 'Активных вакансий', v: jobs.filter(job => job.status === 'active').length, dot: dot('#EDEDED') }, { t: 'Ждут ответа кандидата', v: offers.filter(offer => offer.status === 'pending').length, dot: dot('#EDEDED') }, { t: 'Принятых приглашений', v: accepted.length, dot: dot('#402FFF') }],
      filters: [['all', 'Все'], ['wait', 'Ждут'], ['accepted', 'Приняли'], ['declined', 'Архив']].map(([key, text]) => ({ t: text, style: seg(s.filter === key), pick: () => component.setState({ filter: key }) })),
      rows: filtered.map(offer => {
        const candidate = candidates.find(item => item.id === offer.candidateId);
        const name = candidate ? candidate.fullName : 'Кандидат #' + offer.candidateId.slice(-6);
        return { href: 'Профиль-кандидата.dc.html?id=' + encodeURIComponent(offer.candidateId), initials: initials(name), name, cat: candidate ? candidate.role + ' · ' + candidate.grade : offer.jobTitle, sal: pay(offer), status: statuses[offer.status], when: date(offer.updatedAt), statusStyle: { fontSize: 14, fontWeight: 600, color: offer.status === 'declined' ? '#C8102E' : '#2A1BD9' }, steps: [0, 1].map((value) => ({ dot: { width: 12, height: 12, borderRadius: '50%', background: value === 0 || offer.status !== 'pending' ? '#402FFF' : '#FFFFFF', border: '2px solid #402FFF' }, line: value === 0, lineStyle: { width: 28, height: 2, background: '#DCDCD8' } })), isAction: true, isNote: false, actLabel: offer.status === 'accepted' ? 'Контакты →' : 'Открыть →', actStyle: button, act: () => go(offer), note: '' };
      }),
      invitationsEmpty: filtered.length === 0,
      agenda: accepted.map(offer => ({ when: date(offer.updatedAt).split(',')[0], t: offer.jobTitle, d: offer.candidateContact || 'Кандидат принял приглашение. Откройте предложение.', whenStyle: { fontFamily: mono, fontSize: 12, color: '#402FFF' }, bodyStyle: { display: 'flex', flexDirection: 'column', gap: 3 }, box: Object.assign({}, button, { height: 28, width: 28, padding: 0 }), mark: '→', toggle: () => go(offer) })), agendaLeft: accepted.length,
      connections: [], helperLabel: 'Настройки →', radars: [], tasks: [],
      companyName: companyDraft.name || '', companyFields: fields('companyDraft', companyDraft, [['name', 'Название компании'], ['industry', 'Отрасль'], ['contact', 'Контакт компании']]),
      companyDescription: companyDraft.description || '', onCompanyDescription: field('companyDraft', 'description'),
      saveCompany: () => mutate(component, 'company', 'PATCH', { name: companyDraft.name || '', industry: companyDraft.industry || '', contact: companyDraft.contact || '', description: companyDraft.description || '' }, 'Компания сохранена.', () => component.setState({ companyDraft: null })),
      jobFields: fields('jobDraft', jobDraft, [['title', 'Название вакансии'], ['city', 'Город'], ['salaryMin', 'Зарплата от, ₽', 'number'], ['salaryMax', 'Зарплата до, ₽', 'number'], ['skills', 'Навыки через запятую']]),
      jobRole: jobDraft.role || 'Frontend', jobGrade: jobDraft.grade || 'Junior', jobFormat: jobDraft.workFormat || 'Удалённо',
      roles: ['Frontend', 'Backend', 'Fullstack', 'Data Science', 'DevOps', 'QA'], grades: ['Junior', 'Middle', 'Senior'], workFormats: ['Удалённо', 'Гибрид', 'Офис'],
      onJobRole: field('jobDraft', 'role'), onJobGrade: field('jobDraft', 'grade'), onJobFormat: field('jobDraft', 'workFormat'),
      jobDescription: jobDraft.description || '', onJobDescription: field('jobDraft', 'description'),
      saveJob: () => mutate(component, 'jobs', 'POST', { title: jobDraft.title || '', company: (snapshot.company || {}).name || '', role: jobDraft.role || 'Frontend', grade: jobDraft.grade || 'Junior', city: jobDraft.city || '', workFormat: jobDraft.workFormat || 'Удалённо', salaryMin: Number(jobDraft.salaryMin), salaryMax: Number(jobDraft.salaryMax), skills: String(jobDraft.skills || '').split(',').map(skill => skill.trim()).filter(Boolean), description: jobDraft.description || '' }, 'Вакансия опубликована.', () => component.setState({ jobDraft: null })),
      jobRows: jobs.map(job => ({ id: job.id, title: job.title, meta: job.role + ' · ' + job.grade + ' · ' + job.workFormat, salary: pay(job) + ' тыс ₽', status: job.status === 'active' ? 'Опубликована' : 'В архиве', label: job.status === 'active' ? 'В архив' : 'Возобновить', toggle: () => mutate(component, 'jobs/' + encodeURIComponent(job.id), 'PATCH', { status: job.status === 'active' ? 'archived' : 'active' }, 'Статус вакансии сохранён.') })), jobsEmpty: jobs.length === 0,
    });
  }
  window.FSPEmployer = { connect, disconnect, mutate, invite, common, invitationValues, dashboardValues };
})();
