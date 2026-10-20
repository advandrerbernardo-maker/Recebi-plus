// Teste isolado: falha de resposta depois da gravacao no servidor.
// Executar: node --test recebiplus-tests/falha-rede-isolada.node.test.mjs
// Nao usa credenciais nem modifica o Supabase real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../recebiplus-supabase/repository.js',import.meta.url),'utf8');
const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));

test('Resposta perdida apos commit: reenvio recupera 3 parcelas sem duplicar',async()=>{
 const rows=[];let attempts=0;
 const api={
  auth:{getUser:async()=>({data:{user:{id:'conta-teste'}},error:null})},
  from:()=>({
   upsert(entries,options){
    assert.equal(options.onConflict,'owner_id,group_id,description');
    assert.equal(options.ignoreDuplicates,true);
    return {then(resolve){
     attempts++;
     // Simula o servidor persistindo tudo antes da queda de conexao.
     for(const e of entries)if(!rows.some(x=>x.owner_id===e.owner_id&&x.group_id===e.group_id&&x.description===e.description))rows.push({...e});
     resolve(attempts===1?{data:null,error:{message:'Failed to fetch: response lost after commit'}}:{data:null,error:null});
    }};
   },
   select(){const filters={};return {eq(k,v){filters[k]=v;return this},then(resolve){resolve({data:rows.filter(x=>x.owner_id===filters.owner_id&&x.group_id===filters.group_id),error:null})}}}
  })
 };
 const repo=createRecebiRepository(api);
 const entries=[1,2,3].map(n=>({client_id:'cliente-ficticio',group_id:'grupo-estavel',description:'Teste rede '+n+'/3',cents:300,due_date:'2026-12-26'}));
 await assert.rejects(repo.addCharges(entries),/response lost after commit/);
 assert.equal(rows.length,3,'Servidor ja tinha persistido todas as parcelas');
 const recovered=await repo.addCharges(entries);
 assert.equal(recovered.length,3);
 assert.equal(rows.length,3,'Reenvio nao duplica');
 assert.equal(rows.reduce((s,r)=>s+r.cents,0),900);
 await repo.addCharges(entries);
 assert.equal(rows.length,3,'Novo reenvio permanece idempotente');
 assert.equal(attempts,3);
});

test('Gravacao parcial e falha de resposta: reenvio completa as faltantes',async()=>{
 const rows=[];let attempts=0;
 const api={
  auth:{getUser:async()=>({data:{user:{id:'conta-teste'}},error:null})},
  from:()=>({
   upsert(entries){return {then(resolve){
    attempts++;
    const received=attempts===1?entries.slice(0,1):entries;
    for(const e of received)if(!rows.some(x=>x.group_id===e.group_id&&x.description===e.description))rows.push({...e});
    resolve(attempts===1?{data:null,error:{message:'connection reset'}}:{data:null,error:null});
   }}},
   select(){const f={};return {eq(k,v){f[k]=v;return this},then(resolve){resolve({data:rows.filter(x=>x.owner_id===f.owner_id&&x.group_id===f.group_id),error:null})}}}
  })
 };
 const repo=createRecebiRepository(api);
 const entries=[1,2,3].map(n=>({client_id:'cliente-ficticio',group_id:'grupo-parcial',description:'Parcela '+n+'/3',cents:300,due_date:'2026-12-26'}));
 await assert.rejects(repo.addCharges(entries),/connection reset/);
 assert.equal(rows.length,1);
 const recovered=await repo.addCharges(entries);
 assert.equal(recovered.length,3);
 assert.equal(rows.length,3);
 assert.equal(rows.reduce((s,r)=>s+r.cents,0),900);
});
