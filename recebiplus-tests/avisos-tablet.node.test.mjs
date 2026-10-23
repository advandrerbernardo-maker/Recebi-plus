import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const start=js.indexOf('const nativePerReminderSettings=');
const end=js.indexOf('function notificationSummary(){',start);
const source=js.slice(start,end);
assert.ok(start>0&&end>start,'Módulo de avisos por aparelho presente');
const makeModule=(native=false)=>{
 const store=new Map(),nativeStore=new Map();
 const localStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,value),
 };
 const nativeBridge=native?{
  getReminderNotificationSettings:id=>JSON.stringify(nativeStore.get(id)||{hour:9,minute:0,three:true,eve:true,today:true}),
  saveReminderNotificationSettings:(id,value)=>nativeStore.set(id,JSON.parse(value))
 }:undefined;
 const root={RecebiAndroid:nativeBridge};
 const messages=[];
 const env=new Function('window','localStorage','document','text','msg','checkBrowserDueReminders',source+';return {setOwner:id=>reminderOwnerId=id,reminderSettings,reminderSummary,saveReminderSettings,editReminderNotifications,nativePerReminderSettings,perReminderSettings};');
 const doc={
  elements:[],
  createElement(tag){
   const obj={tag,children:[],style:{},styleText:'',events:{},textContent:'',value:'',checked:false,parentElement:null,
    append(...nodes){this.children.push(...nodes);for(const n of nodes){if(n&&typeof n==='object')n.parentElement=this}},
    addEventListener(name,fn){this.events[name]=fn},
    remove(){this.removed=true},
   };
   this.elements.push(obj);return obj;
  },
  createTextNode(value){return {nodeType:3,textContent:value}},
 };
 const text=(tag,value)=>{const el=doc.createElement(tag);el.textContent=value;return el};
 const module=env(root,localStorage,doc,text,message=>messages.push(message),()=>messages.push('checked'));
 return {module,store,nativeStore,doc,messages};
};

