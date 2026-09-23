#include <jsapi.h>
#include <js/CompilationAndEvaluation.h>
#include <js/Context.h>
#include <js/GlobalObject.h>
#include <js/Initialization.h>
#include <js/Realm.h>
#include <js/SourceText.h>
#include <js/Stack.h>
#include <js/StructuredClone.h>

#include <cstdio>
#include <cstring>

static_assert(sizeof(void*) == 8);
static const JSClass globalClass = {
    "DollySpiderMonkeyCheck", JSCLASS_GLOBAL_FLAGS, &JS::DefaultGlobalClassOps};

static bool nativeAdd(JSContext* cx, unsigned argc, JS::Value* vp) {
  JS::CallArgs args = JS::CallArgsFromVp(argc, vp);
  if (argc != 2 || !args[0].isInt32() || !args[1].isInt32()) return false;
  JS_GC(cx);
  args.rval().setInt32(args[0].toInt32() + args[1].toInt32());
  return true;
}

static bool evaluate(JSContext* cx, const char* text, JS::MutableHandleValue out) {
  JS::CompileOptions options(cx);
  options.setFileAndLine("dolly-spidermonkey-check.js", 1);
  JS::SourceText<mozilla::Utf8Unit> source;
  return source.init(cx, text, std::strlen(text), JS::SourceOwnership::Borrowed) &&
         JS::Evaluate(cx, options, source, out);
}

static bool check(JSContext* cx) {
  JS::RealmOptions options;
  JS::RootedObject first(cx, JS_NewGlobalObject(
      cx, &globalClass, nullptr, JS::FireOnNewGlobalHook, options));
  if (!first) return false;
  JSAutoStructuredCloneBuffer clone(JS::StructuredCloneScope::SameProcess, nullptr, nullptr);
  {
    JSAutoRealm realm(cx, first);
    if (!JS::InitRealmStandardClasses(cx) ||
        !JS_DefineFunction(cx, first, "nativeAdd", nativeAdd, 2, 0)) return false;
    JS::RootedValue value(cx);
    if (!evaluate(cx, R"JS(
      (() => {
        let total = 0;
        for (let i = 0; i < 100; i++) total = nativeAdd(total, i);
        if (total !== 4950) throw Error("native callback/GC");
        const state = {turn: 123, name: "日本語", values: new Int32Array([1, -2, 3]),
                       map: new Map([["food", 42]]), big: 1234567890123456789n};
        state.self = state;
        return state;
      })()
    )JS", &value) || !clone.write(cx, value)) return false;
  }
  JS_GC(cx);
  JS::RootedObject second(cx, JS_NewGlobalObject(
      cx, &globalClass, nullptr, JS::FireOnNewGlobalHook, options));
  if (!second) return false;
  {
    JSAutoRealm realm(cx, second);
    JS::RootedValue restored(cx), result(cx);
    if (!JS::InitRealmStandardClasses(cx) || !clone.read(cx, &restored) ||
        !JS_DefineProperty(cx, second, "state", restored, JSPROP_ENUMERATE)) return false;
    JS_GC(cx);
    if (!evaluate(cx, R"JS(
      state.self === state && state.turn === 123 && state.name === "日本語" &&
      state.values instanceof Int32Array && state.values[1] === -2 &&
      state.map.get("food") === 42 && state.big === 1234567890123456789n &&
      JSON.stringify(JSON.parse('{"turn":123,"units":[1,2]}')) === '{"turn":123,"units":[1,2]}' &&
      typeof nativeAdd === "undefined"
    )JS", &result) || !result.isBoolean() || !result.toBoolean()) return false;
  }
  return true;
}

int main() {
  if (const char* error = JS_InitWithFailureDiagnostic()) {
    std::fprintf(stderr, "SpiderMonkey initialization: %s\n", error);
    return 1;
  }
  JSContext* cx = JS_NewContext(64 * 1024 * 1024);
  if (!cx) return 2;
  JS_SetNativeStackQuota(cx, 2 * 1024 * 1024);
  const bool ok = JS::InitSelfHostedCode(cx) && check(cx);
  JS_DestroyContext(cx);
  JS_ShutDown();
  std::puts(ok ? "spidermonkey: wasm64 realms, GC, callbacks and clone passed" :
                 "spidermonkey: embedding check failed");
  return ok ? 0 : 3;
}
