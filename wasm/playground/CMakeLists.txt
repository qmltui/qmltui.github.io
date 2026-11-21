# The live QML editor's runtime. QmlTui.Image pulls in Qt Gui (image decoders,
# fonts) and doubles the download; pass -DQMLTUI_WASM_PLAYGROUND_IMAGE=OFF to omit it.
option(QMLTUI_WASM_PLAYGROUND_IMAGE "Link QmlTui.Image into the playground binary" ON)

set(playground_imports "import QtQml\nimport QtQml.Models\nimport QmlTui\nimport QmlTui.Controls\n")
set(playground_modules QmlTui::Core QmlTui::Controls)
set(playground_dependencies TARGET QmlTui::Core TARGET QmlTui::Controls)
if(QMLTUI_WASM_PLAYGROUND_IMAGE AND TARGET QmlTui::Image)
    string(APPEND playground_imports "import QmlTui.Image\n")
    list(APPEND playground_modules QmlTui::Image)
    list(APPEND playground_dependencies TARGET QmlTui::Image)
endif()
# Never instantiated: its imports make qmlimportscanner link every QML plugin
# the playground offers into the static binary.
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/Imports.qml"
    "// Generated; see CMakeLists.txt.\n${playground_imports}\nQtObject {}\n")

set_source_files_properties("${CMAKE_CURRENT_BINARY_DIR}/Imports.qml"
    PROPERTIES QT_RESOURCE_ALIAS Imports.qml)

qt_add_executable(qmltui_playground main.cpp)

qt_add_qml_module(qmltui_playground
    URI QmlTuiPlayground
    QML_FILES "${CMAKE_CURRENT_BINARY_DIR}/Imports.qml"
    DEPENDENCIES ${playground_dependencies}
)

target_link_libraries(qmltui_playground PRIVATE Qt6::Core Qt6::Qml ${playground_modules})

foreach(plugin_target IN ITEMS
        QmlTuiCoreplugin QmlTuiControlsplugin QmlTuiImageplugin
        QmlTui::CorePlugin QmlTui::ControlsPlugin QmlTui::ImagePlugin)
    if(TARGET ${plugin_target})
        add_dependencies(qmltui_playground ${plugin_target})
    endif()
endforeach()

if(QMLTUI_WASM_PLAYGROUND_IMAGE AND TARGET QmlTui::Image)
    # The gallery's Image tile loads qrc:/gallery/assets/bike-picsum.jpg and its
    # AnimatedSprite tile qrc:/gallery/assets/loading.png, so the runtime carries
    # the same resources the desktop gallery embeds.
    set(gallery_asset_dir "${QMLTUI_SOURCE_DIR}/examples/gallery/assets")
    qt_add_resources(qmltui_playground playground_gallery_assets
        PREFIX "/gallery/assets"
        BASE "${gallery_asset_dir}"
        FILES
            "${gallery_asset_dir}/panda.png"
            "${gallery_asset_dir}/loading.png"
            "${gallery_asset_dir}/bike-picsum.jpg"
    )
endif()

if(COMMAND qmltui_wasm_app)
    qmltui_wasm_app(qmltui_playground)
endif()
