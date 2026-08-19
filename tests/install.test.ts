const mockInfo = jest.fn();
const mockDebug = jest.fn();
const mockAddPath = jest.fn();
const mockExec = jest.fn();

jest.mock('@actions/core', () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
  addPath: (...args: unknown[]) => mockAddPath(...args),
}));

jest.mock('@actions/exec', () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
  },
}));

// Load after mocks so @actions/* wiring is in place.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  DEFAULT_HC_VERSION,
  normalizeHcVersion,
  versionsMatch,
  ensureHc,
} = require('../src/install');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RUNNER_TEMP;
});

describe('normalizeHcVersion', () => {
  test('empty uses default pin', () => {
    expect(normalizeHcVersion('')).toBe(DEFAULT_HC_VERSION);
    expect(normalizeHcVersion('  ')).toBe(DEFAULT_HC_VERSION);
  });

  test('adds leading v when missing', () => {
    expect(normalizeHcVersion('1.3.43')).toBe('v1.3.43');
  });

  test('keeps leading v', () => {
    expect(normalizeHcVersion('v1.3.43')).toBe('v1.3.43');
  });

  test('rejects shell metacharacters', () => {
    expect(() => normalizeHcVersion('v1.3.43; rm -rf /')).toThrow(/Invalid hc-version/);
    expect(() => normalizeHcVersion('$(reboot)')).toThrow(/Invalid hc-version/);
  });
});

describe('versionsMatch', () => {
  test('matches hc version output without leading v', () => {
    expect(versionsMatch('hc version 1.3.43\nBuilt with go1.22\n', 'v1.3.43')).toBe(true);
  });

  test('matches when expected omits v', () => {
    expect(versionsMatch('hc version 1.3.43\n', '1.3.43')).toBe(true);
  });

  test('rejects mismatch', () => {
    expect(versionsMatch('hc version 1.2.0\n', 'v1.3.43')).toBe(false);
  });

  test('rejects unparseable output', () => {
    expect(versionsMatch('not a version', 'v1.3.43')).toBe(false);
  });
});

describe('ensureHc', () => {
  test('skips install when PATH hc matches pin', async () => {
    mockExec.mockImplementation(async (cmd: string, args: string[], opts: any) => {
      if (cmd === 'which') return 0;
      if (cmd === 'hc' && args[0] === 'version') {
        opts?.listeners?.stdout?.(Buffer.from('hc version 1.3.43\n'));
        return 0;
      }
      throw new Error(`unexpected exec: ${cmd} ${args}`);
    });

    await ensureHc('v1.3.43');

    expect(mockExec.mock.calls.some((c: any[]) => c[0] === 'sh')).toBe(false);
    expect(mockAddPath).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('already on PATH'),
    );
  });

  test('reinstalls when PATH hc version mismatches', async () => {
    let versionCalls = 0;
    mockExec.mockImplementation(async (cmd: string, args: string[], opts: any) => {
      if (cmd === 'which') return 0;
      if (cmd === 'hc' && args[0] === 'version') {
        versionCalls += 1;
        const out = versionCalls === 1 ? 'hc version 1.0.0\n' : 'hc version 1.3.43\n';
        opts?.listeners?.stdout?.(Buffer.from(out));
        return 0;
      }
      if (cmd === 'sh') return 0;
      throw new Error(`unexpected exec: ${cmd} ${args}`);
    });

    await ensureHc('v1.3.43');

    const shCall = mockExec.mock.calls.find((c: any[]) => c[0] === 'sh');
    expect(shCall[1][1]).toMatch(/HC_VERSION='v1\.3\.43'/);
    expect(mockAddPath).toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('reinstalling pinned version'),
    );
  });

  test('installs when hc is not on PATH', async () => {
    mockExec.mockImplementation(async (cmd: string, args: string[], opts: any) => {
      if (cmd === 'which') return 1;
      if (cmd === 'sh') return 0;
      if (cmd === 'hc' && args[0] === 'version') {
        opts?.listeners?.stdout?.(Buffer.from('hc version 1.3.43\n'));
        return 0;
      }
      throw new Error(`unexpected exec: ${cmd} ${args}`);
    });

    await ensureHc('');

    const shCall = mockExec.mock.calls.find((c: any[]) => c[0] === 'sh');
    expect(shCall[1][1]).toMatch(/HC_VERSION='v1\.3\.43'/);
    expect(mockAddPath).toHaveBeenCalled();
  });

  test('fails if install does not yield expected version', async () => {
    mockExec.mockImplementation(async (cmd: string, args: string[], opts: any) => {
      if (cmd === 'which') return 1;
      if (cmd === 'sh') return 0;
      if (cmd === 'hc' && args[0] === 'version') {
        opts?.listeners?.stdout?.(Buffer.from('hc version 9.9.9\n'));
        return 0;
      }
      throw new Error(`unexpected exec: ${cmd} ${args}`);
    });

    await expect(ensureHc('v1.3.43')).rejects.toThrow(/version mismatch/);
  });
});
