-- 不执行、待 Rocky 审。
-- 作用：清理 2026-11-13 只读快照中命中的 7 个词的重复原场景例句。
-- 只动 words.examples_json；不改其它 words 字段，不改 review_logs，不生成词条。
-- 快照的这些重复句均与 original_context 逐字相同。本草稿采取保守的精确比较；
-- 如线上文字已改为大小写/空白/尾标点变体，本草稿跳过变体，由运行时归一化过滤兜底。
-- 不复制快照句子。按执行时的当前数组过滤并保序；无剩余例句时整行跳过。
-- 不在 migrations/ 中，不得纳入自动迁移；审核线上当前数据后再决定是否手动执行。
-- 可重复执行；已清理的行不再更新。请先单独执行下面的只读预览。

-- 只读预览（不含句子）：
-- SELECT w.id, json_array_length(w.examples_json) AS before_count,
--   (SELECT COUNT(*) FROM json_each(w.examples_json) e
--    WHERE json_extract(e.value, '$.en') IS NOT w.original_context) AS after_count
-- FROM words w
-- WHERE w.id IN ('period-n-1', 'obsessed-adj-1', 'particularly-adv-1',
--   'replace-v-1', 'practically-adv-1', 'ranking-n-1', 'leaderboard-n-1');

WITH snapshot_candidates(id) AS (
  VALUES
    ('period-n-1'),
    ('obsessed-adj-1'),
    ('particularly-adv-1'),
    ('replace-v-1'),
    ('practically-adv-1'),
    ('ranking-n-1'),
    ('leaderboard-n-1')
)
UPDATE words
SET examples_json = (
  SELECT json_group_array(json(value))
  FROM (
    SELECT e.value
    FROM json_each(words.examples_json) e
    WHERE json_extract(e.value, '$.en') IS NOT words.original_context
    ORDER BY CAST(e.key AS INTEGER)
  )
)
WHERE id IN (SELECT id FROM snapshot_candidates)
  AND original_context IS NOT NULL AND trim(original_context) <> ''
  AND EXISTS (
    SELECT 1 FROM json_each(words.examples_json) e
    WHERE json_extract(e.value, '$.en') = words.original_context
  )
  AND EXISTS (
    SELECT 1 FROM json_each(words.examples_json) e
    WHERE json_extract(e.value, '$.en') IS NOT words.original_context
  );
