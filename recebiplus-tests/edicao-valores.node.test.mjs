import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const money=await import(new URL('../recebiplus-supabase/money.js',import.meta.url));
const {setupValueEditor}=await import(new URL('../recebiplus-supabase/edit-total.js',import.meta.url));
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const repositorySource=await fs.readFile(new URL('../recebiplus-supabase/repository.js',import.meta.url),'utf8');
const sql=await fs.readFile(new URL('../supabase/migrations/20261023_recebiplus_recalculate_group.sql',import.meta.url),'utf8');

test('Máscara brasileira pontua centenas, milhares, centavos e não modifica espaços vazios',()=>{
 for(const [typed,expected] of [
  ['1','R$ 0,01'],['12','R$ 0,12'],['123','R$ 1,23'],
  ['50000','R$ 500,00'],['123456','R$ 1.234,56'],
  ['123456789','R$ 1.234.567,89'],
  ['R$ 2.500,00','R$ 2.500,00'],['','']
 ])assert.equal(money.formatCurrencyInput(typed),expected);
});

test('Parsing monetário aceita centavos inteiros e rejeita valores inválidos',()=>{
 assert.equal(money.parseCurrencyCents('R$ 0,01'),1);
 assert.equal(money.parseCurrencyCents('R$ 12,34'),1234);
 assert.equal(money.parseCurrencyCents('R$ 1.234,56'),123456);
 assert.equal(money.parseCurrencyCents('R$ 100.000.000,00'),10000000000);
 assert.equal(money.parseCurrencyCents('R$ 2.000.000.000,00'),200000000000);
 assert.equal(money.parseCurrencyCents('R$ 0,00'),null);
 assert.equal(money.parseCurrencyCents(''),null);
 assert.equal(money.parseCurrencyCents('9999999999999'),null);
});

const makeGroup=(paid,unpaid)=>[
 ...paid.map((c,i)=>({id:'paid-'+i,cents:c,paid:true,version:3})),
 ...unpaid.map((c,i)=>({id:'unpaid-'+i,cents:c,paid:false,version:1}))
];

test('Preserva R$ 500 pagos e redistribui R$ 3.000 em quatro parcelas de R$ 625',()=>{
 assert.deepEqual(money.previewInstallments(300000,makeGroup([50000],[50000,50000,50000,50000])),{
  paidCents:50000,pendingCount:4,baseCents:62500,lastCents:62500,
  totalCents:300000,remainingCents:250000,changedCents:50000
 });
});

test('Distribui centavos residuais no final e impede alterar planos inteiramente pagos',()=>{
 const x=money.previewInstallments(300001,makeGroup([50000],[50000,50000,50000,50000]));
 assert.equal(x.baseCents,62500);
 assert.equal(x.lastCents,62501);
 assert.equal(x.baseCents*3+x.lastCents+x.paidCents,300001);
 assert.equal(money.previewInstallments(50000,makeGroup([50000],[50000,50000])),null);
 assert.equal(money.previewInstallments(60000,makeGroup([60000],[])),null);
});

test('RPC SQL é atômica, preserva pagos, usa RLS/versão e gera auditoria normal',()=>{
 for(const match of [/SECURITY INVOKER/,/v_owner uuid := auth\.uid\(\)/,
  /row_charge\.paid THEN/,/AND c\.paid=false/,/FOR UPDATE/,
  /v_version_text::bigint <> row_charge\.version/,/jsonb_object_keys\(p_expected_versions\)/,
  /REVOKE ALL ON FUNCTION public\.recebiplus_recalculate_group/])
  assert.match(sql,match);
 assert.doesNotMatch(sql,/SECURITY DEFINER/);
});

test('Interface exibe o botão onde o usuário indicou e mascara valor do novo cadastro',()=>{
 assert.match(html,/class="client-total-tools"><div id="clientTotal"[\s\S]*?<button[^>]*id="editClientTotal"/);
 assert.match(html,/id="editTotalDialog"/);
 assert.match(html,/id="editTotalMoney"[^>]*inputmode="numeric"/);
 assert.match(html,/id="amount"[^>]*type="text" inputmode="numeric"/);
 assert.match(html,/attachMoneyMask\(\$\('amount'\)\)/);
 assert.match(html,/const valueEditor=setupValueEditor/);
 assert.match(html,/total=parseCurrencyCents\(\$\('amount'\)\.value\)/);
 assert.match(html,/const RECEBI_BUILD='2026-10-23-money-edit-23'/);
});

