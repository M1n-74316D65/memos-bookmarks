UPDATE memo
SET payload = json_set(
  payload,
  '$.bookmark.type',
  'LINK',
  '$.bookmark.sourceUrl',
  COALESCE(json_extract(payload, '$.links[0].url'), ''),
  '$.bookmark.favorited',
  json(CASE WHEN pinned = 1 THEN 'true' ELSE 'false' END)
)
WHERE json_extract(payload, '$.property.hasLink') IS TRUE
  AND (
    lower(json_extract(payload, '$.links[0].url')) LIKE 'http://%'
    OR lower(json_extract(payload, '$.links[0].url')) LIKE 'https://%'
  )
  AND json_extract(payload, '$.bookmark') IS NULL;
