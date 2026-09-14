UPDATE `memo`
SET `payload` = JSON_SET(
  `payload`,
  '$.bookmark',
  JSON_OBJECT(
    'type',
    'LINK',
    'sourceUrl',
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.links[0].url')), ''),
    'favorited',
    JSON_EXTRACT(IF(`pinned`, 'true', 'false'), '$')
  )
)
WHERE JSON_EXTRACT(`payload`, '$.property.hasLink') = CAST('true' AS JSON)
  AND (
    LOWER(JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.links[0].url'))) LIKE 'http://%'
    OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.links[0].url'))) LIKE 'https://%'
  )
  AND JSON_EXTRACT(`payload`, '$.bookmark') IS NULL;
