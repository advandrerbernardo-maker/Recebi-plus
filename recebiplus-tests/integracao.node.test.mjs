import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html = await fs.readFile(new URL('../integracao-teste.html',import.meta.url),'utf8');
const original = await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] || '';

test('A pagina experimental tem JavaScript valido e nao altera a tela original',()=>{
 assert.ok(moduleScript);
 assert.doesNotThrow(()=>new Function(moduleScript.replace(/^import .*?;\s*$/gm,'')));
 assert.match(original,/Recebi\+ · Lembretes de recebimentos/);
 assert.doesNotMatch(original,/id="demo"|id="discard"/);
 assert.match(original,/const DAIZE_RECEIPT_TARGET='https:\/\/advandrerbernardo-maker\.github\.io\/Daiz-e\/index\.html\?recebiplus=1'/);
});
test('Somente consultas de cobrancas pagas; sem escrita no Supabase',()=>{
 assert.match(moduleScript,/\.eq\('owner_id',uid\)\.eq\('paid',true\)/);
 assert.match(moduleScript,/\.eq\('id',ch\.id\)\.eq\('paid',true\)/);
 assert.match(moduleScript,/\.eq\('owner_id',currentUser\)/);
 assert.doesNotMatch(moduleScript,/\.from\([^)]+\)\.(?:insert|update|delete|upsert)\(/);
});
test('Handoff transporta apenas informacoes limitadas e nao coloca nome em URL',()=>{
 assert.match(moduleScript,/const BRIDGE_KEY='recebiplus-daize-beta-handoff-v1'/);
 assert.match(moduleScript,/const entry=\{kind:'recebiplus-daize-test-v1'/);
 assert.match(moduleScript,/name:payload\.name,cents:payload\.cents,description:payload\.description/);
 assert.match(moduleScript,/window\.location\.assign\(TARGET\)/);
 assert.doesNotMatch(moduleScript,/localStorage\.setItem\([^)]*password/);
 assert.doesNotMatch(moduleScript,/new URLSearchParams/);
});
test('Simulacao ficticia transfere nome e centavos corretamente',()=>{
 const bridge=moduleScript.slice(moduleScript.indexOf('const BRIDGE_KEY='),moduleScript.indexOf("$('demo').addEventListener"));
 assert.ok(bridge);
 const store=new Map();
 const mockStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k)};
 let target='';
 const w={location:{origin:'https://advandrerbernardo-maker.github.io',assign:url=>{target=url}}};
 const make=new Function('localStorage','window','crypto','URL',bridge+';return handoff;');
 const handoff=make(mockStorage,w,{randomUUID:()=> 'mock-uuid'},URL);
 handoff({name:'CLIENTE DE TESTE',cents:150000,description:'Simulação',source:'demo',charge_id:null});
 const value=JSON.parse(store.get('recebiplus-daize-beta-handoff-v1'));
 assert.equal(value.name,'CLIENTE DE TESTE');
 assert.equal(value.cents,150000);
 assert.equal(value.description,'Simulação');
 assert.equal(value.source,'demo');
 assert.equal(target,'https://advandrerbernardo-maker.github.io/Daiz-e/integracao-teste.html');
});


const appModule=original.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
const bridgeStart=appModule.indexOf('const DAIZE_RECEIPT_TARGET=');
const bridgeEnd=appModule.indexOf('let latestRefreshId=0;',bridgeStart);
const bridgeCode=appModule.slice(bridgeStart,bridgeEnd);

