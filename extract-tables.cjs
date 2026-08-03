const fs = require('fs');
const path = require('path');
let tables = new Set();
function walk(dir) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const c = fs.readFileSync(file, 'utf8');
      const m = c.match(/supabase\.from\(['"](\w+)['"]\)/g);
      if (m) m.forEach(x => {
        const t = x.match(/['"](\w+)['"]/)[1];
        tables.add(t);
      });
    }
  });
}
walk('g:/Refrimaqconnect/src');
console.log(Array.from(tables).sort().join('\n'));
