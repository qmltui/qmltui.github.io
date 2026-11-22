# Application Showcase

Thirteen full-scale terminal applications built with **QmlTui** and Qt 6, demonstrating both full-screen `Terminal.AltScreen` workspaces and streaming `Terminal.Inline` CLIs. Source code, CMake configuration, and `Runner` test scenarios live in [`qmltui/apps`]({{APPS_REPO_URL}}).

```sh
git clone {{APPS_REPO_URL}}.git
cd apps
cmake -S . -B build -G Ninja
cmake --build build --parallel
ctest --test-dir build -LE Demo --output-on-failure
```

---

## Inline CLI and AI Workflows

Applications that run directly inside your normal shell buffer (`Terminal.Inline`) and commit rich QML cards into native terminal scrollback via [`Scrollback`](qml-types/scrollback.md).

### `agent_stream`

Interactive coding-agent session combining [`Terminal.Inline`](guides/inline-mode.md), [`Scrollback`](qml-types/scrollback.md), slash-command autocomplete, model selector, side-by-side diff inspector, permission prompts, and streaming tool cards.

- **Source**: [`apps/agent_stream`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/agent_stream)

![agent_stream showcase](assets/showcase/agent_stream.gif)

### `package_manager`

Multi-stage `Terminal.Inline` CLI package installer (`qpm`) with an interactive transaction [`TableView`](qml-types/tableview.md), optional feature [`CheckBox`](qml-types/checkbox.md) controls, dependency [`TreeView`](qml-types/treeview.md), 4-worker parallel fetch/build [`ProgressBar`](qml-types/progressbar.md) rows with [`Sparkline`](qml-types/sparkline.md) throughput, expandable compiler log stream, and `Scrollback` receipt cards.

- **Source**: [`apps/package_manager`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/package_manager)

![package_manager showcase](assets/showcase/package_manager.gif)

---

## System and DevOps Dashboards

High-density telemetry dashboards backed by C++ [`QAbstractTableModel`](guides/models.md) and `QSortFilterProxyModel` pipelines, virtualized tables, and sub-cell Braille charts.

### `qtop`

