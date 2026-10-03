import {build} from 'vite';
import {readdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Use an isolated output so test configuration can never be deployed as dist.
delete process.env.VITE_FIREBASE_CONFIG;
let rejected=false;
try {await build({mode:'build-check',build:{outDir:'artifacts/build-rejected'},logLevel:'silent'});}catch {rejected=true;}
assert(rejected,'Build must reject missing Firebase settings');
process.env.VITE_FIREBASE_CONFIG=JSON.stringify({apiKey:'build-check-not-a-real-key',authDomain:'demo-mato.firebaseapp.com',projectId:'demo-mato',appId:'build-check-not-a-real-app'});
await build({mode:'build-check',build:{outDir:'artifacts/build-check'},logLevel:'warn'});
const files=await readdir('artifacts/build-check',{recursive:true});
assert(files.includes('index.html'));
assert(!files.some(name=>/local-feed|sources\.json|service-account|\.env/.test(name)));
for(const file of files.filter(name=>name.endsWith('.js'))){
  const content=await readFile(`artifacts/build-check/${file}`,'utf8');
  assert(!content.includes('/data/local-feed.json'),'Preview fetch must be removed from production');
}
console.log('Build passed: missing configuration rejected; preview data and code excluded.');
