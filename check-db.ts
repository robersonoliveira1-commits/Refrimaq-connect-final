import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
async function run() {
  const p = await supabase.from('products').select('active').limit(1);
  console.log("Products active:", p.error ? p.error.message : "Exists");
  const s = await supabase.from('services').select('active').limit(1);
  console.log("Services active:", s.error ? s.error.message : "Exists");
  
  // Test deletion error?
  // Let's insert a dummy service and try to delete it?
}
run()
