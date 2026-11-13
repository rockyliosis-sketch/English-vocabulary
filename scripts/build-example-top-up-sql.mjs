/** Offline SQL generator; writes SQL to stdout only. Never opens a database. */
import { fileURLToPath } from 'node:url';
import { normalizeExampleText } from '../functions/_lib/scheduler.js';

export const TOP_UP_CANDIDATES = [
  ['scope-n-1', [
    ['The scope of the audit includes all three regional offices.', '审计范围涵盖全部三个地区办事处。'],
    ['Adding a mobile app would expand the scope of this project.', '增加手机应用会扩大这个项目的范围。'],
    ['Pricing decisions fall outside the scope of my role.', '定价决策不在我的职责范围内。'],
    ['The new software gives teachers more scope to adapt each lesson.', '新软件让老师有更大的空间调整每节课。'],
    ['We narrowed the scope of the study to small businesses.', '我们把研究范围缩小到小企业。']
  ]],
  ['range-n-1', [
    ['The store carries a wide range of camping gear.', '这家店有种类丰富的露营装备。'],
    ['The salary range for this position is posted online.', '这个职位的薪资范围已公布在网上。'],
    ['The cabin is just beyond the range of our Wi-Fi signal.', '小屋刚好在我们的无线网络信号范围之外。'],
    ['The test scores fell within a narrow range.', '考试分数集中在一个很小的范围内。'],
    ['The electric van has a range of about two hundred miles.', '这辆电动货车的续航里程约为两百英里。']
  ]]
].flatMap(([id, entries]) => entries.map(([en, zh], priority) => ({ id, priority, en, zh })));

const quote = (s) => `'${s.replaceAll("'", "''")}'`;
let cachedTables;
function unicodeTables() {
  if (cachedTables) return cachedTables;
  const specs = { space: /\s/u, punctuation: /\p{P}/u, cased: /\p{Cased}/u, ignorable: /\p{Case_Ignorable}/u };
  const ranges = Object.fromEntries(Object.keys(specs).map((key) => [key, []]));
  const lower = [], expanded = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const ch = String.fromCodePoint(cp);
    for (const [key, re] of Object.entries(specs)) {
      if (!re.test(ch)) continue;
      const list = ranges[key], last = list.at(-1);
      if (last && last[1] === cp - 1) last[1] = cp;
      else list.push([cp, cp]);
    }
    const mapped = ch.toLowerCase();
    if (mapped === ch) continue;
    if ([...mapped].length !== 1) expanded.push([cp, mapped]);
    else lower.push([cp, mapped.codePointAt(0) - cp]);
  }
  const lowerRanges = [];
  for (let i = 0; i < lower.length;) {
    const [start, delta] = lower[i];
    const next = lower[i + 1];
    const stride = next && next[1] === delta && next[0] - start <= 2 ? next[0] - start : 1;
    let end = start;
    i++;
    while (i < lower.length && lower[i][1] === delta && lower[i][0] === end + stride) end = lower[i++][0];
    lowerRanges.push([start, end, stride, delta]);
  }
  const propertyRows = Object.entries(ranges).map(([key, values]) => `(${quote(key)}, ${quote(JSON.stringify(values))})`).join(',\n    ');
  cachedTables = `property_data(kind, ranges_json) AS (VALUES\n    ${propertyRows}\n),
properties(kind, lo, hi) AS MATERIALIZED (
  SELECT kind, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]')
  FROM property_data, json_each(ranges_json) j
),
lower_ranges(lo, hi, stride, delta) AS MATERIALIZED (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'),
    json_extract(value, '$[2]'), json_extract(value, '$[3]')
  FROM json_each(${quote(JSON.stringify(lowerRanges))})
),
lower_expanded(cp, text) AS (VALUES ${expanded.map(([cp, text]) => `(${cp}, ${quote(text)})`).join(', ')})`;
  return cachedTables;
}

