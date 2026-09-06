# Reading and illustration pipeline

## The automatic flow

Upload → create book plus extraction job → immediately open PDF → extract mapped passages → plan pages 1–50 in small batches → render nearby illustrations → maintain coverage as page progress arrives.

PDF display is independent of extraction. Extraction currently reads the whole PDF before the first planning call. Optimizing to incremental extraction is possible later. Planning starts with at most eight physical pages and 24,000 source characters; no source text is silently dropped to fit. A page too dense for the budget fails with a visible error. Text passages have stable IDs derived from physical page and 2,000-character chunk offset.

The 50-page target is a scheduling horizon, not one expensive model call. Planning is sequential with a checkpoint so later batches inherit visual context. Each committed batch immediately schedules the next batch and relevant renders. Rendering runs on separate lanes, so a slow image cannot block planning.

## Contracts

`prepareBatch(passages, start, target, checkpoint, existingIllustrations, style)` returns a `BatchInput` with an exclusive `end`.

`Planner.plan(input)` returns:

- new illustrations: local ID, reason, full prompt, source passage IDs, reveal page;
- complete display spans, including explicit null images;
- continuity checkpoint: summary, sourced facts, active illustration ID.

The AI adapter validates structure with Effect Schema. `validatePlan(plan, input)` validates semantics: sources exist, IDs are unique, spans cover exactly the batch without overlap, references resolve, and display starts do not precede source reveals. The application replaces local illustration IDs with stable IDs before committing.

Zero new illustrations is a valid result. A previous image can span later batches when the planner keeps it. The final page's illustration can be deferred into the checkpoint. A future batch must explicitly assign it a valid display span.

## Timing

Page numbers are physical PDF pages, one-based. Ranges are `[start, end)`. A picture supported by text on page 3 can appear on page 4 at the earliest. This is a conservative reading rule: a page viewport does not prove a sentence has been read. There is no eye tracking or sentence-level reveal.

The rendering horizon includes spans intersecting the current page through 12 pages ahead. Completed artifacts outside their display span remain hidden. Revisiting an earlier page can display its saved image. Page updates are debounced, and queued jobs are deduplicated by book/illustration or planning boundary.

Jumping forward raises the horizon, but v1 continues planning sequentially from its checkpoint. It does **not** yet start a separate section-local planning branch at the jump destination. Reading remains available while planning catches up. Full-book and selected-chapter controls are also not exposed yet.

Already queued image jobs are allowed to finish when the reader leaves or jumps; only new scheduling is bounded. Blank space appears when an image is late or no image is warranted. A missing image never blocks a page turn.

## What still needs real-book evaluation

The deterministic demo proves delivery mechanics only. Real AI evaluation should score image usefulness, source faithfulness, spoiler leakage, continuity, and latency with descriptive, dialogue-heavy and action-heavy books. Provider output can contain invented details despite structurally valid source references. There is no separate semantic reviewer yet.

The current source-character budget does not include accumulated checkpoint/illustration context. Very long illustrated books may need a bounded visual-reference index instead of sending all existing illustration metadata. Visual continuity is textual, not reference-image based.
