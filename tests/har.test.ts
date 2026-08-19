import {
  buildPushArgs,
  buildRegistryPath,
  buildPushResult,
  combineCliOutput,
  login,
  push,
  sanitizeCliOutput,
  validateSwiftInputs,
  HarInputs,
  ExecFn,
} from '../src/har';
import { SUPPORTED_TYPES, isSupportedType, SUPPORTED_TYPES_LIST } from '../src/types';

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

// ─── types ────────────────────────────────────────────────────────────────────

describe('SUPPORTED_TYPES', () => {
  test('lists 16 types and isSupportedType agrees', () => {
    expect(SUPPORTED_TYPES).toHaveLength(16);
    expect(isSupportedType('generic')).toBe(true);
    expect(isSupportedType('docker')).toBe(false);
    expect(SUPPORTED_TYPES_LIST).toContain('terraform');
  });
});

// ─── combineCliOutput / sanitizeCliOutput ─────────────────────────────────────

describe('combineCliOutput', () => {
  test('joins stdout and stderr when both present', () => {
    expect(combineCliOutput('progress line', 'actual error')).toBe(
      'progress line\nactual error',
    );
  });

  test('returns single stream when the other is empty', () => {
    expect(combineCliOutput('only stdout', '')).toBe('only stdout');
    expect(combineCliOutput('', 'only stderr')).toBe('only stderr');
  });
});

describe('sanitizeCliOutput', () => {
  test('redacts secret substrings', () => {
    expect(sanitizeCliOutput('token=pat.test-account-id.abc.xyz bad', baseInputs.token))
      .toBe('token=*** bad');
  });

  test('returns (no output) for empty', () => {
    expect(sanitizeCliOutput('   ')).toBe('(no output)');
  });

  test('truncates long output keeping the end', () => {
    const long = 'x'.repeat(3000);
    const out = sanitizeCliOutput(long);
    expect(out.startsWith('…')).toBe(true);
    expect(out.length).toBe(1 + 2048);
  });
});

// ─── validateSwiftInputs ──────────────────────────────────────────────────────

describe('validateSwiftInputs', () => {
  test('accepts segments without slashes', () => {
    expect(() => validateSwiftInputs('myorg', 'mylib', '1.0.0')).not.toThrow();
  });

  test('rejects slash in scope, name, or version', () => {
    expect(() => validateSwiftInputs('my/org', 'mylib', '1.0.0'))
      .toThrow('Input "scope" must not contain "/"');
    expect(() => validateSwiftInputs('myorg', 'my/lib', '1.0.0'))
      .toThrow('Input "name" must not contain "/"');
    expect(() => validateSwiftInputs('myorg', 'mylib', '1.0/0'))
      .toThrow('Input "version" must not contain "/"');
  });
});

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

// ─── buildRegistryPath / buildPushResult ──────────────────────────────────────

describe('buildRegistryPath', () => {
  test('generic: registry/name@version', () => {
    expect(buildRegistryPath(baseInputs)).toBe('my-registry/my-package@2.1.0');
  });

  test('omits missing name/version', () => {
    expect(buildRegistryPath({ ...baseInputs, name: '', version: '' })).toBe('my-registry');
    expect(buildRegistryPath({ ...baseInputs, version: '' })).toBe('my-registry/my-package');
  });

  test('swift: registry/scope/name@version', () => {
    expect(buildRegistryPath({
      ...baseInputs, type: 'swift', scope: 'myorg', name: 'mylib', version: '1.0.0',
    })).toBe('my-registry/myorg/mylib@1.0.0');
  });

  test('conan: registry/reference', () => {
    expect(buildRegistryPath({
      ...baseInputs, type: 'conan', reference: 'mylib/1.0.0@user/stable', name: '', version: '',
    })).toBe('my-registry/mylib/1.0.0@user/stable');
  });

  test('terraform: registry/namespace/name@version', () => {
    expect(buildRegistryPath({
      ...baseInputs, type: 'terraform', namespace: 'myorg', name: 'vpc', version: '1.2.0',
    })).toBe('my-registry/myorg/vpc@1.2.0');
  });

  test('terraform provider without name: registry/namespace@version', () => {
    expect(buildRegistryPath({
      ...baseInputs, type: 'terraform', namespace: 'myorg', name: '', version: '1.2.0',
    })).toBe('my-registry/myorg@1.2.0');
  });
});

describe('buildPushResult', () => {
  test('attaches trimmed stdout and input-derived path', () => {
    const result = buildPushResult('\n  ok  \n', baseInputs);
    expect(result.rawOutput).toBe('ok');
    expect(result.registryPath).toBe('my-registry/my-package@2.1.0');
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('login', () => {
  test('calls hc with correct auth login flags and silent option', async () => {
    const calls: Array<{ cmd: string; args: string[]; options?: object }> = [];
    const fakeExec: ExecFn = async (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return { exitCode: 0, stdout: 'Successfully logged into Harness', stderr: '' };
    };

    await login(baseInputs, fakeExec);

    expect(calls).toHaveLength(1);
    const { cmd, args, options } = calls[0];
    expect(cmd).toBe('hc');
    expect(args).toEqual([
      'auth', 'login',
      '--api-url', 'http://localhost:3000',
      '--api-token', 'pat.test-account-id.abc.xyz',
      '--account', 'test-account-id',
      '--non-interactive',
    ]);
    expect(options).toEqual({ silent: true });
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

  test('error message redacts token if present in CLI output', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1,
      stdout: `rejected ${baseInputs.token}`,
      stderr: '',
    });
    await expect(login(baseInputs, fakeExec)).rejects.toThrow('rejected ***');
  });

  test('error message includes both stdout and stderr', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1,
      stdout: 'progress noise',
      stderr: 'real failure',
    });
    await expect(login(baseInputs, fakeExec)).rejects.toThrow(
      'progress noise\nreal failure',
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

  test('error message includes both stdout and stderr', async () => {
    const fakeExec: ExecFn = async () => ({
      exitCode: 1,
      stdout: 'upload step',
      stderr: '403 Forbidden',
    });
    await expect(push(baseInputs, fakeExec)).rejects.toThrow(
      'upload step\n403 Forbidden',
    );
  });
});
