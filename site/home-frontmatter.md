---
layout: doc
isHomeOverview: true
pageClass: qmltui-home-page
aside: false
prev: false
next:
  text: Getting Started Tutorial
  link: /getting-started
title: QmlTui
titleTemplate: Retained-Mode Terminal UI Framework for Qt 6

hero:
  name: QmlTui
  text: Retained-Mode QML for the Terminal
  tagline: Build reactive terminal UIs with QML bindings and C++ models on QCoreApplication, without QtQuick, QtGui, or a display server.
  image:
    light: /assets/branding/qmltui_mark_light.svg
    dark: /assets/branding/qmltui_mark.svg
    alt: QmlTui
  actions:
    - theme: brand
      text: Get Started
      link: ./getting-started
    - theme: brand
      text: Try Playground
      link: ./playground
      target: _blank
    - theme: alt
      text: Showcase (12 Apps)
      link: ./showcase
    - theme: alt
      text: Component Gallery
      link: ./playground?mode=gallery
      target: _blank

features:
  - title: Retained QML Scene Graph
    details: Declare layouts, box-drawing borders, and focus chains in QML. Property bindings mark only affected subtrees dirty and diff the resulting cell grid against the previous frame.
    link: ./guides/architecture
    linkText: Architecture
  - title: Shared C++ Models and Views
    details: Drive virtualized ListView, TableView, TreeView, and GridView components from C++ QAbstractItemModel and QSortFilterProxyModel classes on QCoreApplication without QtQuick or QtGui.
    link: ./guides/models
    linkText: Models & views
  - title: Animation and States
    details: Animate cell geometry and colors with NumberAnimation, ColorAnimation, Easing curves, Behavior, and declarative State, StateGroup, and Transition controllers.
    link: ./guides/animation-and-states
    linkText: Animation & states
  - title: AltScreen and Inline Modes
    details: Run full-screen terminal interfaces (Terminal.AltScreen) or inline CLI sessions (Terminal.Inline) that commit history to native terminal scrollback.
    link: ./guides/inline-mode
    linkText: Inline mode
  - title: Headless Testing with Runner
    details: Drive keyboard and mouse input deterministically, step a virtual clock, assert committed text and style snapshots in CTest, and record Asciinema .cast files.
    link: ./guides/testing
    linkText: Testing guide
  - title: Agentic Closed-Loop Workflow
    details: Let coding agents inspect coordinate-ruled UTF-8 frames, SGR styles, virtual-clock animations, and idle paint budgets headlessly on QCoreApplication, with installable agent skills.
    link: ./guides/agentic-development
    linkText: Agentic workflow
---