test('A interface exibe Emitir recibo apenas no estado PAGO e junto de Gerenciar parcela',()=>{
 assert.ok(bridgeCode.includes("async function prepareDaizeReceipt(chargeId)"));
 assert.match(original,/if\(c\.paid\)\{const receipt=text\('button','Emitir recibo'\)/);
 assert.match(original,/quickActions\.append\(manager\);if\(c\.paid\)/);
 assert.match(original,/quickActions\.append\(receipt\)/);
 assert.match(original,/className='receipt-button'/);
 assert.match(original,/O Daiz-e abrirá para conferir e confirmar a emissão do recibo/);
 assert.doesNotMatch(original,/id="runDiagnostics"/);
});
test('O botão revalida pagamento e titularidade antes de preparar recibo',()=>{
 assert.match(bridgeCode,/\.eq\('owner_id',user\.id\)\.eq\('id',chargeId\)\.eq\('paid',true\)\.maybeSingle\(\)/);
 assert.match(bridgeCode,/\.from\('recebiplus_clients'\).*?\.eq\('owner_id',user\.id\).*?\.eq\('id',charge\.client_id\)/s);
 assert.match(bridgeCode,/if\(!charge\?\.paid\)throw Error/);
 assert.match(bridgeCode,/if\(epoch!==authEpoch\)throw Error/);
 assert.doesNotMatch(bridgeCode,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
const prepareWithMock=({paid=true,owner='conta1',clientName='Cliente Silva',offline=false,chargeError=false,clientError=false}={})=>{
 const entries=new Map(),queries=[];
 const storage={setItem(k,v){entries.set(k,v)}};
 const window={location:{origin:'https://advandrerbernardo-maker.github.io',target:null,assign(url){this.target=url}}};
 const client={
  auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
  from(table){
   const filters={};queries.push({table,filters});
   return {select(){
    return {eq(key,val){filters[key]=val;return this},async maybeSingle(){
     if(table==='recebiplus_charges'){
      if(chargeError)return {data:null,error:{message:'falha simulada'}};
      if(!paid)return {data:null,error:null};
      return {data:{id:'parcela1',client_id:'cliente1',description:'Entrada de lote',cents:10000,paid:true},error:null}
     }
     return clientError?{data:null,error:{message:'falha simulada'}}:{data:{name:clientName},error:null};
    }}
   }}
  }
 };
 const prepare=new Function('supabase','withConnectionDeadline','requireConnection','authEpoch','window','localStorage','crypto','URL',bridgeCode+';return prepareDaizeReceipt;')(client,async promise=>await promise,()=>!offline,1,window,storage,{randomUUID:()=> 'nonce-test'},URL);
 return {prepare,queries,entries,window};
};
test('Parcela paga gera rascunho para o Daiz-e original após validação',async()=>{
 const a=prepareWithMock();
 await a.prepare('parcela1');
 const entry=JSON.parse(a.entries.get('recebiplus-daize-receipt-handoff-v1'));
 assert.equal(entry.kind,'recebiplus-daize-receipt-v1');
 assert.equal(entry.name,'Cliente Silva');
 assert.equal(entry.cents,10000);
 assert.equal(entry.description,'Entrada de lote');
 assert.equal(entry.source,'paid');
 assert.equal(entry.charge_id,'parcela1');
 assert.equal(entry.owner_id,'conta1');
 assert.equal(a.queries[0].filters.owner_id,'conta1');
 assert.equal(a.queries[0].filters.paid,true);
 assert.equal(a.queries[1].filters.id,'cliente1');
 assert.equal(a.window.location.target,'https://advandrerbernardo-maker.github.io/Daiz-e/index.html?recebiplus=1');
 assert.equal(Object.hasOwn(entry,'password'),false);
 assert.equal(Object.hasOwn(entry,'phone'),false);
 assert.equal(Object.hasOwn(entry,'cpf'),false);
});
test('Parcela pendente nao gera recibo nem redireciona',async()=>{
 const a=prepareWithMock({paid:false});
 await assert.rejects(a.prepare('parcela1'),/nao esta mais marcada como PAGA/);
 assert.equal(a.entries.size,0);
 assert.equal(a.window.location.target,null);
});
test('Falha ao verificar cliente nao transfere dados nem abre outro app',async()=>{
 const a=prepareWithMock({clientError:true});
 await assert.rejects(a.prepare('parcela1'),/confirmar o cliente/);
 assert.equal(a.entries.size,0);
 assert.equal(a.window.location.target,null);
});
test('Sem internet bloqueia a integracao sem gravar rascunho',async()=>{
 const a=prepareWithMock({offline:true});
 await a.prepare('parcela1');
 assert.equal(a.entries.size,0);
 assert.equal(a.queries.length,0);
 assert.equal(a.window.location.target,null);
});

test('Avisos reforçam que o recebimento é manual e o recibo só é emitido no Daiz-e',()=>{
 assert.match(original,/Confirma que o pagamento desta parcela foi efetivamente recebido/);
 assert.match(original,/O Recebi\+ não verifica movimentações bancárias/);
 assert.match(original,/Se já emitiu um recibo no Daiz-e, ele não será cancelado automaticamente/);
 assert.match(original,/const RECEBI_BUILD='2026-10-23-tablet-reminders-21'/);
 assert.doesNotMatch(appModule,/DAIZE_TEST_TARGET|prepareDaizeTestReceipt/);
});
