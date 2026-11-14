# QmlTui Website & WebAssembly Playground (`qmltui/website`)

Documentation portal (VitePress), Application Showcase gallery, and interactive browser playground (`xterm.js` + CodeMirror 6 + Qt for WebAssembly) for [QmlTui](https://github.com/qmltui/qmltui).

## Repository Responsibilities

- **[`qmltui/qmltui`](https://github.com/qmltui/qmltui)**: Core C++/QML library, `WasmTerminalBackend`, `cmake/QmlTuiWasm.cmake` (`qmltui_wasm_app()`), component gallery (`examples/gallery/`), copyable recipes (`examples/recipes/`), pure GitHub-Flavored Markdown docs (`docs/**/*.md`), and the sidebar manifest (`docs/nav.json`).
- **[`qmltui/apps`](https://github.com/qmltui/apps)**: Twelve full-scale showcase applications (`agent_stream`, `package_manager`, `btop`, `container_fleet`, `file_manager`, `markdown_viewer`, `audio_player`, `plotting_dashboard`, `industrial_plc_hmi`, `screensaver`, `snake_game`, `twozero48`) and their recorded `.gif`/`.cast` previews (`docs/assets/casts/`).
- **[`qmltui/website`](https://github.com/qmltui/website)** *(this repo)*: VitePress theme and site configuration (`site/`), doc/showcase sync script (`scripts/sync-docs.mjs`), and the live browser QML Playground (`wasm/`).

## Synchronization & Playground Architecture

- **Zero-config sibling resolution locally**: When checked out alongside `../qml-tui` and `../qmltui-apps` (or via `QMLTUI_REPO_DIR` / `QMLTUI_APPS_DIR`), `scripts/sync-docs.mjs` and `wasm/CMakeLists.txt` read directly from your local working trees. In CI (or standalone clones), `scripts/sync-docs.mjs` shallow-clones `qmltui/qmltui` and `qmltui/apps` into `.cache/`.
- **Single-source sidebar (`docs/nav.json`) & deep-link injection**: `scripts/sync-docs.mjs` copies `qmltui/docs/nav.json` into `docs/.vitepress/nav.json`, renders `site/showcase.md` with the 12 GIFs from `qmltui/apps`, rewrites repo-relative links (`../examples/...`) to `https://github.com/qmltui/qmltui/blob/<commit>/...`, and injects `[WebAssembly Playground]` links on gallery examples while keeping raw Markdown in `qmltui/qmltui` free of VitePress-only markup.
- **Playground (`wasm/`)**:
  - `wasm/playground/` builds `qmltui_playground.wasm` linking `qmltui::core`, `qmltui::controls`, and `qmltui::image`, exposing `qmltuiLoadQml(code, filename)` over Emscripten embind.
  - `wasm/www/` hosts a split-pane CodeMirror 6 editor (`qmltui-playground.js`, borderless QML autocomplete via `qmltui-completion.js` + `types.json`) on the left and an `xterm.js` terminal (`@xterm/addon-unicode-graphemes` `15-graphemes` + OSC 52 clipboard bridge) on the right, supporting both **Try It Yourself** (`Terminal.AltScreen` and `Terminal.Inline`) and **Gallery Grid** (`?mode=gallery` / `?example=<Name>.qml` / `?code=<base64url>`).
- **Atomic SHA parity**: `wasm/CMakeLists.txt` writes `build-wasm/www/wasm-meta.json` with `PROJECT_VERSION` and `git rev-parse HEAD` of `qmltui`, verified by `scripts/sync-docs.mjs` when `QMLTUI_REQUIRE_WASM=1`.

## Quickstart

### 1. Local Documentation Development

```bash
npm install --no-package-lock
npm run docs:dev
```

### 2. Build the WebAssembly Playground (`build-wasm`)

Requires Emscripten (`4.0.7` for Qt 6.11, `5.0.5` for Qt 6.12) and the matching Qt `wasm_singlethread` kit:

```bash
source ~/emsdk/emsdk_env.sh
~/Qt/6.11.1/wasm_singlethread/bin/qt-cmake -S wasm -B build-wasm -G Ninja \
  -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DQT_HOST_PATH=/usr
cmake --build build-wasm --parallel

# Optional: serve the standalone playground at http://localhost:8000/
cmake --build build-wasm --target serve
```

### 3. Build the Production Static Site Bundle (`./public/`)

```bash
# Root domain (/)
QMLTUI_REQUIRE_WASM=1 npm run docs:build

# Subpath deployment (e.g. GitHub Pages at /website/)
QMLTUI_REQUIRE_WASM=1 VITEPRESS_BASE=/website/ npm run docs:build

# Preview the built static site locally
npm run docs:preview
```
