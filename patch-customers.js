import fs from 'fs';
const path = 'src/components/CustomerList.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add state for delete dialog
content = content.replace(
  "const [error, setError] = useState('');",
  "const [error, setError] = useState('');\n  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'multiple', id?: string, name?: string } | null>(null);"
);

// Update deleteSelected
content = content.replace(
  "async function deleteSelected() {\n    const count = selected.size;\n    if (!confirm(`Excluir ${count} cliente(s)? Esta ação não pode ser desfeita.`)) return;",
  "async function deleteSelected() {\n    const count = selected.size;\n    const ids = [...selected];"
);

// Update deleteOne
content = content.replace(
  "async function deleteOne(id: string, name: string) {\n    if (!confirm(`Excluir o cliente \"${name}\"? Esta ação não pode ser desfeita.`)) return;\n    const { error } = await supabase.from('customers').delete().eq('id', id);",
  "async function deleteOne(id: string, name: string) {\n    const { error } = await supabase.from('customers').delete().eq('id', id);"
);

// We need to inject the dialog into the UI, let's put it right before the main container ends.
content = content.replace(
  "    </div>\n  );\n}",
  `      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              {deleteConfirm.type === 'single' 
                ? \`Excluir o cliente "\${deleteConfirm.name}"? Esta ação não pode ser desfeita.\`
                : \`Excluir \${selected.size} cliente(s)? Esta ação não pode ser desfeita.\`
              }
            </p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { 
                if (deleteConfirm.type === 'single' && deleteConfirm.id && deleteConfirm.name) deleteOne(deleteConfirm.id, deleteConfirm.name);
                else deleteSelected();
                setDeleteConfirm(null);
              }} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Sim, excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`
);

// Replace button calls
content = content.replace(
  "onClick={deleteSelected}",
  "onClick={() => setDeleteConfirm({ type: 'multiple' })}"
);
content = content.replace(
  "onClick={(e) => { e.stopPropagation(); deleteOne(customer.id, customer.name); }}",
  "onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'single', id: customer.id, name: customer.name }); }}"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched CustomerList.tsx');
