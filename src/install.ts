import * as core from '@actions/core';
import * as exec from '@actions/exec';

export async function ensureHc(): Promise<void> {
  const alreadyInstalled = await exec.exec('which', ['hc'], {
    ignoreReturnCode: true,
    silent: true,
  }) === 0;

  if (alreadyInstalled) {
    core.debug('hc already on PATH, skipping install');
    return;
  }

  core.info('Installing harness CLI (hc)...');
  await exec.exec('sh', [
    '-c',
    'curl -fsSL https://raw.githubusercontent.com/harness/harness-cli/v2/install | sh',
  ]);
}
