import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function checkFixture(change = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'audio-check-'));
  const write = (file, content) => {
    const destination = path.join(root, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  const manifest = {
    '/blog/example': {
      src: '/audio/example.mp3',
      source: 'src/content/blog/example.md',
      sourceHash: createHash('sha256').update('Article text').digest('hex'),
      duration: 10,
      sections: [{ text: 'Article text', start: 0 }],
    },
  };
  try {
    write('dist/index.html', '<html>Home</html>');
    write('dist/blog/example/index.html', '<div id="audio-player-root"><audio src="/audio/example.mp3"></audio></div>');
    write('src/content/blog/example.md', 'Article text');
    write('public/audio/example.mp3', 'recording');
    write('dist/audio/example.mp3', 'recording');
    write('scripts/check-audio.mjs', readFileSync(new URL('./check-audio.mjs', import.meta.url)));
    change({ root, write, manifest });
    write('public/audio/manifest.json', JSON.stringify(manifest));
    return spawnSync(process.execPath, [path.join(root, 'scripts/check-audio.mjs')], { encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts a built page with an available, current recording', () => {
  const result = checkFixture();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 pages have recordings/);
});

test('rejects the original failure: a player with no recording', () => {
  const result = checkFixture(({ manifest }) => { delete manifest['/blog/example']; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no recording/);
  assert.match(result.stderr, /npm run audio:generate/);
});

test('rejects an MP3 omitted from the deployment output', () => {
  const result = checkFixture(({ root }) => rmSync(path.join(root, 'dist/audio/example.mp3')));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MP3 missing or empty in dist/);
});

test('rejects a recording whose article has changed', () => {
  const result = checkFixture(({ write }) => write('src/content/blog/example.md', 'Updated article'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /article changed/);
});

test('rejects a build made before the updated manifest was embedded', () => {
  const result = checkFixture(({ write }) => write('dist/blog/example/index.html', '<div id="audio-player-root"><audio></audio></div>'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /built player does not reference the recording/);
});

test('rejects paragraph timestamps outside the recording', () => {
  const result = checkFixture(({ manifest }) => { manifest['/blog/example'].sections[0].start = 11; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid duration or paragraph timestamps/);
});
