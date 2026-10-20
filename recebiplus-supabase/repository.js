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
    async clients() { await userId(); return query(supabase.from('recebiplus_clients').select('*').order('name')); },
    async charges() { await userId(); return query(supabase.from('recebiplus_charges').select('*').order('due_date')); },
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
      return query(supabase.from('recebiplus_charges').insert(entries.map(e=>({...e,owner_id}))).select());
    },
    async setPaid(id,paid,version) {
      await userId();
      const data=await query(supabase.from('recebiplus_charges').update({paid}).eq('id',id).eq('version',version).select());
      if(data.length!==1) throw new Error('Cobrança alterada em outro dispositivo. Atualize os dados antes de tentar novamente.');
      return data[0];
    },
    async changeDue(id,due_date,version) {
      await userId();
      const data=await query(supabase.from('recebiplus_charges').update({due_date}).eq('id',id).eq('version',version).select());
      if(data.length!==1) throw new Error('Cobrança alterada em outro dispositivo. Atualize os dados antes de tentar novamente.');
      return data[0];
    },
    async audit() { await userId(); return query(supabase.from('recebiplus_audit').select('*').order('at',{ascending:false}).limit(100)); }
  };
}
