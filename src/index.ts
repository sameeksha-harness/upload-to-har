import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import { login, push, HarInputs, ExecFn } from './har';
import { ensureHc } from './install';

const SUPPORTED_TYPES = [
  'generic', 'maven', 'rpm', 'npm', 'conda', 'composer', 'go', 'cargo',
  'dart', 'python', 'nuget', 'swift', 'puppet', 'debian', 'conan', 'terraform',
];

function validateInputs(inputs: HarInputs): void {
  const { type, file, name, version, pomFile, distribution, component, namespace, scope, reference } = inputs;

  if (!SUPPORTED_TYPES.includes(type)) {
    throw new Error(
      `Unsupported artifact type: "${type}". Supported types: ${SUPPORTED_TYPES.join(', ')}`,
    );
  }

  // For conan, file is the recipe directory (may not exist yet in some workflows)
  // For all others, the file must exist on disk before we call hc
  if (type !== 'conan' && !fs.existsSync(file)) {
    throw new Error(`File not found: "${file}"`);
  }

  // Per-type required field validation — gives a clear error instead of a cryptic hc failure
  switch (type) {
    case 'generic':
      if (!name) throw new Error('Input "name" is required for type "generic"');
      if (!version) throw new Error('Input "version" is required for type "generic"');
      break;
    case 'go':
      if (!version) throw new Error('Input "version" is required for type "go"');
      break;
    case 'maven':
      if (!pomFile) throw new Error('Input "pom-file" is required for type "maven"');
      break;
    case 'debian':
      if (!distribution) throw new Error('Input "distribution" is required for type "debian"');
      if (!component) throw new Error('Input "component" is required for type "debian"');
      break;
    case 'terraform':
      if (!namespace) throw new Error('Input "namespace" is required for type "terraform"');
      break;
    case 'swift':
      if (!scope) throw new Error('Input "scope" is required for type "swift"');
      if (!name) throw new Error('Input "name" is required for type "swift"');
      if (!version) throw new Error('Input "version" is required for type "swift"');
      break;
    case 'conan':
      if (!reference) throw new Error('Input "reference" is required for type "conan"');
      break;
  }
}

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
    await ensureHc();

    const token = core.getInput('token', { required: true });
    // Mask the token so it never appears in logs
    core.setSecret(token);

    const inputs: HarInputs = {
      apiUrl:       core.getInput('api-url',      { required: true }),
      account:      core.getInput('account',       { required: true }),
      token,
      registry:     core.getInput('registry',      { required: true }),
      type:         core.getInput('type',          { required: true }),
      file:         core.getInput('file',          { required: true }),
      name:         core.getInput('name'),
      version:      core.getInput('version'),
      extraArgs:    parseExtraArgs(core.getInput('extra-args')),
      // Type-specific optional inputs
      pomFile:      core.getInput('pom-file'),
      distribution: core.getInput('distribution'),
      component:    core.getInput('component'),
      namespace:    core.getInput('namespace'),
      scope:        core.getInput('scope'),
      reference:    core.getInput('reference'),
    };

    validateInputs(inputs);

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
if (require.main === module) {
  run();
}
