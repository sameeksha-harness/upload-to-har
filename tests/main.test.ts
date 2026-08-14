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

jest.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  setSecret: mockSetSecret,
  info: mockInfo,
  startGroup: mockStartGroup,
  endGroup: mockEndGroup,
  debug: mockDebug,
}));

const mockExec = jest.fn();
jest.mock('@actions/exec', () => ({
  exec: mockExec,
}));

// Import run() AFTER mocks are in place.
// We re-require each test so module-level side effects (the bare `run()` call
// at the bottom of index.ts) are flushed per-test via jest.resetModules().
async function runModule(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../src/index');
  // run() is both called at module load AND exported; await the export
  // so the test waits for the full async execution.
  await mod.run();
}

const INPUTS: Record<string, string> = {
  'api-url':    'http://localhost:3000',
  'account':    'acc-123',
  'token':      'pat.acc-123.abc.xyz',
  'registry':   'my-reg',
  'type':       'generic',
  'file':       '/tmp/file.tar.gz',
  'name':       'my-pkg',
  'version':    '1.0.0',
  'extra-args': '',
};

function setupInputMock(overrides: Record<string, string> = {}) {
  const merged = { ...INPUTS, ...overrides };
  mockGetInput.mockImplementation((name: string) => merged[name] ?? '');
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('main orchestration', () => {
  test('successful run: login then push, sets output and does not call setFailed', async () => {
    setupInputMock();

    const execCalls: Array<string[]> = [];
    mockExec.mockImplementation((_cmd: string, args: string[], opts: any) => {
      execCalls.push(args);
      // Simulate output through listeners
      const output = 'Found 1 file(s) (1 kB) to upload to my-pkg/1.0.0 in registry \'my-reg\'';
      opts?.listeners?.stdout?.(Buffer.from(output));
      return Promise.resolve(0);
    });

    await runModule();

    // login call (execCalls[0] is the `which hc` check from ensureHc)
    expect(execCalls[1]).toEqual([
      'auth', 'login',
      '--api-url', 'http://localhost:3000',
      '--api-token', 'pat.acc-123.abc.xyz',
      '--account', 'acc-123',
      '--non-interactive',
    ]);

    // push call
    expect(execCalls[2]).toEqual([
      'artifact', 'push', 'generic',
      'my-reg', '/tmp/file.tar.gz',
      '--name', 'my-pkg',
      '--version', '1.0.0',
    ]);

    expect(mockSetOutput).toHaveBeenCalledWith('registry-path', 'my-reg/my-pkg@1.0.0');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test('login failure propagates to setFailed', async () => {
    setupInputMock();

    mockExec.mockImplementation((_cmd: string, args: string[], opts: any) => {
      if (args[0] === 'auth') {
        opts?.listeners?.stdout?.(Buffer.from('authentication failed with status 401 Unauthorized'));
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    });

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('hc auth login failed'),
    );
    // Push should not have been called
    const authCalls = (mockExec as jest.Mock).mock.calls.filter(
      (c: any[]) => c[1][0] === 'artifact',
    );
    expect(authCalls).toHaveLength(0);
  });

  test('push failure propagates to setFailed', async () => {
    setupInputMock();

    mockExec.mockImplementation((_cmd: string, args: string[], opts: any) => {
      if (args[0] === 'auth') {
        opts?.listeners?.stdout?.(Buffer.from('Successfully logged into Harness'));
        return Promise.resolve(0);
      }
      // push fails
      opts?.listeners?.stdout?.(Buffer.from('failed to push package: 403 Forbidden'));
      return Promise.resolve(1);
    });

    await runModule();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('hc artifact push generic failed'),
    );
    expect(mockSetOutput).not.toHaveBeenCalled();
  });

  test('token is masked via setSecret', async () => {
    setupInputMock();
    mockExec.mockResolvedValue(0);

    await runModule();

    expect(mockSetSecret).toHaveBeenCalledWith('pat.acc-123.abc.xyz');
  });

  test('extra-args are split on newlines and passed through', async () => {
    setupInputMock({ 'extra-args': '--include-hidden\n--description\na description' });

    const execCalls: Array<string[]> = [];
    mockExec.mockImplementation((_cmd: string, args: string[], _opts: any) => {
      execCalls.push(args);
      return Promise.resolve(0);
    });

    await runModule();

    const pushArgs = execCalls[2];
    expect(pushArgs).toContain('--include-hidden');
    expect(pushArgs).toContain('--description');
    expect(pushArgs).toContain('a description');
  });
});
