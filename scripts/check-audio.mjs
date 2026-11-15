import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/audio/manifest.json'), 'utf8'));
const failures = [];
let count = 0;

function checkPage(file) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('id="audio-player-root"')) return;
  count++;
  const route = '/' + path.relative(dist, path.dirname(file)).split(path.sep).join('/');
  const narration = manifest[route];
  const fail = (message) => failures.push(`${route}: ${message}`);
  if (!narration) {
    fail('no recording in public/audio/manifest.json');
    return;
  }
  if (!narration.src?.startsWith('/audio/') || !narration.src.endsWith('.mp3')) {
    fail('invalid MP3 path');
    return;
  }
  for (const directory of ['public', 'dist']) {
    const audio = path.join(root, directory, narration.src);
    if (!existsSync(audio) || !statSync(audio).isFile() || statSync(audio).size === 0) fail(`MP3 missing or empty in ${directory}`);
  }
  const source = path.join(root, narration.source ?? '');
  if (!narration.source || !existsSync(source)) {
    fail('source article missing');
  } else if (createHash('sha256').update(readFileSync(source)).digest('hex') !== narration.sourceHash) {
    fail('article changed since the recording was generated');
  }
  if (!html.includes(`src="${narration.src}"`)) fail('built player does not reference the recording; rebuild the site');
  if (!(narration.duration > 0) || !narration.sections?.length ||
      narration.sections.some((section, index, sections) =>
        !section.text || !Number.isFinite(section.start) || section.start < 0 ||
        section.start >= narration.duration || (index > 0 && section.start < sections[index - 1].start))) {
    fail('invalid duration or paragraph timestamps');
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name === 'index.html') checkPage(file);
  }
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('Build the site before checking audio: npm run build');
  process.exit(1);
}
walk(dist);
if (failures.length) {
  console.error(`Audio check failed:\n${failures.map((failure) => `  ${failure}`).join('\n')}\n\nRun npm run audio:generate, then commit public/audio/ together with the articles.`);
  process.exitCode = 1;
} else {
  console.log(`Audio check passed: ${count} pages have recordings and valid paragraph timestamps.`);
}
