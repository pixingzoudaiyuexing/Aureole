import fs from 'node:fs';
import path from 'node:path';

function verify() {
  const dist = 'dist';
  if (!fs.existsSync(dist)) throw new Error('dist/ missing');
  
  const indexHtmlPath = path.join(dist, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) throw new Error('index.html missing');
  
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  const assetsDir = path.join(dist, 'assets');
  const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  
  const hasJs = assets.some(f => f.endsWith('.js'));
  const hasCss = assets.some(f => f.endsWith('.css'));
  if (!hasJs || !hasCss) throw new Error('Missing hashed JS or CSS assets');

  const hasMap = assets.some(f => f.endsWith('.map'));
  if (hasMap) throw new Error('Unexpected .map file found in production artifact');

  const releaseJson = path.join(dist, 'release.json');
  if (!fs.existsSync(releaseJson)) throw new Error('release.json missing');
  const metadata = JSON.parse(fs.readFileSync(releaseJson, 'utf8'));
  if (!metadata.sha) throw new Error('Invalid release.json: missing SHA');

  // Check that all assets referenced in index.html actually exist
  // A crude regex for src="..." and href="..."
  const refs = [...indexHtml.matchAll(/(?:src|href)="\/([^"]+)"/g)].map(m => m[1]);
  for (const ref of refs) {
    if (ref.startsWith('assets/')) {
      const target = path.join(dist, ref);
      if (!fs.existsSync(target)) {
        throw new Error(`Referenced asset missing: ${ref}`);
      }
    }
  }

  // Check for leakage
  for (const file of assets) {
    const content = fs.readFileSync(path.join(dist, 'assets', file), 'utf8');
    if (content.includes('gateway.example.com')) {
       throw new Error(`Baked-in backend hostname found in ${file}`);
    }
    // Also ensure the V2Board explicit path (if we knew one) isn't there, 
    // but gateway.example.com covers the .env.example leakage.
  }

  console.log('Artifact verification passed.');
}

try {
  verify();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
