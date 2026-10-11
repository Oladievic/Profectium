/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. */
(function () {
  'use strict';
  const api = () => window.ProfectiumAPI;
  const date = value => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
  const own = state => state && state.candidates.find(c => c.id === state.session.candidateId);
  const bar = (v, max, background) => ({ width: Math.min(100, Math.max(0, v / max * 100)) + '%', height: '100%', background, borderRadius: 2 });
  const chip = ok => ({ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '4px 8px', borderRadius: 3, background: ok ? '#402FFF' : '#EFEFEC', color: ok ? '#FFFFFF' : '#5B5D65', alignSelf: 'flex-start' });
  function error(component, e) { component.setState({ error: e.message || 'Не удалось загрузить данные', busy: false }); }
  async function action(component, task) {
    if (component.state.busy) return;
    component.setState({ busy: true, error: '', notice: '' });
    try { await task(); component.setState({ busy: false }); }
    catch (e) { error(component, e); }
  }
  function profileBody(c, updates) {
    return Object.assign({ fullName: c.fullName, role: c.role, grade: c.grade, city: c.city, workFormat: c.workFormat,
      salaryMin: c.salaryMin, salaryMax: c.salaryMax, yearsExperience: c.yearsExperience, skills: c.skills,
      bio: c.bio, available: c.available, contact: c.contact || '', softSkills: c.softSkills || [], fspId: c.fspId || '',
      privacy: { processing: !!c.privacy?.processing, publication: !!c.privacy?.publication, showAchievements: !!c.privacy?.showAchievements },
    }, updates);
  }
  function editForm(c) { return c ? { fullName: c.fullName, city: c.city, salaryMin: String(c.salaryMin), salaryMax: String(c.salaryMax), yearsExperience: String(c.yearsExperience), skills: c.skills.join(', '), contact: c.contact || '', bio: c.bio, workFormat: c.workFormat } : {}; }
  async function mountCabinet(component) {
    try {
      await api().ready(); const state = await api().ensureRole('candidate');
      component.setState({ data: state, form: editForm(own(state)), loading: false });
      component._unsubscribe = api().subscribe(state => component.setState({ data: state }));
    } catch (e) { error(component, e); }
  }
  function cabinetValues(component, previous) {
    const s = component.state, c = own(s.data), q = c?.qualification, score = q?.score || 0;
    const nextChange = q && Date.parse(q.nextChangeAt), unlocked = !nextChange || nextChange <= Date.now();
    const change = (name, value) => component.setState({ form: Object.assign({}, component.state.form, { [name]: value }), notice: '' });
    const save = updates => action(component, async () => {
      const current = own(await api().getState());
      const result = await api().request('profile', { method: 'PATCH', headers: { 'If-Match': String(current.revision) }, body: profileBody(current, updates) });
      component.setState({ data: result, form: editForm(own(result)), notice: 'Профиль сохранён' });
    });
    return Object.assign({}, previous, {
      error: s.error || '', notice: s.notice || '', busy: s.busy || !c, pendingCount:(s.data?.offers||[]).filter(o=>o.status==='pending').length,
      candidateName: c?.fullName || 'Загружаем профиль', candidateInitials: c?.initials || '…',
      categoryRole: q?.role || c?.role || 'Категория', categoryGrade: q?.grade || 'не подтверждена',
      qualificationNote: q ? `${q.synthetic ? 'Демонстрационный результат' : 'Подтверждено тестом'} ${date(q.passedAt)} · ${score}%` : 'Пройдите тест — категория появится в каталоге после подтверждения.',
      ownProfileHref: 'Профиль-кандидата.dc.html?id=' + encodeURIComponent(c?.id || ''),
      open: unlocked, closed: !unlocked, nextTestHref: 'Тестирование.dc.html?role=' + encodeURIComponent(q?.role || c?.role || 'Frontend') + '&grade=' + (q?.grade || 'Junior'),
      nextTestLabel: q ? 'Пройти тест категории' : 'Подтвердить категорию',
      seniorNote: unlocked ? 'Выберите категорию теста' : 'Смена с ' + date(q.nextChangeAt),
      lockText: unlocked ? 'Можно выбрать категорию теста. Результат проверяет сервер.' : 'Следующая смена категории — ' + date(q.nextChangeAt),
      lockBar: Object.assign({}, previous.lockBar, { width: unlocked ? '100%' : Math.max(0, 100 - (nextChange - Date.now()) / (90 * 86400000) * 100) + '%' }),
      score, scoreNote: q ? `Результат ${q.role} · ${q.grade}` : 'Тест ещё не пройден',
      parts: [{ k: 'Тест', v: score, max: 100, bar: bar(score, 100, '#402FFF') }],
      profileVisibility: c?.available && c?.privacy?.publication && q ? 'Профиль опубликован в категории' : 'Для каталога нужны тест, публикация и доступность',
      juniorNote: q?.grade === 'Junior' ? date(q.passedAt) : 'Начальный уровень', middleNote: q?.grade === 'Middle' ? date(q.passedAt) : 'Самостоятельная работа',
      history: (s.data?.assessments || []).map(a => ({ date: date(a.createdAt), t: a.role + ' · ' + a.grade, d: a.industry + ' · ' + a.motivation,
        res: a.status === 'active' ? 'В процессе' : `${a.score || 0}% · ${a.status === 'passed' ? 'подтверждён' : a.status === 'expired' ? 'время истекло' : 'не пройден'}`,
        chip: chip(a.status === 'passed'), dot: { width: 12, height: 12, borderRadius: '50%', background: a.status === 'passed' ? '#402FFF' : '#A3A5AD' } })),
      historyEmpty: !(s.data?.assessments.length),
      tasks: [], tasksEmpty: true,
      fspId: c?.fspId || 'Не указан', fspStatus: c?.achievements.length ? `${c.achievements.length} записей в профиле · ${q?.synthetic ? 'демоданные' : 'источник указан в достижениях'}` : 'Внешний реестр ФСП не подключён',
      privacy: c ? [['publication','Публикация профиля','Показывать после подтверждения категории'], ['showAchievements','Достижения','Показывать достижения в каталоге'], ['available','Открыт к предложениям','Работодатели могут направлять приглашения']].map(([key,t,d]) => {
        const on = key === 'available' ? c.available : c.privacy?.[key];
        return { t,d, toggle: () => save(key === 'available' ? { available: !on } : { privacy: Object.assign({}, profileBody(c).privacy, { [key]: !on }) }),
          track: { width:40,height:22,borderRadius:999,background:on?'#402FFF':'#D9D9D5',position:'relative',flexShrink:0 },
          knob: { position:'absolute',top:3,left:on?21:3,width:16,height:16,borderRadius:'50%',background:'#FFFFFF' } };
      }) : [],
      editFields: [['fullName','Имя','text'],['city','Город','text'],['skills','Навыки через запятую','text'],['contact','Контакт','text'],['salaryMin','Зарплата от ₽','number'],['salaryMax','Зарплата до ₽','number'],['yearsExperience','Опыт в годах','number']].map(([name,label,type]) => ({ name,label,type,value:s.form?.[name] || '',change:e=>change(name,e.target.value) })),
      editBio: s.form?.bio || '', onBio:e=>change('bio',e.target.value), editFormat:s.form?.workFormat || 'Удалённо', onFormat:e=>change('workFormat',e.target.value),
      saveProfile:()=>{ const f=component.state.form || {}; return save({ fullName:f.fullName,city:f.city,skills:String(f.skills).split(',').map(x=>x.trim()).filter(Boolean),contact:f.contact,bio:f.bio,workFormat:f.workFormat,salaryMin:Number(f.salaryMin),salaryMax:Number(f.salaryMax),yearsExperience:Number(f.yearsExperience) }); },
    });
  }
  function applyAttempt(component, state, preferredId) {
    const a = state.assessments.find(x => x.id === preferredId) || state.assessments.find(x => x.status === 'active');
    if (!a) { component.setState({ data:state,loading:false }); return; }
    component._attempt=a;
    component.Q=a.questions.map(q=>({ id:q.id,kind:q.kind==='professional'?'банк':'параметрическое',topic:q.topic,prompt:q.prompt,options:q.options.map(o=>o.text),optionIds:q.options.map(o=>o.id) }));
    const saved=a.status==='active'?a.draftAnswers||{}:a.answers||{};
    const answers=Object.fromEntries(a.questions.flatMap((q,i)=>saved[q.id]?[[i,q.options.findIndex(o=>o.id===saved[q.id])]]:[]));
    component._draftRevision=a.draftRevision||0;
    component.setState({ data:state,loading:false,phase:a.status==='active'?'test':'result',spec:a.role,grade:a.grade,industry:a.industry,answers,qi:Math.min(component.state.qi,5),left:Math.max(0,Math.ceil((Date.parse(a.expiresAt)-Date.now())/1000)) });
  }
  async function mountTest(component) {
    try {
      await api().ready(); const state=await api().ensureRole('candidate');
      applyAttempt(component,state,new URLSearchParams(location.search).get('attempt'));
      component._timer=setInterval(async()=>{
        if(component.state.phase!=='test'||!component._attempt)return;
        const left=Math.max(0,Math.ceil((Date.parse(component._attempt.expiresAt)-Date.now())/1000));
        component.setState({left});
        if(left===0&&!component._expiring){ component._expiring=true;try{await component._saveQueue;applyAttempt(component,await api().getState(),component._attempt.id);}catch(e){error(component,e);}finally{component._expiring=false;} }
      },1000);
      component._beforeUnload=e=>{if(component._pending){e.preventDefault();e.returnValue='';}};
      window.addEventListener('beforeunload',component._beforeUnload);
    }catch(e){error(component,e);}
  }
  function selectedAnswers(component, choices) {
    return Object.fromEntries(component.Q.flatMap((q,i)=>Number.isInteger(choices[i])&&q.optionIds?.[choices[i]]?[[q.id,q.optionIds[choices[i]]]]:[]));
  }
  function answer(component, index) {
    if(!component._attempt||component._attempt.status!=='active'||component.state.busy)return;
    const choices=Object.assign({},component.state.answers,{[component.state.qi]:index});
    component.setState({answers:choices,error:'',saveStatus:'Сохраняем…'}); component._pending=(component._pending||0)+1;
    component._saveQueue=(component._saveQueue||Promise.resolve()).then(async()=>{
      const state=await api().request(`assessments/${component._attempt.id}/draft`,{method:'PUT',body:{answers:selectedAnswers(component,choices),revision:component._draftRevision}});
      const current=state.assessments.find(a=>a.id===component._attempt.id); component._draftRevision=current.draftRevision;
      component._saveFailure=null;component.setState({saveStatus:'Ответы сохранены'});
    }).catch(e=>{component._saveFailure=e;error(component,e);component.setState({saveStatus:'Не сохранено — повторите выбор'});}).finally(()=>{component._pending--;});
  }
  async function finish(component) {
    return action(component,async()=>{
      await component._saveQueue;
      if(component._saveFailure){ const failure=component._saveFailure;component._saveFailure=null;throw failure; }
      const answers=selectedAnswers(component,component.state.answers);
      if(Object.keys(answers).length!==component.Q.length)throw new Error('Ответьте на все 6 вопросов перед завершением.');
      const state=await api().request(`assessments/${component._attempt.id}`,{method:'POST',body:{answers,revision:component._draftRevision}});
      applyAttempt(component,state,component._attempt.id); window.scrollTo(0,0);
    });
  }
  function testValues(component, previous) {
    const s=component.state,a=component._attempt,passed=a?.status==='passed';
    return Object.assign({},previous,{
      error:s.error||'',busy:s.busy||s.loading,notice:s.notice||'',saveStatus:s.saveStatus||'Ответы сохранены',
      motivation:s.motivation||'',onMotivation:e=>component.setState({motivation:e.target.value}),
      variantLabel:a?`${a.role} · ${a.grade}`:'',variantId:a?.id||'',variantBlueprint:a?.blueprint||'',
      segs:previous.segs.map((segment,i)=>Object.assign({},segment,{label:'Задание '+(i+1)})),
      gradesOpts:previous.gradesOpts.map(g=>Object.assign({},g,{tag:own(s.data)?.qualification?.grade===g.t?'подтверждён':''})),
      howto:[{n:'01',t:'Банк категории',d:'Вопросы соответствуют выбранной специализации и уровню.'},{n:'02',t:'4 профессиональных',d:'Случайная выборка из банка. Правильные ответы остаются на сервере.'},{n:'03',t:'2 параметрических',d:'Расчёт нагрузки и граничные условия с новыми числами.'},{n:'04',t:'Категория',d:'Нужны минимум 4 из 6, включая 3 профессиональных ответа.'}],
      start:()=>action(component,async()=>{ const state=await api().request('assessments',{method:'POST',body:{role:s.spec,grade:s.grade,industry:s.industry,motivation:(s.motivation||'Хочу подтвердить навыки в выбранной категории.').trim()}});applyAttempt(component,state);window.scrollTo(0,0); }),
      next:()=>s.qi<component.Q.length-1?component.setState({qi:s.qi+1}):finish(component),
      skip:()=>s.qi<component.Q.length-1?component.setState({qi:s.qi+1}):finish(component),
      score:a?.feedback?.filter(f=>f.correct).length||0,
      verdictTitle:passed?s.spec+' · '+s.grade+' подтверждён':a?.status==='expired'?'Время теста истекло':'Тест пока не пройден',
      verdictText:passed?'Сервер сохранил результат. Опубликованный и доступный профиль виден работодателям.': 'Предыдущая подтверждённая категория сохранена. Повтор этого уровня доступен через 24 часа после начала попытки.',
      verdictStyle:Object.assign({},previous.verdictStyle,{background:passed?'#402FFF':'#1B1C21'}),
      review:(a?.feedback||[]).map((f,i)=>({n:String(i+1).padStart(2,'0'),topic:f.topic,exp:f.correct?'Ответ принят сервером.':'Повторите тему перед следующей попыткой.',mark:f.correct?'Верно':'Неверно',style:chip(f.correct)})),
      rubricShow:false,
      restart:()=>{component._attempt=null;component.setState({phase:'survey',answers:{},qi:0,error:'',left:1800});window.scrollTo(0,0);},
    });
  }
  async function mountProfile(component) {
    try {
      const state=await api().ready();
      const id=new URLSearchParams(location.search).get('id')||state.session.candidateId;
      let raw=state.candidates.find(c=>c.id===id);
      if(!raw){const data=await api().request('candidates/'+encodeURIComponent(id));raw=data.item||data.candidate||data;}
      if(!raw?.id)throw new Error('Профиль не найден или недоступен.');
      component.setState({data:state,raw,loading:false,fav:state.favorites.includes(raw.id)});
    }catch(e){error(component,e);}
  }
  function profileValues(component) {
    const s=component.state,c=s.raw,q=c?.qualification;
    const current=s.data?.session,employer=current?.role==='employer';
    const score=q?.score||0;
    const mapped=c&&api().toCandidate?api().toCandidate(c,new URLSearchParams(location.search).get('need')||'none'):null;
    const results=c&&current&&c.id===current.candidateId?s.data.assessments.find(a=>a.id===q?.attemptId):null;
    const achievement=(c?.achievements||[]).map(a=>({place:a.place||'—',of:a.participants||a.totalParticipants||'—',year:a.year||'',comp:a.competition||a.title||'',disc:a.discipline||'',role:a.teamRole||''}));
    return {
      error:s.error||'',notice:s.notice||'',busy:s.busy||!c,backHref:employer?'Каталог.dc.html':'Кабинет-кандидата.dc.html',
      catLabel:q?`${q.role} · ${q.grade}`:'Категория не подтверждена',initials:c?.initials||'…',name:c?.fullName||'Загрузка профиля',
      meta:c?`${c.role} · ${c.city} · ${c.workFormat} · ${c.yearsExperience} лет опыта`:'',
      hasFsp:achievement.length>0,noFsp:!achievement.length,total:mapped?.total??Math.round(score*.6),
      parts:[{k:'Тест',v:Math.round(score*.6),max:60,bar:bar(score,100,'#402FFF')},{k:'ФСП',v:mapped?.fsp||0,max:20,bar:bar(mapped?.fsp||0,20,'#EDEDED')},{k:'Навыки',v:mapped?.skillFit||0,max:15,bar:bar(mapped?.skillFit||0,15,'#9A92FF')},{k:'Зарплата',v:mapped?.salaryFit||0,max:5,bar:bar(mapped?.salaryFit||0,5,'#C8C9CA')}],
      needTitle:'Данные профиля',reasons:[{k:'Тест',v:q?`Серверный результат ${score}% · ${date(q.passedAt)}${q.synthetic?' · демонстрационный':''}`:'Тест ещё не пройден',s:score+'%'},{k:'Навыки',v:(c?.skills||[]).join(', '),s:''}],
      hasNeedSkills:false,needChips:[],correct:Math.round(score/100*6),testMeta:q?(q.synthetic?'Демонстрационный результат':'Подтверждённый результат')+' · '+date(q.passedAt):'Нет завершённого теста',
      tasks:(results?.feedback||[]).map((f,i)=>({n:String(i+1).padStart(2,'0'),kind:'тест',topic:f.topic,mark:f.correct?'✓':'×',style:{padding:'14px 16px',borderRadius:6,background:'#F3F3F0',color:f.correct?'#1B1C21':'#C8102E'}})),
      regular:[],bio:c?.bio||'',skills:c?.skills||[],fspSource:q?.synthetic?'Демонстрационные достижения':'Достижения, доступные в профиле',ach:achievement,
      terms:[{k:'Ожидания',v:c?`${c.salaryMin.toLocaleString('ru-RU')}–${c.salaryMax.toLocaleString('ru-RU')} ₽`:''},{k:'Формат',v:c?.workFormat||''},{k:'Город',v:c?.city||''},{k:'Контакт',v:c?.contact||'После принятия предложения'}],
      visibility:[{k:'Публикация',v:c?.privacy?.publication===false?'Скрыта':'Открыта'},{k:'Достижения',v:achievement.length?'Доступны':'Не показаны'},{k:'Контакт',v:c?.contact?'Доступен':'После согласия'}],
      profileTestLabel:q?'Подтверждено тестом · '+date(q.passedAt):'Тест ещё не пройден',contactValue:c?.contact||'••••••@••••.ru',contactNote:c?.contact?'Контакт доступен вашему аккаунту':'Откроется после принятия приглашения',noTestDetails:!(results?.feedback?.length),
      favLabel:s.fav?'★ В избранном':'☆ В избранное',favStyle:{height:48,padding:'0 18px',borderRadius:4,border:'1px solid #4A4B52',background:s.fav?'#EDEDED':'transparent',color:s.fav?'#1B1C21':'#EDEDED',font:'inherit',fontSize:15,cursor:'pointer',display:employer?'block':'none'},
      fav:()=>action(component,async()=>{const state=await api().request('favorites/'+c.id,{method:s.fav?'DELETE':'PUT'});component.setState({fav:state.favorites.includes(c.id),data:state});}),
      notInvited:employer&&!s.invited,invited:!!s.invited,invitedSal:s.invited||'',modal:!!s.modal,sal:c?`${c.salaryMin/1000}–${c.salaryMax/1000}`:'',
      openInvite:()=>component.setState({modal:true,err:''}),closeInvite:()=>component.setState({modal:false}),fMin:s.fMin||'',fMax:s.fMax||'',fText:s.fText||'',err:s.err||'',
      onMin:e=>component.setState({fMin:e.target.value,err:''}),onMax:e=>component.setState({fMax:e.target.value,err:''}),onText:e=>component.setState({fText:e.target.value}),
      send:()=>action(component,async()=>{try{const min=Number(s.fMin)*1000,max=Number(s.fMax)*1000;await api().request('offers',{method:'POST',body:{candidateId:c.id,jobId:'',jobTitle:`${c.role} · ${c.grade}`,employerContact:s.data.company.contact||api().user.email,salaryMin:min,salaryMax:max,message:s.fText,workFormat:c.workFormat,coreHours:'',onCall:'discuss'}});component.setState({modal:false,invited:`${min/1000}–${max/1000} тыс ₽`,notice:'Предложение сохранено и отправлено кандидату.'});}catch(e){component.setState({err:e.message});throw e;}}),
      briefLabel:'По данным профиля',briefIdle:!s.brief,briefBusy:false,briefHas:!!s.brief,briefText:s.brief||'',briefTyping:false,
      briefRun:()=>c&&component.setState({brief:`${c.fullName}: ${c.role}, ${c.grade}. Подтверждённый тест: ${score}%.\n\nОбсудите опыт: ${c.bio}\n\nУточните применение навыков: ${c.skills.join(', ')}.\n\nЭто подготовка по данным профиля; профессиональные ответы другого пользователя не раскрываются.`}),
    };
  }
  window.ProfectiumCandidate={mountCabinet,cabinetValues,mountTest,testValues,answer,mountProfile,profileValues};
})();
