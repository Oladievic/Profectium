/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const project = path.resolve(process.argv[2] ?? process.cwd());
const require = createRequire(path.join(project, "package.json"));
const { build } = require("esbuild");
const plugins = [
  {
    name: "read-only-review",
    setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
        path: "db",
        namespace: "review",
      }));
      b.onResolve({ filter: /session-auth$/ }, () => ({
        path: "auth",
        namespace: "review",
      }));
      b.onLoad({ filter: /.*/, namespace: "review" }, (x) => ({
        contents:
          x.path === "db"
            ? "export const env={get DB(){return globalThis.__reviewDb}}"
            : "export async function getCurrentUser(){return {userId:'review-owner'}}",
        loader: "js",
      }));
      b.onResolve({ filter: /^@\// }, (x) => ({
        path: path.resolve(project, x.path.slice(2) + ".ts"),
      }));
    },
  },
];
const built = await build({
  absWorkingDir: project,
  entryPoints: ["app/api/v1/[...path]/route.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins,
  logLevel: "silent",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync(path.join(project, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(fs.readFileSync(path.join(project, "drizzle", file), "utf8"));
  let revision = 0,
    firstHook = null,
    allHook = null,
    runHook = null;
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      const value = sqlite.prepare(this.sql).get(...this.args) ?? null;
      if (firstHook?.matches(this.sql, this.args)) {
        const hook = firstHook;
        firstHook = null;
        await hook.wait();
      }
      return value;
    }
    async all() {
      const results = sqlite.prepare(this.sql).all(...this.args);
      if (allHook?.matches(this.sql, this.args)) {
        const hook = allHook;
        allHook = null;
        await hook.wait();
      }
      return { results };
    }
    async run() {
      if (runHook?.matches(this.sql, this.args)) {
        const hook = runHook;
        runHook = null;
        await hook.wait();
      }
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { meta: { changes: Number(result.changes) } };
    }
  }
  globalThis.__reviewDb = {
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  async function request(route, body, customMethod) {
    const method = customMethod ?? (body === undefined ? "GET" : "POST");
    const response = await api[method](
      new Request("https://review.local/api/v1/" + route, {
        method,
        headers: {
          Origin: "https://review.local",
          "Content-Type": "application/json",
          "X-Session-Revision": String(revision),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: Promise.resolve({ path: route.split("/") }) },
    );
    const value = await response.json();
    if (value.session) revision = value.session.revision;
    return { status: response.status, value };
  }
  function pause(kind, matches) {
    let enter, release;
    const entered = new Promise((r) => (enter = r)),
      released = new Promise((r) => (release = r));
    const hook = {
      matches,
      wait: async () => {
        enter();
        await released;
      },
    };
    if (kind === "first") firstHook = hook;
    else if (kind === "run") runHook = hook;
    else allHook = hook;
    return { entered, release };
  }
  const keys = (id) =>
    JSON.parse(
      sqlite.prepare("SELECT answer_key FROM assessments WHERE id=?").get(id)
        .answer_key,
    );
  async function init(onboard = true) {
    await request("state");
    if (onboard)
      await request("onboarding", {
        fullName: "Review Candidate",
        contact: "review@example.test",
        processing: true,
        publication: true,
      });
  }
  return { request, pause, keys, init, sqlite };
}
const { strict: assert } = await import("node:assert");
const input = { role: "Backend", grade: "Junior", industry: "ИТ", motivation: "Synthetic qualification regression fixture" };
const results=[];
async function test(name, run) {
  const f=fixture();
  try { await f.init(); await run(f); results.push({name,passed:true}); }
  finally { f.sqlite.close(); }
}
async function start(f) {
  const r=await f.request("assessments",input); assert.equal(r.status,201); return r.value.assessments[0];
}
const read=(f,id)=>{const row=f.sqlite.prepare("SELECT data,status FROM assessments WHERE id=?").get(id); return {...JSON.parse(row.data),status:row.status};};
const expire=(f,id)=>{const at=new Date(Date.now()-1000).toISOString();f.sqlite.prepare("UPDATE assessments SET data=json_set(data,'$.expiresAt',?) WHERE id=?").run(at,id);return at;};
const candidate=(f)=>JSON.parse(f.sqlite.prepare("SELECT data FROM candidates WHERE id='demo-new-candidate'").get().data);
await test("stale draft and stale final submission cannot replace another tab's answers",async f=>{
  const a=await start(f), keys=f.keys(a.id), draft={ [a.questions[0].id]:keys[a.questions[0].id] };
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:draft,revision:0},"PUT")).status,200);
  for(const method of ["PUT","POST"]){const r=await f.request(`assessments/${a.id}${method==='PUT'?'/draft':''}`,{answers:keys,revision:0},method);assert.equal(r.status,409);}
  assert.deepEqual(read(f,a.id).draftAnswers,draft);assert.equal(read(f,a.id).draftRevision,1);assert.equal(read(f,a.id).status,'active');
  assert.equal((await f.request(`assessments/${a.id}`,{answers:keys,revision:1})).status,200);
  const immutable=read(f,a.id);assert.equal(immutable.status,'passed');
  assert.equal((await f.request(`assessments/${a.id}`,{answers:keys,revision:0})).status,200);
  assert.deepEqual(read(f,a.id),immutable);
});
await test("legacy unversioned save is accepted only for revision zero",async f=>{
  const a=await start(f),answers={ [a.questions[0].id]:a.questions[0].options[0].id };
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers},"PUT")).status,200);
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:{}},"PUT")).status,409);
  assert.deepEqual(read(f,a.id).draftAnswers,answers);
});
await test("concurrent saves with the same revision have exactly one winner",async f=>{
  const a=await start(f),first={ [a.questions[0].id]:a.questions[0].options[0].id },second={ [a.questions[1].id]:a.questions[1].options[0].id };
  const gate=f.pause('first',sql=>sql.startsWith("SELECT data FROM assessments"));
  const stale=f.request(`assessments/${a.id}/draft`,{answers:first,revision:0},'PUT');await gate.entered;
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:second,revision:0},'PUT')).status,200);
  gate.release();assert.equal((await stale).status,409);assert.deepEqual(read(f,a.id).draftAnswers,second);
});
await test("save racing final submission cannot silently change the finalized answers",async f=>{
  const a=await start(f),keys=f.keys(a.id);
  const gate=f.pause('first',sql=>sql==='SELECT data,revision FROM candidates WHERE owner=? AND id=?');
  const pending=f.request(`assessments/${a.id}`,{answers:keys,revision:0});await gate.entered;
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:{},revision:0},'PUT')).status,200);
  gate.release();assert.equal((await pending).status,409);assert.equal(read(f,a.id).status,'active');assert.equal(candidate(f).qualification,undefined);
});
for (const count of [0,2,6]) await test(`timeout finalizes ${count} saved answers, leaves qualification unchanged and ignores late perfect answers`,async f=>{
  const a=await start(f),keys=f.keys(a.id),answers=Object.fromEntries(Object.entries(keys).slice(0,count));
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers,revision:0},'PUT')).status,200);
  const deadline=expire(f,a.id),before=candidate(f);
  const r=await f.request('state'),result=r.value.assessments[0];
  assert.equal(result.status,'expired');assert.equal(result.completedAt,deadline);assert.equal(result.score,Math.round(count/6*100));assert.equal(result.feedback.filter(x=>x.correct).length,count);assert.deepEqual(result.answers,answers);assert.deepEqual(candidate(f),before);
  const frozen=read(f,a.id);
  for(const late of [{},keys]){const replay=await f.request(`assessments/${a.id}`,{answers:late,revision:1});assert.equal(replay.status,200);assert.deepEqual(read(f,a.id),frozen);}
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:keys,revision:1},'PUT')).status,404);
  await f.request('state');assert.deepEqual(read(f,a.id),frozen);
});
await test("starting another level finalizes the expired attempt before creating a new one",async f=>{
  const a=await start(f);expire(f,a.id);
  const r=await f.request('assessments',{...input,grade:'Middle'});assert.equal(r.status,201);
  assert.equal(r.value.assessments.find(x=>x.id===a.id).status,'expired');assert.equal(r.value.assessments.find(x=>x.id===a.id).score,0);assert.equal(r.value.assessments.filter(x=>x.status==='active').length,1);
});
await test("historical expired record missing completion metadata is repaired once",async f=>{
  const a=await start(f);expire(f,a.id);f.sqlite.prepare("UPDATE assessments SET status='expired' WHERE id=?").run(a.id);
  const r=await f.request('state');assert.equal(r.value.assessments[0].score,0);assert.ok(r.value.assessments[0].completedAt);
});
await test("unknown final and draft URL suffixes return 404 without any mutation",async f=>{
  const a=await start(f),before=read(f,a.id),answers=f.keys(a.id);
  for(const suffix of ['/draft','/anything','/extra/segment'])assert.equal((await f.request(`assessments/${a.id}${suffix}`,{answers,revision:0})).status,404);
  assert.equal((await f.request(`assessments/${a.id}/draft/extra`,{answers,revision:0},'PUT')).status,404);
  assert.deepEqual(read(f,a.id),before);assert.equal(candidate(f).qualification,undefined);
});
await test("invalid draft revision and foreign question IDs cannot mutate saved answers",async f=>{
  const a=await start(f),before=read(f,a.id);
  for(const revision of [-1,1.5,'0']) assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:{},revision},'PUT')).status,422);
  assert.equal((await f.request(`assessments/${a.id}/draft`,{answers:{[crypto.randomUUID()]:crypto.randomUUID()},revision:0},'PUT')).status,422);
  assert.deepEqual(read(f,a.id),before);
});
for (const action of ['submit-after-candidate-read','submit-at-database-write','draft-at-database-write']) await test(`deadline crossing during ${action} grades only committed answers`,async f=>{
 const a=await start(f),keys=f.keys(a.id),answers=Object.fromEntries(Object.entries(keys).slice(0,2));
 assert.equal((await f.request(`assessments/${a.id}/draft`,{answers,revision:0},'PUT')).status,200);
 const before=candidate(f),deadline=Date.now()+300;
 f.sqlite.prepare("UPDATE assessments SET data=json_set(data,'$.expiresAt',?) WHERE id=?").run(new Date(deadline).toISOString(),a.id);
 const isDraft=action.startsWith('draft');
 const gate=f.pause(action==='submit-after-candidate-read'?'first':'run',sql=>action==='submit-after-candidate-read'?sql==='SELECT data,revision FROM candidates WHERE owner=? AND id=?':sql.startsWith(isDraft?"UPDATE assessments SET data=json_set(data,'$.draftAnswers'":"UPDATE assessments SET data=?,status=?"));
 const pending=f.request(`assessments/${a.id}${isDraft?'/draft':''}`,{answers:keys,revision:1},isDraft?'PUT':'POST');
 assert.equal(await Promise.race([gate.entered.then(()=>true),pending.then(()=>false)]),true,'The request must reach the paused boundary before expiry');
 await new Promise(resolve=>setTimeout(resolve,Math.max(1,deadline-Date.now()+30)));gate.release();
 const r=await pending;assert.equal(r.status,isDraft?409:200);
 const result=read(f,a.id);assert.equal(result.status,'expired');assert.equal(result.score,33);assert.deepEqual(result.answers,answers);assert.deepEqual(result.draftAnswers,answers);assert.equal(result.draftRevision,1);assert.equal(result.completedAt,new Date(deadline).toISOString());assert.deepEqual(candidate(f),before,'No late qualification can be assigned');
});
await test('application clock alone cannot finalize a test before the database deadline',async f=>{
 const a=await start(f),realNow=Date.now;
 try {Date.now=()=>Date.parse(a.expiresAt)+1000;const r=await f.request('state');assert.equal(r.value.assessments[0].status,'active');assert.equal(read(f,a.id).score,undefined);}
 finally {Date.now=realNow;}
});
const engineBuild=await build({absWorkingDir:project,entryPoints:['lib/server/assessment-engine.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const engine=await import('data:text/javascript;base64,'+Buffer.from(engineBuild.outputFiles[0].text).toString('base64'));
{
 const {assessment:a,keys}=engine.createAssessment('Backend','Junior','ИТ','Boundary fixture');const deadline=Date.parse(a.expiresAt);
 assert.equal(engine.scoreAssessment(a,keys,keys,deadline-1).status,'passed');
 assert.equal(engine.scoreAssessment(a,keys,keys,deadline).status,'expired');
 assert.equal(engine.scoreAssessment(a,keys,keys,deadline+1).status,'expired');
 results.push({name:'expiry boundary is exclusive at exactly expiresAt',passed:true});
}
// Executes the actual TestAttempt closure with isolated hooks; does not replace browser QA.
{
 const vm=await import('node:vm');
 let rendering=null;
 const hooks={
  useState(initial){const frame=rendering,index=frame.cursor++;if(!(index in frame.slots))frame.slots[index]=typeof initial==='function'?initial():initial;return [frame.slots[index],v=>{frame.slots[index]=typeof v==='function'?v(frame.slots[index]):v;}];},
  useRef(initial){return this.useState({current:initial})[0];},
  useEffect(){rendering.cursor++;},
  mount(component){const frame={slots:[],cursor:0};return props=>{frame.cursor=0;rendering=frame;try{return component(props);}finally{rendering=null;}};},
 };
 const tag=names=>names.map(n=>`export const ${n}=${JSON.stringify('stub:'+n)};`).join('\n');
 const stubs=new Map([
  ['react','export const useState=(...args)=>globalThis.__hooks.useState(...args);export const useRef=(...args)=>globalThis.__hooks.useRef(...args);export const useEffect=(...args)=>globalThis.__hooks.useEffect(...args);'],
  ['react/jsx-runtime',"export const Fragment='fragment';export function jsx(type,props,key){return {type,props:props??{},key};}export const jsxs=jsx;"],
  ['lucide-react',tag(['ArrowRight','Timer','ShieldCheck','GraduationCap','Download'])],
  ['@/components/ui/radio-group',tag(['RadioGroup','RadioGroupItem'])],
  ['@/components/ui/progress',tag(['Progress'])],
  ['@/components/ui/checkbox',tag(['Checkbox'])],
  ['@/components/ui/dialog',tag(['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'])],
  ['./ui',tag(['Field','Picker'])],
  ['sonner','export const toast={error(){},success(){}};'],
 ]);
 const uiBuild=await build({absWorkingDir:project,stdin:{contents:'export { TestAttempt } from "./app/assessment.tsx";',resolveDir:project,sourcefile:'qualification-ui-test.ts',loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',logLevel:'silent',plugins:[{name:'isolated-ui',setup(b){b.onResolve({filter:/.*/},args=>stubs.has(args.path)?{path:args.path,namespace:'ui-stub'}:null);b.onLoad({filter:/.*/,namespace:'ui-stub'},args=>({contents:stubs.get(args.path),loader:'js'}));}}]});
 const cjs={exports:{}};let fetched;
 class TestElement { constructor(editable=false){this.editable=editable;} closest(){return this.editable?this:null;} }
 const context=vm.createContext({module:cjs,exports:cjs.exports,__hooks:hooks,HTMLElement:TestElement,fetch:async()=>({ok:true,json:async()=>fetched})});
 new vm.Script(uiBuild.outputFiles[0].text).runInContext(context,{timeout:5000});
 const {assessment:a}=engine.createAssessment('Backend','Junior','ИТ','UI conflict fixture');
 const local={ [a.questions[0].id]:a.questions[0].options[0].id },remote={ [a.questions[1].id]:a.questions[1].options[1].id };
 let answers=local,answerChanges=0;const calls=[];let succeed=false;
 const props=()=>({attempt:a,mode:'demo',now:Date.now(),busy:false,answers,setAnswers(value){answers=value;answerChanges++;},async mutate(...args){calls.push(JSON.parse(JSON.stringify(args)));return succeed;}});
 const render=hooks.mount(cjs.exports.TestAttempt);
 const all=(tree,pred,out=[])=>{if(Array.isArray(tree))for(const n of tree)all(n,pred,out);else if(tree&&typeof tree==='object'&&'type' in tree){if(pred(tree))out.push(tree);all(tree.props.children,pred,out);}return out;};
 const textOf=n=>Array.isArray(n)?n.map(textOf).join(''):n&&typeof n==='object'?textOf(n.props?.children):n==null?'':String(n);
 const button=(tree,label)=>{const found=all(tree,n=>n.type==='button'&&textOf(n.props.children)===label);assert.equal(found.length,1,label);return found[0];};
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 button(render(props()),'Сохранить черновик').props.onClick();await settle();
 assert.equal(calls[0][2].revision,0);assert.equal(answerChanges,0);assert.deepEqual(answers,local);
 let tree=render(props());assert.equal(all(tree,n=>n.props.role==='alert').length,1);
 fetched={assessments:[{...a,draftAnswers:remote,draftRevision:3}]};
 button(tree,'Проверить сохранённую версию').props.onClick();await settle();
 assert.equal(answerChanges,0);assert.deepEqual(answers,local);
 tree=render(props());button(tree,'Использовать сохранённые ответы').props.onClick();
 assert.deepEqual(answers,remote);assert.equal(answerChanges,1);
 succeed=true;button(render(props()),'Сохранить черновик').props.onClick();await settle();
 assert.equal(calls.at(-1)[2].revision,3);assert.deepEqual(calls.at(-1)[2].answers,remote);
 button(render(props()),'Сохранить черновик').props.onClick();await settle();assert.equal(calls.at(-1)[2].revision,4);
 results.push({name:'UI conflict retains local answers, inspecting never overwrites, explicit recovery uses inspected revision',passed:true});
 const remount=hooks.mount(cjs.exports.TestAttempt);succeed=false;
 button(remount({...props(),attempt:{...a,draftRevision:9}}),'Сохранить черновик').props.onClick();await settle();
 assert.equal(calls.at(-1)[2].revision,5,'Returning to the page must retain the local answers base revision');
 results.push({name:'navigation does not silently rebase retained local answers onto a newer server revision',passed:true});
 const expired=render({...props(),now:Date.parse(a.expiresAt)});
 assert.equal(button(expired,'Сохранить черновик').props.disabled,true);assert.equal(button(expired,'Завершить тест').props.disabled,true);
 assert.ok(all(expired,n=>n.type==='button'&&textOf(n.props.children)==='Получить результат сохранённых ответов').length);
 results.push({name:'UI deadline disables answer saving and exposes result recovery',passed:true});
 // Keyboard shortcuts are intentionally scoped to the focused question, never the page.
 const questions=tree=>all(tree,n=>n.type==='fieldset'&&n.props.onKeyDown);
 let prevented=0;
 const key=(value,extra={})=>({key:value,target:new TestElement(),nativeEvent:{isComposing:false},preventDefault(){prevented++;},...extra});
 answers={};tree=render(props());
 assert.equal(tree.props.onKeyDown,undefined);
 assert.equal(questions(tree).length,a.questions.length);
 questions(tree)[0].props.onKeyDown(key('2'));
 assert.equal(answers[a.questions[0].id],a.questions[0].options[1].id);
 assert.equal(prevented,1);
 tree=render(props());questions(tree)[0].props.onKeyDown(key('d'));
 assert.equal(answers[a.questions[0].id],a.questions[0].options[3].id);
 assert.equal(prevented,2);
 const before=answerChanges;
 for(const event of [key('a',{target:new TestElement(true)}),key('a',{ctrlKey:true}),key('a',{altKey:true}),key('a',{metaKey:true}),key('a',{shiftKey:true}),key('a',{repeat:true}),key('a',{nativeEvent:{isComposing:true}}),key('z'),key('0')])questions(render(props()))[0].props.onKeyDown(event);
 assert.equal(answerChanges,before);assert.equal(prevented,2);
 questions(render(props()))[1].props.onFocusCapture();
 questions(render(props()))[0].props.onKeyDown(key('a'));
 assert.equal(answerChanges,before,'Inactive questions do not capture keys');
 questions(render(props()))[1].props.onKeyDown(key('a'));
 assert.equal(answers[a.questions[1].id],a.questions[1].options[0].id);
 const afterChoice=answerChanges;
 questions(render({...props(),busy:true}))[1].props.onKeyDown(key('2'));
 questions(render({...props(),now:Date.parse(a.expiresAt)}))[1].props.onKeyDown(key('2'));
 assert.equal(answerChanges,afterChoice);
 const navigation=all(render(props()),n=>n.type==='nav'&&n.props['aria-label']==='Карта заданий');
 assert.equal(navigation.length,1);
 const jumps=all(navigation,n=>n.type==='button');assert.equal(jumps.length,a.questions.length);
 assert.equal(jumps[0].props['data-answered'],true);assert.equal(jumps[2].props['data-answered'],false);
 results.push({name:'question keyboard selection is scoped, skips editable/modifier/composition events, and respects expiry and busy guards',passed:true});
 results.push({name:'question map exposes every question and distinguishes selected answers without changing saved data',passed:true});
}
console.log(JSON.stringify({suite:'qualification-regression',readOnly:true,checks:results.length,results},null,2));
