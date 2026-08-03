import fs from 'fs';
const path = 'src/components/PartsServicesPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add state to AuditoriaTab
content = content.replace(
  "const [error, setError] = useState('');",
  "const [error, setError] = useState('');\n  const [closeConfirm, setCloseConfirm] = useState<{ apply: boolean } | null>(null);"
);

// Update closeAudit
content = content.replace(
  "async function closeAudit(applyAdjustments: boolean) {\n    if (!confirm(applyAdjustments ? 'Fechar auditoria e ajustar o estoque do sistema com as contagens? Esta ação não pode ser desfeita.' : 'Fechar auditoria sem ajustar estoque?')) return;",
  "async function closeAudit(applyAdjustments: boolean) {"
);

// Update buttons in AuditoriaTab
content = content.replace(
  "onClick={() => closeAudit(false)}",
  "onClick={() => setCloseConfirm({ apply: false })}"
);
content = content.replace(
  "onClick={() => closeAudit(true)}",
  "onClick={() => setCloseConfirm({ apply: true })}"
);

// Add modal UI before last div in AuditoriaTab
// We have to find the end of AuditoriaTab. 
// AuditoriaTab ends just before `function RelatoriosTab`
const parts = content.split("function RelatoriosTab");
if (parts.length > 1) {
  let p1 = parts[0];
  p1 = p1.replace(/<\div>\n\s*$/g, `      {closeConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Fechar Auditoria</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              {closeConfirm.apply 
                ? 'Fechar auditoria e ajustar o estoque do sistema com as contagens? Esta ação não pode ser desfeita.' 
                : 'Fechar auditoria sem ajustar estoque?'}
            </p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setCloseConfirm(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { closeAudit(closeConfirm.apply); setCloseConfirm(null); }} className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Sim, fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  `);
  content = p1 + "function RelatoriosTab" + parts[1];
}

fs.writeFileSync(path, content, 'utf8');
console.log('Patched AuditoriaTab');
