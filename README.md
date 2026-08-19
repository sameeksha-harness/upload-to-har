# upload-to-har

[![CI](https://github.com/sameeksha-harness/upload-to-har/actions/workflows/ci.yml/badge.svg)](https://github.com/sameeksha-harness/upload-to-har/actions/workflows/ci.yml)
[![license badge](https://img.shields.io/github/license/sameeksha-harness/upload-to-har)](./LICENSE)

A GitHub Action that uploads artifacts to [Harness Artifact Registry (HAR)](https://developer.harness.io/docs/artifact-registry) using the [Harness CLI (`hc`)](https://github.com/harness/harness-cli).

Supports 16 artifact types: `generic`, `maven`, `rpm`, `npm`, `conda`, `composer`, `go`, `cargo`, `dart`, `python`, `nuget`, `swift`, `puppet`, `debian`, `conan`, and `terraform`.

## Usage

```yaml
- name: Upload to Harness Artifact Registry
  uses: sameeksha-harness/upload-to-har@v1
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

## Examples

### Maven

```yaml
- name: Upload JAR to HAR
  uses: sameeksha-harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-maven-registry
    type: maven
    file: target/my-lib-1.0.0.jar
    pom-file: pom.xml
```

### npm

```yaml
- name: Upload npm package to HAR
  uses: sameeksha-harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-npm-registry
    type: npm
    file: my-package-1.0.0.tgz
```

### Python

```yaml
- name: Upload Python package to HAR
  uses: sameeksha-harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-python-registry
    type: python
    file: dist/my_package-1.0.0-py3-none-any.whl
```

### Using the output

```yaml
- name: Upload to HAR
  id: upload
  uses: sameeksha-harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-registry
    type: generic
    file: ./artifact.tar.gz
    name: my-artifact
    version: 1.0.0

- name: Print registry path
  run: echo "Uploaded to ${{ steps.upload.outputs.registry-path }}"
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-url` | yes | — | Harness API base URL. Pass the bare origin with no trailing slash (e.g. `https://app.harness.io`). |
| `account` | yes | — | Harness account ID. |
| `token` | yes | — | Harness PAT token. Always pass via `${{ secrets.* }}` — the action masks it from logs automatically. |
| `registry` | yes | — | HAR registry name. |
| `type` | yes | — | Artifact type. See [Supported types](#supported-types). |
| `file` | yes | — | Local path to the file (or directory, for `conan`) to upload. |
| `name` | no | `""` | Artifact name. **Required** for `generic` and `swift`. Used to build the `registry-path` output for other types. |
| `version` | no | `""` | Artifact version. **Required** for `generic`, `go`, `swift`, and `terraform` modules. Used to build the `registry-path` output for other types. |
| `pom-file` | no | `""` | Path to the POM file. **Required** for `maven`. |
| `distribution` | no | `""` | Debian distribution (e.g. `focal`, `bullseye`). **Required** for `debian`. |
| `component` | no | `""` | Debian component (e.g. `main`, `contrib`). **Required** for `debian`. |
| `namespace` | no | `""` | Terraform namespace. **Required** for `terraform`. |
| `scope` | no | `""` | Swift scope. **Required** for `swift`. Combined with `name` and `version` as `<scope>/<name>/<version>`. |
| `reference` | no | `""` | Conan reference (e.g. `pkg/1.0.0@user/channel`). **Required** for `conan`. |
| `extra-args` | no | `""` | Newline-separated extra CLI arguments appended to the push command. |
| `hc-version` | no | `v1.3.43` | Harness CLI (`hc`) release tag to install. If another version is already on `PATH`, the action reinstalls the requested pin into a job-local directory. |

## Outputs

| Output | Description |
|--------|-------------|
| `registry-path` | Best-effort path built from **inputs** (not parsed from `hc`). |

Format by type:

| Type | `registry-path` |
|------|-----------------|
| `generic`, `go`, and others when `name`/`version` are set | `<registry>/<name>@<version>` |
| `swift` | `<registry>/<scope>/<name>@<version>` |
| `conan` | `<registry>/<reference>` |
| `terraform` | `<registry>/<namespace>/<name>@<version>` (omits missing parts) |
| metadata-embedded types (`npm`, `maven`, …) without `name`/`version` | often just `<registry>` — pass optional `name`/`version` if you need a fuller output |

## Supported types

> **Source of truth:** `src/types.ts` (`SUPPORTED_TYPES`). Keep this table and `action.yml` in sync when adding types.

| Type | Required inputs | Notes |
|------|----------------|-------|
| `generic` | `name`, `version` | |
| `maven` | `pom-file` | Version is read from the POM. |
| `npm` | — | Version is embedded in the package file. |
| `rpm` | — | Version is embedded in the package file. |
| `conda` | — | Version is embedded in the package file. |
| `composer` | — | Version is embedded in the package file. |
| `cargo` | — | Version is embedded in the package file. |
| `dart` | — | Version is embedded in the package file. |
| `python` | — | Version is embedded in the package file. |
| `nuget` | — | Version is embedded in the package file. |
| `puppet` | — | Version is embedded in the package file. |
| `go` | `version` | |
| `swift` | `scope`, `name`, `version` | Positional arg built as `<scope>/<name>/<version>`. |
| `debian` | `distribution`, `component` | |
| `conan` | `reference` | `file` is the recipe directory. |
| `terraform` | `namespace` | `version` required for modules, optional for providers. |

> **Docker and Helm are not supported.** HAR exposes a standard OCI-compatible endpoint for both — use `docker push` and `helm push` directly.

## Contributing

### Setup

```bash
npm install
```

### Test

```bash
npm test
```

### Build

```bash
npm run build
# Produces dist/index.js — commit alongside source changes.
```

### Architecture

- `src/types.ts` — canonical `SUPPORTED_TYPES` list (keep `action.yml` / README in sync).
- `src/har.ts` — pure logic (`login`, `buildPushArgs`, `buildRegistryPath`, `push`). No `@actions/*` imports, independently unit-testable.
- `src/index.ts` — wires `@actions/core` and `@actions/exec` to `har.ts`.
- `src/install.ts` — installs a pinned `hc` release (`hc-version`, default `v1.3.43`) into a job-local dir when missing or mismatched on `PATH`.
- `@vercel/ncc` bundles everything into `dist/index.js` so `node_modules/` does not need to be committed.