// SQLite lower() only folds ASCII. These generated Unicode tables reproduce JS
// default lowercase, whitespace and punctuation, including contextual final sigma.
export function normalizationCtes(inputSql) {
  return `${unicodeTables()},
inputs(raw) AS MATERIALIZED (${inputSql}),
positions(raw, pos) AS (
  SELECT raw, 1 FROM inputs WHERE length(raw) > 0
  UNION ALL SELECT raw, pos + 1 FROM positions WHERE pos < length(raw)
),
characters AS MATERIALIZED (
  SELECT raw, pos, substr(raw, pos, 1) AS ch, unicode(substr(raw, pos, 1)) AS cp
  FROM positions
),
classified AS MATERIALIZED (
  SELECT c.*,
    EXISTS(SELECT 1 FROM properties WHERE kind = 'space' AND cp BETWEEN lo AND hi) AS space,
    EXISTS(SELECT 1 FROM properties WHERE kind = 'punctuation' AND cp BETWEEN lo AND hi) AS punctuation,
    EXISTS(SELECT 1 FROM properties WHERE kind = 'cased' AND cp BETWEEN lo AND hi) AS cased,
    EXISTS(SELECT 1 FROM properties WHERE kind = 'ignorable' AND cp BETWEEN lo AND hi) AS ignorable,
    COALESCE((SELECT text FROM lower_expanded WHERE lower_expanded.cp = c.cp),
      (SELECT char(cp + delta) FROM lower_ranges WHERE cp BETWEEN lo AND hi AND (cp - lo) % stride = 0), ch) AS lower_ch
  FROM characters c
),
walk(raw, pos, output, pending_space, keep_length, previous_cased) AS (
  SELECT raw, 0, '', 0, 0, 0 FROM inputs
  UNION ALL
  SELECT w.raw, c.pos,
    CASE WHEN c.space THEN w.output ELSE w.output || CASE WHEN w.pending_space THEN ' ' ELSE '' END ||
      CASE WHEN c.cp = 931 AND w.previous_cased AND COALESCE((
        SELECT n.cased FROM classified n WHERE n.raw = w.raw AND n.pos > c.pos AND NOT n.ignorable
        ORDER BY n.pos LIMIT 1), 0) = 0 THEN 'ς' ELSE c.lower_ch END END,
    CASE WHEN c.space THEN length(w.output) > 0 ELSE 0 END,
    CASE WHEN c.space OR c.punctuation THEN w.keep_length
      ELSE length(w.output) + w.pending_space + length(c.lower_ch) END,
    CASE WHEN c.ignorable THEN w.previous_cased ELSE c.cased END
  FROM walk w JOIN classified c ON c.raw = w.raw AND c.pos = w.pos + 1
),
normalized AS MATERIALIZED (
  SELECT raw, substr(output, 1, keep_length) AS key FROM walk WHERE pos = length(raw)
)`;
}

