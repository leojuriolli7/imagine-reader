import type { Book, Job } from "@imagine/contracts/models";
import type { Effect } from "effect";

/** Every durable step executes under a lease and exposes its expected failures. */
export interface BookStep<E> {
  execute(job: Job, book: Book): Effect.Effect<void, E>;
}
