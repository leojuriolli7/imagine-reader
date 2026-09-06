import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  OtlpLogger,
  OtlpMetrics,
  OtlpSerialization,
  OtlpTracer,
} from "effect/unstable/observability";
import { AppConfig } from "../infrastructure/config";

/** Export Effect spans, correlated logs, and metrics through a single OTLP collector. */
export const ObservabilityLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    if (!config.otlpEndpoint) return Layer.empty;

    const endpoint = config.otlpEndpoint.replace(/\/$/, "");

    const resource = {
      serviceName: config.otelServiceName,
      serviceVersion: "0.0.1",
      attributes: { "deployment.environment.name": config.nodeEnv },
    };

    return Layer.mergeAll(
      OtlpTracer.layer({ url: `${endpoint}/v1/traces`, resource, exportInterval: "1 second" }),
      OtlpLogger.layer({ url: `${endpoint}/v1/logs`, resource, exportInterval: "1 second" }),
      OtlpMetrics.layer({ url: `${endpoint}/v1/metrics`, resource, exportInterval: "5 seconds" }),
    ).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
  }),
);
