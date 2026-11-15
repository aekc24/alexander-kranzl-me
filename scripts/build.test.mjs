import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSite } from './build.mjs';

function fixture({ builds = [0, 0], checks = [0], force = false, failure } = {}) {
  const calls = [];
  const execute = () => buildSite({
    build: () => { calls.push('build'); return builds.shift(); },
    check: () => { calls.push('check'); return checks.shift(); },
    generate: () => { calls.push('generate'); if (failure) throw new Error(failure); },
    force,
  });
  return { calls, execute };
}

test('a current recording needs no generator or second build', () => {
  const { calls, execute } = fixture();
  execute();
  assert.deepEqual(calls, ['build', 'check']);
});

test('missing or stale audio is generated, embedded and validated', () => {
  const { calls, execute } = fixture({ checks: [1, 0] });
  execute();
  assert.deepEqual(calls, ['build', 'check', 'generate', 'build', 'check']);
});

test('an Astro failure does not start audio generation', () => {
  const { calls, execute } = fixture({ builds: [1] });
  assert.throws(execute, /Astro build failed/);
  assert.deepEqual(calls, ['build']);
});

test('a speech service failure fails the build', () => {
  const { calls, execute } = fixture({ checks: [1], failure: 'Speech service unavailable' });
  assert.throws(execute, /Speech service unavailable/);
  assert.deepEqual(calls, ['build', 'check', 'generate']);
});

test('invalid regenerated audio still fails validation', () => {
  const { execute } = fixture({ checks: [1, 1] });
  assert.throws(execute, /Audio validation failed/);
});

test('a failed rebuild is reported', () => {
  const { execute } = fixture({ builds: [0, 1], checks: [1] });
  assert.throws(execute, /Astro rebuild failed/);
});

test('explicit generation works with the platform Python selected by the runner', () => {
  const { calls, execute } = fixture({ force: true });
  execute();
  assert.deepEqual(calls, ['build', 'generate', 'build', 'check']);
});
