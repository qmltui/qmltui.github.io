# QmlTui Website & WebAssembly Playground (`qmltui/qmltui.github.io`)

Documentation portal (VitePress), Application Showcase gallery, and interactive browser playground (`xterm.js` + CodeMirror 6 + Qt for WebAssembly) for [QmlTui](https://github.com/qmltui/qmltui), published at [qmltui.github.io](https://qmltui.github.io/).

## Repository Responsibilities

- **[`qmltui/qmltui`](https://github.com/qmltui/qmltui)**: Core C++/QML library, `WasmTerminalBackend`, `cmake/QmlTuiWasm.cmake` (`qmltui_wasm_app()`), component gallery (`examples/gallery/`), copyable recipes (`examples/recipes/`), pure GitHub-Flavored Markdown docs (`docs/**/*.md`), and the sidebar manifest (`docs/nav.json`).
- **[`qmltui/apps`](https://github.com/qmltui/apps)**: Thirteen full-scale showcase applications (`qtop`, `agent_stream`, `file_manager`, `package_manager`, `turbo_hex`, `audio_player`, `industrial_plc_hmi`, `container_fleet`, `markdown_viewer`, `plotting_dashboard`, `screensaver`, `snake_game`, `twozero48`) and their recorded `.gif`/`.cast` previews (`docs/assets/casts/`).
- **[`qmltui/qmltui.github.io`](https://github.com/qmltui/qmltui.github.io)** *(this repo)*: VitePress theme and site configuration (`site/`), doc/showcase sync and QML autocomplete index generators (`scripts/sync-docs.mjs`, `scripts/generate-types.mjs`), and the live browser QML Playground (`wasm/`).

## Synchronization & Playground Architecture

- **Zero-config sibling resolution locally**: When checked out alongside `../qmltui` (or `../qml-tui`) and `../apps` (or `../qmltui-apps`), or configured via `QMLTUI_REPO_DIR` / `QMLTUI_APPS_DIR` (and `-DQMLTUI_SOURCE_DIR` for CMake), `scripts/sync-docs.mjs`, `scripts/generate-types.mjs`, and `wasm/CMakeLists.txt` read directly from your local working trees. In CI or standalone clones, `scripts/sync-docs.mjs` shallow-clones `qmltui/qmltui` and `qmltui/apps` into `.cache/` (reused until `.cache/` is deleted).
- **Single-source sidebar (`docs/nav.json`) & deep-link injection**: `scripts/sync-docs.mjs` stages the gitignored `./docs/` workspace by copying `qmltui/docs/nav.json` into `docs/.vitepress/nav.json`, rendering the `site/showcase.md` template into `docs/showcase.md` alongside the 13 GIFs from `qmltui/apps`, inlining `<<<` file snippets, rewriting repo-relative links (`../examples/...`, `contributing/...`) to `https://github.com/qmltui/qmltui/{blob,tree}/<commit>/...`, and injecting `[WebAssembly Playground]` links on gallery examples while keeping raw Markdown in `qmltui/qmltui` free of VitePress-only markup.
- **Playground (`wasm/`)**:
  - `wasm/playground/` builds `qmltui_playground.wasm` linking `QmlTui::Core`, `QmlTui::Controls`, and (by default) `QmlTui::Image`, exposing `qmltuiLoadQml`, `qmltuiCheckQml`, `qmltuiWriteFile`, and `qmltuiSetContextProperty` over Emscripten embind.
  - `wasm/www/` hosts a split-pane CodeMirror 6 editor (`qmltui-playground.js`, borderless QML autocomplete via `qmltui-completion.js` + `types.json`, regenerated from `.qmltypes` via `npm run types`) on the left and an `xterm.js` terminal (`@xterm/addon-unicode-graphemes` `15-graphemes` + OSC 4/10/11 palette sync + OSC 52 clipboard bridge) on the right:
    - **Try It Yourself**: Full root `Terminal {}` applications in `Terminal.AltScreen` (default, or `?code=<base64url>`) and `Terminal.Inline` (`?mode=inline`), plus compressed `#code=<deflate-base64url>` share links.
    - **Gallery Grid**: Interactive component browser (`?mode=gallery`) and per-component live editor (`?example=<Name>.qml`).
    - **Preview fallback**: When `build-wasm` has not been built locally, the terminal pane automatically falls back to recorded component and showcase GIF previews (`wasm=fallback-gif`).
- **Source-tree parity (`wasm-meta.json`)**: `wasm/CMakeLists.txt` writes `build-wasm/www/wasm-meta.json` with `version`, `commit`, and `sourceTreeHash` (SHA-256 of version, `git ls-tree HEAD`, and `git diff HEAD` across `CMakeLists.txt`, `cmake`, `src`, and `examples/gallery`). Verified by `scripts/sync-docs.mjs` when `QMLTUI_REQUIRE_WASM=1` so doc-only commits can reuse cached Wasm builds while catching stale binaries or uncommitted source edits.

## Prerequisites

- **Documentation portal**: Node.js 20+ (CI uses Node 22) and `git`.
- **WebAssembly playground** *(optional for docs-only development)*:
  - CMake 3.21+ and Ninja
  - Qt 6.8+ `wasm_singlethread` kit **plus** a matching desktop host Qt kit of the exact same version (e.g. `gcc_64` on Linux or `macos` on macOS, providing `qmlimportscanner`, `qmlcachegen`, and `Qt6::QmlPrivate`)
  - Matching Emscripten SDK (`emsdk`): `4.0.7` for Qt 6.11, `5.0.5` for Qt 6.12 (`3.1.56` for Qt 6.8, `3.1.70` for Qt 6.9)
  - Python 3 *(optional, required only for the `serve` CMake target)*

## Quickstart

### 1. Local Documentation Development

```bash
npm ci
npm run docs:dev
```

> **Note**: Without `build-wasm`, the embedded playground runs in recorded GIF preview mode. After building `build-wasm` (step 2), re-run `npm run sync` or restart `npm run docs:dev` so `qmltui_playground.{js,wasm}` is staged into `docs/public/playground/`.

### 2. Build the WebAssembly Playground (`build-wasm`)

If you cloned `website` standalone (without a sibling `../qmltui` checkout) and have not run `npm run docs:dev` yet, run `npm run sync` first (or pass `-DQMLTUI_SOURCE_DIR=/path/to/qmltui`) so `qmltui` sources are available in `.cache/qmltui`.

```bash
source ~/emsdk/emsdk_env.sh
~/Qt/6.11.1/wasm_singlethread/bin/qt-cmake -S wasm -B build-wasm -G Ninja \
  -DCMAKE_BUILD_TYPE=MinSizeRel
cmake --build build-wasm --parallel

# Optional: serve the standalone playground at http://localhost:8000/ (requires Python 3)
cmake --build build-wasm --target serve
```

*(Pass `-DQT_HOST_PATH=/path/to/host/qt` only if the matching desktop host Qt kit was not installed alongside `wasm_singlethread`—for example, `-DQT_HOST_PATH=/usr` when using a distro-packaged Wasm kit of the exact same Qt version.)*

When QmlTui's QML API changes, regenerate `wasm/www/types.json` after building `build-wasm` (or a desktop `qmltui` build configured with `-DQMLTUI_ENABLE_IMAGE=ON`):

```bash
npm run types
```

### 3. Build & Preview the Production Static Site Bundle (`./public/`)

```bash
# Root domain (/) — requires a matching build-wasm
QMLTUI_REQUIRE_WASM=1 npm run docs:build
npm run docs:preview

# Subpath deployment (optional, e.g. serving under a custom subpath)
QMLTUI_REQUIRE_WASM=1 VITEPRESS_BASE=/qmltui/ npm run docs:build
VITEPRESS_BASE=/qmltui/ npm run docs:preview

# Docs-only static bundle (uses recorded GIF previews if build-wasm is absent)
npm run docs:build
```

## Configuration Reference

### Environment Variables

| Variable | Description |
| :--- | :--- |
| `QMLTUI_REPO_DIR` | Path to a local `qmltui/qmltui` checkout (overrides `../qmltui`, `../qml-tui`, and `.cache/qmltui`). |
| `QMLTUI_APPS_DIR` | Path to a local `qmltui/apps` checkout (overrides `../apps`, `../qmltui-apps`, and `.cache/qmltui-apps`). |
| `QMLTUI_REF` / `QMLTUI_APPS_REF` | Git branch, tag, or commit SHA cloned into `.cache/` when no local checkout exists (default: `main`). |
| `QMLTUI_REPO_URL` / `QMLTUI_APPS_REPO_URL` | Git clone URLs used when populating `.cache/`. |
| `QMLTUI_GITHUB_URL` / `QMLTUI_APPS_GITHUB_URL` | Base repository URLs used when rewriting source links in staged Markdown. |
| `QMLTUI_WASM_DIR` | Directory searched first for compiled `qmltui_playground.{js,wasm}` artifacts during `npm run sync` (defaults to `build-wasm/www`; note that `wasm/www` only holds static HTML/JS sources). |
| `QMLTUI_REQUIRE_WASM=1` | Fail `sync-docs.mjs` if `qmltui_playground.{js,wasm}` is missing or its `sourceTreeHash` does not match `qmltui`. |
| `QMLTUI_STRICT_SYNC=1` | Fail `sync-docs.mjs` instead of warning when expected Markdown injection patterns do not match. |
| `QMLTUI_BUILD_DIR` | Explicit QmlTui build directory containing `qml/QmlTui/*.qmltypes` for `npm run types`. |
| `VITEPRESS_BASE` | URL base path for `docs:dev`, `docs:build`, and `docs:preview` (defaults to `/`, or the pathname of `CI_PAGES_URL`). |

### CMake Options (`wasm/`)

| Option | Default | Description |
| :--- | :--- | :--- |
| `QMLTUI_SOURCE_DIR` | Auto-detected | Path to the `qmltui/qmltui` source directory. |
| `QMLTUI_WASM_WWW_DIR` | `${CMAKE_BINARY_DIR}/www` | Output directory for `.js`/`.wasm` binaries and playground web assets. |
| `QMLTUI_WASM_PLAYGROUND_IMAGE` | `ON` | Link `QmlTui.Image` (`QtGui` image decoders) into `qmltui_playground.wasm` (`OFF` roughly halves binary size). |
| `QMLTUI_ENABLE_PRIVATE_QT` | `ON` | Enable `Qt6::QmlPrivate` features (`Behavior` and advanced states). |
| `QMLTUI_WASM_INITIAL_MEMORY` | `""` (Qt default) | Override initial WebAssembly linear memory (e.g. `96MB`). |
