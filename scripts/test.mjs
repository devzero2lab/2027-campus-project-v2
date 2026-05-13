import { spawn } from 'node:child_process';

/**
 * Runs a child process and streams its output so the root test command can
 * orchestrate both runtimes from one place.
 */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], {
            stdio: 'inherit',
            shell: false,
          })
        : spawn(command, args, {
            stdio: 'inherit',
            shell: false,
          });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

/**
 * Keeps the root npm script aligned with the monorepo by delegating to the
 * backend and frontend test commands once dependencies are installed.
 */
async function main() {
  await run('python', ['-m', 'pytest', 'apps/backend/tests']);
  await run('npm.cmd', ['run', 'test', '--workspace', 'apps/web']);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
