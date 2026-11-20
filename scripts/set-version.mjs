// Run by `npm version` (the "version" script in package.json): copies the new version into src/version.js.
import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const file = 'src/version.js';
fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/'[^']*';/, `'${version}';`));
