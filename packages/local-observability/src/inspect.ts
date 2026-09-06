import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

/** Read-only access to the local collector's query APIs for humans and agents. */
const print = Effect.fn("Telemetry.inspect")(function* (url: URL) {
  const client = yield* HttpClient.HttpClient;

  const response = yield* client.pipe(HttpClient.filterStatusOk).get(url);

  yield* Console.log(JSON.stringify(yield* response.json, null, 2));
});

const traces = Command.make(
  "traces",
  {
    query: Flag.string("query").pipe(
      Flag.withDefault('{ resource.service.name =~ "imagine-reader.*" }'),
    ),
  },
  Effect.fn(function* ({ query }) {
    const url = new URL("http://localhost:53200/api/search");

    url.searchParams.set("q", query);

    url.searchParams.set("limit", "20");

    yield* print(url);
  }),
);

const trace = Command.make(
  "trace",
  {
    id: Argument.string("trace-id").pipe(
      Argument.withSchema(Schema.String.check(Schema.isPattern(/^[a-f0-9]{1,32}$/))),
    ),
  },
  ({ id }) => print(new URL(`http://localhost:53200/api/traces/${id.padStart(32, "0")}`)),
);

const events = Command.make(
  "events",
  {
    query: Flag.string("query").pipe(Flag.withDefault('{service_name=~"imagine-reader.*"}')),
  },
  Effect.fn(function* ({ query }) {
    const url = new URL("http://localhost:53100/loki/api/v1/query_range");

    url.searchParams.set("query", query);

    url.searchParams.set("limit", "50");

    yield* print(url);
  }),
);

Command.make("telemetry").pipe(
  Command.withSubcommands([traces, trace, events]),
  Command.run({ version: "0.0.1" }),
  Effect.provide(FetchHttpClient.layer),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
