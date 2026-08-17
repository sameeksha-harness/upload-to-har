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

export type ExecFn = (
  cmd: string,
  args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export async function login(inputs: HarInputs, exec: ExecFn): Promise<void> {
  // --non-interactive prevents the CLI from blocking on interactive prompts
  // in a CI environment where stdin is not a TTY.
  const args = [
    'auth',
    'login',
    '--api-url', inputs.apiUrl,
    '--api-token', inputs.token,
    '--account', inputs.account,
    '--non-interactive',
  ];

  const { exitCode, stdout, stderr } = await exec('hc', args);
  if (exitCode !== 0) {
    // hc prints errors to stdout (not stderr) and exits with code 1.
    const detail = stdout.trim() || stderr.trim() || '(no output)';
    throw new Error(`hc auth login failed (exit ${exitCode}): ${detail}`);
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
 * Builds the registry-path output from push inputs.
 *
 * hc artifact push does not emit structured output, so we construct the
 * canonical path from the inputs. Format: <registry>/<name>@<version>
 * Falls back gracefully when name/version are not provided (e.g. for types
 * where they are embedded in the package file).
 */
export function parsePushOutput(stdout: string, inputs: HarInputs): PushResult {
  const { registry, name, version } = inputs;

  let registryPath = registry;
  if (name) registryPath += `/${name}`;
  if (version) registryPath += `@${version}`;

  return {
    registryPath,
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
    const detail = stdout.trim() || stderr.trim() || '(no output)';
    throw new Error(
      `hc artifact push ${inputs.type} failed (exit ${exitCode}): ${detail}`,
    );
  }

  return parsePushOutput(stdout, inputs);
}
