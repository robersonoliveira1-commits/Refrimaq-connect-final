import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
  const { data: p } = await adminClient.from('products').select('id').limit(1);
  if (p && p.length > 0) {
    const id = p[0].id;
    console.log("Found product:", id);
    const { error } = await supabase.from('products').delete().eq('id', id);
    console.log("Delete error:", error);
  }
}
run()
