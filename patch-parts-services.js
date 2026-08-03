import fs from 'fs';
const path = './src/components/PartsServicesPage.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  `    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      await supabase.from('products').update({ active: false }).eq('id', id);
    }`,
  `    const { error } = await supabase.from('products').update({ active: false }).eq('id', id);
    if (error) alert('Erro ao excluir peça: ' + error.message);`
);

content = content.replace(
  `    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) {
      await supabase.from('services').update({ active: false }).eq('id', id);
    }`,
  `    const { error } = await supabase.from('services').update({ active: false }).eq('id', id);
    if (error) alert('Erro ao excluir serviço: ' + error.message);`
);

fs.writeFileSync(path, content, 'utf8');
console.log("Patched PartsServicesPage");
