# upload-to-har

[![CI](https://github.com/harness/upload-to-har/actions/workflows/ci.yml/badge.svg)](https://github.com/harness/upload-to-har/actions/workflows/ci.yml)
[![license badge](https://img.shields.io/github/license/harness/upload-to-har)](./LICENSE)

A GitHub Action that uploads a local file to [Harness Artifact Registry (HAR)](https://developer.harness.io/docs/artifact-registry) using the [harness CLI (`hc`)](https://github.com/harness/harness-cli).

Supports 16 artifact types: `generic`, `maven`, `rpm`, `npm`, `conda`, `composer`, `go`, `cargo`, `dart`, `python`, `nuget`, `swift`, `puppet`, `debian`, `conan`, `terraform`.

## Examples

### Generic

```yaml
- name: Upload to HAR
  uses: harness/upload-to-har@v1
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

### Maven

```yaml
- name: Upload to HAR
  uses: harness/upload-to-har@v1
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
- name: Upload to HAR
  uses: harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-npm-registry
    type: npm
    file: my-package-1.0.0.tgz
```

### Debian

```yaml
- name: Upload to HAR
  uses: harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-debian-registry
    type: debian
    file: my-package_1.0.0_amd64.deb
    distribution: focal
    component: main
```

### Terraform module

```yaml
- name: Upload to HAR
  uses: harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-terraform-registry
    type: terraform
    file: my-module.tar.gz
    namespace: my-org
    version: 1.2.0
```

### Swift

```yaml
- name: Upload to HAR
  uses: harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-swift-registry
    type: swift
    file: my-package.zip
    scope: my-org
    name: my-lib
    version: 1.0.0
```

### Conan

```yaml
- name: Upload to HAR
  uses: harness/upload-to-har@v1
  with:
    api-url: https://app.harness.io
    account: ${{ secrets.HARNESS_ACCOUNT_ID }}
    token: ${{ secrets.HARNESS_PAT_TOKEN }}
    registry: my-conan-registry
    type: conan
    file: ./recipe          # recipe directory
    reference: mylib/1.0.0@user/stable
```

### Using the output

```yaml
- name: Upload to HAR
  id: upload
  uses: harness/upload-to-har@v1
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
| `api-url` | yes | — | Harness API base URL. Pass the bare origin — no trailing slash (`https://app.harness.io`, `https://qa.harness.io`). |
| `account` | yes | — | Harness account ID. |
| `token` | yes | — | Harness PAT token. Always pass via `${{ secrets.* }}` — the action masks it from logs. |
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

## Outputs

| Output | Description |
|--------|-------------|
| `registry-path` | Path of the uploaded artifact in the format `<registry>/<name>@<version>`. Falls back gracefully when `name` or `version` are not provided (e.g. types where they are embedded in the package file). |

## Supported types

| Type | Notes |
|------|-------|
| `generic` | Requires `name` and `version`. |
| `maven` | Requires `pom-file`. Version is read from the POM. |
| `npm` | Version is embedded in the package file. |
| `rpm` | Version is embedded in the package file. |
| `conda` | Version is embedded in the package file. |
| `composer` | Version is embedded in the package file. |
| `cargo` | Version is embedded in the package file. |
| `dart` | Version is embedded in the package file. |
| `python` | Version is embedded in the package file. |
| `nuget` | Version is embedded in the package file. |
| `puppet` | Version is embedded in the package file. |
| `go` | Requires `version`. |
| `swift` | Requires `scope`, `name`, and `version`. |
| `debian` | Requires `distribution` and `component`. |
| `conan` | Requires `reference`. `file` is the recipe directory. |
| `terraform` | Requires `namespace`. `version` is required for modules, optional for providers. |

> **Docker and Helm are not supported.** HAR exposes a standard OCI-compatible registry endpoint for Docker images (`docker push <registry-url>/image:tag`) and Helm charts (`helm push chart.tgz oci://<registry-url>`). Use those native tools directly — no `upload-to-har` step needed.

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
# produces dist/index.js — commit this alongside source changes
```

### Architecture

- `src/har.ts` — pure logic: `login()`, `buildPushArgs()`, `parsePushOutput()`, `push()`. No `@actions/*` imports, independently unit-testable.
- `src/index.ts` — wires `@actions/core` and `@actions/exec` to `har.ts`.
- `src/install.ts` — automatically installs `hc` at the start of each run if it is not already on `PATH`. No manual install step needed in your workflow.
- `@vercel/ncc` bundles everything into `dist/index.js` so `node_modules/` does not need to be committed.
