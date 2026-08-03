const fs = require('fs');
const txt = fs.readFileSync('g:/Refrimaqconnect/src/components/FinancePage.tsx', 'utf8');
const idx = txt.indexOf('select(\'id,name\')');
console.log(txt.substring(idx - 200, idx + 500));
