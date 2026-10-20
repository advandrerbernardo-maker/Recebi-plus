import { test, expect } from '@playwright/test';
const app = 'http://127.0.0.1:8765/recebiplus-prototipo.html';
test.beforeEach(async ({ page }) => { await page.goto(app); });
test('seletor oferece de 1 a 20 parcelas', async ({ page }) => { await expect(page.locator('#count option')).toHaveCount(20); });
test('datas permanecem após aumentar parcelas', async ({ page }) => { await page.locator('#count').selectOption('3'); await page.locator('#due-2').fill('2027-01-02'); await page.locator('#count').selectOption('4'); await expect(page.locator('#due-2')).toHaveValue('2027-01-02'); });
test('cadastro de cliente', async ({ page }) => { await page.locator('#customerName').fill('Cliente Exemplo'); await page.locator('#customerPhone').fill('92999999999'); await page.locator('#customerForm button').click(); await expect(page.locator('#customerSelect option')).toHaveCount(2); });

async function addClient(page){await page.locator('#customerName').fill('Cliente Teste');await page.locator('#customerPhone').fill('92999999999');await page.locator('#customerForm button').click();}
async function addCharge(page,{amount='100.01',count='1'}={}){await addClient(page);await page.locator('#desc').fill('Serviço de teste');await page.locator('#amount').fill(amount);await page.locator('#due').fill('2027-01-01');await page.locator('#count').selectOption(count);for(let i=2;i<=Number(count);i++)await page.locator('#due-'+i).fill('2027-01-'+String(i).padStart(2,'0'));await page.locator('#form button').click();}
test('20 parcelas preservam o total em centavos e sobrevivem à atualização',async({page})=>{await addCharge(page,{count:'20'});await expect(page.locator('#items .entry')).toHaveCount(20);const values=await page.evaluate(()=>JSON.parse(localStorage.getItem('recebiplus-prototipo-v1')));expect(values.reduce((a,x)=>a+x.cents,0)).toBe(10001);expect(values.every(x=>x.cents>0)).toBeTruthy();await page.reload();await expect(page.locator('#items .entry')).toHaveCount(20);});
test('pagamento pode ser confirmado e desfeito',async({page})=>{await addCharge(page);page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Marcar pago'}).click();await expect(page.getByRole('button',{name:'Desfazer pagamento'})).toBeVisible();await page.getByRole('button',{name:'Desfazer pagamento'}).click();const rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('recebiplus-prototipo-v1')));expect(rows[0].paid).toBe(false);});
test('exclusão confirmada persiste após recarregar',async({page})=>{await addCharge(page);page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir'}).click();await expect(page.locator('#items .entry')).toHaveCount(0);await page.reload();await expect(page.locator('#items .entry')).toHaveCount(0);});
test('não permite parcelas com valor zero',async({page})=>{await addClient(page);await page.locator('#desc').fill('Teste');await page.locator('#amount').fill('0.01');await page.locator('#due').fill('2027-01-01');await page.locator('#count').selectOption('2');await page.locator('#due-2').fill('2027-01-02');page.on('dialog',d=>d.accept());await page.locator('#form button').click();await expect(page.locator('#items .entry')).toHaveCount(0);});

test('cliente duplicado é rejeitado',async({page})=>{await addClient(page);page.on('dialog',d=>d.accept());await page.locator('#customerName').fill('Outro cliente');await page.locator('#customerPhone').fill('92999999999');await page.locator('#customerForm button').click();await expect(page.locator('#customerSelect option')).toHaveCount(2);});
test('alterar vencimento persiste',async({page})=>{await addCharge(page);page.on('dialog',d=>d.accept('2027-02-15'));await page.getByRole('button',{name:'Alterar vencimento'}).click();await expect(page.locator('#items')).toContainText('15/02/2027');await page.reload();await expect(page.locator('#items')).toContainText('15/02/2027');});
test('histórico financeiro do cliente abre sem erros',async({page})=>{await addCharge(page);let message='';page.on('dialog',d=>{message=d.message();d.accept()});await page.getByRole('button',{name:'Histórico'}).click();expect(message).toContain('Histórico de Cliente Teste');expect(message).toContain('100,01');});

test('registra criacao de cliente em auditoria local',async({page})=>{await addClient(page);const entries=await page.evaluate(()=>JSON.parse(localStorage.getItem('recebiplus-auditoria-v1')||'[]'));expect(entries.some(x=>x.action==='cliente_criado')).toBeTruthy();});
test('registra criacao de cobranca em auditoria local',async({page})=>{await addCharge(page);const entries=await page.evaluate(()=>JSON.parse(localStorage.getItem('recebiplus-auditoria-v1')||'[]'));expect(entries.some(x=>x.action==='cobranca_criada')).toBeTruthy();});

test('Nuvem: autenticação permanece obrigatória na interface',async({page})=>{
 await page.goto('http://127.0.0.1:8765/recebiplus-nuvem.html');
 await expect(page.locator('#auth')).toBeVisible();
 await expect(page.locator('#app')).toBeHidden();
});
test('Nuvem: edição de pagamentos e vencimentos exige versão',async()=>{
 const fs=await import('node:fs');
 const html=fs.readFileSync('../recebiplus-nuvem.html','utf8');
 const adapter=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 expect(html).toContain('repo.setPaid(c.id,!c.paid,c.version)');
 expect(html).toContain('repo.changeDue(c.id,d,c.version)');
 expect(adapter.split(".eq('version',version)").length-1).toBe(2);
});
test('Nuvem: chave privilegiada não está exposta',async()=>{
 const fs=await import('node:fs');
 for(const file of ['../recebiplus-nuvem.html','../recebiplus-supabase/repository.js']){
 const src=fs.readFileSync(file,'utf8');
 expect(src).not.toMatch(/service_role|sb_secret_/i);
 }
});
test('Nuvem: parcelas são gravadas em lote',async()=>{
 const fs=await import('node:fs');
 const adapter=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 expect(adapter).toContain('.insert(entries.map');
});

test('Nuvem: concorrencia recusa versao desatualizada no repositorio',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 const calls=[];
 const db={version:3,paid:false,due_date:'2027-01-10'};
 const supabase={
  auth:{getUser:async()=>({data:{user:{id:'user-a'}},error:null})},
  from:table=>{
   expect(table).toBe('recebiplus_charges');
   const filters={};let patch;
   const builder={
    update(data){patch=data;return builder},
    eq(key,val){filters[key]=val;return builder},
    select(){return Promise.resolve({data:filters.version===db.version?[{...db,...patch,version:db.version+1}]:[],error:null})}
   };
   calls.push(filters);
   return builder;
  }
 };
 const repo=createRecebiRepository(supabase);
 await expect(repo.setPaid('charge-a',true,2)).rejects.toThrow(/outro dispositivo/);
 const result=await repo.setPaid('charge-a',true,3);
 expect(result.paid).toBe(true);
 expect(calls[0].version).toBe(2);
 expect(calls[1].version).toBe(3);
});
test('Nuvem: usuario sem sessao nao grava pagamentos',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 let accessed=false;
 const repo=createRecebiRepository({
  auth:{getUser:async()=>({data:{user:null},error:null})},
  from:()=>{accessed=true;throw Error('Acesso indevido')}
 });
 await expect(repo.setPaid('charge-a',true,1)).rejects.toThrow(/Entre na sua conta/);
 expect(accessed).toBe(false);
});

test('Nuvem: cada conta registra cliente com seu proprio identificador',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 const recorded=[];
 function fake(id){
  return {
   auth:{getUser:async()=>({data:{user:{id}},error:null})},
   from:table=>{
    expect(table).toBe('recebiplus_clients');
    return {insert:row=>{recorded.push(row);return {select:()=>({single:async()=>({data:row,error:null})})}}};
   }
  };
 }
 const a=createRecebiRepository(fake('conta-a'));
 const b=createRecebiRepository(fake('conta-b'));
 await a.addClient('Cliente A','92988887777');
 await b.addClient('Cliente B','92999996666');
 expect(recorded.map(x=>x.owner_id)).toEqual(['conta-a','conta-b']);
});
test('Nuvem: owner_id de parcela enviada nao substitui a conta autenticada',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 let inserted;
 const repo=createRecebiRepository({
  auth:{getUser:async()=>({data:{user:{id:'conta-a'}},error:null})},
  from:()=>({insert:rows=>{inserted=rows;return {select:async()=>({data:rows,error:null})}}})
 });
 await repo.addCharges([{client_id:'c',group_id:'g',description:'Teste',cents:500,due_date:'2027-01-10',owner_id:'conta-b'}]);
 expect(inserted[0].owner_id).toBe('conta-a');
});

