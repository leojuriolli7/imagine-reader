ALTER TABLE jobs ADD COLUMN feedback text;

-- Transform stored aggregates once; runtime code reads only the current contract.
UPDATE books AS b SET state =
  (b.state - 'passages' - 'checkpoint') || jsonb_build_object(
    'config', (b.state->'config') - 'style',
    'pages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('page', number, 'text', COALESCE((
        SELECT string_agg(p->>'text', '' ORDER BY substring(p->>'id' from '-([0-9]+)$')::int)
        FROM jsonb_array_elements(b.state->'passages') p WHERE (p->>'page')::int = number
      ), '')) ORDER BY number)
      FROM generate_series(1, (b.state->>'pageCount')::int) number
    ), '[]'::jsonb),
    'artDirection', NULL,
    'characters', '[]'::jsonb,
    'summary', COALESCE(b.state->'checkpoint'->>'summary', ''),
    'activeIllustrationId', b.state->'checkpoint'->'activeIllustrationId',
    'spans', COALESCE((SELECT jsonb_agg(span) FROM jsonb_array_elements(b.state->'batches') batch CROSS JOIN LATERAL jsonb_array_elements(batch->'plan'->'spans') span), '[]'::jsonb),
    'batches', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'start', batch->'start', 'end', batch->'end', 'durationMs', batch->'durationMs',
      'sceneIds', COALESCE((SELECT jsonb_agg(image->'id') FROM jsonb_array_elements(batch->'plan'->'illustrations') image), '[]'::jsonb)
    )) FROM jsonb_array_elements(b.state->'batches') batch), '[]'::jsonb),
    'illustrations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', image->'id', 'prompt', concat_ws(E'\n\n', b.state->'config'->>'style', image->>'prompt'),
      'revealPage', image->'revealPage',
      'untilPage', COALESCE((SELECT max((span->>'end')::int) FROM jsonb_array_elements(b.state->'batches') batch CROSS JOIN LATERAL jsonb_array_elements(batch->'plan'->'spans') span WHERE span->>'illustrationId' = image->>'id'), (image->>'revealPage')::int + 1),
      'sourcePages', COALESCE((SELECT jsonb_agg(DISTINCT substring(source from '^p([0-9]+)')::int) FROM jsonb_array_elements_text(image->'sourcePassageIds') source WHERE source ~ '^p[0-9]+'), '[]'::jsonb),
      'characters', '[]'::jsonb, 'artifact', image->'artifact'
    )) FROM jsonb_array_elements(b.state->'illustrations') image), '[]'::jsonb)
  );

INSERT INTO jobs (id, key, book_id, kind, ref, priority)
SELECT gen_random_uuid()::text, 'art-direction:' || id, id, 'art-direction', '', 10
FROM books WHERE state->>'status' = 'ready'
ON CONFLICT (key) DO NOTHING;
