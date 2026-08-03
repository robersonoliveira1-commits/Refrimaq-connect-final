import { createClient } from '@supabase/supabase-js'
const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
  const { data: fk } = await adminClient.from('service_order_parts').select('product_id').not('product_id', 'is', null).limit(1);
  if (fk && fk.length > 0) {
    const id = fk[0].product_id;
    console.log("Found product with FK:", id);
    const { error } = await adminClient.from('products').delete().eq('id', id);
    console.log("Delete error:", error);
    const { error: updErr } = await adminClient.from('products').update({ active: false }).eq('id', id);
    console.log("Update error:", updErr);
  }
}
run()
