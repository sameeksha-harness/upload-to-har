import { buildPushArgs, parsePushOutput, login, push, HarInputs, ExecFn } from '../src/har';

const baseInputs: HarInputs = {
  apiUrl: 'http://localhost:3000',
  account: 'test-account-id',
  token: 'pat.test-account-id.abc.xyz',
  registry: 'my-registry',
  type: 'generic',
  file: '/tmp/artifact.tar.gz',
  name: 'my-package',
  version: '2.1.0',
  extraArgs: [],
};

// ─── buildPushArgs ────────────────────────────────────────────────────────────

describe('buildPushArgs', () => {
  test('generic type includes --name and --version flags', () => {
    const args = buildPushArgs(baseInputs);
    expect(args).toEqual([
      'artifact', 'push', 'generic',
      'my-registry', '/tmp/artifact.tar.gz',
      '--name', 'my-package',
      '--version', '2.1.0',
    ]);
  });

  test('generic type with extra-args appends them at end', () => {
    const inputs: HarInputs = {
      ...baseInputs,
      extraArgs: ['--include-hidden', '--description', 'a test artifact'],
    };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'generic',
      'my-registry', '/tmp/artifact.tar.gz',
      '--name', 'my-package',
      '--version', '2.1.0',
      '--include-hidden',
      '--description', 'a test artifact',
    ]);
  });

  test('rpm type — no --name or --version flags (CLI reads from package metadata)', () => {
    const inputs: HarInputs = { ...baseInputs, type: 'rpm', file: '/tmp/pkg.rpm' };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'rpm',
      'my-registry', '/tmp/pkg.rpm',
    ]);
  });

  test('npm type — no --name or --version flags', () => {
    const inputs: HarInputs = { ...baseInputs, type: 'npm', file: '/tmp/package.tgz' };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'npm',
      'my-registry', '/tmp/package.tgz',
    ]);
  });

  test('maven type — no --name or --version flags', () => {
    const inputs: HarInputs = { ...baseInputs, type: 'maven', file: '/tmp/lib.jar' };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'maven',
      'my-registry', '/tmp/lib.jar',
    ]);
  });

  test('go type includes --version flag', () => {
    const inputs: HarInputs = { ...baseInputs, type: 'go', file: '/tmp/gotest' };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'go',
      'my-registry', '/tmp/gotest',
      '--version', '2.1.0',
    ]);
  });

  test('terraform type includes --version flag', () => {
    const inputs: HarInputs = { ...baseInputs, type: 'terraform', file: '/tmp/module' };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'terraform',
      'my-registry', '/tmp/module',
      '--version', '2.1.0',
    ]);
  });

  test('non-generic type with extra-args appends them', () => {
    const inputs: HarInputs = {
      ...baseInputs,
      type: 'rpm',
      file: '/tmp/pkg.rpm',
      extraArgs: ['--pkg-url', 'https://custom.registry/'],
    };
    const args = buildPushArgs(inputs);
    expect(args).toEqual([
      'artifact', 'push', 'rpm',
      'my-registry', '/tmp/pkg.rpm',
      '--pkg-url', 'https://custom.registry/',
    ]);
  });

  test('generic type with no extra-args produces minimal arg list', () => {
    const args = buildPushArgs({ ...baseInputs, extraArgs: [] });
    expect(args).toHaveLength(9);
    expect(args[0]).toBe('artifact');
    expect(args[1]).toBe('push');
    expect(args[2]).toBe('generic');
  });
});

// ─── parsePushOutput ──────────────────────────────────────────────────────────

describe('parsePushOutput', () => {
  // TODO: replace sample strings with real CLI output after first live test run.

  test('rpm success line produces correct registry-path', () => {
    const stdout = [
      '✓ Input parameters validated',
      '• Uploading package to registry',
      'Successfully uploaded package /tmp/pkg.rpm',
    ].join('\n');
    const result = parsePushOutput(stdout, { ...baseInputs, type: 'rpm', file: '/tmp/pkg.rpm' });
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
    expect(result.rawOutput).toContain('Successfully uploaded package');
  });

  test('npm success line produces correct registry-path', () => {
    const stdout = "Successfully uploaded NPM package 'my-package@2.1.0' to registry 'my-registry'";
    const result = parsePushOutput(stdout, { ...baseInputs, type: 'npm' });
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
  });

  test('generic upload (no explicit success line) still produces registry-path', () => {
    const stdout = [
      'Scanning 1 input(s) ...',
      'Found 1 file(s) (1.2 MB) to upload to my-package/2.1.0 in registry \'my-registry\'',
    ].join('\n');
    const result = parsePushOutput(stdout, baseInputs);
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
  });

  test('rawOutput trims leading/trailing whitespace', () => {
    const result = parsePushOutput('\n  some output  \n', baseInputs);
    expect(result.rawOutput).toBe('some output');
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('login', () => {
  test('calls hc with correct auth login flags', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeExec: ExecFn = async (cmd, args) => {
      calls.push({ cmd, args });
      return { exitCode: 0, stdout: 'Successfully logged into Harness', stderr: '' };
    };

    await login(baseInputs, fakeExec);

    expect(calls).toHaveLength(1);
    const { cmd, args } = calls[0];
    expect(cmd).toBe('hc');
    expect(args).toEqual([
      'auth', 'login',
      '--api-url', 'http://localhost:3000',
      '--api-token', 'pat.test-account-id.abc.xyz',
      '--account', 'test-account-id',
      '--non-interactive',
    ]);
  });

  test('throws on non-zero exit code', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1,
      stdout: 'authentication failed with status 401 Unauthorized',
      stderr: '',
    });

    await expect(login(baseInputs, fakeExec)).rejects.toThrow(
      /hc auth login failed \(exit 1\)/,
    );
  });

  test('error message includes CLI stdout when stderr is empty', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1,
      stdout: 'error: something went wrong',
      stderr: '',
    });

    await expect(login(baseInputs, fakeExec)).rejects.toThrow(
      'error: something went wrong',
    );
  });
});

// ─── push ─────────────────────────────────────────────────────────────────────

describe('push', () => {
  test('calls hc with args from buildPushArgs', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeExec: ExecFn = async (cmd, args) => {
      calls.push({ cmd, args });
      return {
        exitCode: 0,
        stdout: "Found 1 file(s) (512 B) to upload to my-package/2.1.0 in registry 'my-registry'",
        stderr: '',
      };
    };

    const result = await push(baseInputs, fakeExec);

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('hc');
    expect(calls[0].args).toEqual(buildPushArgs(baseInputs));
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
  });

  test('throws on non-zero exit code with detail from stdout', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1,
      stdout: 'failed to push package: 403 Forbidden\n response: {"message":"access denied"}',
      stderr: '',
    });

    await expect(push(baseInputs, fakeExec)).rejects.toThrow(
      /hc artifact push generic failed \(exit 1\)/,
    );
  });

  test('throws with "(no output)" when stdout and stderr are both empty', async () => {
    const fakeExec: ExecFn = async () => ({ exitCode: 1, stdout: '', stderr: '' });
    await expect(push(baseInputs, fakeExec)).rejects.toThrow('(no output)');
  });
});
