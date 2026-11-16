// QmlTui QML playground for the browser: one binary, QML source supplied by the
// page at run time. The page calls Module.qmltuiLoadQml(source, fileName) after
// every edit; the previous root is destroyed and the new one instantiated.
// No user C++ is possible here by design; everything QmlTui.* offers is linked.

#include <QCoreApplication>
#include <QEvent>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMetaObject>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQmlError>
#include <QRegularExpression>
#include <QUrl>
#include <QVariantMap>

#include <emscripten.h>
#include <emscripten/bind.h>

#include <string>
#include <utility>

namespace {

QQmlEngine* g_engine = nullptr;
QObject* g_root = nullptr;
QMetaObject::Connection g_quitNotifyConn;
bool g_quitDuringCreate = false;
QVariantMap g_exampleSources;

// Page callbacks; each is optional.
EM_JS(void, playground_js_quit, (), {
    if (Module['qmltuiOnQuit']) Module['qmltuiOnQuit']();
});
EM_JS(void, playground_js_warning, (const char* text, int length), {
    if (Module['qmltuiOnWarning']) Module['qmltuiOnWarning'](UTF8ToString(text, length));
});

void scheduleRootRelease() {
    if (QObject* root = std::exchange(g_root, nullptr)) {
        QObject::disconnect(g_quitNotifyConn);
        g_quitNotifyConn =
            QObject::connect(root, &QObject::destroyed, [] { playground_js_quit(); });
        root->deleteLater();
    } else {
        g_quitDuringCreate = true;
    }
}

std::string errorsToJson(const QList<QQmlError>& errors) {
    QJsonArray array;
    for (const QQmlError& error : errors) {
        QJsonObject item;
        item[QStringLiteral("line")] = error.line();
        item[QStringLiteral("column")] = error.column();
        item[QStringLiteral("message")] = error.description();
        item[QStringLiteral("file")] = error.url().fileName();
        array.append(item);
    }
    return QJsonDocument(array).toJson(QJsonDocument::Compact).toStdString();
}

// Returns "" on success, otherwise a JSON array of {line, column, message, file}.
std::string loadQml(const std::string& source, const std::string& fileName) {
    if (!g_engine) return R"([{"line":0,"column":0,"message":"engine not ready","file":""}])";

    // Tear down the previous Terminal first, so its shutdown output (leave the
    // alternate screen, show the cursor) precedes the new root's first frame.
    // Disconnect any pending quit notification before flushing deleteLater() so
    // replacing an exited root does not re-fire qmltuiOnQuit for the new run.
    QObject::disconnect(g_quitNotifyConn);
    g_quitDuringCreate = false;
    delete g_root;
    g_root = nullptr;
    QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
    g_engine->clearComponentCache();

    const QUrl url(QStringLiteral("file:///playground/") + QString::fromStdString(fileName));
    QQmlComponent component(g_engine);
    component.setData(QByteArray::fromStdString(source), url);
    if (component.isError()) return errorsToJson(component.errors());

    g_root = component.create();
    if (!g_root) {
        g_quitDuringCreate = false;
        return errorsToJson(component.errors());
    }

    if (!g_root->inherits("qmltui::Terminal")) {
        g_quitDuringCreate = false;
        QString name = QString::fromLatin1(g_root->metaObject()->className());
        name.remove(QRegularExpression(QStringLiteral("_QMLTYPE_\\d+$"))); // Main_QMLTYPE_4 -> Main
        delete g_root;
        g_root = nullptr;
        QJsonObject item;
        item[QStringLiteral("line")] = 1;
        item[QStringLiteral("column")] = 1;
        item[QStringLiteral("message")] =
            QStringLiteral("the root item must be a Terminal, not %1").arg(name);
        item[QStringLiteral("file")] = QString::fromStdString(fileName);
        return QJsonDocument(QJsonArray{item}).toJson(QJsonDocument::Compact).toStdString();
    }

    if (std::exchange(g_quitDuringCreate, false)) {
        scheduleRootRelease();
    }
    return {};
}

} // namespace

// Compiles `source` without creating anything: "" or the same JSON error
// array as loadQml. The page checks an edited example this way before it is
// handed to the running gallery, which reports only what it can catch.
std::string checkQml(const std::string& source, const std::string& fileName) {
    if (!g_engine) return R"([{"line":0,"column":0,"message":"engine not ready","file":""}])";
    QQmlComponent component(g_engine);
    component.setData(
        QByteArray::fromStdString(source),
        QUrl(QStringLiteral("file:///playground/") + QString::fromStdString(fileName)));
    return component.isError() ? errorsToJson(component.errors()) : std::string();
}

// Publishes an example's QML source in the qmltuiExampleSources context map read
// by gallery.qml when instantiating demos with Qt.createQmlObject.
void writeFile(const std::string& fileName, const std::string& content) {
    const QString relPath = QString::fromStdString(fileName);
    if (relPath.startsWith(QStringLiteral("examples/"))) {
        const QFileInfo info(relPath);
        g_exampleSources.insert(info.fileName(), QString::fromStdString(content));
        if (g_engine) {
            g_engine->rootContext()->setContextProperty(QStringLiteral("qmltuiExampleSources"),
                                                        g_exampleSources);
        }
    }
}

// Page-defined state the next root can read as a context property, e.g. the
// gallery's qmltuiGalleryPage or qmltuiAvailableExamples.
void setContextProperty(const std::string& name, const std::string& value) {
    if (!g_engine) return;
    const QString key = QString::fromStdString(name);
    if (key == QStringLiteral("qmltuiAvailableExamples")) {
        const QJsonArray arr = QJsonDocument::fromJson(QByteArray::fromStdString(value)).array();
        QStringList list;
        list.reserve(arr.size());
        for (const QJsonValue& v : arr)
            list.append(v.toString());
        g_engine->rootContext()->setContextProperty(key, list);
        return;
    }
    g_engine->rootContext()->setContextProperty(key, QString::fromStdString(value));
}

EMSCRIPTEN_BINDINGS(qmltui_playground) {
    emscripten::function("qmltuiLoadQml", &loadQml);
    emscripten::function("qmltuiCheckQml", &checkQml);
    emscripten::function("qmltuiWriteFile", &writeFile);
    emscripten::function("qmltuiSetContextProperty", &setContextProperty);
}

int main(int argc, char* argv[]) {
    QCoreApplication app(argc, argv);
    QQmlEngine engine;
    g_engine = &engine;
    engine.addImportPath(QStringLiteral("qrc:/qt/qml"));
    engine.setOutputWarningsToStandardError(false);
    QObject::connect(&engine, &QQmlEngine::warnings, [](const QList<QQmlError>& warnings) {
        for (const QQmlError& warning : warnings) {
            const std::string text = warning.toString().toStdString();
            playground_js_warning(text.data(), static_cast<int>(text.size()));
        }
    });
    // Qt.quit() from user QML must not end the runtime (Qt would abort without
    // Asyncify); destroy the root via deleteLater() so ~Terminal() flushes its
    // shutdown sequences and Scrollback output first, then notify the page.
    QObject::connect(&engine, &QQmlEngine::quit, &scheduleRootRelease);
    QObject::connect(&engine, &QQmlEngine::exit, [](int) { scheduleRootRelease(); });
    return app.exec(); // never returns in the browser; the page drives qmltuiLoadQml
}
