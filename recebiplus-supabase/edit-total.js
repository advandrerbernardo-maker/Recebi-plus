// Recebi+ | Edição do total de parcelamentos em centavos.
// Atualização integral e atômica no Supabase via RPC SECURITY INVOKER.
import {parseCurrencyCents,formatCurrencyInput,previewInstallments,attachMoneyMask} from './money.js';

export function setupValueEditor({
  $,repo,fmt,msg,action,refresh,withConnectionDeadline,confirmRecebi,requireConnection,
  getSelectedClientId,getCharges
}) {
  function allGroups(clientId){
    const groups=new Map();
    for(const c of getCharges().filter(x=>x.client_id===clientId)){
      if(!groups.has(c.group_id))groups.set(c.group_id,[]);
      groups.get(c.group_id).push(c);
    }
    return [...groups.entries()].map(([id,rows])=>{
      const items=rows.slice().sort((a,b)=>a.due_date.localeCompare(b.due_date)||
        a.description.localeCompare(b.description)||a.id.localeCompare(b.id));
      const total=items.reduce((n,c)=>n+Number(c.cents),0);
      const label=items[0].description
        .replace(/\s*·\s*parcela\s+\d+\s*\/\s*\d+\s*$/i,'').trim()||'Cobrança';
      return {id,items,total,label};
    }).sort((a,b)=>a.items[0].due_date.localeCompare(b.items[0].due_date));
  }
  function selectedGroup(){
    return allGroups(getSelectedClientId()).find(g=>g.id===$('editTotalGroup').value);
  }
  function preview(){
    const group=selectedGroup();
    const cents=parseCurrencyCents($('editTotalMoney').value);
    const data=group&&cents!==null?previewInstallments(cents,group.items):null;
    const note=$('editTotalPreview');
    note.classList.toggle('invalid',!data);
    $('saveEditTotal').disabled=!data||cents===group?.total;
    if(!group){
      note.textContent='Escolha um parcelamento para alterar.';return;
    }
    if(!data){
      const paid=group.items.filter(x=>x.paid).reduce((sum,x)=>sum+Number(x.cents),0);
      note.textContent='Valor inválido. Já foram pagos '+fmt(paid)+'. Cada parcela pendente precisa ter pelo menos R$ 0,01.';
      return;
    }
    const balances=data.pendingCount===1
      ?' A parcela pendente ficará em '+fmt(data.baseCents)+'.'
      :' '+data.pendingCount+' parcelas pendentes: '+
         (data.lastCents===data.baseCents
          ?fmt(data.baseCents)+' cada.'
          :(data.pendingCount-1)+' de '+fmt(data.baseCents)+' e a última de '+fmt(data.lastCents)+'.');
    note.textContent='Total atual: '+fmt(group.total)+' → Novo total: '+fmt(cents)+
      '. Já pago: '+fmt(data.paidCents)+' (preservado). Saldo: '+fmt(data.remainingCents)+'.'+
      balances+(data.changedCents===0?' Nenhuma mudança de valor.':'');
  }
  function fillGroup(){
    const group=selectedGroup();
    $('editTotalMoney').value=group?formatCurrencyInput(String(group.total)):'';
    preview();
  }
  function close(){
    if($('editTotalDialog').open)$('editTotalDialog').close();
  }
  function open(){
    const clientId=getSelectedClientId();
    if(!clientId)return;
    const groups=allGroups(clientId).filter(g=>g.items.some(x=>!x.paid));
    if(!groups.length){
      msg('Não há parcelas pendentes para recalcular neste cliente.');return;
    }
    const select=$('editTotalGroup');
    select.replaceChildren();
    for(const group of groups){
      const option=document.createElement('option');
      option.value=group.id;
      option.textContent=group.label+' · '+fmt(group.total)+' · '+group.items.length+
        ' parcela(s)'+(group.items.some(x=>x.paid)?
          ' ('+group.items.filter(x=>x.paid).length+' paga(s))':'');
      select.append(option);
    }
    $('editTotalGroupLabel').hidden=groups.length===1;
    select.disabled=groups.length===1;
    fillGroup();
    $('editTotalDialog').showModal();
    $('editTotalMoney').focus();
  }
  $('editClientTotal').addEventListener('click',open);
  $('cancelEditTotal').addEventListener('click',close);
  $('editTotalGroup').addEventListener('change',fillGroup);
  $('editTotalMoney').addEventListener('input',preview);
  attachMoneyMask($('editTotalMoney'));
  $('editTotalForm').addEventListener('submit',event=>{
    event.preventDefault();
    action(async()=>{
      const group=selectedGroup();
      const clientId=getSelectedClientId();
      const amount=parseCurrencyCents($('editTotalMoney').value);
      const snapshot=group?.items.slice();
      const expected=Object.fromEntries((snapshot||[]).map(c=>[c.id,Number(c.version)]));
      const estimate=group&&amount!==null?previewInstallments(amount,snapshot):null;
      if(!estimate||amount===group.total){
        $('editTotalPreview').textContent='Informe um novo valor total válido.';return;
      }
      if(!await confirmRecebi(
        'Alterar o valor TOTAL do parcelamento "'+group.label+'"?\n\n'+
        'De '+fmt(group.total)+' para '+fmt(amount)+'.\n'+
        'Já pago: '+fmt(estimate.paidCents)+' (será preservado).\n'+
        estimate.pendingCount+' parcela(s) PENDENTE(S) serão recalculadas.\n\n'+
        'Datas, pagamentos anteriores e recibos já emitidos não serão alterados.',
        {confirmLabel:'Confirmar novo valor'}
      ))return;
      if(!requireConnection())return;
      const groupId=group.id;
      $('saveEditTotal').disabled=true;
      try{
        try{
          await withConnectionDeadline(repo.recalculateGroup(clientId,groupId,amount,expected),30000);
          await withConnectionDeadline(refresh(),30000);
          close();
          msg('Novo total salvo: '+fmt(amount)+'. As parcelas pendentes foram recalculadas.');
        }catch(err){
          // Falha no retorno da rede: sincronizar antes de autorizar nova tentativa.
          try{
            await withConnectionDeadline(refresh(),30000);
            const current=allGroups(clientId).find(g=>g.id===groupId);
            const paidUnchanged=current&&snapshot.filter(c=>c.paid).every(old=>
              current.items.some(c=>c.id===old.id&&c.paid&&
                Number(c.cents)===Number(old.cents)));
            if(current?.total===amount&&paidUnchanged){
              close();msg('Novo valor confirmado após atualizar: '+fmt(amount)+'.');return;
            }
          }catch(_){}
          const detail='Não foi possível confirmar o novo total. Atualize a lista antes de tentar novamente. '+err.message;
          $('editTotalPreview').classList.add('invalid');
          $('editTotalPreview').textContent=detail;
          msg('Erro: '+detail);
        }
      }finally{
        if($('editTotalDialog').open)preview();
      }
    });
  });
  return {close,allGroups,open};
}
