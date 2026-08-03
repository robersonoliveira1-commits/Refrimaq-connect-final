const { buildSync } = require('esbuild');
buildSync({
  entryPoints: ['src/components/CustomerProfile.tsx'],
  bundle: true,
  format: 'cjs',
  outfile: 'dist_test/CustomerProfile.js',
  external: ['react', 'react-dom', 'lucide-react', '@supabase/supabase-js']
});
console.log('Build successful');
