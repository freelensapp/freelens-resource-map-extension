# @freelensapp/example-extension

<!-- markdownlint-disable MD013 -->

[![Home](https://img.shields.io/badge/%F0%9F%8F%A0-freelens.app-02a7a0)](https://freelens.app)
[![GitHub](https://img.shields.io/github/stars/freelensapp/freelens?style=flat&label=GitHub%20%E2%AD%90)](https://github.com/freelensapp/freelens)
[![DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/freelensapp/freelens-example-extension)
[![Release](https://img.shields.io/github/v/release/freelensapp/freelens-example-extension?display_name=tag&sort=semver)](https://github.com/freelensapp/freelens-example-extension)
[![Integration tests](https://github.com/freelensapp/freelens-example-extension/actions/workflows/integration-tests.yaml/badge.svg?branch=main)](https://github.com/freelensapp/freelens-example-extension/actions/workflows/integration-tests.yaml)
[![npm](https://img.shields.io/npm/v/@freelensapp/example-extension.svg)](https://www.npmjs.com/package/@freelensapp/example-extension)

<!-- markdownlint-enable MD013 -->

This repository serves as an example how to build and publish extensions for
Freelens application.

Visit wiki page about [creating
extensions](https://github.com/freelensapp/freelens/wiki/Creating-extensions)
for more informations.

## Requirements

- Kubernetes >= 1.24
- Freelens >= 1.6.0

## API supported

- example.freelens.app/v1alpha1

To install Custom Resource Definition for this example run:

```sh
kubectl apply -f examples/crds/customresourcedefinition.yaml
```

Examples provide a resource for test:

```sh
kubectl apply -f examples/test/example.yaml
```

## Install

To install open Freelens and go to Extensions (`ctrl`+`shift`+`E` or
`cmd`+`shift`+`E`), and install `@freelensapp/example-extension`.

or:

Use a following URL in the browser:
[freelens://app/extensions/install/%40freelensapp%2Fexample-extension](freelens://app/extensions/install/%40freelensapp%2Fexample-extension)

## Build from the source

You can build the extension using this repository.

### Prerequisites

Use [NVM](https://github.com/nvm-sh/nvm) or
[mise-en-place](https://mise.jdx.dev/) or
[windows-nvm](https://github.com/coreybutler/nvm-windows) to install the
required Node.js version.

From the root of this repository:

```sh
nvm install
# or
mise install
# or
winget install CoreyButler.NVMforWindows
nvm install 22.16.0
nvm use 22.16.0
```

Install Pnpm:

```sh
corepack install
# or
curl -fsSL https://get.pnpm.io/install.sh | sh -
# or
winget install pnpm.pnpm
```

### Build extension

```sh
pnpm i
pnpm build
pnpm pack
```

One script to build then pack the extension to test:

```sh
pnpm pack:dev
```

### Install built extension

The tarball for the extension will be placed in the current directory. In
Freelens, navigate to the Extensions list and provide the path to the tarball
to be loaded, or drag and drop the extension tarball into the Freelens window.
After loading for a moment, the extension should appear in the list of enabled
extensions.

### Check code statically

```sh
pnpm lint:check
```

or

```sh
pnpm trunk:check
```

and

```sh
pnpm build
pnpm knip:check
```

### Testing the extension with unpublished Freelens

In Freelens working repository:

```sh
rm -f *.tgz
pnpm i
pnpm build
pnpm pack -r
```

then for extension:

```sh
echo "overrides:" >> pnpm-workspace.yaml
for i in ../freelens/*.tgz; do
  name=$(tar zxOf $i package/package.json | jq -r .name)
  echo "  \"$name\": $i" >> pnpm-workspace.yaml
done

pnpm clean:node_modules
pnpm build
```

## License

Copyright (c) 2025 Freelens Authors.

[MIT License](https://opensource.org/licenses/MIT)
