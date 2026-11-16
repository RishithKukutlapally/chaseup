// Starts the real backend (serving the built UI) on a fresh temp DB in SIMULATED mode for Playwright.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const db = join(tmpdir(), 'chaseup_e2e.db');
for (const s of ['', '-wal', '-shm']) rmSync(db + s, { force: true });

const backend = resolve(import.meta.dirname, '..', '..', 'backend');
const python = process.platform === 'win32' ? join(backend, '.venv', 'Scripts', 'python.exe') : join(backend, '.venv', 'bin', 'python');
const child = spawn(python, ['-W', 'ignore', 'run_exe.py', '--no-browser', '--port', process.env.E2E_PORT || '8030'], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    CHASEZERO_DB_PATH: db,
    CHASEZERO_SIMULATE_ONLY: '1',
    DEMO_PASSWORD_TEMPLATE: '{Name}@e2e-only',
    PBKDF2_ITERATIONS: '1000',
  },
});
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
child.on('exit', (code) => process.exit(code ?? 0));
