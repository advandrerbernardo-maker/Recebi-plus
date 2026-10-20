import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const source=await fs.readFile(new URL('../recebiplus-supabase/repository.js',import.meta.url),'utf8');
const {createRecebiRepository}=await import('data:text/javascript,'+encodeURIComponent(source));
const match=html.match(/const base=Math\.floor\(total\/count\),group_id=crypto\.randomUUID\(\);const entries=datesArr\.map\(\(due_date,i\)=>\(\{client_id,group_id,description:count>1\?description\+' · parcela '\+\(i\+1\)\+'\/'\+count:description,cents:base\+\(i===count-1\?total-base\*count:0\),due_date\}\)\)/);
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
