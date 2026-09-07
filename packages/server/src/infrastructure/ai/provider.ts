import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { ArtDirection, ReadingPlan } from "@imagine/contracts/planning";
import { Effect, Layer, Redacted, Schema } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import { Illustrations } from "../../data/ports";
import { ProviderError } from "../../domain/errors";
import { AppConfig } from "../config";
import { demoImage, demoPlan, demoDirection } from "./demo";
import { PLANNER_INSTRUCTIONS, ART_DIRECTION_INSTRUCTIONS } from "./instructions";

const ImageResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({ b64_json: Schema.Uint8ArrayFromBase64.check(Schema.isMinLength(1)) }),
  ).check(Schema.isMinLength(1)),
});

export const AiLive = Layer.effect(
  Illustrations,
  Effect.gen(function* () {
    const config = yield* AppConfig;

    const http = yield* HttpClient.HttpClient;

    const openai = OpenAiClient.layer({ apiKey: config.openaiKey }).pipe(
      Layer.provide(FetchHttpClient.layer),
    );

    const generate = Effect.fn("AI.generate")(function* <A, I extends Record<string, unknown>>(
      schema: Schema.Codec<A, I>,
      instructions: string,
      input: string,
      model: string,
    ) {
      if (!Redacted.value(config.openaiKey))
        return yield* new ProviderError({
          message: "OPENAI_API_KEY is required.",
          retryable: false,
          cause: "Missing key",
        });

      return yield* LanguageModel.generateObject({
        schema,
        prompt: [
          { role: "system", content: instructions },
          { role: "user", content: input },
        ],
      }).pipe(
        Effect.provide(OpenAiLanguageModel.layer({ model }).pipe(Layer.provide(openai))),
        Effect.map((result) => result.value),
        Effect.mapError(
          (cause) =>
            new ProviderError({ message: cause.message, retryable: cause.isRetryable, cause }),
        ),
        Effect.timeout("180 seconds"),
        Effect.catchTag("TimeoutError", (cause) =>
          Effect.fail(
            new ProviderError({ message: "AI planning timed out.", retryable: true, cause }),
          ),
        ),
      );
    });

    return Illustrations.of({
      direct: Effect.fn("AI.artDirection")((input, settings) =>
        settings.mode === "demo"
          ? Effect.succeed(demoDirection(input))
          : generate(
              ArtDirection,
              ART_DIRECTION_INSTRUCTIONS,
              JSON.stringify(input),
              settings.plannerModel,
            ),
      ),
      plan: Effect.fn("AI.plan")((input, settings) =>
        settings.mode === "demo"
          ? Effect.succeed(demoPlan(input))
          : generate(
              ReadingPlan,
              PLANNER_INSTRUCTIONS,
              JSON.stringify(input),
              settings.plannerModel,
            ),
      ),
      render: Effect.fn("AI.render")((prompt, settings) => {
        if (settings.mode === "demo") return demoImage;

        if (!Redacted.value(config.openaiKey))
          return Effect.fail(
            new ProviderError({
              message: "OPENAI_API_KEY is required.",
              retryable: false,
              cause: "Missing key",
            }),
          );

        return Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({
            "gen_ai.system": "openai",
            "gen_ai.operation.name": "image_generation",
            "gen_ai.request.model": settings.imageModel,
          });

          const request = yield* HttpClientRequest.post(
            "https://api.openai.com/v1/images/generations",
          ).pipe(
            HttpClientRequest.bearerToken(config.openaiKey),
            HttpClientRequest.bodyJson({
              model: settings.imageModel,
              prompt,
              size: "1024x1024",
              n: 1,
            }),
          );

          const response = yield* http.execute(request);

          if (response.status < 200 || response.status >= 300)
            return yield* new ProviderError({
              message: `Image provider returned HTTP ${response.status}.`,
              retryable: response.status === 429 || response.status >= 500,
              cause: response.status,
            });

          const body = yield* HttpClientResponse.schemaBodyJson(ImageResponse)(response);

          const image = body.data[0];

          if (!image)
            return yield* new ProviderError({
              message: "Image response was empty.",
              retryable: true,
              cause: "Empty response",
            });

          return {
            bytes: image.b64_json,
            mediaType: "image/png",
            model: settings.imageModel,
          };
        }).pipe(
          Effect.catchTags({
            HttpClientError: (cause) =>
              Effect.fail(
                new ProviderError({
                  message: "Image provider connection failed.",
                  retryable: true,
                  cause,
                }),
              ),
            HttpBodyError: (cause) =>
              Effect.fail(
                new ProviderError({ message: "Invalid image request.", retryable: false, cause }),
              ),
            SchemaError: (cause) =>
              Effect.fail(
                new ProviderError({ message: "Invalid image response.", retryable: true, cause }),
              ),
          }),
          Effect.timeout("240 seconds"),
          Effect.catchTag("TimeoutError", (cause) =>
            Effect.fail(
              new ProviderError({ message: "Image generation timed out.", retryable: true, cause }),
            ),
          ),
        );
      }),
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