test('Nuvem: erro de rede nao e tratado como pagamento realizado',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 const repo=createRecebiRepository({
  auth:{getUser:async()=>({data:{user:{id:'conta-a'}},error:null})},
  from:()=>({update:()=>({eq(){return this},select:async()=>({data:null,error:{message:'Conexao indisponivel'}})})})
 });
 await expect(repo.setPaid('cobranca',true,1)).rejects.toThrow('Conexao indisponivel');
});
test('Nuvem: conflito de vencimento exige atualizar antes de tentar novamente',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 const repo=createRecebiRepository({
  auth:{getUser:async()=>({data:{user:{id:'conta-a'}},error:null})},
  from:()=>({update:()=>({eq(){return this},select:async()=>({data:[],error:null})})})
 });
 await expect(repo.changeDue('cobranca','2027-04-12',1)).rejects.toThrow(/outro dispositivo/);
});
test('Nuvem: sem autenticacao nao e possivel consultar clientes',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 let reached=false;
 const repo=createRecebiRepository({
  auth:{getUser:async()=>({data:{user:null},error:null})},
  from:()=>{reached=true;throw Error('Consulta nao autorizada')}
 });
 await expect(repo.clients()).rejects.toThrow(/Entre na sua conta/);
 expect(reached).toBe(false);
});
test('Nuvem: parcelamento com mais de 20 registros e recusado',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
 const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
 let reached=false;
 const repo=createRecebiRepository({
  auth:{getUser:async()=>({data:{user:{id:'conta-a'}},error:null})},
  from:()=>{reached=true;throw Error('Nao deveria gravar')}
 });
 await expect(repo.addCharges(Array.from({length:21},()=>({})))).rejects.toThrow(/Quantidade de parcelas/);
 expect(reached).toBe(false);
});

