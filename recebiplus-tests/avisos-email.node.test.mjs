import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const functionSrc=await fs.readFile(new URL('../supabase/functions/recebiplus-due-emails/index.ts',import.meta.url),'utf8');
const sql=await fs.readFile(new URL('../supabase/migrations/20261023_recebiplus_email_due_alerts.sql',import.meta.url),'utf8');
const cron=await fs.readFile(new URL('../supabase/migrations/20261023_recebiplus_email_cron.sql',import.meta.url),'utf8');
const app=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');

const helperSrc=functionSrc.slice(functionSrc.indexOf('function dateAtManaus('),functionSrc.indexOf('async function loadDueRows('));
const helpers=new Function(helperSrc+';return {dateAtManaus,addCalendarDays,escapeHTML,buildMail};')();
const runSrc=functionSrc.slice(functionSrc.indexOf('async function runDaily('),functionSrc.indexOf('Deno.serve(',functionSrc.indexOf('async function runDaily(')));

test('Os alertas são exatamente 2 dias antes e no dia, em Manaus',()=>{
 assert.equal(helpers.addCalendarDays('2026-10-23',2),'2026-10-25');
 assert.equal(helpers.addCalendarDays('2026-12-30',2),'2027-01-01');
 assert.equal(helpers.dateAtManaus(new Date('2026-10-23T03:00:00Z')),'2026-10-22');
 assert.equal(helpers.dateAtManaus(new Date('2026-10-23T15:30:00Z')),'2026-10-23');
 assert.match(cron,/0 13-22 \* \* \*/);
 assert.match(sql,/c\.due_date IN \(p_local_date,p_local_date\+2\)/);
});

test('Uma mensagem agregada por proprietário/dia, sem parcelas pagas',()=>{
 assert.match(sql,/PRIMARY KEY \(owner_id,local_date\)/);
 assert.match(sql,/c\.paid=false/);
 assert.match(functionSrc,/\.eq\("paid",false\)/);
 const letter=helpers.buildMail('2026-10-23',[
  {client_name:'Cliente A',description:'Entrada',cents:150000,due_date:'2026-10-23'},
  {client_name:'Cliente B',description:'Parcela',cents:44900,due_date:'2026-10-25'}
 ]);
 assert.match(letter.text,/Cliente A/);
 assert.match(letter.text,/Cliente B/);
 assert.match(letter.text,/R\$\s*1\.500,00/);
 assert.match(letter.text,/R\$\s*449,00/);
 assert.match(letter.subject,/2 cobrança\(s\)/);
});

test('O e-mail preserva segurança HTML para nomes de clientes',()=>{
 const letter=helpers.buildMail('2026-10-23',[
  {client_name:'<script>ola</script>',description:'<img src=x onerror=alert(1)>',cents:10000,due_date:'2026-10-23'}
 ]);
 assert.doesNotMatch(letter.html,/<script>ola<\/script>/);
 assert.match(letter.html,/&lt;script&gt;/);
 assert.match(letter.html,/&lt;img/);
});

test('Respeita o e-mail atual da conta de autenticação, não o WhatsApp do cliente',()=>{
 assert.match(functionSrc,/db\.auth\.admin\.getUserById\(owner\)/);
 assert.match(functionSrc,/user\.data\.user\.email_confirmed_at/);
 assert.match(functionSrc,/to:\[user\.data\.user\.email\]/);
 assert.doesNotMatch(functionSrc,/to:\[[^\]]*phone/);
 assert.match(functionSrc,/Idempotency-Key/);
 assert.match(sql,/owner_id=\(SELECT auth\.uid\(\)\)/);
});

test('Nenhum navegador pode invocar o processamento administrativo',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.recebiplus_claim_daily_emails\(date\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.recebiplus_finish_daily_email/);
 assert.match(cron,/REVOKE ALL ON FUNCTION public\.recebiplus_validate_cron_token\(text\)/);
 assert.match(functionSrc,/x-recebiplus-cron/);
 assert.match(functionSrc,/recebiplus_validate_cron_token/);
 assert.match(functionSrc,/if\(!authorized\)return json\(\{error:"unauthorized"\},401\)/);
 assert.match(functionSrc,/if\(!resendKey\|\|!fromEmail\)return json\(\{status:"email_service_not_configured"\},503\)/);
});

