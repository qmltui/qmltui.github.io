#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const siteDir = path.join(websiteRoot, 'site')
const wasmWwwDir = path.join(websiteRoot, 'wasm', 'www')
const stagedDocsDir = path.join(websiteRoot, 'docs')

function resolveQmlTuiRepo() {
  if (process.env.QMLTUI_REPO_DIR) {
    const custom = path.resolve(process.env.QMLTUI_REPO_DIR)
    if (!fs.existsSync(path.join(custom, 'CMakeLists.txt'))) {
      throw new Error(`QMLTUI_REPO_DIR does not contain CMakeLists.txt: ${custom}`)
    }
    return custom
  }

  for (const name of ['qmltui', 'qml-tui']) {
    const sibling = path.resolve(websiteRoot, '..', name)
    if (fs.existsSync(path.join(sibling, 'CMakeLists.txt'))) {
      return sibling
    }
  }

  const cacheRepo = path.join(websiteRoot, '.cache', 'qmltui')
  const repoUrl = process.env.QMLTUI_REPO_URL || 'https://github.com/qmltui/qmltui.git'
  const ref = process.env.QMLTUI_REF || 'main'

  if (!fs.existsSync(path.join(cacheRepo, '.git'))) {
    fs.mkdirSync(path.dirname(cacheRepo), { recursive: true })
    console.log(`[sync-docs] Cloning ${repoUrl} (${ref}) into ${cacheRepo}...`)
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, repoUrl, cacheRepo], {
      stdio: 'inherit'
    })
  }
  return cacheRepo
}

function resolveQmlTuiAppsRepo() {
  if (process.env.QMLTUI_APPS_DIR) {
    const custom = path.resolve(process.env.QMLTUI_APPS_DIR)
    if (fs.existsSync(path.join(custom, 'CMakeLists.txt'))) {
      return custom
    }
  }

  for (const name of ['apps', 'qmltui-apps']) {
    const sibling = path.resolve(websiteRoot, '..', name)
    if (fs.existsSync(path.join(sibling, 'CMakeLists.txt'))) {
      return sibling
    }
  }

  const cacheRepo = path.join(websiteRoot, '.cache', 'qmltui-apps')
  if (fs.existsSync(path.join(cacheRepo, 'CMakeLists.txt'))) {
    return cacheRepo
  }

  const repoUrl = process.env.QMLTUI_APPS_REPO_URL || 'https://github.com/qmltui/apps.git'
  const ref = process.env.QMLTUI_APPS_REF || 'main'
  try {
    fs.mkdirSync(path.dirname(cacheRepo), { recursive: true })
    console.log(`[sync-docs] Cloning ${repoUrl} (${ref}) into ${cacheRepo}...`)
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, repoUrl, cacheRepo], {
      stdio: 'inherit'
    })
    return cacheRepo
  } catch (err) {
    console.warn(`[sync-docs] WARNING: Could not clone ${repoUrl}; showcase GIFs will not be staged locally.`)
    return null
  }
}

function readGitCommit(dir, fallback = 'main') {
  if (!dir) return { commit: fallback, commitShort: fallback }
  try {
    const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    const commitShort = execFileSync('git', ['-C', dir, 'rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8'
    }).trim()
    return { commit, commitShort }
  } catch {
    return { commit: fallback, commitShort: fallback }
  }
}

function computeWasmSourceTreeHash(qmltuiDir, version) {
  try {
    const lsTree = execFileSync(
      'git',
      ['-C', qmltuiDir, 'ls-tree', 'HEAD', 'CMakeLists.txt', 'cmake', 'src', 'examples/gallery'],
      { encoding: 'utf8' }
    ).replace(/\s+$/, '')
    const worktreeDiff = execFileSync(
      'git',
      ['-C', qmltuiDir, 'diff', 'HEAD', '--', 'CMakeLists.txt', 'cmake', 'src', 'examples/gallery'],
      { encoding: 'utf8' }
    ).replace(/\s+$/, '')
    return crypto
      .createHash('sha256')
      .update(`${version}\n${lsTree}\n${worktreeDiff}`)
      .digest('hex')
  } catch {
    return null
  }
}

