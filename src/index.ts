import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { login, push, HarInputs, ExecFn } from './har';

function buildExecFn(): ExecFn {
  return async (cmd: string, args: string[]) => {
    let stdout = '';
    let stderr = '';

    const exitCode = await exec.exec(cmd, args, {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => { stdout += data.toString(); },
        stderr: (data: Buffer) => { stderr += data.toString(); },
      },
      // Mask the token in logs — @actions/core addMask is called below,
      // but belt-and-suspenders: don't let exec echo the full command with the token.
      silent: false,
    });

    return { exitCode, stdout, stderr };
  };
}

function parseExtraArgs(raw: string): string[] {
  return raw
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('token', { required: true });
    // Mask the token so it never appears in logs
    core.setSecret(token);

    const inputs: HarInputs = {
      apiUrl:    core.getInput('api-url',   { required: true }),
      account:   core.getInput('account',   { required: true }),
      token,
      registry:  core.getInput('registry',  { required: true }),
      type:      core.getInput('type',      { required: true }),
      file:      core.getInput('file',      { required: true }),
      name:      core.getInput('name',      { required: true }),
      version:   core.getInput('version',   { required: true }),
      extraArgs: parseExtraArgs(core.getInput('extra-args')),
    };

    const execFn = buildExecFn();

    core.startGroup('hc auth login');
    await login(inputs, execFn);
    core.endGroup();

    core.startGroup(`hc artifact push ${inputs.type}`);
    const result = await push(inputs, execFn);
    core.endGroup();

    core.setOutput('registry-path', result.registryPath);
    core.info(`Uploaded to ${result.registryPath}`);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

export { run };

/* istanbul ignore next */
if (require.main === module || process.env.GITHUB_ACTIONS) {
  run();
}