test('A interface sempre possui configuração individual e resumo para pendentes no tablet',()=>{
 assert.match(js,/const perReminderSettings=true/);
 assert.match(js,/if\(!c\.paid && perReminderSettings\)/);
 assert.match(js,/if\(!c\.paid&&perReminderSettings\)/);
 assert.match(js,/Avisos deste lembrete/);
 assert.match(js,/browserReminderPanel/);
});
test('Configuração padrão aparece no tablet mesmo sem integração nativa',()=>{
 const x=makeModule();
 x.module.setOwner('conta-A');
 assert.equal(x.module.nativePerReminderSettings,false);
 assert.equal(x.module.perReminderSettings,true);
 assert.deepEqual(x.module.reminderSettings('cobranca-1'),{hour:9,minute:0,three:true,eve:true,today:true});
 assert.match(x.module.reminderSummary('cobranca-1'),/09:00 · 3 dias antes, na véspera, no vencimento/);
 assert.match(x.module.reminderSummary('cobranca-1'),/somente com Recebi\+ aberto/);
});
test('Preferências salvas no tablet sobrevivem à leitura e são isoladas por conta e parcela',()=>{
 const x=makeModule(),a=x.module;
 a.setOwner('conta-A');
 assert.equal(a.saveReminderSettings('parcela-1',{hour:16,minute:45,three:false,eve:true,today:false}),'web');
 assert.deepEqual(a.reminderSettings('parcela-1'),{hour:16,minute:45,three:false,eve:true,today:false});
 assert.match(a.reminderSummary('parcela-1'),/16:45 · na véspera/);
 assert.equal(a.reminderSummary('parcela-1').includes('3 dias antes'),false);
 assert.equal(a.reminderSettings('parcela-2').hour,9);
 a.setOwner('conta-B');
 assert.equal(a.reminderSettings('parcela-1').hour,9,'Outra conta não recebe preferências anteriores');
 a.setOwner('conta-A');
 assert.equal(a.reminderSettings('parcela-1').hour,16);
 assert.equal(x.store.size,1);
 assert.ok([...x.store.keys()][0].includes('conta-A:parcela-1'));
});
test('Avisos desativados exibem o estado correto sem afirmar entrega em segundo plano',()=>{
 const x=makeModule();x.module.setOwner('A');
 x.module.saveReminderSettings('id',{hour:8,minute:20,three:false,eve:false,today:false});
 assert.equal(x.module.reminderSummary('id'),'🔕 Avisos desativados');
 assert.match(html,/Com o aplicativo fechado, não há notificação automática/);
});
test('Integração Android original continua com leitura e gravação nativas',()=>{
 const x=makeModule(true);x.module.setOwner('owner');
 assert.equal(x.module.nativePerReminderSettings,true);
 assert.equal(x.module.saveReminderSettings('id',{hour:7,minute:30,three:true,eve:false,today:true}),'native');
 assert.deepEqual(x.nativeStore.get('id'),{hour:7,minute:30,three:true,eve:false,today:true});
 assert.match(x.module.reminderSummary('id'),/07:30 · 3 dias antes, no vencimento/);
 assert.doesNotMatch(x.module.reminderSummary('id'),/somente com Recebi\+ aberto/);
 assert.equal(x.store.size,0,'Não copiar configuração nativa para storage do navegador');
});
test('Formulário de avisos no tablet permite mudar e salvar três opções',()=>{
 const x=makeModule();const m=x.module;m.setOwner('owner');
 const holder=x.doc.createElement('div');
 const summary=x.doc.createElement('small');summary.parentElement=holder;
 m.editReminderNotifications('reminder1',summary);
 const form=holder.children[0];assert.equal(form.tag,'form');
 assert.ok(form.children.some(c=>c.textContent?.includes('Neste tablet/navegador')));
 const time=x.doc.elements.find(e=>e.tag==='input'&&e.type==='time');
 assert.ok(time);time.value='15:40';
 const boxes=x.doc.elements.filter(e=>e.tag==='input'&&e.type==='checkbox');
 assert.equal(boxes.length,3);boxes[0].checked=false;
 form.events.submit({preventDefault(){}});
 assert.equal(m.reminderSettings('reminder1').hour,15);
 assert.equal(m.reminderSettings('reminder1').minute,40);
 assert.equal(m.reminderSettings('reminder1').three,false);
 assert.match(summary.textContent,/15:40/);
 assert.equal(form.removed,true);
});
test('Contagem de dias de aviso usa calendário local e não horas UTC',()=>{
 const pos=js.indexOf('function daysUntilReminder(');
 const end=js.indexOf('function checkBrowserDueReminders(){',pos);
 assert.ok(pos>0&&end>pos);
 const extract=js.slice(pos,end);
 const calc=new Function(extract+';return daysUntilReminder;')();
 assert.equal(calc('2026-10-26','2026-10-23'),3);
 assert.equal(calc('2026-10-24','2026-10-23'),1);
 assert.equal(calc('2026-10-23','2026-10-23'),0);
 assert.equal(calc('2026-10-22','2026-10-23'),-1);
});
test('No navegador aberto o aviso do dia aparece uma vez, ignorando parcelas pagas',()=>{
 const start=js.indexOf('const seenWebAlerts=new Set();');
 const end=js.indexOf("$('dismissBrowserReminders').addEventListener",start);
 assert.ok(start>0&&end>start);
 const snippet=js.slice(start,end);
 const storage=new Map();
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const nodes={
  app:{hidden:false},
  browserReminderText:{textContent:''},
  browserReminderPanel:{hidden:true}
 };
 const $=id=>nodes[id];
 const DateMock=function(){return new Date(2026,9,23,10,30)};
 DateMock.UTC=Date.UTC;
 const charges=[
  {id:'pending-1',paid:false,due_date:'2026-10-26'},
  {id:'paid-1',paid:true,due_date:'2026-10-26'},
  {id:'pending-later',paid:false,due_date:'2026-11-26'}
 ];
 const run=new Function('nativePerReminderSettings','reminderOwnerId','document','$','charges','todayLocal','reminderSettings','localStorage','Date',snippet+';return checkBrowserDueReminders;')(
  false,'owner1',{visibilityState:'visible'},$,charges,()=> '2026-10-23',()=>({hour:9,minute:0,three:true,eve:true,today:true}),localStorage,DateMock);
 run();
 assert.equal(nodes.browserReminderPanel.hidden,false);
 assert.match(nodes.browserReminderText.textContent,/1 cobrança/);
 assert.equal(storage.size,1);
 nodes.browserReminderPanel.hidden=true;run();
 assert.equal(nodes.browserReminderPanel.hidden,true,'Não repetir o aviso no mesmo dia');
});
