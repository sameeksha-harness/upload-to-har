/**
 * HAR module — builds and runs harness CLI (hc) commands.
 * Kept free of @actions/* imports so it's independently unit-testable.
 *
 * Real CLI command structure (verified from harness-cli source):
 *   hc auth login --api-url <url> --api-token <token> --account <id> --non-interactive
 *   hc artifact push generic  <registry> <file> --name <name> --version <version>
 *   hc artifact push <type>   <registry> <file>
 *     (rpm, maven, npm, conda, composer, go, cargo, dart, python, nuget, swift, puppet, debian)
 *
 * Sources verified:
 *   cmd/auth/login.go       — flags: --api-url, --api-token, --account, --non-interactive
 *   cmd/artifact/command/push_generic.go — flags: positional <registry> <path>, --name (required), --version
 *   cmd/artifact/command/push_rpm.go     — positional <registry_name> <file_path>, no extra flags
 *   cmd/artifact/root.go    — subcommand path is "artifact push <type>"
 *   cmd/hc/main.go          — SilenceErrors:true; errors print to stdout; exit code 1 on failure
 */

export interface HarInputs {
  apiUrl: string;
  account: string;
  token: string;
  registry: string;
  type: string;
  file: string;
  name: string;
  version: string;
  extraArgs: string[];
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
    // Cobra SilenceErrors=true means the error message lands on stdout, not stderr.
    const detail = stdout.trim() || stderr.trim() || '(no output)';
    throw new Error(`hc auth login failed (exit ${exitCode}): ${detail}`);
  }
}

/**
 * Builds the argument array for "hc artifact push <type> ...".
 *
 * generic type:
 *   ["artifact", "push", "generic", "<registry>", "<file>", "--name", "<name>", "--version", "<version>"]
 *
 * all other types:
 *   ["artifact", "push", "<type>", "<registry>", "<file>"]
 *   (name/version are derived from the package file's own metadata by the CLI)
 *
 * NOTE: --version is not supported as a standalone flag for non-generic types —
 * each package format (rpm, maven, npm, etc.) reads version from its own metadata.
 * If you need to override version for those types, use extra-args.
 */
export function buildPushArgs(inputs: HarInputs): string[] {
  const { type, registry, file, name, version, extraArgs } = inputs;

  const base = ['artifact', 'push', type, registry, file];

  let typeFlags: string[];
  if (type === 'generic') {
    // push_generic.go: --name is required, --version defaults to "1.0.0"
    typeFlags = ['--name', name, '--version', version];
  } else {
    // All other push_<type>.go commands: positional args only; no --name / --version flags.
    typeFlags = [];
  }

  return [...base, ...typeFlags, ...extraArgs];
}

/**
 * Parses plain-text stdout from "hc artifact push".
 *
 * The CLI does NOT support --format json for push commands — they use
 * progress.Success(...) / fmt.Printf, not printer.Print. Structured output
 * flags have no effect here.
 *
 * Observed success patterns (from harness-cli source):
 *   generic:  no explicit success line; zero exit = success
 *   rpm/conda/composer/cargo/python/nuget/swift/debian:
 *             "Successfully uploaded package <filePath>"
 *   npm:      "Successfully uploaded NPM package '<name>@<version>' to registry '<registry>'"
 *   dart:     "Successfully uploaded Dart package '<name>@<version>' to registry '<registry>'"
 *   puppet:   "Successfully uploaded Puppet module '<name>@<version>' to registry '<registry>'"
 *   maven:    "Successfully uploaded package"
 *   go:       "Successfully uploaded package <packageName>"
 *
 * TODO: confirm these patterns against real CLI output from local/QA runs.
 */
export function parsePushOutput(stdout: string, inputs: HarInputs): PushResult {
  const { registry, name, version, type } = inputs;

  // Derive a canonical registry-path for the output regardless of which
  // success line the CLI printed. The path follows HAR conventions:
  //   <registry>/<name>@<version>
  const registryPath = `${registry}/${name}@${version}`;

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
    // Cobra SilenceErrors=true: error message is on stdout; stderr may have
    // verbose log lines if --verbose was passed (it wasn't, so stderr is likely empty).
    const detail = stdout.trim() || stderr.trim() || '(no output)';
    throw new Error(
      `hc artifact push ${inputs.type} failed (exit ${exitCode}): ${detail}`,
    );
  }

  return parsePushOutput(stdout, inputs);
}