function readQmlTuiMeta(qmltuiDir, appsDir) {
  const cmakeText = fs.readFileSync(path.join(qmltuiDir, 'CMakeLists.txt'), 'utf8')
  const verMatch = cmakeText.match(/project\(qmltui\s+VERSION\s+([0-9]+\.[0-9]+\.[0-9]+)/)
  const version = verMatch ? verMatch[1] : '0.6.0'

  const { commit, commitShort } = readGitCommit(qmltuiDir, 'main')
  const { commit: appsCommit, commitShort: appsCommitShort } = readGitCommit(appsDir, 'main')
  const sourceTreeHash = computeWasmSourceTreeHash(qmltuiDir, version)

  const repoUrl = (process.env.QMLTUI_GITHUB_URL || 'https://github.com/qmltui/qmltui').replace(
    /\/+$/,
    ''
  )
  const appsRepoUrl = (process.env.QMLTUI_APPS_GITHUB_URL || 'https://github.com/qmltui/apps').replace(
    /\/+$/,
    ''
  )

  return {
    version,
    commit,
    commitShort,
    sourceTreeHash,
    repoUrl,
    qmltuiDir,
    appsDir,
    appsCommit,
    appsCommitShort,
    appsRepoUrl
  }
}

const REPO_ROOT_PATH_RE =
  /^(?:\.agents\/|\.github\/|\.githooks\/|\.clang-format$|\.qmlformat\.ini$|\.qmlls\.ini$|cmake\/|examples\/|LICENSES\/|scripts\/|src\/|tests\/|tools\/|AGENTS\.md$|CLA\.md$|CMakeLists\.txt$|CONTRIBUTING\.md$|jsconfig\.json$|LICENSE(?:\.md)?$|README\.md$|REUSE\.toml$|THIRD-PARTY\.md$)/

function replaceExpected(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement)
  if (next === text) {
    const msg = `Expected pattern did not match in ${label}`
    if (process.env.QMLTUI_STRICT_SYNC === '1') {
      throw new Error(`[sync-docs] ${msg}`)
    }
    console.warn(`[sync-docs] WARNING: ${msg}`)
  }
  return next
}

function rewriteRepoRelativeLinks(markdown, relFileDir, meta) {
  const withSnippets = markdown.replace(
    /^<<<\s+([^\s{]+)(?:\{([^}]+)\})?\s*$/gm,
    (full, relSnippetPath, lang = 'qml') => {
      const resolvedFromDocs = path.posix.normalize(path.posix.join(relFileDir, relSnippetPath))
      const repoRel = resolvedFromDocs.replace(/^(\.\.\/)+/, '')
      const absSnippet = path.join(meta.qmltuiDir, repoRel)
      if (fs.existsSync(absSnippet)) {
        const snippetCode = fs.readFileSync(absSnippet, 'utf8').trimEnd()
        return `\`\`\`${lang}\n${snippetCode}\n\`\`\``
      }
      return full
    }
  )

  return withSnippets.replace(/(\[[^\]]+\]\()([^)]+)(\))/g, (full, prefix, rawUrl, suffix) => {
    const trimmed = rawUrl.trim()
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('#') || trimmed.startsWith('/')) {
      if (/^#\d/.test(trimmed)) {
        return `${prefix}#_${trimmed.slice(1)}${suffix}`
      }
      return full
    }
    const [pathname, hashPart] = trimmed.split('#')
    const resolvedFromDocs = path.posix.normalize(path.posix.join(relFileDir, pathname))
    if (resolvedFromDocs === 'contributing' || resolvedFromDocs.startsWith('contributing/')) {
      const repoRel = `docs/${resolvedFromDocs}`
      const targetPath = path.join(meta.qmltuiDir, repoRel)
      const isDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
      const kind = isDir ? 'tree' : 'blob'
      const hash = hashPart ? `#${hashPart}` : ''
      return `${prefix}${meta.repoUrl}/${kind}/${meta.commit}/${repoRel}${hash}${suffix}`
    }
    if (resolvedFromDocs.startsWith('../')) {
      const repoRel = resolvedFromDocs.replace(/^(\.\.\/)+/, '')
      const targetPath = path.join(meta.qmltuiDir, repoRel)
      if (REPO_ROOT_PATH_RE.test(repoRel) || fs.existsSync(targetPath)) {
        const isDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
        const kind = isDir ? 'tree' : 'blob'
        const hash = hashPart ? `#${hashPart}` : ''
        return `${prefix}${meta.repoUrl}/${kind}/${meta.commit}/${repoRel}${hash}${suffix}`
      }
    }
    if (hashPart && /^\d/.test(hashPart)) {
      return `${prefix}${pathname}#_${hashPart}${suffix}`
    }
    return full
  })
}

