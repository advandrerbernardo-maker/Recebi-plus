// Recebi+ | moeda brasileira em centavos inteiros para evitar perda por ponto flutuante.
// Formatação viva: 123456 => "R$ 1.234,56"; entrada vazia continua vazia.
export const MAX_TOTAL_CENTS = 200000000000; // limite máximo de um plano (20 parcelas)
export const MAX_CHARGE_CENTS = 10000000000; // limite individual do banco

export function currencyDigits(raw){
 return String(raw ?? '').replace(/[^0-9]/g,'').replace(/^0+(?=[0-9])/,'');
}

export function parseCurrencyCents(raw){
 const digits=currencyDigits(raw);
 if(!digits||digits.length>12)return null;
 const cents=Number(digits);
 return Number.isSafeInteger(cents)&&cents>=1&&cents<=MAX_TOTAL_CENTS?cents:null;
}

export function formatCurrencyInput(raw){
 const digits=currencyDigits(raw);
 if(!digits)return '';
 const full=digits.padStart(3,'0');
 const whole=full.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 return 'R$ '+whole+','+full.slice(-2);
}

export function previewInstallments(newTotalCents,group){
 if(!Array.isArray(group)||group.length===0||!Number.isSafeInteger(newTotalCents))return null;
 const paid=group.filter(c=>c.paid).reduce((n,c)=>n+Number(c.cents),0);
 const pend=group.filter(c=>!c.paid);
 const remaining=newTotalCents-paid;
 if(!pend.length||remaining<pend.length||remaining>pend.length*MAX_CHARGE_CENTS)return null;
 const base=Math.floor(remaining/pend.length);
 const last=base+(remaining%pend.length);
 if(base<1||last>MAX_CHARGE_CENTS)return null;
 return {paidCents:paid,pendingCount:pend.length,baseCents:base,lastCents:last,
         totalCents:newTotalCents,remainingCents:remaining,
         changedCents:newTotalCents-group.reduce((n,c)=>n+Number(c.cents),0)};
}

export function attachMoneyMask(input){
 if(!input)return;
 input.addEventListener('input',()=>{
  const original=input.value;
  const selection=typeof input.selectionStart==='number'?input.selectionStart:original.length;
  const digitsToCaret=original.slice(0,selection).replace(/[^0-9]/g,'').length;
  const result=formatCurrencyInput(original);
  input.value=result;
  if(typeof input.setSelectionRange==='function'&&document.activeElement===input){
   let count=0,pos=0;
   while(pos<result.length&&count<digitsToCaret){
    if(/[0-9]/.test(result[pos]))count++;
    pos++;
   }
   if(selection===original.length)pos=result.length;
   input.setSelectionRange(pos,pos);
  }
 });
}
