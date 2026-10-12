// Support/Telemetry without a telemetry backend: this Mojo collects and sends
// nothing. Upstream's implementation is OpenTelemetry's SDK with OTLP
// exporters over HTTP and Protocol Buffers; every instrument and logger here
// is OpenTelemetry's own no-op one, from its header-only API.
#include "Support/Telemetry/Telemetry.h"

#include "opentelemetry/logs/noop.h"
#include "opentelemetry/metrics/noop.h"

using namespace M;
using namespace M::Telemetry;

const LocalIDs &Telemetry::createLocalIDs() {
  static const LocalIDs ids;
  return ids;
}

bool Telemetry::isTelemetryEnabled(Config &) { return false; }

bool Telemetry::isCrashReportingEnabled(Config &) { return false; }

TelemetryContext::TelemetryContext(Config &, StringRef, StringRef)
    : telemetryLevel(Level::L0),
      noopMetricsProvider(
          std::make_unique<opentelemetry::metrics::NoopMeterProvider>()),
      loggerProvider(
          std::make_shared<opentelemetry::logs::NoopLoggerProvider>()),
      eventLoggerProvider(
          std::make_shared<opentelemetry::logs::NoopEventLoggerProvider>()) {
  noopMeter = noopMetricsProvider->GetMeter("modular");
  meter = noopMeter;
}

TelemetryContext::~TelemetryContext() = default;

void TelemetryContext::flush(std::chrono::microseconds) {}
