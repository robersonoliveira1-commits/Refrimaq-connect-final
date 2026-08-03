import fs from 'fs';
let content = fs.readFileSync('src/components/CustomerList.tsx', 'utf8');
content = content.replace(/const ids = \[\.\.\.selected\];[\s\n]*const ids = \[\.\.\.selected\];/, "const ids = [...selected];");
fs.writeFileSync('src/components/CustomerList.tsx', content, 'utf8');
