/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

/**
 * v4 security regression. Run: node v4-security.mjs <platform-dir>
 * Actual routes + migrations; esbuild write:false; SQLite :memory:; no network.
 * No checkout writes, provider calls or persisted test databases.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";

const project = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(project, "package.json"));
const { build } = require("esbuild");
const contexts = new AsyncLocalStorage();
globalThis.__featureReviewContext = contexts;
const compiled = await build({
  absWorkingDir: project,
  stdin: {
    resolveDir: project,
    sourcefile: "feature-review.ts",
    contents: `
  export * as route from './app/api/v1/[...path]/route';
  export * as career from './app/api/v2/[...path]/route';

`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
  plugins: [
    {
      name: "feature-review",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "env",
          namespace: "review",
        }));
        b.onResolve({ filter: /session-auth$/ }, () => ({
          path: "auth",
          namespace: "review",
        }));
        b.onResolve({ filter: /^@\// }, (x) => ({
          path: path.join(project, x.path.slice(2) + (x.path.endsWith(".json") ? "" : ".ts")),
        }));
        b.onLoad({ filter: /.*/, namespace: "review" }, (x) => ({
          loader: "js",
          contents:
            x.path === "env"
              ? "export const env=new Proxy({},{get(_,key){return globalThis.__featureReviewContext.getStore().fixture.env[key]}});"
              : "export async function getCurrentUser(){return globalThis.__featureReviewContext.getStore().user}",
        }));
      },
    },
  ],
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Outbound network disabled in feature invariant suite");
};
const ORIGIN = "https://feature-review.invalid",
  LIVE = "live-profectium-v1";
const status = (response, want) =>
  assert.equal(
    response.status,
    want,
    `HTTP status should be ${want}, got ${response.status}`,
  );