function injectPortalPlaygroundLinks(content, relPath) {
  if (relPath.startsWith('qml-types/') && relPath !== 'qml-types/index.md') {
    if (relPath === 'qml-types/scrollback.md') {
      return replaceExpected(
        content,
        '(`./build/examples/recipes/inline_repl/qmltui_inline_repl_demo`).',
        '(`./build/examples/recipes/inline_repl/qmltui_inline_repl_demo`, or try `Terminal.Inline` in the [WebAssembly Playground](../playground.md?mode=inline)).',
        'qml-types/scrollback.md recipe link'
      )
    }
    if (relPath === 'qml-types/terminal.md') {
      return replaceExpected(
        content,
        /(\[`examples\/gallery\/Main\.qml`\]\([^)]+\))\./,
        '$1, or run a root `Terminal` live in the [WebAssembly Playground](../playground.md).',
        'qml-types/terminal.md example link'
      )
    }
    return content.replace(
      /\(`\.\/build\/examples\/gallery\/qmltui_gallery --example ([A-Za-z0-9_]+)`\)\./g,
      (full, exampleName) => {
        if (exampleName === 'PtyView') return full
        return `(\`./build/examples/gallery/qmltui_gallery --example ${exampleName}\`, or open in the [WebAssembly Playground](../playground.md?example=${exampleName}.qml)).`
      }
    )
  }

  if (relPath === 'examples.md') {
    let out = replaceExpected(
      content,
      '![QmlTui Interactive Gallery](assets/casts/gallery-tour.gif)',
      '![QmlTui Interactive Gallery](assets/casts/gallery-tour.gif)\n\nYou can also write a complete `Terminal { ... }` application in the browser using the [Try It Yourself Playground](playground.md), browse all interactive components in the [WebAssembly Component Gallery](playground.md?mode=gallery), or inspect the 13 full-scale applications on the [Application Showcase](showcase.md) page.',
      'examples.md gallery intro'
    )
    out = replaceExpected(
      out,
      '| Example | Source File | CLI Command | QML Reference | Recording |\n| :--- | :--- | :--- | :--- | :--- |',
      '| Example | Source File | CLI Command | QML Reference | Playground | Recording |\n| :--- | :--- | :--- | :--- | :--- | :--- |',
      'examples.md table header'
    )
    out = replaceExpected(
      out,
      /^(\|\s*\*\*([A-Za-z0-9_]+)\*\*\s*\|[^|\n]+\|\s*`--example ([A-Za-z0-9_]+)`\s*\|[^|\n]+\|)(\s*(?:\[GIF\]\([^)]+\)|-)\s*\|)$/gm,
      (_full, prefixCols, _label, exampleName, recordingCol) => {
        const pgCell =
          exampleName === 'PtyView'
            ? ' POSIX only |'
            : ` [Open](playground.md?example=${exampleName}.qml) |`
        return `${prefixCols}${pgCell}${recordingCol}`
      },
      'examples.md table rows'
    )
    return out
  }

  if (relPath === 'getting-started.md') {
    let out = replaceExpected(
      content,
      /https:\/\/qmltui\.github\.io\/website\/playground\.html/g,
      'playground.md',
      'getting-started.md playground URLs'
    )
    out = replaceExpected(
      out,
      'and showcase apps in [qmltui/apps](https://github.com/qmltui/apps).',
      'and 13 full-scale apps on the [Application Showcase](showcase.md) page (source in [qmltui/apps](https://github.com/qmltui/apps)).',
      'getting-started.md showcase link'
    )
    return out
  }

  return content
}

