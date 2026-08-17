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
  // v2 is a floating tag — always installs the latest v2.x release.
  // Trade-off: mutable tag means we pick up fixes automatically but can't
  // guarantee bit-for-bit reproducibility. To pin, replace v2 with a full
  // commit SHA and verify the checksum before executing.
  await exec.exec('sh', [
    '-c',
    'curl -fsSL https://raw.githubusercontent.com/harness/harness-cli/v2/install | sh',
  ]);
}
