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
 assert.doesNotMatch(original,/id="demo"|id="discard"|integracao-teste.html/);
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