const now = () => new Date().toISOString();

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync(path.join(project, "drizzle"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(fs.readFileSync(path.join(project, "drizzle", file), "utf8"));
  const f = { sqlite, beforeRun: null, afterFirst: null };
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      const row = sqlite.prepare(this.sql).get(...this.args) ?? null; f.afterFirst?.(this.sql,this.args,row); return row;
    }
    async all() {
      return { results: sqlite.prepare(this.sql).all(...this.args) };
    }
    execute() {
      f.beforeRun?.(this.sql, this.args);
      const r = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
    async run() {
      return this.execute();
    }
  }
  f.env = {
    DB: {
      prepare: (sql) => new Statement(sql),
      batch: async (statements) => {
        sqlite.exec("BEGIN");
        try {
          const r = statements.map((s) => s.execute());
          sqlite.exec("COMMIT");
          return r;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      },
    },
  };
  f.request = async (
    id,
    route,
    { method = "GET", body, headers = {}, demo = false, version = 2, authenticated = true } = {},
  ) =>
    contexts.run(
      { fixture: f, user: authenticated ? { userId: id, email: id + "@example.invalid" } : null },
      async () => {
        const owner = demo ? id : "live:" + id;
        const account = sqlite
          .prepare(
            `SELECT revision FROM ${demo ? "demo_accounts" : "members"} WHERE owner=?`,
          )
          .get(owner);
        const req = new Request(
          ORIGIN + (demo ? "/api/v" : "/api/live/v") + version + "/" + route,
          {
            method,
            headers: {
              Origin: ORIGIN,
              "Content-Type": "application/json",
              "X-Session-Revision": String(account?.revision ?? 0),
              ...headers,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        );
        const response = await (version === 2 ? api.career : api.route)[method](req, {
          params: Promise.resolve({ path: route.split("/") }),
        });
        return { status: response.status, value: await response.json(), headers: response.headers };
      },
    );
  f.member = (id, role = "candidate", qualified = false) => {
    const candidateId = role === "candidate" ? crypto.randomUUID() : "";
    sqlite
      .prepare(
        "INSERT INTO members(owner,role,candidate_id,email,full_name,verified_at,revision) VALUES(?,?,?,?,?,?,0)",
      )
      .run(
        "live:" + id,
        role,
        candidateId,
        id + "@example.invalid",
        "Test " + id,
        now(),
      );
    if (role === "candidate") {
      const c = {
        id: candidateId,
        fullName: "Candidate " + id,
        initials: "TC",
        role: "Frontend",
        grade: "Junior",
        city: "Москва",
        workFormat: "Удалённо",
        salaryMin: 80000,
        salaryMax: 140000,
        yearsExperience: 1,
        skills: ["TypeScript"],
        bio: "Описание опыта и выполненных учебных проектов.",
        softSkills: ["Командная работа"],
        contact: id + "@example.invalid",
        fspId: "",
        achievements: [],
        available: true,
        privacy: {
          processing: true,
          publication: true,
          showAchievements: true,
          consentAt: now(),
        },
      };
      if (qualified)
        c.qualification = {
          role: "Frontend",
          grade: "Junior",
          score: 83,
          passedAt: now(),
          nextChangeAt: new Date(Date.now() + 90 * 86400000).toISOString(),
          attemptId: crypto.randomUUID(),
          synthetic: false,
        };
      sqlite
        .prepare(
          "INSERT INTO candidates(owner,id,data,revision) VALUES(?,?,?,0)",
        )
        .run(LIVE, candidateId, JSON.stringify(c));
    } else
      sqlite
        .prepare("INSERT INTO companies(owner,data) VALUES(?,?)")
        .run(
          "live:" + id,
          JSON.stringify({
            name: "Company " + id,
            industry: "ИТ",
            description: "Рабочая компания для проверки инвариантов.",
            contact: id + "@example.invalid",
          }),
        );
    return candidateId;
  };
  f.readCandidate = (id) => {
    const row = sqlite
      .prepare("SELECT data,revision FROM candidates WHERE owner=? AND id=?")
      .get(LIVE, id);
    return { ...JSON.parse(row.data), revision: row.revision };
  };
  f.insertAttempt = (candidateId, assessment, keys) =>
    sqlite
      .prepare(
        "INSERT INTO assessments(owner,id,candidate_id,role,grade,data,answer_key,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        LIVE,
        assessment.id,
        candidateId,
        assessment.role,
        assessment.grade,
        JSON.stringify(assessment),
        JSON.stringify(keys),
        assessment.status,
        assessment.createdAt,
      );
  return f;
}

const bank=JSON.parse(fs.readFileSync(path.join(project,'lib/server/lab-bank.json'),'utf8'));
const uuid=()=>crypto.randomUUID();
const tests=[];const test=(name,fn)=>tests.push({name,fn});
const rules={minimumSalary:120000,formats:['Удалённо'],coreHours:'10:00–16:00',onCall:'no',strict:true,interests:[]};
const terms={salaryMin:120000,salaryMax:150000,workFormat:'Удалённо',coreHours:'10:00–16:00',onCall:'no',firstMonths:'Проверяемые результаты первых месяцев.',interviewSteps:'Одно интервью',reviewProcess:'Еженедельный review',mentoring:'Наставник'};
const proofData=(published=true)=>({title:'Identity-bearing artifact',skill:'TypeScript',summary:'A private exercise with candidate-authored evidence',artifact:'Owned source fragment, kept separate from identity disclosure',published});
function actors(f){f.member('ea','employer');f.member('eb','employer');f.ca=f.member('ca','candidate',true);f.cb=f.member('cb','candidate',true);return f;}
const row=(f,kind,id,owner=LIVE)=>f.sqlite.prepare('SELECT * FROM career_records WHERE owner=? AND kind=? AND id=?').get(owner,kind,id);
const value=(f,kind,id)=>JSON.parse(row(f,kind,id).data);
const offerRow=(f,id)=>f.sqlite.prepare('SELECT * FROM offers WHERE owner=? AND id=?').get(LIVE,id);
const mutateCandidate=(f,id,change)=>{const c=f.readCandidate(id);change(c);delete c.revision;f.sqlite.prepare('UPDATE candidates SET data=?,revision=revision+1 WHERE owner=? AND id=?').run(JSON.stringify(c),LIVE,id);};
async function control(f,{anonymous=false,strict=false,...changes}={}){const c=f.readCandidate(f.ca);status(await f.request('ca','controls',{method:'PUT',body:{revision:c.revision,data:{anonymous,rules:{...rules,strict,...changes}}}}),200);}
async function proof(f,published=true,actor='ca'){const id=uuid();status(await f.request(actor,'proofs',{method:'POST',body:{id,data:proofData(published)}}),201);return id;}
async function grant(f,fields,employer='ea'){const id=uuid();status(await f.request('ca','grants',{method:'POST',body:{id,employerId:'live:'+employer,fields,expiresInDays:1}}),201);return id;}
async function revoke(f,id){status(await f.request('ca','grants/'+id,{method:'PATCH',body:{revision:row(f,'grant',id).revision}}),200);}
function expire(f,id){f.sqlite.prepare("UPDATE career_records SET data=json_set(data,'$.expiresAt',?) WHERE owner=? AND kind='grant' AND id=?").run(new Date(Date.now()-60000).toISOString(),LIVE,id);}
async function state(f,actor='ea',version=2){const r=await f.request(actor,'state',{version});status(r,200);return r.value;}
async function candidateView(f,actor='ea'){return (await state(f,actor,1)).candidates.find(x=>x.id===f.ca);}
async function artifactView(f,id,actor='ea'){const a=await f.request(actor,'proofs/'+f.ca);status(a,200);const b=await state(f,actor);const visible=a.value.proofs.some(x=>x.id===id);assert.equal(b.proofs.some(x=>x.id===id),visible,'state and direct proof projections must agree');return visible;}
const newOffer=(f,overrides={})=>({candidateId:f.ca,jobId:'',jobTitle:'Example role',employerContact:'employer@example.invalid',salaryMin:120000,salaryMax:150000,workFormat:'Удалённо',coreHours:'10:00–16:00',onCall:'no',message:'A concrete proposal with sufficient detail for review.',...overrides});
async function offer(f,overrides={},actor='ea'){const id=uuid();status(await f.request(actor,'offers',{version:1,method:'POST',headers:{'Idempotency-Key':id},body:newOffer(f,overrides)}),201);return id;}
async function dialogue(f,id,t=terms){status(await f.request('ea','dialogues/'+id,{method:'POST',body:{terms:t}}),201);return id;}
async function request(f){const id=uuid();status(await f.request('ea','requests',{method:'POST',body:{id,candidateId:f.ca,skill:'TypeScript',title:'Validate one concrete skill',criteria:'Explain one bounded typed API contract and its behavior.',estimatedMinutes:15,dueAt:new Date(Date.now()+86400000).toISOString()}}),201);return id;}
async function updateDialogue(f,id,actor,action,extra={}){return f.request(actor,'dialogues/'+id,{method:'PATCH',body:{revision:row(f,'dialogue',id).revision,action,...extra}});}
function insertConcurrentEvent(f,id){const r=row(f,'dialogue',id),d=JSON.parse(r.data);d.events.push({id:'concurrent-event',at:now(),by:'employer',kind:'message',text:'This concurrent event must survive a failed CAS.'});f.sqlite.prepare("UPDATE career_records SET data=?,revision=revision+1 WHERE owner=? AND kind='dialogue' AND id=?").run(JSON.stringify(d),LIVE,id);}
const labPayload=(task,mask=7)=>({id:uuid(),answers:Object.fromEntries(task.decisions.map((q,i)=>[q.id,(mask&(1<<i))?q.correctOptionId:q.options.find(x=>x.id!==q.correctOptionId).id])),explanation:'Candidate explanation is preserved without pretending to execute code.',published:false});
const noKeys=x=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){assert.ok(!['correctOptionId','answer_key','answerKey'].includes(k),'server answer key leaked: '+k);noKeys(v);}};

test('v2 rejects missing authentication, unenrolled live identity, wrong origin and stale session',async f=>{
 actors(f);status(await f.request('ea','state',{authenticated:false}),401);status(await f.request('missing','state'),403);
 status(await f.request('ca','parse',{method:'POST',headers:{Origin:'https://foreign.invalid'},body:{kind:'resume',text:'Frontend React experience and useful projects.'}}),403);
 status(await f.request('ca','parse',{method:'POST',headers:{'X-Session-Revision':'99'},body:{kind:'resume',text:'Frontend React experience and useful projects.'}}),409);
 assert.equal((await f.request('ea','state')).headers.get('cache-control'),'no-store');
});
test('strict incoming rules reject each v1 offer violation and accept matching conditions',async f=>{
 actors(f);await control(f,{strict:true});for(const bad of [{salaryMin:110000},{workFormat:'Офис'},{coreHours:'09:00–18:00'},{onCall:'yes'}]){status(await f.request('ea','offers',{version:1,method:'POST',headers:{'Idempotency-Key':uuid()},body:newOffer(f,bad)}),422);}
 assert.equal((await state(f,'ea',1)).offers.length,0);await offer(f);
});
test('v1 offer INSERT rechecks candidate revision after strict preferences change',async f=>{
 actors(f);let injected=false;f.beforeRun=sql=>{if(!injected&&sql.startsWith('INSERT OR IGNORE INTO offers')){injected=true;mutateCandidate(f,f.ca,c=>{c.controls={anonymous:false,rules:{...rules,minimumSalary:500000}}});}};
 status(await f.request('ea','offers',{version:1,method:'POST',headers:{'Idempotency-Key':uuid()},body:newOffer(f)}),409);assert.ok(injected);assert.equal((await state(f,'ea',1)).offers.length,0);
});
test('v2 dialogue creation enforces each strict condition without creating a partial record',async f=>{
 actors(f);const id=await offer(f);await control(f,{strict:true});for(const bad of [{salaryMin:110000},{workFormat:'Офис'},{coreHours:'09:00–18:00'},{onCall:'yes'}]){status(await f.request('ea','dialogues/'+id,{method:'POST',body:{terms:{...terms,...bad}}}),422);assert.equal(row(f,'dialogue',id),undefined);}await dialogue(f,id);
});
test('v2 employer cannot propose or confirm terms violating current strict preferences',async f=>{
 actors(f);const id=await dialogue(f,await offer(f));await control(f,{strict:true});status(await updateDialogue(f,id,'ca','propose',{terms:{...terms,salaryMin:110000},note:'Candidate offers a lower amount deliberately.'}),200);
 status(await updateDialogue(f,id,'ea','agree'),422);status(await updateDialogue(f,id,'ea','propose',{terms:{...terms,onCall:'yes'},note:'Employer attempts to add on-call duties.'}),422);
 assert.equal(offerRow(f,id).status,'pending');assert.equal(value(f,'dialogue',id).versions.length,2);status(await updateDialogue(f,id,'ea','propose',{terms,note:'Employer restores all required conditions.'}),200);
});
test('identity grant alone exposes identity but not artifacts or contacts',async f=>{
 actors(f);await control(f,{anonymous:true});const p=await proof(f);assert.equal((await candidateView(f)).isAnonymous,true);assert.equal(await artifactView(f,p),false);await grant(f,['identity']);const c=await candidateView(f);assert.equal(c.fullName,'Candidate ca');assert.equal(c.isAnonymous,false);assert.equal(c.contact,undefined);assert.equal(await artifactView(f,p),false);assert.equal((await candidateView(f,'eb')).isAnonymous,true);
});
test('artifacts grant alone exposes only published artifacts while identity remains anonymous',async f=>{
 actors(f);await control(f,{anonymous:true});const pub=await proof(f),priv=await proof(f,false);await grant(f,['artifacts']);assert.equal(await artifactView(f,pub),true);assert.equal(await artifactView(f,priv),false);assert.equal((await candidateView(f)).isAnonymous,true);assert.equal((await candidateView(f)).contact,undefined);assert.equal(await artifactView(f,pub,'eb'),false);
});
test('artifact revocation and expiry remain effective while identity permission persists',async f=>{
 actors(f);await control(f,{anonymous:true});const p=await proof(f);await grant(f,['identity']);const g=await grant(f,['artifacts']);assert.equal(await artifactView(f,p),true);await revoke(f,g);assert.equal(await artifactView(f,p),false);const next=await grant(f,['artifacts']);expire(f,next);assert.equal(await artifactView(f,p),false);assert.equal((await candidateView(f)).isAnonymous,false);
});
test('identity revocation and expiry do not revoke independently granted artifacts',async f=>{
 actors(f);await control(f,{anonymous:true});const p=await proof(f);await grant(f,['artifacts']);const g=await grant(f,['identity']);await revoke(f,g);assert.equal((await candidateView(f)).isAnonymous,true);assert.equal(await artifactView(f,p),true);const next=await grant(f,['identity']);expire(f,next);assert.equal((await candidateView(f)).isAnonymous,true);assert.equal(await artifactView(f,p),true);
});
test('publication changes affect employer evidence while own private evidence remains readable',async f=>{
 actors(f);const p=await proof(f);assert.equal(await artifactView(f,p),true);status(await f.request('ca','proofs/'+p,{method:'PATCH',body:{revision:0,published:false}}),200);assert.equal(await artifactView(f,p),false);assert.ok((await state(f,'ca')).proofs.some(x=>x.id===p));status(await f.request('cb','proofs/'+f.ca),404);status(await f.request('cb','proofs/'+p,{method:'PATCH',body:{revision:1,published:true}}),404);
});
test('foreign grants cannot be revoked and grants cannot target a nonexistent employer',async f=>{
 actors(f);const id=await grant(f,['identity']);status(await f.request('cb','grants/'+id,{method:'PATCH',body:{revision:0}}),404);status(await f.request('ea','grants/'+id,{method:'PATCH',body:{revision:0}}),403);status(await f.request('ca','grants',{method:'POST',body:{id:uuid(),employerId:'live:missing',fields:['identity'],expiresInDays:1}}),422);assert.equal(value(f,'grant',id).revoked,false);assert.equal((await state(f,'cb')).grants.length,0);assert.equal((await state(f,'ea')).grants.length,0);
});
test('verification request and response are visible and writable only to their participants',async f=>{
 actors(f);const id=await request(f);assert.equal((await state(f,'ea')).requests.length,1);assert.equal((await state(f,'ca')).requests.length,1);assert.equal((await state(f,'eb')).requests.length,0);assert.equal((await state(f,'cb')).requests.length,0);
 status(await f.request('eb','requests/'+id,{method:'PATCH',body:{revision:0,action:'cancel'}}),404);status(await f.request('cb','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'Foreign candidate response must never be stored.'}}),404);status(await f.request('ea','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'Employer must not impersonate the candidate.'}}),403);
 status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'One concrete explanation of the requested skill.'}}),200);status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:1,action:'review',feedback:'The candidate cannot confirm their own evidence.',decision:'confirmed'}}),403);
 status(await f.request('ea','requests/'+id,{method:'PATCH',body:{revision:1,action:'review',feedback:'A bounded review confirms the specific submitted explanation.',decision:'confirmed'}}),200);assert.equal(value(f,'request',id).state,'reviewed');
});
test('verification cannot attach another candidate proof and expired requests reject submission',async f=>{
 actors(f);const id=await request(f),foreign=await proof(f,true,'cb');status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'This response attempts to attach someone else proof.',proofId:foreign}}),422);
 f.sqlite.prepare("UPDATE career_records SET data=json_set(data,'$.dueAt',?) WHERE owner=? AND kind='request' AND id=?").run(new Date(Date.now()-1000).toISOString(),LIVE,id);status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'This otherwise valid response arrives after the deadline.'}}),409);assert.equal(value(f,'request',id).state,'requested');
});
test('terminal verification state and exact revision prevent rewriting a reviewed response',async f=>{
 actors(f);const id=await request(f);status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'The original candidate response with useful explanation.'}}),200);status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:0,action:'submit',response:'A stale replacement response must fail its CAS.'}}),409);status(await f.request('ea','requests/'+id,{method:'PATCH',body:{revision:1,action:'review',feedback:'Specific review of the submitted evidence and its limits.',decision:'more-evidence'}}),200);status(await f.request('ca','requests/'+id,{method:'PATCH',body:{revision:2,action:'submit',response:'A later replacement cannot rewrite the reviewed artifact.'}}),409);
});
test('foreign employers and candidates cannot read or mutate another negotiation',async f=>{
 actors(f);const id=await dialogue(f,await offer(f));for(const user of ['eb','cb']){assert.equal((await state(f,user)).dialogues.length,0);status(await f.request(user,'dialogues/'+id,{method:'PATCH',body:{revision:0,action:'message',note:'An unrelated person must not enter the shared timeline.'}}),404);}status(await f.request('eb','dialogues/'+id,{method:'POST',body:{terms}}),404);assert.equal(value(f,'dialogue',id).events.length,0);
});
test('legacy acceptance is blocked for versioned offers and remains available for unversioned offers',async f=>{
 actors(f);const id=await dialogue(f,await offer(f));status(await f.request('ca','offers/'+id,{version:1,method:'PATCH',body:{status:'accepted'}}),409);assert.equal(offerRow(f,id).status,'pending');status(await updateDialogue(f,id,'ca','agree'),200);const legacy=await offer(f);status(await f.request('ca','offers/'+legacy,{version:1,method:'PATCH',body:{status:'accepted'}}),200);
});
test('only candidate final confirmation accepts counterterms and publishes all shared conditions',async f=>{
 actors(f);await control(f,{anonymous:true});await grant(f,['identity','artifacts']);const id=await dialogue(f,await offer(f,{workFormat:'Офис',coreHours:'09:00–18:00',onCall:'yes',salaryMin:90000,salaryMax:110000}));
 status(await updateDialogue(f,id,'ea','agree'),409);status(await updateDialogue(f,id,'ca','propose',{terms:{...terms,salaryMin:130000},note:'Candidate proposes a higher lower salary bound.'}),200);status(await updateDialogue(f,id,'ea','agree'),200);assert.equal(offerRow(f,id).status,'pending');assert.equal((await state(f,'ea',1)).offers.find(x=>x.id===id).candidateContact,undefined);
 status(await updateDialogue(f,id,'ca','agree'),200);const accepted=(await state(f,'ea',1)).offers.find(x=>x.id===id);for(const key of ['salaryMin','salaryMax','workFormat','coreHours','onCall'])assert.equal(accepted[key],value(f,'dialogue',id).terms[key]);assert.equal(accepted.candidateContact,'ca@example.invalid');assert.equal(value(f,'dialogue',id).agreed,true);assert.equal((await state(f,'ea')).dialogues[0].mutationNonce,undefined);
 mutateCandidate(f,f.ca,c=>{c.privacy.processing=false});assert.equal((await state(f,'ea',1)).offers.find(x=>x.id===id).candidateContact,undefined);assert.equal((await state(f,'ea')).dialogues.length,0);
});
test('future revision racing an intervening event is rejected without changing offer or history',async f=>{
 actors(f);const id=await dialogue(f,await offer(f));let injected=false;f.afterFirst=(sql,args,r)=>{if(!injected&&r?.kind==='dialogue'&&r.id===id){injected=true;insertConcurrentEvent(f,id);}};
 status(await f.request('ca','dialogues/'+id,{method:'PATCH',body:{revision:1,action:'agree'}}),409);f.afterFirst=null;assert.ok(injected);assert.ok(value(f,'dialogue',id).events.some(x=>x.id==='concurrent-event'));assert.equal(value(f,'dialogue',id).agreed,false);assert.equal(offerRow(f,id).status,'pending');
});
test('concurrent exact-revision dialogue writes preserve one winner and never partially accept',async f=>{
 actors(f);const id=await dialogue(f,await offer(f));let injected=false;f.beforeRun=sql=>{if(!injected&&sql.startsWith('UPDATE career_records SET data=')){injected=true;insertConcurrentEvent(f,id);}};
 status(await f.request('ca','dialogues/'+id,{method:'PATCH',body:{revision:0,action:'agree'}}),409);f.beforeRun=null;assert.ok(injected);assert.equal(offerRow(f,id).status,'pending');assert.equal(value(f,'dialogue',id).events.length,1);assert.equal(value(f,'dialogue',id).events[0].id,'concurrent-event');assert.equal(value(f,'dialogue',id).agreed,false);
});
test('profile or session change during negotiation causes conflict without partial acceptance',async ()=>{
 for(const change of ['profile','session']){const g=fixture();try{actors(g);const id=await dialogue(g,await offer(g));let injected=false;g.beforeRun=sql=>{if(!injected&&sql.startsWith('UPDATE career_records SET data=')){injected=true;if(change==='profile')mutateCandidate(g,g.ca,c=>{c.privacy.processing=false});else g.sqlite.prepare('UPDATE members SET revision=revision+1 WHERE owner=?').run('live:ca');}};status(await g.request('ca','dialogues/'+id,{method:'PATCH',body:{revision:0,action:'agree'}}),409);assert.equal(offerRow(g,id).status,'pending');assert.equal(value(g,'dialogue',id).agreed,false);assert.equal(row(g,'dialogue',id).revision,0);}finally{g.sqlite.close();}}
});
test('terminal offer stops new conditions and private hiring notes never enter shared timeline',async f=>{
 actors(f);const id=await dialogue(f,await offer(f));status(await f.request('ea','notes/'+f.ca,{version:1,method:'PUT',body:{revision:0,stage:'shortlist',text:'PRIVATE_INTERNAL_NOTE_SENTINEL'}}),200);status(await updateDialogue(f,id,'ca','agree'),200);status(await updateDialogue(f,id,'ea','propose',{terms,note:'Attempt to rewrite a completed agreement.'}),409);status(await updateDialogue(f,id,'ea','message',{note:'A legitimate follow-up after the agreement.'}),200);assert.ok(!JSON.stringify(await state(f,'ca')).includes('PRIVATE_INTERNAL_NOTE_SENTINEL'));
});
test('lab list and every public case omit server keys and pre-submit explanations',async f=>{
 actors(f);const list=await f.request('ca','lab');status(list,200);assert.equal(list.value.cases.length,bank.length);assert.equal(bank.length,12);noKeys(list.value);for(const task of bank){const r=await f.request('ca','lab/'+task.id);status(r,200);noKeys(r.value);assert.equal(r.value.case.decisions.length,3);for(const q of r.value.case.decisions)assert.equal(q.explanation,undefined);}
});
let scoredMasks=0;
test('server scores all 8 answer subsets of every lab case without changing qualification',async f=>{
 f.member('ea','employer');for(const [idx,task] of bank.entries()){const user='learner'+idx,cid=f.member(user,'candidate',true),before=f.readCandidate(cid);for(let mask=0;mask<8;mask++){const body=labPayload(task,mask),r=await f.request(user,'lab/'+task.id,{method:'POST',body});status(r,201);const run=r.value.runs.find(x=>x.id===body.id);assert.equal(run.score,Math.round(100*mask.toString(2).replaceAll('0','').length/3));assert.equal(run.executedCode,false);assert.equal(run.feedback.length,3);assert.equal(run.feedback.filter(x=>x.correct).length,mask.toString(2).replaceAll('0','').length);assert.equal(run.artifact,task.decisions.map(q=>q.options.find(x=>x.id===body.answers[q.id]).patch).join('\n\n'));assert.deepEqual(f.readCandidate(cid),before);scoredMasks++;}assert.equal((await state(f,'ea')).runs.length,0);}
});
test('lab rejects client score, qualification, invalid choices and employer submission',async f=>{
 actors(f);const task=bank[0],b=labPayload(task);for(const extra of [{score:100},{qualification:{role:'Frontend',grade:'Senior'}}])status(await f.request('ca','lab/'+task.id,{method:'POST',body:{...b,...extra}}),422);status(await f.request('ea','lab/'+task.id,{method:'POST',body:b}),403);status(await f.request('ca','lab/'+task.id,{method:'POST',body:{...b,answers:{...b.answers,[task.decisions[0].id]:'not-an-option'}}}),422);status(await f.request('ca','lab/'+task.id,{method:'POST',body:{...b,answers:{...b.answers,foreign:'value'}}}),422);assert.equal((await state(f,'ca')).runs.length,0);
});
test('lab retry is idempotent, changed answers conflict, and private runs stay candidate-only',async f=>{
 actors(f);const task=bank[0],b=labPayload(task);const first=await f.request('ca','lab/'+task.id,{method:'POST',body:b});status(first,201);const stored=row(f,'lab',b.id);status(await f.request('ca','lab/'+task.id,{method:'POST',body:b}),200);assert.deepEqual(row(f,'lab',b.id),stored);const different=labPayload(task,0);status(await f.request('ca','lab/'+task.id,{method:'POST',body:{...different,id:b.id}}),409);status(await f.request('cb','lab/'+task.id,{method:'POST',body:b}),409);assert.equal((await state(f,'cb')).runs.length,0);assert.equal((await state(f,'ea')).runs.length,0);assert.equal((await state(f,'ca')).runs.length,1);assert.equal(await artifactView(f,'lab:'+b.id),false);
});
test('lab publish exposes selected artifact but not private explanation or answer feedback',async f=>{
 actors(f);const task=bank[0],b={...labPayload(task),published:true,explanation:'PRIVATE_CANDIDATE_EXPLANATION_SENTINEL'};status(await f.request('ca','lab/'+task.id,{method:'POST',body:b}),201);const s=await state(f,'ea');assert.equal(s.runs.length,0);const p=s.proofs.find(x=>x.id==='lab:'+b.id);assert.ok(p);assert.equal(p.score,100);assert.equal(p.answers,undefined);assert.equal(p.feedback,undefined);assert.ok(!JSON.stringify(s).includes('PRIVATE_CANDIDATE_EXPLANATION_SENTINEL'));
});
test('parser is an honest nonmutating rules draft and import edits only own self-report',async f=>{
 actors(f);const before=f.readCandidate(f.ca),other=f.readCandidate(f.cb);const r=await f.request('ca','parse',{method:'POST',body:{kind:'resume',text:'Frontend React TypeScript engineer. Удалённо. Built bounded UI projects.'}});status(r,200);assert.equal(r.value.engine,'rules');assert.deepEqual(f.readCandidate(f.ca),before);
 status(await f.request('ca','resume-import',{method:'POST',body:{revision:before.revision,skills:r.value.skills,bio:'A concrete self-reported summary imported from a reviewed draft.'}}),200);const after=f.readCandidate(f.ca);assert.equal(after.revision,before.revision+1);assert.deepEqual(after.qualification,before.qualification);assert.deepEqual(after.privacy,before.privacy);assert.equal(after.contact,before.contact);assert.deepEqual(f.readCandidate(f.cb),other);
});
test('import cannot impersonate another candidate, forge grade or bypass role and stale revision',async f=>{
 actors(f);const b={revision:0,skills:['React'],bio:'Reviewed candidate supplied summary of relevant projects.'};status(await f.request('ea','resume-import',{method:'POST',body:b}),403);for(const extra of [{candidateId:f.cb},{owner:'live:cb'},{qualification:{role:'Frontend',grade:'Senior'}}])status(await f.request('ca','resume-import',{method:'POST',body:{...b,...extra}}),422);status(await f.request('ca','resume-import',{method:'POST',body:b}),200);status(await f.request('ca','resume-import',{method:'POST',body:b}),409);mutateCandidate(f,f.ca,c=>{c.privacy.processing=false});status(await f.request('ca','resume-import',{method:'POST',body:{...b,revision:f.readCandidate(f.ca).revision}}),409);
});
test('demo namespaces and live records stay separate, including identical proof IDs',async f=>{
 actors(f);const p=await proof(f);status(await f.request('demo-a','state',{demo:true}),200);status(await f.request('demo-b','state',{demo:true}),200);const demoCid='demo-subject';const data={...proofData(),kind:'self',status:'claimed',source:'demo',synthetic:true,limits:'fixture'};f.sqlite.prepare('INSERT INTO career_records(owner,kind,id,candidate_id,employer_id,data,revision,created_at) VALUES(?,?,?,?,?,?,0,?)').run('demo-a','proof',p,demoCid,'',JSON.stringify(data),now());assert.ok(!(await state(f,'ea')).proofs.some(x=>x.id===p&&x.candidateId===demoCid));const ds=await f.request('demo-b','state',{demo:true});assert.ok(!ds.value.proofs.some(x=>x.id===p));status(await f.request('demo-b','proofs/'+f.ca,{demo:true}),404);
});
test('sandbox is demo-only and all fixture scenarios perform no import or network action',async f=>{
 actors(f);status(await f.request('ea','sandbox',{method:'POST',body:{scenario:'success'}}),403);await f.request('demo-a','state',{demo:true});const before=f.sqlite.prepare('SELECT count(*) AS n FROM candidates').get().n;for(const scenario of ['success','timeout','partial','changed']){const r=await f.request('demo-a','sandbox',{demo:true,method:'POST',body:{scenario}});status(r,200);assert.equal(r.value.networkRequest,false);assert.equal(r.value.imported,false);assert.equal(r.value.synthetic,true);}assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM candidates').get().n,before);
});