test('Repository usa uma transação via RPC para recalcular todo o grupo',async()=>{
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(repositorySource));
 let call=null;
 const supabase={
  auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  rpc:async(name,data)=>{call={name,data};return {data:[
   {charge_id:'c1',new_cents:50000},{charge_id:'c2',new_cents:125000},
   {charge_id:'c3',new_cents:125000}
  ],error:null}}
 };
 const data={c1:2,c2:1,c3:1};
 const repo=createRecebiRepository(supabase);
 await repo.recalculateGroup('client','group',300000,data);
 assert.deepEqual(call,{name:'recebiplus_recalculate_group',data:{
  p_client_id:'client',p_group_id:'group',p_new_total:300000,p_expected_versions:data
 }});
});

test('Repository recusa resposta incompleta ou soma diferente após a atualização',async()=>{
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(repositorySource));
 const sb={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  rpc:async()=>({data:[{new_cents:1}],error:null})};
 await assert.rejects(
  createRecebiRepository(sb).recalculateGroup('client','group',200000,{id:1}),
  /Novo total não confirmado/
 );
});

test('Editor permite escolher um plano e envia apenas suas parcelas para recálculo',async()=>{
 const originalDoc=globalThis.document;
 class Element{
  constructor(){this.value='';this.textContent='';this.disabled=false;this.open=false;this.hidden=false;this.children=[];this.events={};this.classList={toggle(){},add(){}}}
  addEventListener(type,fn){this.events[type]=fn}
  append(e){this.children.push(e);if(!this.value)this.value=e.value||''}
  replaceChildren(){this.children=[];this.value=''}
  showModal(){this.open=true}
  close(){this.open=false}
  focus(){globalThis.document.activeElement=this}
 }
 const items=new Map();
 const $=id=>{if(!items.has(id))items.set(id,new Element());return items.get(id)};
 globalThis.document={activeElement:null,createElement:()=>new Element()};
 let lastPromise=null,lastRPC=null;
 const clientId='cliente';
 const rows=[
  {id:'a1',client_id:clientId,group_id:'g1',description:'Entrada · parcela 1/5',cents:50000,paid:true,version:2,due_date:'2026-09-30'},
  ...[2,3,4,5].map(i=>({id:'a'+i,client_id:clientId,group_id:'g1',
   description:'Entrada · parcela '+i+'/5',cents:50000,paid:false,version:1,
   due_date:'2026-11-'+String(i).padStart(2,'0')})),
  {id:'b1',client_id:clientId,group_id:'g2',description:'Outra dívida',
   cents:77777,paid:false,version:1,due_date:'2026-12-01'}
 ];
 try{
  setupValueEditor({
   $,repo:{recalculateGroup:async(...args)=>{lastRPC=args;return []}},
   fmt:c=>'R$ '+(Number(c)/100).toFixed(2),msg:()=>{},
   action:fn=>{lastPromise=fn();return lastPromise},
   refresh:async()=>{},withConnectionDeadline:async p=>await p,
   confirmRecebi:async()=>true,requireConnection:()=>true,
   getSelectedClientId:()=>clientId,getCharges:()=>rows
  });
  $('editClientTotal').events.click();
  assert.equal($('editTotalDialog').open,true);
  assert.equal($('editTotalGroup').children.length,2);
  assert.equal($('editTotalGroup').value,'g1');
  assert.equal($('editTotalMoney').value,'R$ 2.500,00');
  $('editTotalMoney').value='R$ 3.000,00';
  $('editTotalMoney').events.input();
  assert.match($('editTotalPreview').textContent,/625\.00/);
  $('editTotalForm').events.submit({preventDefault(){}});
  await lastPromise;
  assert.equal(lastRPC[0],clientId);
  assert.equal(lastRPC[1],'g1');
  assert.equal(lastRPC[2],300000);
  assert.deepEqual(lastRPC[3],{a1:2,a2:1,a3:1,a4:1,a5:1});
  assert.equal($('editTotalDialog').open,false);
  assert.equal(rows.at(-1).cents,77777);
 }finally{globalThis.document=originalDoc}
});
