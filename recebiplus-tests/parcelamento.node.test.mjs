import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../recebiplus-supabase/repository.js',import.meta.url),'utf8');
const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
const match=html.match(/const base=Math\.floor\(total\/count\),group_id=pendingChargeGroup\|\|crypto\.randomUUID\(\);pendingChargeGroup=group_id;const entries=datesArr\.map\(\(due_date,i\)=>\(\{client_id,group_id,description:count>1\?description\+' · parcela '\+\(i\+1\)\+'\/'\+count:description,cents:base\+\(i===count-1\?total-base\*count:0\),due_date\}\)\)/);
assert.ok(match,'A formula de parcelamento do aplicativo deve continuar reconhecivel');
function installments(total,count){
 const base=Math.floor(total/count);
 return Array.from({length:count},(_,i)=>({cents:base+(i===count-1?total-base*count:0),paid:false,version:1}));
}
for(const n of [3,6,12]){
 test('Parcelamento '+n+'x preserva centavos e pagamentos independentes',async()=>{
  const total=10001,items=installments(total,n);
  assert.equal(items.length,n);
  assert.equal(items.reduce((s,c)=>s+c.cents,0),total);
  assert.ok(items.every(x=>x.cents>0));
  let calls=0;
  const supabase={
   auth:{getUser:async()=>({data:{user:{id:'owner-teste'}},error:null})},
   from:()=>({update(patch){return {eq(field,value){this[field]=value;return this},async select(){calls++;const index=Number(this.id.split('-')[1]);const row=items[index];if(row.version!==this.version)return {data:[],error:null};Object.assign(row,patch,{version:row.version+1});return {data:[{...row}],error:null}}}}})
  };
  const repo=createRecebiRepository(supabase);
  const first=await repo.setPaid('p-0',true,1);
  assert.equal(first.paid,true);
  assert.ok(items.slice(1).every(x=>!x.paid),'Outras parcelas nao podem ser marcadas como pagas');
  assert.equal(items.filter(x=>!x.paid).reduce((s,c)=>s+c.cents,0),total-first.cents);
  await repo.setPaid('p-0',false,2);
  assert.equal(items[0].paid,false);
  assert.equal(items.reduce((s,c)=>s+c.cents,0),total);
  assert.equal(calls,2);
 });
}
test('Valor de 1 centavo nao pode ser dividido em mais parcelas do que centavos',()=>{
 assert.match(html,/total<count/);
});
test('A interface cria campos individuais de vencimento e exige ordem',()=>{
 assert.match(html,/for\(let i=2;i<=Number\(\$\('count'\)\.value\);i\+\+\)/);
 assert.match(html,/d<datesArr\[i-1\]/);
});

test('Cenario realista: R$ 300 em 3x, pagamento da primeira deixa R$ 200 pendentes',async()=>{
 const total=30000;
 const items=installments(total,3);
 assert.deepEqual(items.map(x=>x.cents),[10000,10000,10000]);
 const supabase={
  auth:{getUser:async()=>({data:{user:{id:'usuario-teste'}},error:null})},
  from:()=>({update(patch){return {eq(field,value){this[field]=value;return this},async select(){const index=Number(this.id.split('-')[1]);const row=items[index];if(row.version!==this.version)return {data:[],error:null};Object.assign(row,patch,{version:row.version+1});return {data:[{...row}],error:null}}}}})
 };
 const repo=createRecebiRepository(supabase);
 const pago=await repo.setPaid('parcela-0',true,1);
 assert.equal(pago.cents,10000);
 assert.deepEqual(items.map(x=>x.paid),[true,false,false]);
 assert.equal(items.filter(x=>x.paid).reduce((s,x)=>s+x.cents,0),10000);
 assert.equal(items.filter(x=>!x.paid).reduce((s,x)=>s+x.cents,0),20000);
 const revertido=await repo.setPaid('parcela-0',false,2);
 assert.equal(revertido.paid,false);
 assert.deepEqual(items.map(x=>x.paid),[false,false,false]);
 assert.equal(items.filter(x=>!x.paid).reduce((s,x)=>s+x.cents,0),30000);
});

test('Troca de conta oculta interface antes de consultar sessao',()=>{
 assert.match(html,/customers=\[\];charges=\[\];.*\$\('app'\)\.hidden=true;const \{data:\{user\},error\}=await supabase\.auth\.getUser\(\)/);
});
test('Atualizacao de dados interrompe ao detectar troca de sessao',()=>{
 assert.match(html,/loadedClients=await repo\.clients\(\);if\(epoch!==authEpoch\)return;const loadedCharges=await repo\.charges\(\);if\(epoch!==authEpoch\)return/);
});