[`btop++`](https://github.com/aristocratos/btop)-inspired UI layout study recreating Braille CPU history graphs ([`Canvas.Braille`](qml-types/canvas.md)), per-core meters, memory and disk bars, network throughput sparklines, a sortable `QAbstractTableModel` process [`TableView`](qml-types/tableview.md), and [`Behavior`](qml-types/behavior.md)-animated panel collapsing in **~770 lines of declarative QML** instead of manual ANSI cursor math.

- **Source**: [`apps/qtop`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/qtop)

![qtop showcase](assets/showcase/qtop.gif)

### `container_fleet`

Container fleet dashboard with [`TableView`](qml-types/tableview.md) column sorting, [`TabBar`](qml-types/tabbar.md) status filters, live search filtering, per-node CPU [`Sparkline`](qml-types/sparkline.md) charts, and a streaming container log drawer.

- **Source**: [`apps/container_fleet`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/container_fleet)

![container_fleet showcase](assets/showcase/container_fleet.gif)

---

## Developer and File Tools

Multi-pane navigation, syntax-highlighted text buffers, offscreen raster/PDF previews, and embedded Unix subshells.

### `file_manager`

Three-column Miller file manager with syntax-highlighted source and Markdown previews, asynchronous [`Image`](qml-types/image.md) / SVG / multi-page PDF rendering (`Auto`, `HalfBlock`, `Braille`, `ASCII`), live filtering, and an integrated [`PtyView`](guides/pty-view.md) shell drawer.

- **Source**: [`apps/file_manager`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/file_manager)

![file_manager showcase](assets/showcase/file_manager.gif)

### `markdown_viewer`

Terminal Markdown document reader powered by `md4qt` AST parsing with syntax-highlighted code blocks, Unicode box tables, heading tree navigation, search highlighting, live style editor, and color themes.

- **Source**: [`apps/markdown_viewer`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/markdown_viewer)

![markdown_viewer showcase](assets/showcase/markdown_viewer.gif)

### `turbo_hex`

IDA `idat`- and Borland Turbo Debugger-inspired multi-window **Hex & Binary Inspector** built on the [`QmlTui.TVision`](https://github.com/qmltui/tvision) MDI add-on module. Synchronizes tileable `BoundedSelfPaint` Hex + ASCII windows with a live Little/Big-Endian Data Inspector, ELF/PNG/ZIP/WASM header & string span highlighting, hex/text search, in-place byte patching, and switchable BIOS palettes.

- **Source**: [`apps/turbo_hex`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/turbo_hex) · **Add-on**: [`qmltui/tvision`](https://github.com/qmltui/tvision)

![turbo_hex showcase](assets/showcase/turbo_hex.gif)

---

## Audio, Plotting, and Industrial HMI

Real-time 60 Hz signal visualization, vector oscilloscopes, and operator consoles built on [`Canvas`](qml-types/canvas.md) and declarative [`State`](qml-types/state.md) alarms.

### `audio_player`

Retained-mode terminal audio player and real-time 24-band FFT spectrum / `Canvas.Braille` stereo oscilloscope visualizer with docked studio decks, playlist editor, ANSI skins, and a procedural synthwave album.

- **Source**: [`apps/audio_player`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/audio_player)

![audio_player showcase](assets/showcase/audio_player.gif)

### `plotting_dashboard`

Real-time vector plotting dashboard with high-resolution `Canvas.Braille` oscilloscope waveforms (sine, square, triangle, sawtooth), frequency and noise modulation, and XY Lissajous phase orbits.

- **Source**: [`apps/plotting_dashboard`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/plotting_dashboard)

![plotting_dashboard showcase](assets/showcase/plotting_dashboard.gif)

### `industrial_plc_hmi`

ISA-101 industrial PLC controller and SCADA HMI operator console featuring rounded [`Panel`](qml-types/panel.md) telemetry gauges, multi-trace `Canvas.Braille` trend scope, animated P&ID reactor mimic, dimmed [`Popup`](qml-types/popup.md) safety interlocks, [`TableView`](qml-types/tableview.md) audit log, modular I/O rack diagnostics, and 3 switchable SCADA skins (`ISA-SLATE`, `AMBER CRT`, `PHOSPHOR`).

- **Source**: [`apps/industrial_plc_hmi`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/industrial_plc_hmi)

![industrial_plc_hmi showcase](assets/showcase/industrial_plc_hmi.gif)

---

## Arcade Games and Demoscene

Sub-cell rendering (`Canvas.HalfBlock` and `Canvas.Braille`), color transitions, and standalone [WebAssembly](guides/webassembly.md) targets (`qmltui_wasm_app()`).

### `screensaver`

Retro demoscene screensaver suite featuring 11 rendering modes (`Canvas.HalfBlock`, `Canvas.Braille`, Unicode box-drawing 3D pipes, ASCII raymarched donut, Conway's Game of Life, Doom Fire, 3D Tesseract, Lorenz attractor) and selectable color palettes.

- **Source**: [`apps/screensaver`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/screensaver)

![screensaver showcase](assets/showcase/screensaver.gif)

### `snake_game`

Classic arcade Snake rendered with half-block subpixel graphics (`Canvas.HalfBlock`), dynamic speed levels, pause overlay, and responsive viewport sizing.

- **Source**: [`apps/snake_game`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/snake_game)

![snake_game showcase](assets/showcase/snake_game.gif)

### `twozero48`

2048 sliding-tile puzzle game with tile color palettes, [`Behavior`](qml-types/behavior.md) color transitions, score tracking, and win/game-over modal overlays.

- **Source**: [`apps/twozero48`]({{APPS_REPO_URL}}/tree/{{APPS_COMMIT}}/apps/twozero48)

![twozero48 showcase](assets/showcase/twozero48.gif)
