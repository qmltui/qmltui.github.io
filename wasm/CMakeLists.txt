# QmlTui in the browser: the component gallery and live QML playground.
# Builds the QmlTui library from QMLTUI_SOURCE_DIR and the playground runtime
# (playground/), copies the gallery QML files next to it, and writes wasm-meta.json.
#
#   source ~/emsdk/emsdk_env.sh
#   <Qt>/wasm_singlethread/bin/qt-cmake -S wasm -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=MinSizeRel
#   cmake --build build-wasm
#   cmake --build build-wasm --target serve        # http://localhost:8000/
cmake_minimum_required(VERSION 3.21)
project(qmltuiWasmPlayground LANGUAGES CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure this project with the Qt for WebAssembly kit's qt-cmake.")
endif()

if(NOT DEFINED QMLTUI_SOURCE_DIR)
    if(DEFINED ENV{QMLTUI_REPO_DIR} AND EXISTS "$ENV{QMLTUI_REPO_DIR}/CMakeLists.txt")
        set(_default_qmltui_dir "$ENV{QMLTUI_REPO_DIR}")
    elseif(EXISTS "${CMAKE_CURRENT_LIST_DIR}/../../qml-tui/CMakeLists.txt")
        set(_default_qmltui_dir "${CMAKE_CURRENT_LIST_DIR}/../../qml-tui")
    else()
        set(_default_qmltui_dir "${CMAKE_CURRENT_LIST_DIR}/../.cache/qmltui")
    endif()
    get_filename_component(_default_qmltui_dir "${_default_qmltui_dir}" ABSOLUTE)
    set(QMLTUI_SOURCE_DIR "${_default_qmltui_dir}" CACHE PATH "Path to the qmltui repository")
endif()

if(NOT EXISTS "${QMLTUI_SOURCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "QmlTui source directory not found at '${QMLTUI_SOURCE_DIR}'. "
                        "Pass -DQMLTUI_SOURCE_DIR=/path/to/qmltui or run 'npm run sync' first.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Core Qml)
qt_standard_project_setup(REQUIRES 6.8)

set(QMLTUI_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(QMLTUI_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(QMLTUI_BUILD_BENCHMARKS OFF CACHE BOOL "" FORCE)
set(QMLTUI_ENABLE_RUNNER OFF CACHE BOOL "" FORCE)
set(QMLTUI_ENABLE_PTYVIEW OFF CACHE BOOL "" FORCE)
option(QMLTUI_ENABLE_PRIVATE_QT "Private Qt features: Behavior and advanced states (needs Qt QmlPrivate)" ON)
option(QMLTUI_WASM_PLAYGROUND_IMAGE "Link QmlTui.Image into the playground binary" ON)
option(QMLTUI_ENABLE_IMAGE "Build the optional QmlTui Image module (requires Qt Gui and Network)" ${QMLTUI_WASM_PLAYGROUND_IMAGE})

set(QMLTUI_WASM_WWW_DIR "${CMAKE_BINARY_DIR}/www" CACHE PATH
    "Directory that holds the .js/.wasm artifacts and the playground page")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${QMLTUI_WASM_WWW_DIR}")

add_subdirectory("${QMLTUI_SOURCE_DIR}" qmltui)
add_subdirectory(playground)

foreach(page index.html qmltui-playground.js qmltui-completion.js types.json)
    configure_file("${CMAKE_CURRENT_SOURCE_DIR}/www/${page}" "${QMLTUI_WASM_WWW_DIR}/${page}" COPYONLY)
endforeach()
configure_file("${CMAKE_CURRENT_SOURCE_DIR}/www/index.html" "${QMLTUI_WASM_WWW_DIR}/qmltui_playground.html" COPYONLY)

find_package(Python3 COMPONENTS Interpreter QUIET)
if(Python3_Interpreter_FOUND AND NOT TARGET serve)
    add_custom_target(serve
        COMMAND "${Python3_EXECUTABLE}" -m http.server 8000 --directory "${QMLTUI_WASM_WWW_DIR}"
        USES_TERMINAL VERBATIM
        COMMENT "Serving ${QMLTUI_WASM_WWW_DIR} at http://localhost:8000/"
    )
endif()

configure_file("${QMLTUI_SOURCE_DIR}/examples/gallery/Main.qml" "${QMLTUI_WASM_WWW_DIR}/gallery.qml" COPYONLY)
file(GLOB gallery_examples CONFIGURE_DEPENDS "${QMLTUI_SOURCE_DIR}/examples/gallery/examples/*.qml")
if(NOT QMLTUI_ENABLE_PRIVATE_QT)
    list(FILTER gallery_examples EXCLUDE REGEX "/Behavior\\.qml$")
endif()
if(NOT QMLTUI_WASM_PLAYGROUND_IMAGE OR NOT QMLTUI_ENABLE_IMAGE)
    list(FILTER gallery_examples EXCLUDE REGEX "/(Image|AnimatedSprite)\\.qml$")
endif()
if(NOT QMLTUI_ENABLE_PTYVIEW)
    list(FILTER gallery_examples EXCLUDE REGEX "/PtyView\\.qml$")
endif()
set(example_index "")
foreach(example IN LISTS gallery_examples)
    get_filename_component(name "${example}" NAME)
    configure_file("${example}" "${QMLTUI_WASM_WWW_DIR}/examples/${name}" COPYONLY)
    string(APPEND example_index "\"${name}\", ")
endforeach()
string(REGEX REPLACE ", $" "" example_index "${example_index}")
file(WRITE "${QMLTUI_WASM_WWW_DIR}/examples/index.json" "[${example_index}]\n")

# Stamp version, git commit SHA, and Wasm input tree hash of QMLTUI_SOURCE_DIR
# into wasm-meta.json at configure time and on every qmltui_playground build.
set(_stamp_wasm_meta_script "${CMAKE_CURRENT_BINARY_DIR}/stamp_wasm_meta.cmake")
file(WRITE "${_stamp_wasm_meta_script}" [=[
file(READ "${QMLTUI_SOURCE_DIR}/CMakeLists.txt" _qmltui_cmake_text)
string(REGEX MATCH "project\\(qmltui[ \t\r\n]+VERSION[ \t\r\n]+([0-9]+\\.[0-9]+\\.[0-9]+)" _ver_match "${_qmltui_cmake_text}")
set(_qmltui_version "${CMAKE_MATCH_1}")
if(NOT _qmltui_version)
    set(_qmltui_version "0.6.0")
endif()

execute_process(
    COMMAND git -C "${QMLTUI_SOURCE_DIR}" rev-parse HEAD
    OUTPUT_VARIABLE _qmltui_commit
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)
execute_process(
    COMMAND git -C "${QMLTUI_SOURCE_DIR}" rev-parse --short=7 HEAD
    OUTPUT_VARIABLE _qmltui_commit_short
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)
execute_process(
    COMMAND git -C "${QMLTUI_SOURCE_DIR}" ls-tree HEAD CMakeLists.txt cmake src examples/gallery
    OUTPUT_VARIABLE _qmltui_ls_tree
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)
execute_process(
    COMMAND git -C "${QMLTUI_SOURCE_DIR}" diff HEAD -- CMakeLists.txt cmake src examples/gallery
    OUTPUT_VARIABLE _qmltui_worktree_diff
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)
string(SHA256 _qmltui_source_tree_hash "${_qmltui_version}\n${_qmltui_ls_tree}\n${_qmltui_worktree_diff}")

file(WRITE "${QMLTUI_WASM_WWW_DIR}/wasm-meta.json"
    "{\n  \"version\": \"${_qmltui_version}\",\n  \"commit\": \"${_qmltui_commit}\",\n  \"commitShort\": \"${_qmltui_commit_short}\",\n  \"sourceTreeHash\": \"${_qmltui_source_tree_hash}\"\n}\n"
)
]=])

execute_process(
    COMMAND "${CMAKE_COMMAND}"
        "-DQMLTUI_SOURCE_DIR=${QMLTUI_SOURCE_DIR}"
        "-DQMLTUI_WASM_WWW_DIR=${QMLTUI_WASM_WWW_DIR}"
        -P "${_stamp_wasm_meta_script}"
)
add_custom_target(qmltui_wasm_meta ALL
    DEPENDS qmltui_playground
    COMMAND "${CMAKE_COMMAND}"
        "-DQMLTUI_SOURCE_DIR=${QMLTUI_SOURCE_DIR}"
        "-DQMLTUI_WASM_WWW_DIR=${QMLTUI_WASM_WWW_DIR}"
        -P "${_stamp_wasm_meta_script}"
    VERBATIM
)
