import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../recebiplus-supabase/repository.js',import.meta.url),'utf8');
const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
assert.ok(html.includes('group_id=retry.group;pendingChargeGroup=group_id;const entries=datesArr.map'),'A formula de parcelamento deve permanecer reconhecivel');
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
 assert.match(html,/const retry=await retryGroup\(user\.id/);
 assert.match(html,/await repo\.addCharges\(entries\);clearRetryGroup\(user\.id,retry\.hash\);pendingChargeGroup=null/);
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

test('Sessao ausente bloqueia leitura antes de consultar banco',async()=>{
 let accessed=false;
 const api={auth:{getUser:async()=>({data:{user:null},error:null})},from(){accessed=true;throw Error('Consulta indevida')}};
 const repository=createRecebiRepository(api);
 await assert.rejects(repository.clients(),/Entre na sua conta/);
 await assert.rejects(repository.charges(),/Entre na sua conta/);
 assert.equal(accessed,false);
});
test('Falha na gravacao e reenvio com mesmo grupo nao geram duplicatas',async()=>{
 const rows=[];let calls=0;
 const api={auth:{getUser:async()=>({data:{user:{id:'conta-a'}},error:null})},from(){
 return {
 upsert(entries){return {then(done){calls++;if(calls===1){done({data:null,error:{message:'Falha de rede'}});return}for(const entry of entries){if(!rows.some(x=>x.group_id===entry.group_id&&x.description===entry.description))rows.push(entry)}done({data:null,error:null})}}},
 select(){const conditions={};return {eq(k,v){conditions[k]=v;return this},then(done){done({data:rows.filter(x=>x.owner_id===conditions.owner_id&&x.group_id===conditions.group_id),error:null})}}}
 };
 }};
 const repository=createRecebiRepository(api);
 const entry={client_id:'cliente-a',group_id:'grupo-a',description:'Lembrete A',cents:1000,due_date:'2026-11-01'};
 await assert.rejects(repository.addCharges([entry]),/Falha de rede/);
 await repository.addCharges([entry]);
 await repository.addCharges([entry]);
 assert.equal(rows.length,1);
});

test('WhatsApp manual exige toque e usa link wa.me com mensagem codificada',()=>{
 assert.match(html,/wa\.addEventListener\('click',/);
 assert.match(html,/window\.open\('https:\/\/wa\.me\/'\+phone\+'\?text='\+encodeURIComponent\(message\)/);
 assert.doesNotMatch(html,/setInterval\([^]*?window\.open\('https:\/\/wa\.me\//);
});
test('Aviso de teste e protecao contra uso prematuro continuam presentes',()=>{
 assert.match(html,/Versão de testes/);
 assert.match(html,/Não use dados reais até concluirmos os testes de isolamento e segurança/);
});

test('Reenvio apos reinicio reutiliza identificador por conta e assinatura',()=>{
 assert.match(html,/const retryKey='recebiplus:pending-reminder:v1'/);
 assert.match(html,/crypto\.subtle\.digest\('SHA-256',bytes\)/);
 assert.match(html,/saved\?\.owner===owner&&saved\?\.hash===hash/);
 assert.match(html,/localStorage\.setItem\(retryKey,JSON\.stringify\(\{owner,hash,group,createdAt:Date\.now\(\)\}\)\)/);
 assert.match(html,/clearRetryGroup\(user\.id,retry\.hash\)/);
});

test('Falha offline mostra aviso visivel e nao confirma operacao',async()=>{
 const elements=Object.fromEntries(['status','retryConnection','operationAlertText','operationAlert','closeOperationAlert'].map(id=>[id,{textContent:'',hidden:true,addEventListener(){}}]));
 const $=id=>elements[id];
 const msgSource=html.match(/const msg=t=>\{[^\n]+\};\$\('closeOperationAlert'\)\.addEventListener\('click',\(\)=>\{[^\n]+\}\);/);
 assert.ok(msgSource,'Tratamento de erro e aviso visual devem existir');
 const msg=new Function('$',msgSource[0]+';return msg')($);
 msg('Erro: Failed to fetch');
 assert.equal(elements.operationAlert.hidden,false);
 assert.equal(elements.retryConnection.hidden,false);
 assert.match(elements.operationAlertText.textContent,/alteração não foi confirmada/);
 msg('Dados sincronizados com Supabase');
 assert.equal(elements.operationAlert.hidden,true);
});

test('Sem internet bloqueia alteracao antes de enviar e mostra aviso',()=>{
 assert.match(html,/function requireConnection\(\)/);
 assert.match(html,/navigator\.onLine===false/);
 assert.match(html,/if\(!requireConnection\(\)\)\{showInlineError\(actions/);
 assert.match(html,/withConnectionDeadline\(repo\.changeDue/);
 assert.match(html,/if\(!requireConnection\(\)\)\{msg\('Erro: Sem conexão/);
});
test('Reenvio pendente tem validade de 24 horas e nao armazena dados do cliente',()=>{
 assert.match(html,/Date\.now\(\)-saved\.createdAt<86400000/);
 assert.match(html,/JSON\.stringify\(\{owner,hash,group,createdAt:Date\.now\(\)\}\)/);
});

test('Alerta nativo aparece mesmo quando aviso de pagina nao esta visivel',()=>{
 const source=html.match(/function requireConnection\(\)\{[^\n]+\}/);
 assert.ok(source);
 let message='';
 const msg=()=>{};
 const check=new Function('navigator','msg','window',source[0]+';return requireConnection')({onLine:false},msg,{alert:value=>{message=value}});
 assert.equal(check(),false);
 assert.match(message,/NÃO foi salva/);
 let onlineAlert=false;
 const onlineCheck=new Function('navigator','msg','window',source[0]+';return requireConnection')({onLine:true},msg,{alert:()=>{onlineAlert=true}});
 assert.equal(onlineCheck(),true);
 assert.equal(onlineAlert,false);
});

test('Falha de rede apresenta aviso junto ao lembrete e tempo limite',()=>{
 assert.match(html,/function showInlineError\(actions,message\)/);
 assert.match(html,/note\.setAttribute\('role','alert'\)/);
 assert.match(html,/function withConnectionDeadline\(promise,ms=12000\)/);
 assert.match(html,/withConnectionDeadline\(repo\.setPaid/);
 assert.match(html,/withConnectionDeadline\(repo\.addCharges/);
 assert.match(html,/Não foi possível confirmar a alteração/);
});