function copyDocsMarkdown(srcRoot, dstRoot, meta, relDir = '') {
  const entries = fs.readdirSync(path.join(srcRoot, relDir), { withFileTypes: true })
  for (const entry of entries) {
    const relPath = relDir ? path.posix.join(relDir, entry.name) : entry.name
    if (
      relPath === 'contributing' ||
      relPath.startsWith('contributing/') ||
      relPath === '.vitepress' ||
      relPath === 'node_modules' ||
      relPath === 'public' ||
      relPath === 'assets' ||
      relPath === 'nav.json' ||
      relPath === 'package.json' ||
      relPath === 'package-lock.json'
    ) {
      continue
    }

    const srcPath = path.join(srcRoot, relPath)
    const dstPath = path.join(dstRoot, relPath)

    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true })
      copyDocsMarkdown(srcRoot, dstRoot, meta, relPath)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let content = fs.readFileSync(srcPath, 'utf8')
      content = rewriteRepoRelativeLinks(content, relDir || '.', meta)
      content = injectPortalPlaygroundLinks(content, relPath)
      fs.mkdirSync(path.dirname(dstPath), { recursive: true })
      fs.writeFileSync(dstPath, content, 'utf8')
    }
  }
}

function upgradeHomeReadme(rawReadmePath, homeFrontmatter, meta) {
  if (!fs.existsSync(rawReadmePath)) return
  let readmeBody = fs.readFileSync(rawReadmePath, 'utf8')
  readmeBody = readmeBody.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '')
  readmeBody = readmeBody.replace(/^#\s+[^\r\n]+\r?\n+/, '')
  // Strip the static lead paragraph that duplicates the VitePress hero tagline
  readmeBody = readmeBody.replace(/^\*\*QmlTui\*\* is a retained-mode[\s\S]*?\r?\n\r?\n/, '')

  // Inject a live Hello, World! QML block read directly from examples/helloworld/Main.qml
  // so homepage visitors see real QML (with an automatic "▶ Try in Playground" button)
  // between <HomeShowcase /> and the Interactive Component Gallery GIF.
  if (!readmeBody.includes('## Hello, World!')) {
    const helloQmlPath = path.join(meta.qmltuiDir, 'examples', 'helloworld', 'Main.qml')
    if (fs.existsSync(helloQmlPath)) {
      const helloQml = fs.readFileSync(helloQmlPath, 'utf8').trimEnd()
      const helloUrl = `${meta.repoUrl}/blob/${meta.commit}/examples/helloworld/Main.qml`
      const helloSection =
        `## Hello, World!\n\n` +
        `Every QmlTui application starts with a root [\`Terminal\`](qml-types/terminal.md) item. ` +
        `Click **▶ Try in Playground** on [\`examples/helloworld/Main.qml\`](${helloUrl}) below to edit and run it in your browser, ` +
        `or follow the [Getting Started Tutorial](getting-started.md) to build a native CMake binary:\n\n` +
        `\`\`\`qml\n${helloQml}\n\`\`\`\n\n`
      readmeBody = replaceExpected(
        readmeBody,
        '## Interactive Component Gallery',
        `${helloSection}## Interactive Component Gallery`,
        'README.md Hello, World! injection anchor'
      )
    }
  }

  readmeBody = replaceExpected(
    readmeBody,
    'Browse 45 interactive controls, views, layouts, animations, and terminal capabilities in `qmltui_gallery`:\n\n![QmlTui Interactive Component Gallery](assets/casts/gallery-tour.gif)',
    'Browse 45 interactive controls, views, layouts, animations, and terminal capabilities in the component gallery. **[▶ Try the Component Gallery live in your browser](playground.md?mode=gallery)** or open the **[Try It Yourself Playground](playground.md)** to edit and run QML directly via WebAssembly:\n\n[![QmlTui Interactive Component Gallery](assets/casts/gallery-tour.gif)](playground.md?mode=gallery)',
    'README.md gallery section'
  )

  readmeBody = replaceExpected(
    readmeBody,
    'and 13 complete showcase applications (`qtop`, `agent_stream`, `file_manager`, `package_manager`, `turbo_hex`, `audio_player`, and more) in [qmltui/apps](https://github.com/qmltui/apps).',
    'and 13 complete applications on the [Application Showcase](showcase.md) page (source in [qmltui/apps](https://github.com/qmltui/apps)).',
    'README.md showcase link'
  )

  fs.writeFileSync(rawReadmePath, `${homeFrontmatter}\n\n${readmeBody.trimStart()}`, 'utf8')
}

