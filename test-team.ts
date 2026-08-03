import { supabase } from './src/lib/supabase';
async function run() {
  const { data, error } = await supabase.from('user_profiles').select('id, full_name, email, phone, role, active, assigned_day_index, created_at');
  console.log("Error:", error);
  console.log("Data length:", data?.length);
}
run();
