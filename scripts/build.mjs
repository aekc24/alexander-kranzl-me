import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function generateAudio() {
  const candidates = process.platform === 'win32'
    ? [['python', []], ['py', ['-3']], ['python3', []]]
    : [['python3', []], ['python', []]];
  const python = candidates.find(([command, args]) => {
    const probe = spawnSync(command, [...args, '-c', 'import sys; sys.exit(sys.version_info < (3, 10))'],
      { cwd: root, stdio: 'ignore' });
    return probe.status === 0;
  });
  if (!python) throw new Error('Automatic audio generation requires Python 3.10 or later on the build host.');
  const [command, prefix] = python;
  const available = run(command, [...prefix, '-c',
    "import sys; sys.path.insert(0, '.audio-tools'); import edge_tts; from mutagen.mp3 import MP3"],
    { stdio: 'ignore' });
  if (available !== 0) {
    console.log('Installing audio generator dependencies…');
    if (run(command, [...prefix, '-m', 'pip', 'install', '--target', '.audio-tools', '--upgrade',
      '-r', 'scripts/audio-requirements.txt']) !== 0) {
      throw new Error('Could not install audio dependencies. Check Python/pip and network access on the build host.');
    }
  }
  if (run(command, [...prefix, 'scripts/generate-audio.py']) !== 0) {
    throw new Error('Audio generation failed. Check access to the Microsoft speech service and retry the build.');
  }
}

// Build first to extract exactly the text rendered on each published page.
// Only invoke Python and the speech service when recordings need attention.
export function buildSite({ build, check, generate, force = false }) {
  if (build() !== 0) throw new Error('Astro build failed.');
  if (!force && check() === 0) return;
  console.log('Updating audio recordings automatically...');
  generate();
  // Embed the updated manifest and copy the new MP3 files into the deployment.
  if (build() !== 0) throw new Error('Astro rebuild failed.');
  if (check() !== 0) throw new Error('Audio validation failed after generation.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildSite({
      build: () => run(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build']),
      check: () => run(process.execPath, ['scripts/check-audio.mjs']),
      generate: generateAudio,
      force: process.argv.includes('--generate-audio'),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
