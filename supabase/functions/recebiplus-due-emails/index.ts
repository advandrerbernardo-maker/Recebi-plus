// Recebi+ - aviso diário de parcelas por e-mail.
// Um resumo por proprietário/dia: pendências para hoje e para daqui a 2 dias.
// Segredos SOMENTE no Supabase (nunca no navegador ou GitHub).
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const ORIGIN="https://advandrerbernardo-maker.github.io";
const cors={"access-control-allow-origin":ORIGIN,"access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"authorization,apikey,content-type,x-recebiplus-cron"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...cors}
});
function constantTimeEqual(a,b){
 if(!a||!b)return false;
 const encoder=new TextEncoder(),x=encoder.encode(a),y=encoder.encode(b);
 let different=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)different|=(x[i]||0)^(y[i]||0);
 return different===0;
}
function dateAtManaus(date=new Date()){
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Manaus",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(date);
 const part=k=>parts.find(item=>item.type===k)?.value||"";
 return part("year")+"-"+part("month")+"-"+part("day");
}
function addCalendarDays(day,number){
 const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+number);
 return d.toISOString().slice(0,10);
}
function escapeHTML(value){
 return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function reais(cents){
 return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cents)/100);
}
function humanDate(day){return day.slice(8,10)+"/"+day.slice(5,7)+"/"+day.slice(0,4)}
function buildMail(day,rows){
 const today=rows.filter(x=>x.due_date===day);
 const inTwo=rows.filter(x=>x.due_date===addCalendarDays(day,2));
 const itemText=x=>"- "+x.client_name+" | "+reais(x.cents)+" | "+x.description+" | vencimento "+humanDate(x.due_date);
 const lines=["Recebi+ - Avisos de recebimentos","",
   "Cobranças PENDENTES com vencimento hoje ("+humanDate(day)+"):"]
  .concat(today.length?today.map(itemText):["Nenhuma"])
  .concat(["","Cobranças PENDENTES que vencem daqui a 2 dias ("+humanDate(addCalendarDays(day,2))+"):" ])
  .concat(inTwo.length?inTwo.map(itemText):["Nenhuma"])
  .concat(["","Confira os valores e recebimentos no Recebi+.",
    "As informações refletem os registros manuais do aplicativo e não confirmam pagamentos bancários.",
    "Para desativar, acesse Avisos por e-mail nas configurações da sua conta."]);
 const renderRows=data=>data.length?data.map(x=>
  "<tr><td>"+escapeHTML(x.client_name)+"</td><td>"+escapeHTML(x.description)+"</td><td>"+reais(x.cents)+"</td><td>"+humanDate(x.due_date)+"</td></tr>"
 ).join(""):"<tr><td colspan='4'>Nenhuma parcela pendente</td></tr>";
 const table=(label,rows)=>"<h2 style='font-size:16px;color:#102b3c'>"+escapeHTML(label)+"</h2>"+
  "<table style='width:100%;border-collapse:collapse'><thead><tr>"+
  "<th style='text-align:left'>Cliente</th><th style='text-align:left'>Descrição</th>"+
  "<th style='text-align:left'>Valor</th><th style='text-align:left'>Vencimento</th></tr></thead><tbody>"+
  renderRows(rows)+"</tbody></table>";
 const html="<div style='font-family:Arial,sans-serif;color:#163346;max-width:680px'>"+
  "<h1 style='background:#102b3c;color:#fff;padding:18px;border-radius:12px'>recebi<span style='color:#55e4b0'>+</span></h1>"+
  "<p>Resumo automático das suas cobranças ainda <strong>PENDENTES</strong>.</p>"+
  table("Vencem hoje · "+humanDate(day),today)+
  table("Vencem em 2 dias · "+humanDate(addCalendarDays(day,2)),inTwo)+
  "<p>Confira se o pagamento foi recebido antes de alterar o status no aplicativo.</p>"+
  "<p style='color:#617481;font-size:12px'>O Recebi+ registra pagamentos manualmente, não consulta movimentações bancárias. "+
  "Para desativar estes avisos, acesse as configurações da sua conta no aplicativo.</p></div>";
 return {subject:"Recebi+ · "+rows.length+" cobrança(s) próximas do vencimento · "+humanDate(day),
  text:lines.join("\n"),html};
}
async function loadDueRows(db,ownerId,day){
 const plusTwo=addCalendarDays(day,2),all=[];
 for(let offset=0;offset<5000;offset+=500){
  const result=await db.from("recebiplus_charges")
   .select("id,owner_id,client_id,description,cents,due_date,paid")
   .eq("owner_id",ownerId).eq("paid",false)
   .in("due_date",[day,plusTwo]).order("due_date",{ascending:true})
   .order("id",{ascending:true}).range(offset,offset+499);
  if(result.error)throw new Error("charges_query_failed");
  const batch=result.data||[];all.push(...batch);
  if(batch.length<500)break;
  if(offset>=4500)throw new Error("too_many_charges_for_email");
 }
 if(!all.length)return [];
 const ids=[...new Set(all.map(x=>x.client_id))],names=new Map();
 for(let i=0;i<ids.length;i+=250){
  const result=await db.from("recebiplus_clients").select("id,name")
   .eq("owner_id",ownerId).in("id",ids.slice(i,i+250));
  if(result.error)throw new Error("clients_query_failed");
  for(const c of result.data||[])names.set(c.id,c.name);
 }
 return all.map(x=>({...x,client_name:names.get(x.client_id)||"Cliente não identificado"}));
}
async function runDaily(db,resendKey,fromEmail,day){
 const claim=await db.rpc("recebiplus_claim_daily_emails",{p_local_date:day});
 if(claim.error)throw new Error("claim_failed");
 const ids=claim.data||[];
 const totals={claimed:ids.length,sent:0,skipped:0,failed:0};
 for(const entry of ids){
  const owner=entry.owner_id,claimId=entry.claim_id;
  let status="failed",providerId=null,errorCode="processing_failed";
  try{
   // Revalidar opt-in imediatamente antes de coletar dados e enviar.
   const pref=await db.from("recebiplus_email_preferences").select("enabled")
    .eq("owner_id",owner).maybeSingle();
   if(pref.error||!pref.data?.enabled){status="skipped";errorCode=null}
   else{
    const user=await db.auth.admin.getUserById(owner);
    if(user.error||!user.data?.user?.email||!user.data.user.email_confirmed_at)
      throw new Error("recipient_unavailable");
    const rows=await loadDueRows(db,owner,day);
    if(!rows.length){status="skipped";errorCode=null}
    else{
     const letter=buildMail(day,rows);
     const reply=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
       "Authorization":"Bearer "+resendKey,
       "Content-Type":"application/json",
       "Idempotency-Key":"recebiplus-email-"+owner+"-"+day
      },
      body:JSON.stringify({from:fromEmail,to:[user.data.user.email],subject:letter.subject,
        text:letter.text,html:letter.html})
     });
     const result=await reply.json().catch(()=>({}));
     if(!reply.ok||!result.id)throw new Error("email_provider_error_"+reply.status);
     status="sent";providerId=String(result.id);errorCode=null;
    }
   }
  }catch(e){
   errorCode=String(e instanceof Error?e.message:"unknown").slice(0,100);
   console.error("Recebi+ email send error",errorCode);
  }
  const finalized=await db.rpc("recebiplus_finish_daily_email",{
   p_owner:owner,p_local_date:day,p_claim:claimId,p_status:status,
   p_message_id:providerId,p_error_code:errorCode
  });
  if(finalized.error||!finalized.data)console.error("Recebi+ email finalization error");
  if(status==="sent")totals.sent++;
  else if(status==="skipped")totals.skipped++;
  else totals.failed++;
 }
 return totals;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const resendKey=Deno.env.get("RESEND_API_KEY");
 const fromEmail=Deno.env.get("RESEND_FROM_EMAIL");
 if(req.method==="GET")return json({configured:Boolean(resendKey&&fromEmail),timezone:"America/Manaus",hour:"09:00"});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL");
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!serviceKey)return json({error:"service_unavailable"},503);
 const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const supplied=req.headers.get("x-recebiplus-cron")||"";
 // O segredo nasce e fica no Vault. Apenas o serviço com papel service_role
 // consegue verificar o token; nenhum usuário comum pode invocar essa RPC.
 const envToken=Deno.env.get("RECEBIPLUS_CRON_TOKEN");
 let authorized=false;
 if(envToken)authorized=constantTimeEqual(supplied,envToken);
 else if(supplied.length>=32&&supplied.length<=256){
  const verified=await db.rpc("recebiplus_validate_cron_token",{p_token:supplied});
  authorized=Boolean(!verified.error&&verified.data===true);
 }
 if(!authorized)return json({error:"unauthorized"},401);
 if(!resendKey||!fromEmail)return json({status:"email_service_not_configured"},503);
 try{
  const day=dateAtManaus();
  const summary=await runDaily(db,resendKey,fromEmail,day);
  return json({date:day,...summary},summary.failed?502:200);
 }catch(e){
  console.error("Recebi+ email service error",String(e instanceof Error?e.message:"unknown"));
  return json({error:"internal_error"},500);
 }
});
