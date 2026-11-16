// Install MicroPython packages onto the Pico, the way mip / mpremote mip do it:
// the browser downloads the files and writes them into the Pico's lib folder.
// Follows micropython-lib's mip/__init__.py (index layout, github:/gitlab:/codeberg: names, deps).

import { writeFile, makeDirs, joinPath } from './picofs.js';

export const INDEX = 'https://micropython.org/pi/v2';

const HOSTS = {
  'codeberg:': (org, repo, branch, path) => `https://codeberg.org/api/v1/repos/${org}/${repo}/raw/${path}?ref=${branch}`,
  'github:': (org, repo, branch, path) => `https://raw.githubusercontent.com/${org}/${repo}/${branch}/${path}`,
  'gitlab:': (org, repo, branch, path) => `https://gitlab.com/${org}/${repo}/-/raw/${branch}/${path}`,
};
const URL_PREFIXES = ['http://', 'https://', ...Object.keys(HOSTS)];
const isUrl = text => URL_PREFIXES.some(p => text.startsWith(p));

// github:org/repo/path -> https://raw.githubusercontent.com/org/repo/<branch>/path (likewise gitlab:, codeberg:)
export function rewriteUrl(url, branch) {
  for (const [prefix, build] of Object.entries(HOSTS)) {
    if (!url.startsWith(prefix)) continue;
    const [org, repo, ...rest] = url.slice(prefix.length).split('/');
    return build(org, repo, branch || 'HEAD', rest.join('/'));
  }
  return url;
}

// Where a package comes from: {json: url of its package.json} or {file: url, name} for a single file
export function packageSource(spec, { mpy = 'py', version } = {}) {
  if (isUrl(spec)) {
    if (spec.endsWith('.py') || spec.endsWith('.mpy')) return { file: spec, name: spec.split('/').at(-1) };
    if (spec.endsWith('.json')) return { json: spec };
    return { json: spec.replace(/\/?$/, '/') + 'package.json' };
  }
  return { json: `${INDEX}/package/${mpy}/${spec}/${version || 'latest'}.json` };
}

// The Pico's compiled-code (.mpy) version, and the lib folder on its import path
export async function deviceInfo(link) {
  const { stdout, stderr } = await link.run(`import sys, json
def _info():
    impl = sys.implementation
    mpy = impl._mpy & 0xff if hasattr(impl, '_mpy') else 'py'
    lib = [p for p in sys.path if p.endswith('/lib') and not p.startswith('/rom')]
    print(json.dumps({'mpy': mpy, 'lib': lib[0] if lib else '/lib'}))
_info()
del _info`, { reset: false });
  if (stderr) throw new Error(stderr.trim().split('\n').at(-1));
  return JSON.parse(stdout.trim());
}

// Installs a package (a micropython-lib name, github:org/repo, a package.json URL or a .py/.mpy URL)
// and its dependencies. Returns the paths written on the Pico.
export async function installPackage(link, spec, { fetch = globalThis.fetch, index = INDEX, version, log = () => {} } = {}) {
  const { mpy, lib } = await deviceInfo(link);
  const installed = [];
  const done = new Set();

  async function download(url, what) {
    let response;
    try {
      response = await fetch(url);
    } catch (e) {
      throw new Error(`Could not reach ${new URL(url).origin}: ${e.message}. ` +
        'Check your internet connection; some sites may also refuse requests from a web page.');
    }
    if (!response.ok) throw new Error(`${what} (HTTP ${response.status})`);
    return response;
  }

  async function copy(url, target, notFound) {
    const bytes = new Uint8Array(await (await download(url, notFound)).arrayBuffer());
    const path = joinPath(lib, target);
    log(`Copying ${path}`);
    if (target.includes('/')) await makeDirs(link, path.slice(0, path.lastIndexOf('/')));
    else await makeDirs(link, lib);
    await writeFile(link, path, bytes);
    installed.push(path);
  }

  async function install(spec, version) {
    const key = `${spec}@${version || ''}`;
    if (done.has(key)) return;
    done.add(key);
    const source = packageSource(spec, { mpy, version });
    log(isUrl(spec) ? `Installing ${spec} into ${lib}` : `Installing ${spec} (${version || 'latest'}) into ${lib}`);

    if (source.file) {
      await copy(rewriteUrl(source.file, version), source.name, `File not found: ${spec}`);
      return;
    }
    const pkg = await (await download(rewriteUrl(source.json, version), `Package not found: ${spec}`)).json();
    for (const [target, hash] of pkg.hashes ?? []) {
      await copy(`${index}/file/${hash.slice(0, 2)}/${hash}`, target, `File not found: ${target}`);
    }
    const base = source.json.slice(0, source.json.lastIndexOf('/'));
    for (const [target, url] of pkg.urls ?? []) {
      const full = isUrl(url) ? url : `${base}/${url}`;
      await copy(rewriteUrl(full, version), target, `File not found: ${target}`);
    }
    for (const [dep, depVersion] of pkg.deps ?? []) await install(dep, depVersion);
  }

  await install(spec, version);
  return installed;
}
