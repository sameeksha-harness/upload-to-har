/**
 * Orchestration tests for src/index.ts.
 *
 * We mock @actions/core and @actions/exec to verify:
 *   1. Inputs are read and wired to the correct CLI calls.
 *   2. login → push sequence happens in order.
 *   3. registry-path output is set.
 *   4. Failures propagate to core.setFailed().
 */

const mockGetInput = jest.fn();
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockSetSecret = jest.fn();
const mockInfo = jest.fn();
const mockStartGroup = jest.fn();
const mockEndGroup = jest.fn();
const mockDebug = jest.fn();
const mockAddPath = jest.fn();

jest.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  setSecret: mockSetSecret,
  info: mockInfo,
  startGroup: mockStartGroup,
  endGroup: mockEndGroup,
  debug: mockDebug,
  addPath: mockAddPath,
}));

const mockExec = jest.fn();
jest.mock('@actions/exec', () => ({
  exec: mockExec,
}));

// Mock fs so validateInputs doesn't hit the real filesystem
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
  },
}));

// Import run() AFTER mocks are in place.
// We re-require each test so fresh module state is created per-test via jest.resetModules().
// run() is NOT auto-invoked during require (the `if (require.main === module)` guard
// in index.ts prevents it); we call mod.run() explicitly.
async function runModule(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../src/index');
  await mod.run();
}

const INPUTS: Record<string, string> = {
  'api-url':      'http://localhost:3000',
  'account':      'acc-123',
  'token':        'pat.acc-123.abc.xyz',
  'registry':     'my-reg',
  'type':         'generic',
  'file':         '/tmp/file.tar.gz',
  'name':         'my-pkg',
  'version':      '1.0.0',
  'extra-args':   '',
  'pom-file':     '',
  'distribution': '',
  'component':    '',
  'namespace':    '',
  'scope':        '',
  'reference':    '',
  'hc-version':   'v1.3.43',
};

function setupInputMock(overrides: Record<string, string> = {}) {
  const merged = { ...INPUTS, ...overrides };
  mockGetInput.mockImplementation((name: string) => merged[name] ?? '');
}