test('candidate can revoke a grant while processing is off and it stays revoked after reenabling',async f=>{
 actors(f);await control(f,{anonymous:true});const p=await proof(f),id=await grant(f,['identity','artifacts']);assert.equal(await artifactView(f,p),true);mutateCandidate(f,f.ca,c=>{c.privacy.processing=false});
 status(await f.request('ca','grants/'+id,{method:'PATCH',body:{revision:0}}),200);assert.equal(value(f,'grant',id).revoked,true);mutateCandidate(f,f.ca,c=>{c.privacy.processing=true});assert.equal((await candidateView(f)).isAnonymous,true);assert.equal(await artifactView(f,p),false);
});
test('lab retry with changed explanation or publication conflicts instead of silently discarding input',async f=>{
 actors(f);const task=bank[0],body=labPayload(task);status(await f.request('ca','lab/'+task.id,{method:'POST',body}),201);const before=row(f,'lab',body.id),p=row(f,'proof','lab:'+body.id);
 for(const change of [{explanation:'This materially different explanation must not be silently discarded.'},{published:true}])status(await f.request('ca','lab/'+task.id,{method:'POST',body:{...body,...change}}),409);
 assert.deepEqual(row(f,'lab',body.id),before);assert.deepEqual(row(f,'proof','lab:'+body.id),p);
});
test('lab retry treats equivalent answer maps as identical regardless of JSON key order',async f=>{
 actors(f);const task=bank[0],body=labPayload(task);status(await f.request('ca','lab/'+task.id,{method:'POST',body}),201);const before=row(f,'lab',body.id);status(await f.request('ca','lab/'+task.id,{method:'POST',body:{...body,answers:Object.fromEntries(Object.entries(body.answers).reverse())}}),200);assert.deepEqual(row(f,'lab',body.id),before);
});
test('profile-backed v2 writes cannot use future revision to cross concurrent processing withdrawal',async ()=>{
 const observed=[];
 for(const endpoint of ['controls','resume-import']){const g=fixture();try{actors(g);let injected=false;g.afterFirst=(sql,args)=>{if(!injected&&sql==='SELECT data,revision FROM candidates WHERE owner=? AND id=?'&&args[1]===g.ca){injected=true;g.afterFirst=null;mutateCandidate(g,g.ca,c=>{c.privacy.processing=false});}};
  const body=endpoint==='controls'?{revision:1,data:{anonymous:true,rules}}:{revision:1,skills:['React'],bio:'Future revision must not bypass withdrawal of processing.'};const r=await g.request('ca',endpoint,{method:endpoint==='controls'?'PUT':'POST',body});assert.ok(injected);observed.push(r.status);
 }finally{g.sqlite.close();}}
 assert.deepEqual(observed,[409,409],'Both endpoints must reject future read/write revisions');
});

let failures=0;
try{for(const {name,fn} of tests){const f=fixture();try{await fn(f);console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack);}finally{f.sqlite.close();}}}finally{globalThis.fetch=originalFetch;delete globalThis.__featureReviewContext;}
console.log(JSON.stringify({groups:tests.length,passed:tests.length-failures,failed:failures,labAnswerSubsets:scoredMasks,caseCount:bank.length,actualHandlers:true,networkCalls:0}));
if(failures)process.exitCode=1;


