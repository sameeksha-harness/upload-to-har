# upload-to-har

A GitHub Action that uploads a local file to [Harness Artifact Registry (HAR)](https://developer.harness.io/docs/artifact-registry) using the [harness CLI (`hc`)](https://github.com/harness/harness-cli).

Works like `redhat-actions/push-to-registry` but shells out to `hc artifact push` instead of `podman`.

## Prerequisites

The `hc` binary must be available on the runner's `PATH`. On GitHub-hosted Ubuntu runners it is **not** preinstalled — add an install step before this action:

```yaml
- name: Install harness CLI
  run: curl -fsSL https://raw.githubusercontent.com/harness/harness-cli/v2/install | sh
```

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `api-url` | yes | Harness API base URL. Pass the bare origin — no trailing slash, no extra path (`http://localhost:3000`, `https://qa.harness.io`, `https://app.harness.io`). The CLI appends its own path suffixes internally. |
| `account` | yes | Harness account ID |
| `token` | yes | Harness PAT token — pass via `secrets.*` |
| `registry` | yes | HAR registry name |
| `type` | yes | Artifact type: `generic`, `rpm`, `maven`, `npm`, `conda`, `composer`, `go`, `cargo`, `dart`, `python`, `nuget`, `swift`, `puppet`, `debian` |
| `file` | yes | Local path to the file to upload |
| `name` | yes | Artifact/package name. Required for `generic`; used to build the `registry-path` output for all types. |
| `version` | yes | Artifact version. Used as `--version` for `generic`; used to build the `registry-path` output for all types. |
| `extra-args` | no | Newline-separated extra CLI arguments appended to the push command |

## Outputs

| Output | Description |
|--------|-------------|
| `registry-path` | `<registry>/<name>@<version>` of the uploaded artifact |

## Example

```yaml
jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install harness CLI
        run: curl -fsSL https://raw.githubusercontent.com/harness/harness-cli/v2/install | sh

      - name: Upload to HAR
        uses: your-org/upload-to-har@v1
        with:
          api-url: https://app.harness.io
          account: ${{ secrets.HARNESS_ACCOUNT_ID }}
          token: ${{ secrets.HARNESS_PAT_TOKEN }}
          registry: my-registry
          type: generic
          file: ./dist/my-artifact.tar.gz
          name: my-artifact
          version: ${{ github.sha }}
```

## Local development

### Install dependencies

```bash
cd upload-to-har
npm install
```

### Run unit tests (offline, no CLI required)

```bash
npm test
```

### Build the action bundle

```bash
npm run build
# produces dist/index.js
```

### Run against a real HAR instance

1. Copy the example env file and fill in real values:

   ```bash
   cp .env.local.example .env.local
   # edit .env.local with your api-url, account, token, registry, etc.
   ```

2. Create a test file to upload:

   ```bash
   echo "hello from upload-to-har test" > /tmp/test-artifact.txt
   ```

3. Build and run against **local** (edit `HAR_API_URL=http://localhost:3000` in `.env.local`):

   ```bash
   npm run build
   bash scripts/run-local.sh
   ```

4. Run against **QA** — edit `.env.local`:

   ```
   HAR_API_URL=https://qa.harness.io
   HAR_ACCOUNT=<your-qa-account-id>
   HAR_TOKEN=<your-qa-pat-token>
   ```

   Then:

   ```bash
   bash scripts/run-local.sh
   ```

### What to look for in the output

**Successful local run:**
```
✓ Credentials validated successfully
✓ Registry configuration fetched successfully
Successfully logged into Harness

Found 1 file(s) (N bytes) to upload to test-artifact/0.0.1 in registry 'my-registry'

RESULT  : SUCCESS (exit 0)
Output  : registry-path=my-registry/test-artifact@0.0.1
API URL : http://localhost:3000
```

**Successful QA run:** Same output but `API URL` shows `https://qa.harness.io`. Confirm the `registry-path` in the output matches what you see in the Harness UI under your registry.

**Common failure indicators:**
- `authentication failed with status 401` — wrong token or account ID
- `authentication failed with status 404` — wrong `api-url` or account ID
- `hc: command not found` — harness CLI not installed
- `no files to upload` — `HAR_FILE` path doesn't exist or is an empty directory

## Architecture notes

- `src/har.ts` — pure logic: `login()`, `buildPushArgs()`, `parsePushOutput()`, `push()`. No `@actions/*` imports, independently unit-testable.
- `src/index.ts` — wires `@actions/core` and `@actions/exec` to `har.ts`.
- `@vercel/ncc` bundles everything into `dist/index.js` so no `node_modules/` needs to be committed.
