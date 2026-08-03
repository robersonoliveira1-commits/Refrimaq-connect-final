import fs from 'fs';
const path = 'src/components/PartsServicesPage.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "const [editItem, setEditItem] = useState<Partial<Service> | null>(null);\n  const [saving, setSaving] = useState(false);\n  const [deleting, setDeleting] = useState<string | null>(null);",
  "const [editItem, setEditItem] = useState<Partial<Service> | null>(null);\n  const [saving, setSaving] = useState(false);\n  const [deleting, setDeleting] = useState<string | null>(null);\n  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);"
);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched PartsServicesPage.tsx 2');