function stageDocs() {
  const qmltuiDir = resolveQmlTuiRepo()
  const appsDir = resolveQmlTuiAppsRepo()
  const srcDocsDir = path.join(qmltuiDir, 'docs')
  const meta = readQmlTuiMeta(qmltuiDir, appsDir)

  // Clean and recreate staged ./docs directory
  fs.rmSync(stagedDocsDir, { recursive: true, force: true })
  fs.mkdirSync(stagedDocsDir, { recursive: true })

  // 1. Copy Markdown docs from qmltui/docs/
  copyDocsMarkdown(srcDocsDir, stagedDocsDir, meta)

  // 2. Stage showcase GIFs from qmltui-apps if available
  let showcaseGifsCount = 0
  if (appsDir) {
    const appsCastsSrc = path.join(appsDir, 'docs', 'assets', 'casts')
    if (fs.existsSync(appsCastsSrc)) {
      const gifFiles = fs.readdirSync(appsCastsSrc).filter((f) => f.endsWith('.gif')).sort()
      for (const dst of [
        path.join(stagedDocsDir, 'assets', 'showcase'),
        path.join(stagedDocsDir, 'public', 'assets', 'showcase')
      ]) {
        fs.mkdirSync(dst, { recursive: true })
        for (const gif of gifFiles) {
          fs.copyFileSync(path.join(appsCastsSrc, gif), path.join(dst, gif))
        }
      }
      showcaseGifsCount = gifFiles.length
    }
  }

  // 3. Construct README.md / index.md with VitePress home hero frontmatter
  const homeFrontmatter = fs.readFileSync(path.join(siteDir, 'home-frontmatter.md'), 'utf8').trim()
  upgradeHomeReadme(path.join(stagedDocsDir, 'README.md'), homeFrontmatter, meta)

  // 4. Copy site/playground.md, site/showcase.md, site/.vitepress/, and qmltui/docs/nav.json
  fs.copyFileSync(path.join(siteDir, 'playground.md'), path.join(stagedDocsDir, 'playground.md'))

  const showcaseTemplate = fs.readFileSync(path.join(siteDir, 'showcase.md'), 'utf8')
  const renderedShowcase = showcaseTemplate
    .replaceAll('{{APPS_REPO_URL}}', meta.appsRepoUrl)
    .replaceAll('{{APPS_COMMIT}}', meta.appsCommit)
  fs.writeFileSync(path.join(stagedDocsDir, 'showcase.md'), renderedShowcase, 'utf8')

  fs.cpSync(path.join(siteDir, '.vitepress'), path.join(stagedDocsDir, '.vitepress'), {
    recursive: true
  })

  const navJsonSrc = path.join(srcDocsDir, 'nav.json')
  if (fs.existsSync(navJsonSrc)) {
    fs.copyFileSync(navJsonSrc, path.join(stagedDocsDir, '.vitepress', 'nav.json'))
  }

  // 5. Stage recorded GIFs and branding SVGs into ./docs/assets/ and ./docs/public/assets/
  const castsSrc = path.join(srcDocsDir, 'assets', 'casts')
  if (fs.existsSync(castsSrc)) {
    for (const dst of [
      path.join(stagedDocsDir, 'assets', 'casts'),
      path.join(stagedDocsDir, 'public', 'assets', 'casts')
    ]) {
      fs.cpSync(castsSrc, dst, {
        recursive: true,
        filter: (src) => fs.statSync(src).isDirectory() || src.endsWith('.gif')
      })
    }
  }

  const brandingSrc = path.join(srcDocsDir, 'assets', 'branding')
  if (fs.existsSync(brandingSrc)) {
    for (const dst of [
      path.join(stagedDocsDir, 'assets', 'branding'),
      path.join(stagedDocsDir, 'public', 'assets', 'branding')
    ]) {
      fs.cpSync(brandingSrc, dst, {
        recursive: true,
        filter: (src) =>
          fs.statSync(src).isDirectory() || src.endsWith('.svg') || src.endsWith('.png')
      })
    }
  }

  // 6. Stage WebAssembly playground HTML/JS/types + gallery QML files
  const playgroundOut = path.join(stagedDocsDir, 'public', 'playground')
  const examplesOut = path.join(playgroundOut, 'examples')
  fs.mkdirSync(examplesOut, { recursive: true })

  for (const file of ['index.html', 'qmltui-playground.js', 'qmltui-completion.js', 'types.json']) {
    const src = path.join(wasmWwwDir, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(playgroundOut, file))
    }
  }

  const galleryDir = path.join(qmltuiDir, 'examples', 'gallery')
  if (fs.existsSync(galleryDir)) {
    const mainQml = path.join(galleryDir, 'Main.qml')
    if (fs.existsSync(mainQml)) {
      fs.copyFileSync(mainQml, path.join(playgroundOut, 'gallery.qml'))
    }
    const galleryExamplesDir = path.join(galleryDir, 'examples')
    if (fs.existsSync(galleryExamplesDir)) {
      const qmlFiles = fs
        .readdirSync(galleryExamplesDir)
        .filter((f) => f.endsWith('.qml') && f !== 'PtyView.qml')
        .sort()
      for (const file of qmlFiles) {
        fs.copyFileSync(path.join(galleryExamplesDir, file), path.join(examplesOut, file))
      }
      fs.writeFileSync(path.join(examplesOut, 'index.json'), JSON.stringify(qmlFiles))
    }
  }

  // 7. Stage prebuilt Qt for WebAssembly playground binary if available
  if (process.env.QMLTUI_WASM_DIR) {
    const customWasmDir = path.resolve(process.env.QMLTUI_WASM_DIR)
    const hasCustomWasm =
      fs.existsSync(path.join(customWasmDir, 'qmltui_playground.js')) &&
      fs.existsSync(path.join(customWasmDir, 'qmltui_playground.wasm'))
    if (!hasCustomWasm) {
      const hint =
        customWasmDir === wasmWwwDir
          ? ' (wasm/www holds static HTML/JS sources; compiled Wasm binaries are output to build-wasm/www)'
          : ''
      const msg = `QMLTUI_WASM_DIR does not contain compiled qmltui_playground.js/.wasm: ${customWasmDir}${hint}`
      if (process.env.QMLTUI_REQUIRE_WASM === '1') {
        throw new Error(msg)
      }
      console.warn(`[sync-docs] WARNING: ${msg}`)
    }
  }

  const wasmCandidates = [
    process.env.QMLTUI_WASM_DIR && path.resolve(process.env.QMLTUI_WASM_DIR),
    path.join(websiteRoot, 'build-wasm', 'www'),
    path.join(websiteRoot, 'build-wasm', 'playground'),
    path.join(websiteRoot, 'build-wasm'),
    path.join(qmltuiDir, 'build-wasm', 'www')
  ].filter(Boolean)

  let wasmFound = false
  for (const cand of wasmCandidates) {
    if (
      fs.existsSync(path.join(cand, 'qmltui_playground.js')) &&
      fs.existsSync(path.join(cand, 'qmltui_playground.wasm'))
    ) {
      for (const art of [
        'qmltui_playground.js',
        'qmltui_playground.wasm',
        'qtloader.js',
        'wasm-meta.json'
      ]) {
        const artPath = path.join(cand, art)
        if (fs.existsSync(artPath)) {
          fs.copyFileSync(artPath, path.join(playgroundOut, art))
        }
      }
      const wasmMetaPath = path.join(cand, 'wasm-meta.json')
      if (fs.existsSync(wasmMetaPath)) {
        try {
          const wasmMeta = JSON.parse(fs.readFileSync(wasmMetaPath, 'utf8'))
          const treeMismatch =
            wasmMeta.sourceTreeHash && meta.sourceTreeHash
              ? wasmMeta.sourceTreeHash !== meta.sourceTreeHash
              : Boolean(wasmMeta.commit && meta.commit && wasmMeta.commit !== meta.commit)
          if (treeMismatch) {
            const detail =
              wasmMeta.commit && meta.commit && wasmMeta.commit === meta.commit
                ? `uncommitted worktree changes on ${meta.commitShort}`
                : `wasm=${wasmMeta.commitShort || 'unknown'} vs qmltui=${meta.commitShort}`
            const msg = `Wasm binary inputs differ from current QmlTui sources (${detail}). Rebuild build-wasm.`
            if (process.env.QMLTUI_REQUIRE_WASM === '1') {
              throw new Error(msg)
            }
            console.warn(`[sync-docs] WARNING: ${msg}`)
          }
        } catch (err) {
          if (process.env.QMLTUI_REQUIRE_WASM === '1') throw err
        }
      }
      wasmFound = true
      break
    }
  }

  if (process.env.QMLTUI_REQUIRE_WASM === '1' && !wasmFound) {
    throw new Error(
      'QMLTUI_REQUIRE_WASM=1 is set, but compiled qmltui_playground.js/.wasm was not found in build-wasm/www. Build it first with qt-cmake -S wasm -B build-wasm && cmake --build build-wasm --parallel (or omit QMLTUI_REQUIRE_WASM=1 for GIF preview mode).'
    )
  }

  // 8. Write build-meta.json into staged docs/.vitepress/
  const buildMeta = {
    version: meta.version,
    commit: meta.commit,
    commitShort: meta.commitShort,
    repoUrl: meta.repoUrl,
    appsRepoUrl: meta.appsRepoUrl,
    appsCommit: meta.appsCommit,
    showcaseStaged: showcaseGifsCount > 0,
    wasmStaged: wasmFound
  }
  fs.writeFileSync(
    path.join(stagedDocsDir, '.vitepress', 'build-meta.json'),
    JSON.stringify(buildMeta, null, 2) + '\n',
    'utf8'
  )

  console.log(
    `[sync-docs] Synced docs from ${qmltuiDir} (v${meta.version} @ ${meta.commitShort}, showcaseGifs=${showcaseGifsCount}, wasm=${wasmFound ? 'yes' : 'fallback-gif'})`
  )
}

stageDocs()
