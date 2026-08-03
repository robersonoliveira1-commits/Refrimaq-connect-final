import fs from 'fs';
const path = 'src/components/PartsServicesPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// PecasTab: Add deleteConfirm state
content = content.replace(
  "const [deleting, setDeleting] = useState<string | null>(null);",
  "const [deleting, setDeleting] = useState<string | null>(null);\n  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);"
);

// PecasTab: Update handleDelete function
content = content.replace(
  "async function handleDelete(id: string) {\n    if (!confirm('Excluir esta peça? Esta ação não pode ser desfeita.')) return;\n    setDeleting(id);\n    const { error } = await supabase.from('products').update({ active: false }).eq('id', id);\n    if (error) alert('Erro ao excluir peça: ' + error.message);\n    setDeleting(null);\n    load();\n  }",
  "async function handleDelete(id: string) {\n    setDeleting(id);\n    const { error } = await supabase.from('products').update({ active: false }).eq('id', id);\n    if (error) console.error('Erro ao excluir peça: ' + error.message);\n    setDeleting(null);\n    setDeleteConfirm(null);\n    load();\n  }"
);

// PecasTab: Update UI
content = content.replace(
  `<div className="flex items-center justify-end gap-1">\n                          <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"><Pencil size={13} /></button>\n                          <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors">\n                            {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}\n                          </button>\n                        </div>`,
  `<div className="flex items-center justify-end gap-1">
                          {deleteConfirm === p.id ? (
                            <div className="flex items-center gap-1.5 mr-1">
                              <span className="text-xs text-red-600 font-medium">Excluir?</span>
                              <button onClick={() => handleDelete(p.id)} className="p-1 px-2 bg-red-500 text-white rounded hover:bg-red-600 text-xs font-semibold">Sim</button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-1 px-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-xs">Não</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"><Pencil size={13} /></button>
                              <button onClick={() => setDeleteConfirm(p.id)} disabled={deleting === p.id} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
                                {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </>
                          )}
                        </div>`
);


// ServicosTab: Update handleDelete function
content = content.replace(
  "async function handleDelete(id: string) {\n    if (!confirm('Excluir este serviço?')) return;\n    setDeleting(id);\n    const { error } = await supabase.from('services').update({ active: false }).eq('id', id);\n    if (error) alert('Erro ao excluir serviço: ' + error.message);\n    setDeleting(null); load();\n  }",
  "async function handleDelete(id: string) {\n    setDeleting(id);\n    const { error } = await supabase.from('services').update({ active: false }).eq('id', id);\n    if (error) console.error('Erro ao excluir serviço: ' + error.message);\n    setDeleting(null);\n    setDeleteConfirm(null);\n    load();\n  }"
);

// ServicosTab: Update UI
content = content.replace(
  `<div className="flex gap-1.5 pt-1 mt-auto border-t border-slate-100">\n                <button onClick={() => { setEditItem({ ...s }); setShowModal(true); }} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">\n                  <Pencil size={11} /> Editar\n                </button>\n                <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">\n                  {deleting === s.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}\n                  Excluir\n                </button>\n              </div>`,
  `<div className="flex gap-1.5 pt-1 mt-auto border-t border-slate-100">
                {deleteConfirm === s.id ? (
                  <div className="flex-1 flex items-center justify-between px-2 py-1 bg-red-50 rounded-lg border border-red-100">
                    <span className="text-xs text-red-600 font-semibold">Excluir?</span>
                    <div className="flex gap-1">
                      <button onClick={() => handleDelete(s.id)} className="bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded text-xs">Sim</button>
                      <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-0.5 rounded text-xs">Não</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setEditItem({ ...s }); setShowModal(true); }} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      <Pencil size={11} /> Editar
                    </button>
                    <button onClick={() => setDeleteConfirm(s.id)} disabled={deleting === s.id} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">
                      {deleting === s.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      Excluir
                    </button>
                  </>
                )}
              </div>`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched PartsServicesPage.tsx');
