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
  pomFile: '',
  distribution: '',
  component: '',
  namespace: '',
  scope: '',
  reference: '',
};

// ─── buildPushArgs ────────────────────────────────────────────────────────────

describe('buildPushArgs', () => {
  test('generic — --name and --version flags', () => {
    expect(buildPushArgs(baseInputs)).toEqual([
      'artifact', 'push', 'generic',
      'my-registry', '/tmp/artifact.tar.gz',
      '--name', 'my-package',
      '--version', '2.1.0',
    ]);
  });

  test('generic — extra-args appended at end', () => {
    const args = buildPushArgs({
      ...baseInputs,
      extraArgs: ['--include-hidden', '--description', 'a test artifact'],
    });
    expect(args).toEqual([
      'artifact', 'push', 'generic',
      'my-registry', '/tmp/artifact.tar.gz',
      '--name', 'my-package',
      '--version', '2.1.0',
      '--include-hidden', '--description', 'a test artifact',
    ]);
  });

  test('maven — --pom-file flag', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'maven', file: '/tmp/lib.jar', pomFile: 'pom.xml',
    });
    expect(args).toEqual([
      'artifact', 'push', 'maven',
      'my-registry', '/tmp/lib.jar',
      '--pom-file', 'pom.xml',
    ]);
  });

  test('debian — --distribution and --component flags', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'debian', file: '/tmp/pkg.deb',
      distribution: 'focal', component: 'main',
    });
    expect(args).toEqual([
      'artifact', 'push', 'debian',
      'my-registry', '/tmp/pkg.deb',
      '--distribution', 'focal', '--component', 'main',
    ]);
  });

  test('terraform — --namespace required, --version appended when provided', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'terraform', file: '/tmp/module.tar.gz',
      namespace: 'myorg', version: '1.2.0',
    });
    expect(args).toEqual([
      'artifact', 'push', 'terraform',
      'my-registry', '/tmp/module.tar.gz',
      '--namespace', 'myorg',
      '--version', '1.2.0',
    ]);
  });

  test('terraform — --version omitted when version is empty (provider case)', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'terraform', file: '/tmp/provider.zip',
      namespace: 'myorg', version: '',
    });
    expect(args).toEqual([
      'artifact', 'push', 'terraform',
      'my-registry', '/tmp/provider.zip',
      '--namespace', 'myorg',
    ]);
  });

  test('swift — third positional is <scope>/<name>/<version>', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'swift', file: '/tmp/pkg.zip',
      scope: 'myorg', name: 'mylib', version: '1.0.0',
    });
    expect(args).toEqual([
      'artifact', 'push', 'swift',
      'my-registry', '/tmp/pkg.zip',
      'myorg/mylib/1.0.0',
    ]);
  });

  test('conan — <reference> before <recipe_dir>', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'conan', file: './recipe',
      reference: 'mylib/1.0.0@user/stable',
    });
    expect(args).toEqual([
      'artifact', 'push', 'conan',
      'my-registry', 'mylib/1.0.0@user/stable', './recipe',
    ]);
  });

  test('go — --version flag', () => {
    const args = buildPushArgs({ ...baseInputs, type: 'go', file: '/tmp/gomod' });
    expect(args).toEqual([
      'artifact', 'push', 'go',
      'my-registry', '/tmp/gomod',
      '--version', '2.1.0',
    ]);
  });

  test('rpm — no extra flags (version embedded in package)', () => {
    const args = buildPushArgs({ ...baseInputs, type: 'rpm', file: '/tmp/pkg.rpm' });
    expect(args).toEqual([
      'artifact', 'push', 'rpm',
      'my-registry', '/tmp/pkg.rpm',
    ]);
  });

  test('npm — no extra flags', () => {
    expect(buildPushArgs({ ...baseInputs, type: 'npm', file: '/tmp/package.tgz' })).toEqual([
      'artifact', 'push', 'npm', 'my-registry', '/tmp/package.tgz',
    ]);
  });

  test('cargo — no extra flags', () => {
    expect(buildPushArgs({ ...baseInputs, type: 'cargo', file: '/tmp/pkg.crate' })).toEqual([
      'artifact', 'push', 'cargo', 'my-registry', '/tmp/pkg.crate',
    ]);
  });

  test('non-generic extra-args appended correctly', () => {
    const args = buildPushArgs({
      ...baseInputs, type: 'rpm', file: '/tmp/pkg.rpm',
      extraArgs: ['--pkg-url', 'https://custom.registry/'],
    });
    expect(args).toEqual([
      'artifact', 'push', 'rpm',
      'my-registry', '/tmp/pkg.rpm',
      '--pkg-url', 'https://custom.registry/',
    ]);
  });
});

// ─── parsePushOutput ──────────────────────────────────────────────────────────

describe('parsePushOutput', () => {
  test('builds registry-path as registry/name@version when both provided', () => {
    const result = parsePushOutput('Successfully uploaded', baseInputs);
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
  });

  test('builds registry-path without version when version is empty', () => {
    const result = parsePushOutput('ok', { ...baseInputs, version: '' });
    expect(result.registryPath).toBe('my-registry/my-package');
  });

  test('builds registry-path without name and version when both empty', () => {
    const result = parsePushOutput('ok', { ...baseInputs, name: '', version: '' });
    expect(result.registryPath).toBe('my-registry');
  });

  test('rawOutput trims leading/trailing whitespace', () => {
    const result = parsePushOutput('\n  some output  \n', baseInputs);
    expect(result.rawOutput).toBe('some output');
  });

  test('rpm success line produces correct registry-path', () => {
    const stdout = [
      '✓ Input parameters validated',
      'Successfully uploaded package /tmp/pkg.rpm',
    ].join('\n');
    const result = parsePushOutput(stdout, { ...baseInputs, type: 'rpm', file: '/tmp/pkg.rpm' });
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
    expect(result.rawOutput).toContain('Successfully uploaded package');
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
    await expect(login(baseInputs, fakeExec)).rejects.toThrow(/hc auth login failed \(exit 1\)/);
  });

  test('error message includes CLI stdout when stderr is empty', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1, stdout: 'error: something went wrong', stderr: '',
    });
    await expect(login(baseInputs, fakeExec)).rejects.toThrow('error: something went wrong');
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
      stdout: 'failed to push package: 403 Forbidden',
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
