// jsdom cannot execute <script type="module">. The single-file bundle has no
// top-level import/export, so re-tagging it as a classic script lets us verify
// the real production bundle actually mounts and renders.
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';

const file = process.argv[2];
let html = fs.readFileSync(file, 'utf8');
const before = html.length;
html = html.replace('<script type="module" crossorigin>', '<script>');
// The bundle is fully inlined (inlineDynamicImports), so every import.meta.url
// is an unused argument to an already-resolved lazy chunk. Shim it so the code
// parses as a classic script under jsdom.
html = html.replace(/import\.meta\.url/g, 'location.href');
html = html.replace(/import\.meta/g, '({url:location.href,env:{}})');
console.log(`retagged module -> classic script (${before} -> ${html.length} bytes)\n`);

async function run(label, url, blockStorage) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const m = String(e.message || e);
    if (!m.includes('Could not parse CSS stylesheet')) errors.push('jsdomError: ' + m);
  });
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url,
  });
  const { window } = dom;
  if (blockStorage) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new window.DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  }
  window.matchMedia =
    window.matchMedia ||
    ((q) => ({
      matches: false,
      media: q,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }));

  await new Promise((r) => setTimeout(r, 3000));
  const d = window.document;
  const root = d.getElementById('root');
  const text = (root?.textContent || '').replace(/\s+/g, ' ').trim();
  const q = (s) => d.querySelectorAll(s).length;
  const booted = !d.getElementById('boot');

  console.log(`─── ${label} ───`);
  console.log(`  boot skeleton cleared : ${booted ? 'YES' : 'NO'}`);
  console.log(`  theme                 : ${d.documentElement.dataset.theme}`);
  console.log(`  sidebar nav links     : ${q('nav a')}`);
  console.log(`  labelled form controls: ${q('label')}`);
  console.log(`  aria-* attributes     : ${q('[aria-label],[aria-current],[aria-expanded]')}`);
  console.log(`  icon buttons w/ name  : ${q('button[aria-label]')}`);
  console.log(
    `  focus:outline-none    : ${html.includes('focus:outline-none') ? 'PRESENT' : 'none'}`,
  );
  console.log(`  rendered text (${String(text.length).padStart(4)})  : "${text.slice(0, 130)}…"`);
  console.log(`  runtime errors        : ${errors.length}`);
  errors.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 180)));
  const ok = booted && text.length > 200 && q('nav a') >= 6 && errors.length === 0;
  console.log(`  RESULT: ${ok ? 'PASS' : 'FAIL'}\n`);
  window.close();
  return ok;
}

const a = await run(
  'normal browser (localStorage works)',
  'https://arun-v-p.github.io/StudyDesk/',
  false,
);
const b = await run(
  'sandboxed preview pane (localStorage THROWS)',
  'https://arun-v-p.github.io/StudyDesk/',
  true,
);
const c = await run(
  'double-clicked from disk (file://)',
  'file:///tmp/preview-dist/index.html',
  true,
);
const e = await run('embedded via srcdoc (sandboxed iframe)', 'about:srcdoc', true);
const f = await run('blob: URL', 'blob:https://example.com/abc', true);

console.log(a && b && c && e && f ? 'PREVIEW VERIFIED in all three contexts' : 'FAILURES above');
process.exit(a && b && c && e && f ? 0 : 1);