test('Interface configura os avisos para e-mail da conta e informa se o remetente falta',()=>{
 assert.match(app,/id="emailNotificationEnabled"/);
 assert.match(app,/emailNotificationRecipient/);
 assert.match(app,/user\.email\|\|'Endereço indisponível'/);
 assert.match(app,/from\('recebiplus_email_preferences'\)\.upsert/);
 assert.match(app,/2 dias antes/);
 assert.match(app,/os e-mails NÃO estão sendo enviados/);
 assert.doesNotMatch(app,/resend[_-]?api[_-]?key\s*=\s*['"]/i);
});

function buildMock({prefEnabled=true,emailConfirmed=true,rows=null,claim=true}={}){
 const calls={fetch:[],rpc:[],sentTo:null};
 const db={
  rpc:async(name,args)=>{
   calls.rpc.push({name,args});
   if(name==='recebiplus_claim_daily_emails')
    return {data:claim?[{owner_id:'uuid-1',claim_id:'claim-1'}]:[],error:null};
   return {data:true,error:null};
  },
  from(name){
   assert.equal(name,'recebiplus_email_preferences');
   return {select(){return this},eq(){return this},async maybeSingle(){
    return {data:{enabled:prefEnabled},error:null};
   }};
  },
  auth:{admin:{getUserById:async id=>{
   assert.equal(id,'uuid-1');
   return {data:{user:{email:'login@exemplo.com',email_confirmed_at:emailConfirmed?'2026-10-01T00:00:00Z':null}},error:null};
  }}}
 };
 const fetch=async(url,options)=>{
  calls.fetch.push({url,options});
  calls.sentTo=JSON.parse(options.body).to[0];
  return {ok:true,status:200,json:async()=>({id:'mensagem-123'})};
 };
 const loadDueRows=async()=>rows===null?[{client_name:'Cliente',cents:12345,description:'Mensalidade',due_date:'2026-10-23'}]:rows;
 const runner=new Function('fetch','loadDueRows','buildMail',runSrc+';return runDaily;')(fetch,loadDueRows,helpers.buildMail);
 return {run:()=>runner(db,'TEST_API_KEY','Recebi+ <aviso@example.org>','2026-10-23'),calls};
}
test('Processa resumo para o e-mail do login e finaliza a entrega',async()=>{
 const mock=buildMock(),out=await mock.run();
 assert.equal(out.sent,1);assert.equal(out.failed,0);
 assert.equal(mock.calls.sentTo,'login@exemplo.com');
 assert.equal(mock.calls.fetch.length,1);
 assert.equal(mock.calls.fetch[0].url,'https://api.resend.com/emails');
 assert.equal(mock.calls.fetch[0].options.headers['Idempotency-Key'],'recebiplus-email-uuid-1-2026-10-23');
 assert.ok(mock.calls.rpc.some(c=>c.name==='recebiplus_finish_daily_email'&&c.args.p_status==='sent'));
});
test('Sem consentimento não envia email mesmo se uma conta for selecionada',async()=>{
 const mock=buildMock({prefEnabled:false}),result=await mock.run();
 assert.equal(result.skipped,1);
 assert.equal(mock.calls.fetch.length,0);
});
test('Se e-mail de login não estiver confirmado não há envio',async()=>{
 const mock=buildMock({emailConfirmed:false}),result=await mock.run();
 assert.equal(result.failed,1);
 assert.equal(mock.calls.fetch.length,0);
});
test('Sem claim não há disparos nem duplicatas',async()=>{
 const mock=buildMock({claim:false}),result=await mock.run();
 assert.equal(result.claimed,0);
 assert.equal(mock.calls.fetch.length,0);
});
test('Após pagamento, lista vazia não gera email',async()=>{
 const mock=buildMock({rows:[]}),result=await mock.run();
 assert.equal(result.skipped,1);
 assert.equal(mock.calls.fetch.length,0);
});
