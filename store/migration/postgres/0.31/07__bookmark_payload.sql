UPDATE memo
SET payload = jsonb_set(
  payload,
  '{bookmark}',
  jsonb_build_object(
    'type',
    'LINK',
    'sourceUrl',
    COALESCE(payload #>> '{links,0,url}', ''),
    'favorited',
    to_jsonb(pinned)
  )
)
WHERE (payload #>> '{property,hasLink}')::boolean IS TRUE
  AND lower(payload #>> '{links,0,url}') ~ '^https?://'
  AND payload -> 'bookmark' IS NULL;