for(let n=1;n<=20;n++){
 test('Matriz 100: seletor de parcelas '+n,async({page})=>{
  const option=page.locator('#count option').nth(n-1);
  expect(await option.getAttribute('value')).toBe(String(n));
 });
}
for(let n=1;n<=20;n++){
 test('Matriz 100: campos de vencimento para '+n+' parcelas',async({page})=>{
  await page.locator('#count').selectOption(String(n));
  await expect(page.locator('#installmentDates input[type="date"]')).toHaveCount(n-1);
 });
}
const blockedOperations=['clients','charges','addClient','addCharges','setPaid','changeDue'];
const blockedSessions=[
 {label:'usuario nulo',user:null,error:null},
 {label:'usuario indefinido',user:undefined,error:null},
 {label:'usuario falso',user:false,error:null},
 {label:'usuario zero',user:0,error:null},
 {label:'usuario vazio',user:'',error:null},
 {label:'erro de autenticacao',user:null,error:{message:'Sessao expirada'}}
];
for(const operation of blockedOperations){
 for(const scenario of blockedSessions){
  test('Matriz 100: '+operation+' bloqueia '+scenario.label,async()=>{
   const fs=await import('node:fs');
   const source=fs.readFileSync('../recebiplus-supabase/repository.js','utf8');
   const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
   let accessed=false;
   const repo=createRecebiRepository({
    auth:{getUser:async()=>({data:{user:scenario.user},error:scenario.error})},
    from:()=>{accessed=true;throw Error('Acesso indevido')}
   });
   const args={
    clients:[],charges:[],addClient:['Teste','92999999999'],
    addCharges:[[{client_id:'a',cents:100}]],
    setPaid:['c',true,1],changeDue:['c','2027-01-01',1]
   }[operation];
   await expect(repo[operation](...args)).rejects.toThrow(/Entre na sua conta/);
   expect(accessed).toBe(false);
  });
 }
}

test('Nuvem: conflito de versao tenta atualizar dados automaticamente',async()=>{
 const fs=await import('node:fs');
 const html=fs.readFileSync('../recebiplus-nuvem.html','utf8');
 expect(html).toContain("if(e.message.includes('alterada em outro dispositivo'))");
 expect(html).toContain('try{await refresh()}catch(refreshError)');
 expect(html).toContain('msg(error)');
});
test('Nuvem: vencimento pago nao apresenta opcao de alteracao',async()=>{
 const fs=await import('node:fs');
 const html=fs.readFileSync('../recebiplus-nuvem.html','utf8');
 expect(html).toContain('if(!c.paid)actions.append(due)');
});