test('Erro de sincronizacao nao exibe interface da conta',()=>{
 assert.match(html,/try\{await refresh\(\)\}catch\(e\)\{\$\('app'\)\.hidden=true;throw e\}/);
});
test('Troca de conta limpa listas e indicadores anteriores',()=>{
 assert.match(html,/customers=\[\];charges=\[\];\$\('clients'\)\.replaceChildren\(\);\$\('charges'\)\.replaceChildren\(\);\$\('priority'\)\.replaceChildren\(\);\$\('stats'\)\.textContent=''/);
});

test('Teste reverso: reenvio de mesma cobranca nao duplica parcelas',async()=>{
 const rows=[];let insertAttempts=0;
 const supabase={
  auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  from:()=>({
   upsert(entries,opts){assert.equal(opts.ignoreDuplicates,true);assert.equal(opts.onConflict,'owner_id,group_id,description');return {then(resolve){insertAttempts++;for(const entry of entries){if(!rows.some(x=>x.owner_id===entry.owner_id&&x.group_id===entry.group_id&&x.description===entry.description))rows.push({...entry})}resolve({data:null,error:null})}}},
   select(){return {eq(field,value){this[field]=value;return this},then(resolve){resolve({data:rows.filter(x=>x.owner_id===this.owner_id&&x.group_id===this.group_id),error:null})}}}
  })
 };
 const repo=createRecebiRepository(supabase);
 const entries=[1,2,3].map(n=>({client_id:'c1',group_id:'g1',description:'Teste parcela '+n+'/3',cents:10000,due_date:'2026-11-01'}));
 await repo.addCharges(entries);
 await repo.addCharges(entries);
 assert.equal(insertAttempts,2);
 assert.equal(rows.length,3);
 assert.equal(rows.reduce((sum,r)=>sum+r.cents,0),30000);
 const changed=entries.map(x=>({...x,cents:20000}));
 await assert.rejects(()=>repo.addCharges(changed),/não confirmada/);
 assert.equal(rows.length,3);
});
test('Identificador de reenvio permanece ate confirmacao',()=>{
 assert.match(html,/pendingChargeGroup\|\|crypto\.randomUUID\(\)/);
 assert.match(html,/await repo\.addCharges\(entries\);pendingChargeGroup=null/);
});

test('Diretriz comercial: aplicativo e apenas organizador de lembretes',()=>{
 assert.match(html,/não recebe, movimenta ou confirma pagamentos/);
 assert.match(html,/status “Resolvido” é informado manualmente/);
 assert.match(html,/Marcar como resolvido/);
 assert.match(html,/Lembretes cadastrados/);
 assert.doesNotMatch(html,/Marcar pago|Desfazer pagamento/);
});

test('Lembretes vencidos e do dia sao destacados sem confundir resolvidos',()=>{
 assert.match(html,/const overdue=charges\.filter\(c=>!c\.paid&&c\.due_date<today\)/);
 assert.match(html,/const dueToday=charges\.filter\(c=>!c\.paid&&c\.due_date===today\)/);
 assert.match(html,/Retornos prioritários/);
});
test('Renovacao automatica de token nao reinicia tela',()=>{
 assert.match(html,/\['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','USER_UPDATED','PASSWORD_RECOVERY'\]\.includes\(event\)/);
});

test('WhatsApp manual e automatico sao diferenciados sem prometer envio automatico',()=>{
 assert.match(html,/Preparar WhatsApp \(envio manual\)/);
 assert.match(html,/Não há tarifa por mensagem da API do WhatsApp/);
 assert.match(html,/Ainda não disponível; dependerá de integração oficial/);
 assert.match(html,/não envia mensagens aos clientes sem uma ação sua/);
});

test('Falha de atualizacao apos gravar lembrete nao sugere repetir cadastro',()=>{
 assert.match(html,/Lembrete salvo, mas não foi possível atualizar a lista/);
 assert.match(html,/antes de cadastrar outro lembrete/);
});
test('Listagem nao solicita usuario autenticado duas vezes por consulta',()=>{
 assert.doesNotMatch(source,/async clients\(\) \{ await userId\(\); const owner_id=await userId\(\)/);
 assert.doesNotMatch(source,/async charges\(\) \{ await userId\(\); const owner_id=await userId\(\)/);
});

test('Consultas de lembretes limitadas a conta autenticada',()=>{
 assert.match(source,/async clients\(\).*?eq\('owner_id',owner_id\)/);
 assert.match(source,/async charges\(\).*?eq\('owner_id',owner_id\)/);
});
test('Atualizacoes de lembretes limitadas a conta e versao',()=>{
 assert.match(source,/update\(\{paid\}\)\.eq\('owner_id',owner_id\)\.eq\('id',id\)\.eq\('version',version\)/);
 assert.match(source,/update\(\{due_date\}\)\.eq\('owner_id',owner_id\)\.eq\('id',id\)\.eq\('version',version\)/);
});
