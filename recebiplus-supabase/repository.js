// Recebi+ — adaptador remoto; nao armazena clientes ou cobrancas no localStorage.
// Necessita Supabase JS e sessao autenticada antes de operar.
export function createRecebiRepository(supabase) {
  async function userId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Entre na sua conta para continuar.');
    return data.user.id;
  }
  async function query(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async clients() { await userId(); const owner_id=await userId(); return query(supabase.from('recebiplus_clients').select('*').eq('owner_id',owner_id).order('name')); },
    async charges() { await userId(); const owner_id=await userId(); return query(supabase.from('recebiplus_charges').select('*').eq('owner_id',owner_id).order('due_date')); },
    async addClient(name,phone) {
      const owner_id=await userId();
      return query(supabase.from('recebiplus_clients').insert({owner_id,name,phone}).select().single());
    },
    async addCharge({client_id,group_id,description,cents,due_date}) {
      const owner_id=await userId();
      return query(supabase.from('recebiplus_charges').insert({owner_id,client_id,group_id,description,cents,due_date}).select().single());
    },
    async addCharges(entries) {
      const owner_id=await userId();
      if(!Array.isArray(entries)||entries.length<1||entries.length>20) throw new Error('Quantidade de parcelas inválida');
      const group_id=entries[0].group_id;
      if(!group_id||entries.some(e=>e.group_id!==group_id)||new Set(entries.map(e=>e.description)).size!==entries.length) throw new Error('Grupo de cobrança inválido');
      await query(supabase.from('recebiplus_charges').upsert(entries.map(e=>({...e,owner_id})),{onConflict:'owner_id,group_id,description',ignoreDuplicates:true}));
      const saved=await query(supabase.from('recebiplus_charges').select('*').eq('owner_id',owner_id).eq('group_id',group_id));
      if(saved.length!==entries.length||entries.some(e=>!saved.some(row=>row.description===e.description&&Number(row.cents)===Number(e.cents)&&row.due_date===e.due_date&&row.client_id===e.client_id))) throw new Error('Cobrança não confirmada. Atualize antes de tentar novamente.');
      return saved;
    },
    async setPaid(id,paid,version) {
      const owner_id=await userId();
      const data=await query(supabase.from('recebiplus_charges').update({paid}).eq('owner_id',owner_id).eq('id',id).eq('version',version).select());
      if(data.length!==1) throw new Error('Cobrança alterada em outro dispositivo. Atualize os dados antes de tentar novamente.');
      return data[0];
    },
    async changeDue(id,due_date,version) {
      const owner_id=await userId();
      const data=await query(supabase.from('recebiplus_charges').update({due_date}).eq('owner_id',owner_id).eq('id',id).eq('version',version).select());
      if(data.length!==1) throw new Error('Cobrança alterada em outro dispositivo. Atualize os dados antes de tentar novamente.');
      return data[0];
    },
    async audit() { const owner_id=await userId(); return query(supabase.from('recebiplus_audit').select('*').eq('owner_id',owner_id).order('at',{ascending:false}).limit(100)); }
  };
}
