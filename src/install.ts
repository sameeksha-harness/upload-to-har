import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Default harness-cli release tag. Bump deliberately when upgrading. */
export const DEFAULT_HC_VERSION = 'v1.3.43';

const INSTALL_SCRIPT_URL =
  'https://raw.githubusercontent.com/harness/harness-cli/v2/install';

/** Allow only release-tag shapes (blocks shell metacharacters in install). */
const HC_VERSION_RE = /^v?\d+(\.[\w-]+)*$/;

/** Normalize to a leading-v tag (e.g. 1.3.43 → v1.3.43). Empty → default pin. */
export function normalizeHcVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return DEFAULT_HC_VERSION;
  if (!HC_VERSION_RE.test(trimmed)) {
    throw new Error(
      `Invalid hc-version "${trimmed}". Expected a release tag like v1.3.43`,
    );
  }
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

/** Compare `hc version` stdout to an expected tag (with or without leading v). */
export function versionsMatch(versionOutput: string, expected: string): boolean {
  const want = normalizeHcVersion(expected).replace(/^v/, '');
  const match = versionOutput.match(/hc version\s+(v?[\w.-]+)/i);
  if (!match) return false;
  return match[1].replace(/^v/, '') === want;
}

async function isHcOnPath(): Promise<boolean> {
  const exitCode = await exec.exec('which', ['hc'], {
    ignoreReturnCode: true,
    silent: true,
  });
  return exitCode === 0;
}

async function readHcVersionOutput(): Promise<string> {
  let stdout = '';
  const exitCode = await exec.exec('hc', ['version'], {
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
  });
  return exitCode === 0 ? stdout : '';
}

function resolveInstallDir(): string {
  const base = process.env.RUNNER_TEMP || os.tmpdir();
  return path.join(base, 'upload-to-har-hc');
}

async function installHc(version: string): Promise<void> {
  const installDir = resolveInstallDir();
  await fs.promises.mkdir(installDir, { recursive: true });

  core.info(`Installing harness CLI (hc) ${version} into ${installDir}`);

  // Official installer verifies release checksums. HC_VERSION pins the binary;
  // INSTALL_DIR keeps the binary job-local and lets us override PATH.
  const script = [
    `curl -fsSL ${INSTALL_SCRIPT_URL}`,
    `| INSTALL_DIR='${installDir}' HC_VERSION='${version}' sh`,
  ].join(' ');

  await exec.exec('sh', ['-c', script]);
  core.addPath(installDir);
}

/**
 * Ensures a matching `hc` is available.
 * - If PATH already has the requested version, reuse it.
 * - Otherwise install the pinned/requested version into a job-local dir and prepend PATH.
 */
export async function ensureHc(requestedVersion = ''): Promise<void> {
  const version = normalizeHcVersion(requestedVersion);

  if (await isHcOnPath()) {
    const current = await readHcVersionOutput();
    if (current && versionsMatch(current, version)) {
      core.info(`hc ${version} already on PATH, skipping install`);
      return;
    }
    core.info(
      `hc on PATH does not match ${version} (got: ${current.trim() || 'unknown'}); reinstalling pinned version`,
    );
  }

  await installHc(version);

  const installed = await readHcVersionOutput();
  if (!installed || !versionsMatch(installed, version)) {
    throw new Error(
      `hc install completed but version mismatch: expected ${version}, got: ${installed.trim() || '(no output)'}`,
    );
  }
  core.info(`Using hc ${version}`);
}
