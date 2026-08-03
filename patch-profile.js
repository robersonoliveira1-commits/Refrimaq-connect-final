import fs from 'fs';
const path = 'src/components/CustomerProfile.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "const [error, setError] = useState('');",
  "const [error, setError] = useState('');\n  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);"
);

content = content.replace(
  "async function handleDeleteHistory(id: string) {\n    if (!confirm('Excluir este registro de contato?')) return;\n    const { error } = await supabase.from('contacts').delete().eq('id', id);",
  "async function handleDeleteHistory(id: string) {\n    const { error } = await supabase.from('contacts').delete().eq('id', id);"
);

content = content.replace(
  `<button onClick={() => handleDeleteHistory(h.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Excluir">`,
  `<button onClick={() => setDeleteConfirm(h.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Excluir">`
);

content = content.replace(
  "    </div>\n  );\n}",
  `      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-500 text-center mb-4">Excluir este registro de contato? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { handleDeleteHistory(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Sim, excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched CustomerProfile.tsx');