/** Default: hc missing → install → version ok → login/push succeed. */
function mockExecHappyPath(overrides?: {
  onAuth?: (opts: any) => number;
  onPush?: (opts: any) => number;
}) {
  mockExec.mockImplementation(async (cmd: string, args: string[], opts: any) => {
    if (cmd === 'which') return 1;
    if (cmd === 'sh') return 0;
    if (cmd === 'hc' && args[0] === 'version') {
      opts?.listeners?.stdout?.(Buffer.from('hc version 1.3.43\n'));
      return 0;
    }
    if (cmd === 'hc' && args[0] === 'auth') {
      return overrides?.onAuth?.(opts) ?? 0;
    }
    if (cmd === 'hc' && args[0] === 'artifact') {
      if (overrides?.onPush) return overrides.onPush(opts);
      opts?.listeners?.stdout?.(
        Buffer.from("Found 1 file(s) (1 kB) to upload to my-pkg/1.0.0 in registry 'my-reg'"),
      );
      return 0;
    }
    return 0;
  });
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('main orchestration', () => {
  test('successful run: login then push, sets output and does not call setFailed', async () => {
    setupInputMock();
    mockExecHappyPath();

    await runModule();

    const hcCalls = mockExec.mock.calls.filter((c: any[]) => c[0] === 'hc');
    const loginCall = hcCalls.find((c: any[]) => c[1][0] === 'auth');
    const pushCall = hcCalls.find((c: any[]) => c[1][0] === 'artifact');

    expect(loginCall[1]).toEqual([
      'auth', 'login',
      '--api-url', 'http://localhost:3000',
      '--api-token', 'pat.acc-123.abc.xyz',
      '--account', 'acc-123',
      '--non-interactive',
    ]);
    expect(loginCall[2]).toEqual(expect.objectContaining({ silent: true }));

    expect(pushCall[1]).toEqual([
      'artifact', 'push', 'generic',
      'my-reg', '/tmp/file.tar.gz',
      '--name', 'my-pkg',
      '--version', '1.0.0',
    ]);

    expect(mockSetOutput).toHaveBeenCalledWith('registry-path', 'my-reg/my-pkg@1.0.0');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test('masks token before ensureHc and logs redacted login command', async () => {
    setupInputMock();
    const callOrder: string[] = [];
    mockSetSecret.mockImplementation(() => { callOrder.push('setSecret'); });
    mockExec.mockImplementation(async (cmd: string, args: string[], opts: any) => {
      callOrder.push(`${cmd}:${args[0] || ''}`);
      if (cmd === 'which') return 1;
      if (cmd === 'sh') return 0;
      if (cmd === 'hc' && args[0] === 'version') {
        opts?.listeners?.stdout?.(Buffer.from('hc version 1.3.43\n'));
        return 0;
      }
      return 0;
    });

    await runModule();

    expect(callOrder[0]).toBe('setSecret');
    expect(mockSetSecret).toHaveBeenCalledWith('pat.acc-123.abc.xyz');
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('--api-token ***'),
    );
    expect(mockInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('pat.acc-123.abc.xyz'),
    );
  });

  test('login failure propagates to setFailed', async () => {
    setupInputMock();
    mockExecHappyPath({
      onAuth: (opts) => {
        opts?.listeners?.stdout?.(Buffer.from('authentication failed with status 401 Unauthorized'));
        return 1;
      },
    });

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('hc auth login failed'),
    );
    expect(mockEndGroup).toHaveBeenCalled();
    const pushCalls = mockExec.mock.calls.filter(
      (c: any[]) => c[0] === 'hc' && c[1][0] === 'artifact',
    );
    expect(pushCalls).toHaveLength(0);
  });

  test('push failure closes both groups', async () => {
    setupInputMock();
    mockExecHappyPath({
      onPush: () => 1,
    });

    await runModule();

    expect(mockEndGroup).toHaveBeenCalledTimes(2);
  });

  test('push failure propagates to setFailed', async () => {
    setupInputMock();
    mockExecHappyPath({
      onPush: (opts) => {
        opts?.listeners?.stdout?.(Buffer.from('failed to push package: 403 Forbidden'));
        return 1;
      },
    });

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('hc artifact push generic failed'),
    );
    expect(mockSetOutput).not.toHaveBeenCalled();
  });

  test('login failure redacts token if CLI echoed it', async () => {
    setupInputMock();
    mockExecHappyPath({
      onAuth: (opts) => {
        opts?.listeners?.stdout?.(
          Buffer.from('bad token pat.acc-123.abc.xyz rejected'),
        );
        return 1;
      },
    });

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('***'),
    );
    expect(mockSetFailed).not.toHaveBeenCalledWith(
      expect.stringContaining('pat.acc-123.abc.xyz'),
    );
  });

  test('unsupported type propagates to setFailed', async () => {
    setupInputMock({ type: 'docker' });
    mockExecHappyPath();

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported artifact type: "docker"'),
    );
    expect(mockSetOutput).not.toHaveBeenCalled();
  });

  test('file not found propagates to setFailed', async () => {
    setupInputMock();
    const fs = require('fs');
    fs.existsSync.mockReturnValue(false);
    mockExecHappyPath();

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(mockSetOutput).not.toHaveBeenCalled();
  });

  test('swift scope with slash fails validation before hc', async () => {
    setupInputMock({
      type: 'swift',
      file: '/tmp/pkg.zip',
      scope: 'my/org',
      name: 'mylib',
      version: '1.0.0',
    });
    mockExecHappyPath();

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('Input "scope" must not contain "/"'),
    );
    const authCalls = mockExec.mock.calls.filter(
      (c: any[]) => c[0] === 'hc' && c[1][0] === 'auth',
    );
    expect(authCalls).toHaveLength(0);
  });

  test('extra-args are split on newlines and passed through', async () => {
    setupInputMock({ 'extra-args': '--include-hidden\n--description\na description' });
    mockExecHappyPath();

    await runModule();

    const pushCall = mockExec.mock.calls.find(
      (c: any[]) => c[0] === 'hc' && c[1][0] === 'artifact',
    );
    expect(pushCall[1]).toContain('--include-hidden');
    expect(pushCall[1]).toContain('--description');
    expect(pushCall[1]).toContain('a description');
  });
});
