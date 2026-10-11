/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const project=path.resolve(process.argv[2]??process.cwd());
const {build}=createRequire(path.join(project,'package.json'))('esbuild');
const tag=names=>names.map(n=>`export const ${n}=${JSON.stringify('stub:'+n)};`).join('\n');
const stubs=new Map([
 ['react',`export const useState=(...a)=>globalThis.__hooks.useState(...a);export const useRef=(...a)=>globalThis.__hooks.useRef(...a);export const useEffect=(...a)=>globalThis.__hooks.useEffect(...a);export const useCallback=(...a)=>globalThis.__hooks.useCallback(...a);`],
 ['react/jsx-runtime',"export const Fragment='fragment';export function jsx(type,props,key){return {type,props:props??{},key};}export const jsxs=jsx;"],
 ['lucide-react',tag(['ArrowLeft','ArrowUp','ArrowDown','Plus','Trash2','CheckCircle2','Clock3','FileCheck2','Send','Save','Eye','Copy','Download','RefreshCw','LockKeyhole','ListChecks'])],
 ['sonner','export const toast={success(){},error(){}};'],
 ['@/components/ui/dialog',tag(['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription'])],
]);
const bundled=await build({absWorkingDir:project,stdin:{contents:'export { AnswerWorkspace, TestEditor, ResultView, AttemptDetail } from "./app/employer-tests.tsx";',resolveDir:project,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',logLevel:'silent',plugins:[{name:'private-test-exposure',setup(b){
 b.onResolve({filter:/.*/},args=>stubs.has(args.path)?{path:args.path,namespace:'stub'}:null);
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs.get(args.path),loader:'js'}));
 b.onLoad({filter:/[\\/]employer-tests\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport { AnswerWorkspace, TestEditor, ResultView, AttemptDetail };',loader:'tsx'}));
}}]});
function runtime() {
 let frame=null;const listeners=new Map(),timers=new Map();let timerId=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={
  useState(initial){const f=frame,i=f.cursor++;if(!(i in f.slots))f.slots[i]=typeof initial==='function'?initial():initial;return [f.slots[i],v=>{if(f.active)f.slots[i]=typeof v==='function'?v(f.slots[i]):v;}];},
  useRef(initial){return this.useState({current:initial})[0];},
  useCallback(fn,deps){const f=frame,i=f.cursor++;const old=f.slots[i];if(!old||!same(old.deps,deps))f.slots[i]={fn,deps};return f.slots[i].fn;},
  useEffect(fn,deps){const f=frame,i=f.cursor++,old=f.slots[i];if(!old||!same(old.deps,deps)){f.effects.push(()=>{old?.cleanup?.();const cleanup=fn();f.slots[i]={deps,cleanup};});}},
 };
 const window={scrollTo(){},dispatchEvent(event){for(const fn of listeners.get(event.type)??[])fn(event);return !event.defaultPrevented;},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);}};
 const cjs={exports:{}};
 const context=vm.createContext({module:cjs,exports:cjs.exports,__hooks:hooks,window,crypto,structuredClone,Event,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms,interval:false});return id;},clearTimeout(id){timers.delete(id);},setInterval(fn,ms){const id=++timerId;timers.set(id,{fn,ms,interval:true});return id;},clearInterval(id){timers.delete(id);}});
 new vm.Script(bundled.outputFiles[0].text).runInContext(context,{timeout:5000});
 return {components:cjs.exports,mount(component){const f={slots:[],cursor:0,effects:[],active:true};return {render(props){f.cursor=0;f.effects=[];frame=f;let tree;try{tree=component(props);}finally{frame=null;}for(const effect of f.effects)effect();return tree;},unmount(){for(const s of f.slots)s?.cleanup?.();f.active=false;}};},dispatch(type){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of listeners.get(type)??[])fn(event);return event;},fireTimeouts(ms){for(const [id,t] of [...timers])if(!t.interval&&t.ms===ms){timers.delete(id);t.fn();}}};
}
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):n==null?'':String(n);
function nodes(tree,predicate,result=[],disabled=false){if(Array.isArray(tree))for(const n of tree)nodes(n,predicate,result,disabled);else if(tree&&typeof tree==='object'&&'type' in tree){const off=disabled||!!tree.props.disabled;if(predicate(tree))result.push({node:tree,disabled:off});nodes(tree.props.children,predicate,result,off);}return result;}
const one=(tree,p)=>{const n=nodes(tree,p);assert.equal(n.length,1,'Expected exactly one matching node');return n[0];};
const button=(tree,label)=>one(tree,n=>n.type==='button'&&text(n.props.children)===label);
const confirm=(tree)=>one(tree,n=>typeof n.type==='function'&&n.type.name==='Confirm'&&n.props.title==='Отправить ответы?').node;
const textarea=tree=>one(tree,n=>n.type==='textarea'&&n.props.placeholder==='Опишите решение и ход рассуждений…').node;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function queue(){const calls=[];return {calls,api(path,method='GET',body){const d=deferred();calls.push({path,method,body:plain(body??{}),...d});return d.promise;}};}
function attempt(overrides={}){return {id:crypto.randomUUID(),revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),testId:crypto.randomUUID(),testRevision:1,title:'Synthetic employer test',skill:'Backend',employerId:'employer',employerName:'Fixture employer',candidateId:'candidate',dueAt:new Date(Date.now()+3600000).toISOString(),estimatedMinutes:20,questionCount:1,state:'active',startedAt:new Date().toISOString(),submittedAt:null,reviewedAt:null,expired:false,savedAnswers:0,result:null,description:'Synthetic test fixture',passingPercent:70,questions:[{id:'question-text',kind:'text',prompt:'Explain the reasoning',points:10,options:[],rubric:'Reasoning and explicit constraints'}],answers:{},...overrides};}
function candidateFixture(overrides={}){const rt=runtime(),a=attempt(overrides),q=queue(),changes=[];let active=a;const props={attempt:a,api:q.api,onChange(value){changes.push(value);active=value;},onClose(){}};const mounted=rt.mount(rt.components.AnswerWorkspace);return {rt,a,q,changes,props,mounted,render:()=>mounted.render({...props,attempt:active})};}
const results=[];
async function test(name,fn){try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}}
await test('save serialization sends the latest edited text before final submission',async()=>{
 const f=candidateFixture();let tree=f.render();textarea(tree).props.onChange({target:{value:'first draft'}});tree=f.render();button(tree,'Сохранить').node.props.onClick();
 assert.equal(f.q.calls.length,1);assert.equal(f.q.calls[0].body.answers['question-text'],'first draft');
 textarea(tree).props.onChange({target:{value:'newer answer'}});tree=f.render();button(tree,'Сохранить').node.props.onClick();assert.equal(f.q.calls.length,1,'No simultaneous saves');
 f.q.calls[0].resolve({attempt:{...f.a,revision:2,answers:{'question-text':'first draft'}}});await settle();assert.equal(f.q.calls.length,2);assert.equal(f.q.calls[1].body.revision,2);assert.equal(f.q.calls[1].body.answers['question-text'],'newer answer');
 tree=f.render();button(tree,'Завершить тест').node.props.onClick();tree=f.render();confirm(tree).props.onConfirm();await settle();assert.equal(f.q.calls.length,2,'Submit waits for the in-flight latest draft');
 f.q.calls[1].resolve({attempt:{...f.a,revision:3,answers:{'question-text':'newer answer'}}});await settle();assert.equal(f.q.calls.length,3);assert.equal(f.q.calls[2].body.action,'submit');assert.equal(f.q.calls[2].body.revision,3);assert.equal(f.q.calls[2].body.answers['question-text'],'newer answer');
 f.q.calls[2].resolve({attempt:{...f.a,state:'submitted',revision:4,answers:{'question-text':'newer answer'}}});await settle();assert.equal(f.changes.at(-1).state,'submitted');f.mounted.unmount();
});
await test('submit-save conflict closes the dialog and retains local text for recovery',async()=>{
 const f=candidateFixture();let tree=f.render();textarea(tree).props.onChange({target:{value:'must survive conflict'}});tree=f.render();button(tree,'Завершить тест').node.props.onClick();tree=f.render();confirm(tree).props.onConfirm();await settle();assert.equal(f.q.calls.length,1);
 f.q.calls[0].reject(Object.assign(new Error('Changed by another tab'),{status:409}));await settle();tree=f.render();assert.equal(textarea(tree).props.value,'must survive conflict');assert.equal(confirm(tree).props.open,false,'Failure must be visible outside the dismissed dialog');assert.equal(button(tree,'Сохранить').disabled,true);assert.equal(f.changes.length,0);f.mounted.unmount();
});
await test('direct submit error closes the dialog instead of hiding the error behind it',async()=>{
 const f=candidateFixture();let tree=f.render();button(tree,'Завершить тест').node.props.onClick();tree=f.render();confirm(tree).props.onConfirm();await settle();assert.equal(f.q.calls[0].body.action,'submit');
 f.q.calls[0].reject(Object.assign(new Error('Synthetic network failure'),{status:503}));await settle();tree=f.render();assert.equal(confirm(tree).props.open,false);assert.ok(nodes(tree,n=>typeof n.type==='function'&&n.type.name==='ErrorBox'&&n.props.error==='Synthetic network failure').length);f.mounted.unmount();
});
await test('late autosave response cannot reopen an unmounted answer workspace',async()=>{
 const f=candidateFixture();let tree=f.render();textarea(tree).props.onChange({target:{value:'saved before leaving'}});tree=f.render();button(tree,'Сохранить').node.props.onClick();f.mounted.unmount();f.q.calls[0].resolve({attempt:{...f.a,revision:2,answers:{'question-text':'saved before leaving'}}});await settle();assert.equal(f.changes.length,0,'onChange must not run after the workspace was left');
});
await test('expired submission sends no unsaved answers and exposes the saved result',async()=>{
 const f=candidateFixture({dueAt:new Date(Date.now()-1000).toISOString(),answers:{'question-text':'saved answer'}});let tree=f.render();assert.equal(button(tree,'Сохранить').disabled,true);button(tree,'Получить результат').node.props.onClick();tree=f.render();confirm(tree).props.onConfirm();await settle();assert.equal(f.q.calls.length,1);assert.equal(f.q.calls[0].body.action,'submit');assert.ok(!Object.hasOwn(f.q.calls[0].body,'answers'));
 f.q.calls[0].resolve({attempt:{...f.a,state:'submitted',revision:2,expired:true}});await settle();assert.equal(f.changes.at(-1).state,'submitted');f.mounted.unmount();
});
await test('dirty answer draft blocks SPA navigation as well as browser unload',async()=>{
 const f=candidateFixture();let tree=f.render();assert.equal(f.rt.dispatch('profectium:before-navigate').defaultPrevented,false);textarea(tree).props.onChange({target:{value:'navigation must preserve this'}});tree=f.render();assert.equal(f.rt.dispatch('beforeunload').defaultPrevented,true);assert.equal(f.rt.dispatch('profectium:before-navigate').defaultPrevented,true);f.mounted.unmount();assert.equal(f.rt.dispatch('profectium:before-navigate').defaultPrevented,false);
});
await test('publisher disables editable inputs and Back while saving the captured definition',async()=>{
 const rt=runtime(),q=queue();const initial={title:'Original test',description:'Fixture description',skill:'Backend',estimatedMinutes:20,passingPercent:70,questions:[{id:'q1',kind:'text',prompt:'Explain a solution',points:10,options:[],correctOptionIds:[],explanation:'',rubric:'Clear reasoning'}]};const original={...initial,id:crypto.randomUUID(),revision:2,state:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),publishedAt:null};
 const mounted=rt.mount(rt.components.TestEditor),props={initial,original,api:q.api,onClose(){},onSaved(){}};let tree=mounted.render(props);button(tree,'Опубликовать').node.props.onClick();tree=mounted.render(props);const inputs=nodes(tree,n=>n.type==='input'||n.type==='textarea');assert.ok(inputs.length>0);assert.ok(inputs.every(x=>x.disabled),'All editor fields must be disabled during publication');assert.equal(button(tree,'К библиотеке').disabled,true);mounted.unmount();
 q.calls[0].resolve({test:{...original,revision:3}});await settle();if(q.calls[1])q.calls[1].resolve({test:{...original,state:'published',revision:4}});await settle();
});
await test('editor conflict retains edits and saves an independent new draft with a fresh ID',async()=>{
 const rt=runtime(),q=queue();const initial={title:'Original test',description:'Fixture description',skill:'Backend',estimatedMinutes:20,passingPercent:70,questions:[]};const original={...initial,id:crypto.randomUUID(),revision:2,state:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),publishedAt:null};const mounted=rt.mount(rt.components.TestEditor),props={initial,original,api:q.api,onClose(){},onSaved(){}};
 let tree=mounted.render(props);one(tree,n=>n.type==='input'&&n.props.value==='Original test').node.props.onChange({target:{value:'Keep these local edits'}});tree=mounted.render(props);button(tree,'Сохранить черновик').node.props.onClick();q.calls[0].reject(Object.assign(new Error('Stale editor revision'),{status:409}));await settle();tree=mounted.render(props);assert.ok(one(tree,n=>n.type==='input'&&n.props.value==='Keep these local edits'));assert.equal(button(tree,'Сохранить черновик').disabled,true);
 button(tree,'Продолжить как новый черновик').node.props.onClick();tree=mounted.render(props);button(tree,'Сохранить черновик').node.props.onClick();assert.equal(q.calls[1].method,'POST');assert.equal(q.calls[1].path,'tests');assert.notEqual(q.calls[1].body.id,original.id);assert.equal(q.calls[1].body.data.title,'Keep these local edits');q.calls[1].resolve({test:{...original,...q.calls[1].body.data,id:q.calls[1].body.id,revision:0}});await settle();mounted.render(props);assert.equal(rt.dispatch('profectium:before-navigate').defaultPrevented,false);mounted.unmount();
});
await test('debounced autosave coalesces typing and does not retry endlessly after a network error',async()=>{
 const f=candidateFixture();let tree=f.render();textarea(tree).props.onChange({target:{value:'first character'}});tree=f.render();textarea(tree).props.onChange({target:{value:'latest before debounce'}});tree=f.render();f.rt.fireTimeouts(700);assert.equal(f.q.calls.length,1);assert.equal(f.q.calls[0].body.answers['question-text'],'latest before debounce');
 textarea(tree).props.onChange({target:{value:'new edit during save'}});tree=f.render();f.rt.fireTimeouts(700);assert.equal(f.q.calls.length,1);f.q.calls[0].reject(Object.assign(new Error('Offline'),{status:503}));await settle();tree=f.render();f.rt.fireTimeouts(700);await settle();assert.equal(f.q.calls.length,1,'No unchanged retry loop');assert.equal(textarea(tree).props.value,'new edit during save');button(tree,'Сохранить').node.props.onClick();assert.equal(f.q.calls.length,2);assert.equal(f.q.calls[1].body.answers['question-text'],'new edit during save');f.q.calls[1].resolve({attempt:{...f.a,revision:2,answers:{'question-text':'new edit during save'}}});await settle();f.mounted.unmount();
});
await test('manual review preserves zero points, guards navigation and freezes fields while publishing',async()=>{
 const rt=runtime(),q=queue();let a=attempt({state:'submitted',answers:{'question-text':'Candidate explanation'},result:{final:false,pendingReview:1,earnedPoints:0,maxPoints:10,percent:null,passed:null,feedback:'',breakdown:[{questionId:'question-text',points:null,maxPoints:10,correct:null,feedback:'',manual:true}]}});
 const mounted=rt.mount(rt.components.ResultView);const props=()=>({attempt:a,employer:true,api:q.api,onChange(value){a=value;}});let tree=mounted.render(props());
 one(tree,n=>n.type==='input'&&n.props.type==='number').node.props.onChange({target:{value:'0'}});tree=mounted.render(props());one(tree,n=>n.type==='textarea'&&n.props.minLength===5).node.props.onChange({target:{value:'Zero points because constraints were not addressed.'}});tree=mounted.render(props());one(tree,n=>n.type==='textarea'&&n.props.minLength===10).node.props.onChange({target:{value:'Please explain the error conditions and retry strategy.'}});tree=mounted.render(props());assert.equal(rt.dispatch('profectium:before-navigate').defaultPrevented,true,'Review drafts must survive sidebar navigation');
 one(tree,n=>n.type==='form').node.props.onSubmit({preventDefault(){}});assert.equal(q.calls[0].body.action,'review');assert.equal(q.calls[0].body.reviews[0].points,0);tree=mounted.render(props());assert.ok(nodes(tree,n=>n.type==='input'||n.type==='textarea').every(n=>n.disabled),'Fields must not change after review payload is sent');
 q.calls[0].resolve({attempt:{...a,state:'reviewed',revision:2,result:{...a.result,final:true,pendingReview:0,percent:0,passed:false}}});await settle();mounted.render(props());assert.equal(rt.dispatch('profectium:before-navigate').defaultPrevented,false);mounted.unmount();
});
await test('local Back asks before discarding a manual review and cancellation retains comments',async()=>{
 const rt=runtime(),q=queue();const a=attempt({state:'submitted',answers:{'question-text':'Candidate explanation'},result:{final:false,pendingReview:1,earnedPoints:0,maxPoints:10,percent:null,passed:null,feedback:'',breakdown:[{questionId:'question-text',points:null,maxPoints:10,correct:null,feedback:'',manual:true}]}});let closed=0;
 const detail=rt.mount(rt.components.AttemptDetail),review=rt.mount(rt.components.ResultView);const props={attempt:a,employer:true,api:q.api,onChange(){},onClose(){closed++;}};
 let outer=detail.render(props),inner=review.render(props);one(inner,n=>n.type==='textarea'&&n.props.minLength===5).node.props.onChange({target:{value:'Keep this unpublished feedback'}});inner=review.render(props);
 button(outer,'К приглашениям').node.props.onClick();assert.equal(closed,0);outer=detail.render(props);const leave=one(outer,n=>typeof n.type==='function'&&n.type.name==='Confirm'&&n.props.title==='Выйти без публикации оценки?').node;assert.equal(leave.props.open,true);
 leave.props.onOpenChange(false);outer=detail.render(props);inner=review.render(props);assert.equal(one(inner,n=>n.type==='textarea'&&n.props.minLength===5).node.props.value,'Keep this unpublished feedback');assert.equal(closed,0);
 button(outer,'К приглашениям').node.props.onClick();outer=detail.render(props);one(outer,n=>typeof n.type==='function'&&n.type.name==='Confirm'&&n.props.title==='Выйти без публикации оценки?').node.props.onConfirm();assert.equal(closed,1);
 review.unmount();outer=detail.render(props);button(outer,'К приглашениям').node.props.onClick();assert.equal(closed,2,'A pristine detail view closes without another prompt');detail.unmount();
});
console.log(JSON.stringify({suite:'employer-test-ui',kind:'isolated hook harness; not browser/DOM or React scheduling validation',checks:results.length,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;