export function buildTopUpSql(candidates = TOP_UP_CANDIDATES) {
  const seen = new Set();
  for (const item of candidates) {
    const key = normalizeExampleText(item.en);
    if (!key || !item.zh.trim() || seen.has(key)) throw new Error('Candidates must have distinct nonempty English and Chinese');
    seen.add(key);
  }
  return `-- 不执行、待 Rocky 审。
-- 作用：按当前内容为 scope/range 补足过滤后 3 条示例；只 UPDATE words.examples_json。
-- 不动其它字段、stage、排期、反馈或 review_logs；不部署，不连接真实库。
-- 源文件：scripts/build-example-top-up-sql.mjs；本文件为其 stdout，不要手改 Unicode 表。
-- 保留原有项、属性和顺序（包括原场景项），按候选顺序只追加所缺的条数。
-- 同运行时 trim/合并空白/Unicode 小写/去尾标点规则；候选不得重复当前任何词的示例或原场景。
-- 已有 >=3 条可用示例不动；追加后原始总数须 <=5 且可用数恰为3，否则整行跳过。
-- 若保留原项与总数上限无法兼容，或候选被占用不足，先人工审核，不截断、不部分填充。
-- 非数组或非法项跳过对应词条；任何词的英句/场景含 NUL 或 >2000字符时暂停全部补句。
-- 幂等；单条 UPDATE、物化计划、旧值保护；只在当前状态满足条件时追加。
-- 预览：把末尾 UPDATE 整段替换为 SELECT id, raw_count, usable_count, needed,
--   available, status FROM plans ORDER BY id;（勿连同 UPDATE 一起执行。）
-- 不在 migrations/，不会自动执行。先核对线上数据再由 Rocky 决定。
WITH RECURSIVE
candidates(id, priority, en, zh) AS (VALUES
  ${candidates.map((c) => `(${quote(c.id)}, ${c.priority}, ${quote(c.en)}, ${quote(c.zh)})`).join(',\n  ')}
),
arrays AS MATERIALIZED (
  SELECT w.*, CASE WHEN json_valid(examples_json) THEN
    CASE WHEN json_type(examples_json) = 'array' THEN examples_json ELSE '[]' END ELSE '[]' END AS safe_json
  FROM words w
),
entries AS MATERIALIZED (
  SELECT a.id, CAST(e.key AS INTEGER) AS ordinal, e.value, e.type,
    CASE WHEN e.type = 'object' THEN json_extract(e.value, '$.en') END AS en,
    CASE WHEN e.type = 'object' THEN json_extract(e.value, '$.zh') END AS zh
  FROM arrays a, json_each(a.safe_json) e
),
${normalizationCtes(`
  SELECT original_context AS raw FROM words WHERE typeof(original_context) = 'text'
    AND instr(original_context, char(0)) = 0 AND length(original_context) <= 2000
  UNION SELECT en FROM entries WHERE typeof(en) = 'text' AND instr(en, char(0)) = 0 AND length(en) <= 2000
  UNION SELECT en FROM candidates
  UNION SELECT ''
`)},
states AS MATERIALIZED (
  SELECT a.id, a.examples_json AS before_json, a.original_context AS before_context,
    json_array_length(a.safe_json) AS raw_count,
    (SELECT COUNT(*) FROM entries e JOIN normalized n ON n.raw = e.en
      WHERE e.id = a.id AND (ctx.key = '' OR n.key <> ctx.key)) AS usable_count
  FROM arrays a JOIN normalized ctx ON ctx.raw = COALESCE(a.original_context, '')
  WHERE a.examples_json = a.safe_json
    AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = a.id AND (
      e.type <> 'object' OR typeof(e.en) <> 'text' OR typeof(e.zh) <> 'text'
      OR trim(e.en, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) = ''
      OR trim(e.zh, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) = ''
      OR instr(e.en, char(0)) > 0 OR length(e.en) > 2000))
),
accepted AS MATERIALIZED (
  SELECT c.*, row_number() OVER (PARTITION BY c.id ORDER BY c.priority) AS rank
  FROM candidates c JOIN normalized n ON n.raw = c.en
  WHERE NOT EXISTS (SELECT 1 FROM entries e JOIN normalized x ON x.raw = e.en WHERE x.key = n.key)
    AND NOT EXISTS (SELECT 1 FROM words w JOIN normalized x ON x.raw = w.original_context WHERE x.key = n.key)
),
plans AS MATERIALIZED (
  SELECT s.*, 3 - usable_count AS needed,
    (SELECT COUNT(*) FROM accepted c WHERE c.id = s.id) AS available,
    CASE WHEN EXISTS (SELECT 1 FROM words WHERE typeof(original_context) = 'text'
        AND (instr(original_context, char(0)) > 0 OR length(original_context) > 2000))
      OR EXISTS (SELECT 1 FROM entries WHERE typeof(en) = 'text'
        AND (instr(en, char(0)) > 0 OR length(en) > 2000)) THEN 'blocked_text'
      WHEN usable_count >= 3 THEN 'already_sufficient'
      WHEN raw_count + 3 - usable_count > 5 THEN 'blocked_capacity'
      WHEN (SELECT COUNT(*) FROM accepted c WHERE c.id = s.id) < 3 - usable_count THEN 'blocked_candidates'
      ELSE 'ready' END AS status
  FROM states s
),
changes AS MATERIALIZED (
  SELECT p.*,
    (SELECT json_group_array(json(value)) FROM (
      SELECT e.value AS value, e.ordinal AS ordering FROM entries e WHERE e.id = p.id
      UNION ALL
      SELECT json_object('en', c.en, 'zh', c.zh), p.raw_count + c.rank
      FROM accepted c WHERE c.id = p.id AND c.rank <= p.needed
      ORDER BY ordering
    )) AS after_json
  FROM plans p WHERE status = 'ready'
)
UPDATE words
SET examples_json = (SELECT after_json FROM changes c WHERE c.id = words.id)
WHERE id IN (SELECT id FROM changes)
  AND examples_json IS (SELECT before_json FROM changes c WHERE c.id = words.id)
  AND original_context IS (SELECT before_context FROM changes c WHERE c.id = words.id);
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(buildTopUpSql());
