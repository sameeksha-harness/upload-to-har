/**
 * HAR module — builds and runs harness CLI (hc) commands.
 * Kept free of @actions/* imports so it's independently unit-testable.
 *
 * CLI command structure:
 *   hc auth login --api-url <url> --api-token <token> --account <id> --non-interactive
 *   hc artifact push generic  <registry> <file> --name <name> --version <version>
 *   hc artifact push <type>   <registry> <file>
 *     (rpm, maven, npm, conda, composer, go, cargo, dart, python, nuget, swift, puppet, debian)
 */

export interface HarInputs {
  apiUrl: string;
  account: string;
  token: string;
  registry: string;
  type: string;
  file: string;
  name: string;       // required for generic/swift; used to build registry-path for others
  version: string;    // required for generic/go/swift/terraform modules; embedded in file for others
  extraArgs: string[];
  // Type-specific optional inputs
  pomFile: string;      // maven: --pom-file <path>
  distribution: string; // debian: --distribution <e.g. focal>
  component: string;    // debian: --component <e.g. main>
  namespace: string;    // terraform: --namespace <ns>
  scope: string;        // swift: combined with name+version as <SCOPE>/<NAME>/<VERSION> positional
  reference: string;    // conan: <reference> positional (e.g. pkg/1.0.0@user/channel)
}

export interface PushResult {
  registryPath: string;
  rawOutput: string;
}

export interface ExecOptions {
  /** When true, suppress @actions/exec command/stdout echo (use for auth). */
  silent?: boolean;
}

export type ExecFn = (
  cmd: string,
  args: string[],
  options?: ExecOptions,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const MAX_ERROR_DETAIL_CHARS = 2048;

/** Join non-empty stdout/stderr for error messages. */
export function combineCliOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
}

/** Redact secrets and bound length before surfacing CLI output in errors. */
export function sanitizeCliOutput(text: string, secret = ''): string {
  let out = text.trim();
  if (secret) {
    // Split/join avoids regex metacharacter issues in tokens
    out = out.split(secret).join('***');
  }
  if (out.length > MAX_ERROR_DETAIL_CHARS) {
    out = `…${out.slice(-MAX_ERROR_DETAIL_CHARS)}`;
  }
  return out || '(no output)';
}

export async function login(inputs: HarInputs, exec: ExecFn): Promise<void> {
  // --non-interactive prevents the CLI from blocking on interactive prompts
  // in a CI environment where stdin is not a TTY.
  // silent: true avoids logging argv (includes --api-token) via @actions/exec.
  const args = [
    'auth',
    'login',
    '--api-url', inputs.apiUrl,
    '--api-token', inputs.token,
    '--account', inputs.account,
    '--non-interactive',
  ];

  const { exitCode, stdout, stderr } = await exec('hc', args, { silent: true });
  if (exitCode !== 0) {
    // hc prints errors to stdout (not stderr) and exits with code 1.
    const detail = sanitizeCliOutput(
      combineCliOutput(stdout, stderr),
      inputs.token,
    );
    throw new Error(`hc auth login failed (exit ${exitCode}): ${detail}`);
  }
}

/** Reject `/` in swift positional segments (scope/name/version). */
export function validateSwiftInputs(scope: string, name: string, version: string): void {
  for (const [value, label] of [
    [scope, 'scope'],
    [name, 'name'],
    [version, 'version'],
  ] as const) {
    if (value.includes('/')) {
      throw new Error(`Input "${label}" must not contain "/" for type "swift"`);
    }
  }
}

/**
 * Builds the argument array for "hc artifact push <type> ...".
 *
 * Each type has its own required positional args and flags — see inline comments.
 * Extra args (from the extra-args input) are always appended last.
 */
export function buildPushArgs(inputs: HarInputs): string[] {
  const {
    type, registry, file, name, version, extraArgs,
    pomFile, distribution, component, namespace, scope, reference,
  } = inputs;

  let args: string[];
  switch (type) {
    case 'generic':
      // --name and --version both required (validated in index.ts)
      args = ['artifact', 'push', 'generic', registry, file, '--name', name, '--version', version];
      break;

    case 'maven':
      // --pom-file required; version is read from the POM
      args = ['artifact', 'push', 'maven', registry, file, '--pom-file', pomFile];
      break;

    case 'debian':
      // --distribution and --component required
      args = ['artifact', 'push', 'debian', registry, file,
        '--distribution', distribution, '--component', component];
      break;

    case 'terraform':
      // --namespace required; --version required for modules (omit for providers)
      args = ['artifact', 'push', 'terraform', registry, file, '--namespace', namespace];
      if (version) args.push('--version', version);
      break;

    case 'swift':
      // third positional: <SCOPE>/<NAME>/<VERSION>
      args = ['artifact', 'push', 'swift', registry, file, `${scope}/${name}/${version}`];
      break;

    case 'conan':
      // hc artifact push conan <registry> <reference> <recipe_dir>
      // file input is used as the recipe directory
      args = ['artifact', 'push', 'conan', registry, reference, file];
      break;

    case 'go':
      // --version required (no metadata file to read from)
      args = ['artifact', 'push', 'go', registry, file, '--version', version];
      break;

    default:
      // cargo, composer, conda, dart, npm, nuget, puppet, python, rpm
      // version is embedded in the package file — no extra flags needed
      args = ['artifact', 'push', type, registry, file];
  }

  return [...args, ...extraArgs];
}

/**
 * Builds registry-path from push inputs only
 *
 * - generic / go / others: <registry>/<name>@<version> (omits missing parts)
 * - swift: <registry>/<scope>/<name>@<version>
 * - conan: <registry>/<reference>
 * - terraform: <registry>/<namespace>/<name>@<version> (omits missing parts)
 *
 * For package types whose identity is embedded in the file (npm, maven, …),
 * pass optional name/version inputs when you want a full registry-path output.
 */
export function buildRegistryPath(inputs: HarInputs): string {
  const { type, registry, name, version, scope, reference, namespace } = inputs;

  switch (type) {
    case 'swift': {
      const parts = [registry, scope, name].filter(Boolean);
      const base = parts.join('/');
      return version ? `${base}@${version}` : base;
    }
    case 'conan':
      return reference ? `${registry}/${reference}` : registry;
    case 'terraform': {
      const parts = [registry, namespace, name].filter(Boolean);
      const base = parts.join('/');
      return version ? `${base}@${version}` : base;
    }
    default: {
      let path = registry;
      if (name) path += `/${name}`;
      if (version) path += `@${version}`;
      return path;
    }
  }
}

/** Attach raw CLI stdout to the input-derived registry path. */
export function buildPushResult(stdout: string, inputs: HarInputs): PushResult {
  return {
    registryPath: buildRegistryPath(inputs),
    rawOutput: stdout.trim(),
  };
}

export async function push(
  inputs: HarInputs,
  exec: ExecFn,
): Promise<PushResult> {
  const args = buildPushArgs(inputs);
  const { exitCode, stdout, stderr } = await exec('hc', args);

  if (exitCode !== 0) {
    // hc prints errors to stdout (not stderr) and exits with code 1.
    const detail = sanitizeCliOutput(
      combineCliOutput(stdout, stderr),
      inputs.token,
    );
    throw new Error(
      `hc artifact push ${inputs.type} failed (exit ${exitCode}): ${detail}`,
    );
  }

  return buildPushResult(stdout, inputs);
}
