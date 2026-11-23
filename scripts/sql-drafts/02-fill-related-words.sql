-- 不执行、待 Rocky 审。
-- 作用：按 2026-11-13 只读快照的 39 个词条 ID 提供相关词候选，每词 3 项。
-- 只动 words.related_words_json；不动其它字段和 review_logs，不创建复习卡。
-- 必须先应用 migrations/0002_add_related_words.sql，再考虑本草稿。
-- 每项含美式 IPA（多音节标重音，单音节通常不另标）、词性、简短中文及关系。
-- 117 项已逐项复核；近义/反义按当前义项限定，搭配/同词族不表示可以直接替换。
-- IPA 使用美式宽式音标：省略长音号；保留 r 或 ɝ；不强制把有效美式变体统一成一种。
-- 复核依据与修正清单见 docs/交接 - 示例去重与相关词 - 2026-11-13.md；仍待 Rocky 审。
-- 线上 D1 才是准；仅当 id 匹配且旧值严格等于文本 '[]' 时写入。
-- NULL、空串、带空白的 '[ ]' 和非空内容均跳过；重复执行不覆盖已填内容。
-- 不得纳入自动迁移；本轮未执行线上或本地持久库写入。
-- 执行前只读核对：SELECT id, related_words_json FROM words ORDER BY id;

-- complex (adj)
UPDATE words
SET related_words_json = '[
  {"english": "complexity", "ipa": "/kəmˈplɛksəti/", "pos": "n.", "zh": "复杂性", "relation": "衍生"},
  {"english": "complicated", "ipa": "/ˈkɑmpləkeɪtɪd/", "pos": "adj.", "zh": "复杂的", "relation": "近义"},
  {"english": "simple", "ipa": "/ˈsɪmpəl/", "pos": "adj.", "zh": "简单的", "relation": "反义"}
]'
WHERE id = 'complex-adj-1' AND related_words_json = '[]';

-- crave (verb)
UPDATE words
SET related_words_json = '[
  {"english": "craving", "ipa": "/ˈkreɪvɪŋ/", "pos": "n.", "zh": "强烈渴望", "relation": "衍生"},
  {"english": "yearn", "ipa": "/jɝn/", "pos": "v.", "zh": "渴望", "relation": "近义"},
  {"english": "long for", "ipa": "/ˈlɔŋ fɔr/", "pos": "phr.", "zh": "渴望得到", "relation": "近义"}
]'
WHERE id = 'crave-v-1' AND related_words_json = '[]';

-- particular (adj)
UPDATE words
SET related_words_json = '[
  {"english": "particularly", "ipa": "/pərˈtɪkjələrli/", "pos": "adv.", "zh": "尤其；特别", "relation": "衍生"},
  {"english": "specific", "ipa": "/spəˈsɪfɪk/", "pos": "adj.", "zh": "特定的", "relation": "近义"},
  {"english": "general", "ipa": "/ˈdʒɛnərəl/", "pos": "adj.", "zh": "一般的；总体的", "relation": "反义"}
]'
WHERE id = 'particular-adj-1' AND related_words_json = '[]';

-- variety (noun)
UPDATE words
SET related_words_json = '[
  {"english": "various", "ipa": "/ˈvɛriəs/", "pos": "adj.", "zh": "各种各样的", "relation": "同词族"},
  {"english": "vary", "ipa": "/ˈvɛri/", "pos": "v.", "zh": "变化；不同", "relation": "同词族"},
  {"english": "diversity", "ipa": "/dɪˈvɝsəti/", "pos": "n.", "zh": "多样性", "relation": "相关"}
]'
WHERE id = 'variety-n-1' AND related_words_json = '[]';

-- advantage (noun)
UPDATE words
SET related_words_json = '[
  {"english": "advantageous", "ipa": "/ˌædvənˈteɪdʒəs/", "pos": "adj.", "zh": "有利的", "relation": "衍生"},
  {"english": "disadvantage", "ipa": "/ˌdɪsədˈvæntɪdʒ/", "pos": "n.", "zh": "劣势；不利条件", "relation": "反义"},
  {"english": "benefit", "ipa": "/ˈbɛnəfɪt/", "pos": "n.", "zh": "好处；益处", "relation": "近义"}
]'
WHERE id = 'advantage-n-1' AND related_words_json = '[]';

-- authentic (adj)
UPDATE words
SET related_words_json = '[
  {"english": "authenticity", "ipa": "/ˌɔθɛnˈtɪsəti/", "pos": "n.", "zh": "真实性；正宗性", "relation": "衍生"},
  {"english": "genuine", "ipa": "/ˈdʒɛnjuɪn/", "pos": "adj.", "zh": "真正的；非伪造的", "relation": "近义"},
  {"english": "inauthentic", "ipa": "/ˌɪnɔˈθɛntɪk/", "pos": "adj.", "zh": "不真实的；不地道的", "relation": "反义"}
]'
WHERE id = 'authentic-adj-1' AND related_words_json = '[]';

-- authorization (noun)
UPDATE words
SET related_words_json = '[
  {"english": "authorize", "ipa": "/ˈɔθəraɪz/", "pos": "v.", "zh": "授权；批准", "relation": "同词族"},
  {"english": "permission", "ipa": "/pərˈmɪʃən/", "pos": "n.", "zh": "许可", "relation": "近义"},
  {"english": "unauthorized", "ipa": "/ʌnˈɔθəraɪzd/", "pos": "adj.", "zh": "未经授权的", "relation": "同词族"}
]'
WHERE id = 'authorization-n-1' AND related_words_json = '[]';

-- authorize (verb)
UPDATE words
SET related_words_json = '[
  {"english": "authorization", "ipa": "/ˌɔθərəˈzeɪʃən/", "pos": "n.", "zh": "授权；许可", "relation": "衍生"},
  {"english": "authorized", "ipa": "/ˈɔθəraɪzd/", "pos": "adj.", "zh": "获授权的", "relation": "衍生"},
  {"english": "permit", "ipa": "/pərˈmɪt/", "pos": "v.", "zh": "允许；准许", "relation": "近义"}
]'
WHERE id = 'authorize-v-1' AND related_words_json = '[]';

-- approach (noun)
UPDATE words
SET related_words_json = '[
  {"english": "approachable", "ipa": "/əˈproʊtʃəbəl/", "pos": "adj.", "zh": "易接近的；易理解的", "relation": "同词族"},
  {"english": "unapproachable", "ipa": "/ˌʌnəˈproʊtʃəbəl/", "pos": "adj.", "zh": "难接近的", "relation": "同词族"},
  {"english": "method", "ipa": "/ˈmɛθəd/", "pos": "n.", "zh": "方法", "relation": "近义"}
]'
WHERE id = 'approach-n-1' AND related_words_json = '[]';

-- approach (verb)
UPDATE words
SET related_words_json = '[
  {"english": "approachable", "ipa": "/əˈproʊtʃəbəl/", "pos": "adj.", "zh": "平易近人的", "relation": "衍生"},
  {"english": "unapproachable", "ipa": "/ˌʌnəˈproʊtʃəbəl/", "pos": "adj.", "zh": "难接近的", "relation": "同词族"},
  {"english": "approach a problem", "ipa": "/əˈproʊtʃ ə ˈprɑbləm/", "pos": "phr.", "zh": "着手处理问题", "relation": "搭配"}
]'
WHERE id = 'approach-v-1' AND related_words_json = '[]';

-- approachable (adjective)
UPDATE words
SET related_words_json = '[
  {"english": "approach", "ipa": "/əˈproʊtʃ/", "pos": "v.", "zh": "接近；着手处理", "relation": "同词族"},
  {"english": "unapproachable", "ipa": "/ˌʌnəˈproʊtʃəbəl/", "pos": "adj.", "zh": "难接近的", "relation": "反义"},
  {"english": "friendly", "ipa": "/ˈfrɛndli/", "pos": "adj.", "zh": "友好的", "relation": "近义"}
]'
WHERE id = 'approachable-adj-1' AND related_words_json = '[]';

-- unapproachable (adjective)
UPDATE words
SET related_words_json = '[
  {"english": "approachable", "ipa": "/əˈproʊtʃəbəl/", "pos": "adj.", "zh": "平易近人的", "relation": "反义"},
  {"english": "aloof", "ipa": "/əˈluf/", "pos": "adj.", "zh": "冷淡疏远的", "relation": "近义"},
  {"english": "distant", "ipa": "/ˈdɪstənt/", "pos": "adj.", "zh": "冷淡的；疏远的", "relation": "近义"}
]'
WHERE id = 'unapproachable-adj-1' AND related_words_json = '[]';

-- form (noun)
UPDATE words
SET related_words_json = '[
  {"english": "application form", "ipa": "/ˌæpləˈkeɪʃən fɔrm/", "pos": "n.", "zh": "申请表", "relation": "搭配"},
  {"english": "fill out a form", "ipa": "/ˈfɪl aʊt ə fɔrm/", "pos": "phr.", "zh": "填写表格", "relation": "搭配"},
  {"english": "questionnaire", "ipa": "/ˌkwɛstʃəˈnɛr/", "pos": "n.", "zh": "问卷", "relation": "相关"}
]'
WHERE id = 'form-n-1' AND related_words_json = '[]';

-- sheet (noun)
UPDATE words
SET related_words_json = '[
  {"english": "worksheet", "ipa": "/ˈwɝkʃit/", "pos": "n.", "zh": "练习纸；工作表", "relation": "复合词"},
  {"english": "spreadsheet", "ipa": "/ˈsprɛdʃit/", "pos": "n.", "zh": "电子表格", "relation": "复合词"},
  {"english": "sheet of paper", "ipa": "/ˌʃit əv ˈpeɪpər/", "pos": "n.", "zh": "一张纸", "relation": "搭配"}
]'
WHERE id = 'sheet-n-1' AND related_words_json = '[]';

-- scope (noun)
UPDATE words
SET related_words_json = '[
  {"english": "scope of work", "ipa": "/ˌskoʊp əv ˈwɝk/", "pos": "n.", "zh": "工作范围", "relation": "搭配"},
  {"english": "out of scope", "ipa": "/ˌaʊt əv ˈskoʊp/", "pos": "phr.", "zh": "超出范围", "relation": "搭配"},
  {"english": "extent", "ipa": "/ɪkˈstɛnt/", "pos": "n.", "zh": "范围；程度", "relation": "近义"}
]'
WHERE id = 'scope-n-1' AND related_words_json = '[]';

-- range (noun)
UPDATE words
SET related_words_json = '[
  {"english": "wide-ranging", "ipa": "/ˌwaɪdˈreɪndʒɪŋ/", "pos": "adj.", "zh": "范围广泛的", "relation": "复合词"},
  {"english": "spectrum", "ipa": "/ˈspɛktrəm/", "pos": "n.", "zh": "范围；系列", "relation": "近义"},
  {"english": "range of options", "ipa": "/ˌreɪndʒ əv ˈɑpʃənz/", "pos": "n.", "zh": "一系列选项", "relation": "搭配"}
]'
WHERE id = 'range-n-1' AND related_words_json = '[]';

-- analyze (verb)
UPDATE words
SET related_words_json = '[
  {"english": "analysis", "ipa": "/əˈnæləsɪs/", "pos": "n.", "zh": "分析", "relation": "衍生"},
  {"english": "analyst", "ipa": "/ˈænəlɪst/", "pos": "n.", "zh": "分析师", "relation": "衍生"},
  {"english": "analytical", "ipa": "/ˌænəˈlɪtɪkəl/", "pos": "adj.", "zh": "分析性的", "relation": "衍生"}
]'
WHERE id = 'analyze-v-1' AND related_words_json = '[]';

-- incredible (adjective)
UPDATE words
SET related_words_json = '[
  {"english": "incredibly", "ipa": "/ɪnˈkrɛdəbli/", "pos": "adv.", "zh": "难以置信地；极其", "relation": "衍生"},
  {"english": "credible", "ipa": "/ˈkrɛdəbəl/", "pos": "adj.", "zh": "可信的", "relation": "反义（难以置信义）"},
  {"english": "amazing", "ipa": "/əˈmeɪzɪŋ/", "pos": "adj.", "zh": "惊人的；极好的", "relation": "近义（极好义）"}
]'
WHERE id = 'incredible-adj-1' AND related_words_json = '[]';

-- immediately (adverb)
UPDATE words
SET related_words_json = '[
  {"english": "immediate", "ipa": "/ɪˈmidiət/", "pos": "adj.", "zh": "立即的；直接的", "relation": "同词族"},
  {"english": "instantly", "ipa": "/ˈɪnstəntli/", "pos": "adv.", "zh": "立刻", "relation": "近义"},
  {"english": "right away", "ipa": "/ˌraɪt əˈweɪ/", "pos": "phr.", "zh": "马上", "relation": "近义"}
]'
WHERE id = 'immediately-adv-1' AND related_words_json = '[]';

-- scammer (noun)
UPDATE words
SET related_words_json = '[
  {"english": "scam", "ipa": "/skæm/", "pos": "n./v.", "zh": "骗局；诈骗", "relation": "同词族"},
  {"english": "fraudster", "ipa": "/ˈfrɔdstər/", "pos": "n.", "zh": "诈骗者", "relation": "近义"},
  {"english": "con artist", "ipa": "/ˈkɑn ˌɑrtɪst/", "pos": "n.", "zh": "骗子；诈骗高手", "relation": "近义"}
]'
WHERE id = 'scammer-n-1' AND related_words_json = '[]';

-- approval (noun)
UPDATE words
SET related_words_json = '[
  {"english": "approve", "ipa": "/əˈpruv/", "pos": "v.", "zh": "批准；赞同", "relation": "同词族"},
  {"english": "disapproval", "ipa": "/ˌdɪsəˈpruvəl/", "pos": "n.", "zh": "不赞同", "relation": "反义"},
  {"english": "seek approval", "ipa": "/ˌsik əˈpruvəl/", "pos": "phr.", "zh": "寻求批准或认可", "relation": "搭配"}
]'
WHERE id = 'approval-n-1' AND related_words_json = '[]';

-- lack (verb (also noun))
UPDATE words
SET related_words_json = '[
  {"english": "lacking", "ipa": "/ˈlækɪŋ/", "pos": "adj.", "zh": "缺乏的；不足的", "relation": "衍生"},
  {"english": "shortage", "ipa": "/ˈʃɔrtɪdʒ/", "pos": "n.", "zh": "短缺", "relation": "相关"},
  {"english": "lack of", "ipa": "/ˈlæk əv/", "pos": "phr.", "zh": "缺少……", "relation": "搭配"}
]'
WHERE id = 'lack-v-1' AND related_words_json = '[]';

-- blame (verb & noun)
UPDATE words
SET related_words_json = '[
  {"english": "blameless", "ipa": "/ˈbleɪmləs/", "pos": "adj.", "zh": "无过错的", "relation": "衍生"},
  {"english": "blameworthy", "ipa": "/ˈbleɪmˌwɝði/", "pos": "adj.", "zh": "应受责备的", "relation": "衍生"},
  {"english": "blame someone for", "ipa": "/ˈbleɪm ˌsʌmwʌn fɔr/", "pos": "phr.", "zh": "因某事责怪某人", "relation": "搭配"}
]'
WHERE id = 'blame-v-1' AND related_words_json = '[]';

-- separate (adjective)
UPDATE words
SET related_words_json = '[
  {"english": "separately", "ipa": "/ˈsɛpərətli/", "pos": "adv.", "zh": "分别地；单独地", "relation": "衍生"},
  {"english": "separation", "ipa": "/ˌsɛpəˈreɪʃən/", "pos": "n.", "zh": "分离；分开", "relation": "衍生"},
  {"english": "joint", "ipa": "/dʒɔɪnt/", "pos": "adj.", "zh": "共同的；联合的", "relation": "反义"}
]'
WHERE id = 'separate-adj-1' AND related_words_json = '[]';

-- separate (verb)
UPDATE words
SET related_words_json = '[
  {"english": "separation", "ipa": "/ˌsɛpəˈreɪʃən/", "pos": "n.", "zh": "分离；分开", "relation": "衍生"},
  {"english": "divide", "ipa": "/dɪˈvaɪd/", "pos": "v.", "zh": "分开；划分", "relation": "近义"},
  {"english": "combine", "ipa": "/kəmˈbaɪn/", "pos": "v.", "zh": "合并；结合", "relation": "反义"}
]'
WHERE id = 'separate-v-1' AND related_words_json = '[]';

-- separation (noun)
UPDATE words
SET related_words_json = '[
  {"english": "separate", "ipa": "/ˈsɛpəreɪt/", "pos": "v.", "zh": "分开；分离", "relation": "同词族"},
  {"english": "separately", "ipa": "/ˈsɛpərətli/", "pos": "adv.", "zh": "分开地", "relation": "同词族"},
  {"english": "reunion", "ipa": "/ˌriˈjunjən/", "pos": "n.", "zh": "重聚；团聚", "relation": "反义（分离义）"}
]'
WHERE id = 'separation-n-1' AND related_words_json = '[]';

-- period (noun)
UPDATE words
SET related_words_json = '[
  {"english": "periodic", "ipa": "/ˌpɪriˈɑdɪk/", "pos": "adj.", "zh": "周期性的", "relation": "衍生"},
  {"english": "time span", "ipa": "/ˈtaɪm spæn/", "pos": "n.", "zh": "一段时间", "relation": "近义"},
  {"english": "period of time", "ipa": "/ˌpɪriəd əv ˈtaɪm/", "pos": "n.", "zh": "一段时期", "relation": "搭配"}
]'
WHERE id = 'period-n-1' AND related_words_json = '[]';

-- obsessed (adjective)
UPDATE words
SET related_words_json = '[
  {"english": "obsession", "ipa": "/əbˈsɛʃən/", "pos": "n.", "zh": "痴迷；执念", "relation": "同词族"},
  {"english": "obsessive", "ipa": "/əbˈsɛsɪv/", "pos": "adj.", "zh": "痴迷的；执着过度的", "relation": "同词族"},
  {"english": "be obsessed with", "ipa": "/bi əbˈsɛst wɪð/", "pos": "phr.", "zh": "对……着迷", "relation": "搭配"}
]'
WHERE id = 'obsessed-adj-1' AND related_words_json = '[]';

-- particularly (adverb)
UPDATE words
SET related_words_json = '[
  {"english": "particular", "ipa": "/pərˈtɪkjələr/", "pos": "adj.", "zh": "特定的；特别的", "relation": "同词族"},
  {"english": "especially", "ipa": "/ɪˈspɛʃəli/", "pos": "adv.", "zh": "尤其", "relation": "近义"},
  {"english": "in particular", "ipa": "/ɪn pərˈtɪkjələr/", "pos": "phr.", "zh": "尤其；特别", "relation": "近义"}
]'
WHERE id = 'particularly-adv-1' AND related_words_json = '[]';

-- replace (verb)
UPDATE words
SET related_words_json = '[
  {"english": "replacement", "ipa": "/rɪˈpleɪsmənt/", "pos": "n.", "zh": "替代品；更换", "relation": "衍生"},
  {"english": "replaceable", "ipa": "/rɪˈpleɪsəbəl/", "pos": "adj.", "zh": "可替换的", "relation": "衍生"},
  {"english": "irreplaceable", "ipa": "/ˌɪrɪˈpleɪsəbəl/", "pos": "adj.", "zh": "不可替代的", "relation": "衍生"}
]'
WHERE id = 'replace-v-1' AND related_words_json = '[]';

-- practically (adverb)
UPDATE words
SET related_words_json = '[
  {"english": "practical", "ipa": "/ˈpræktɪkəl/", "pos": "adj.", "zh": "实际的；实用的", "relation": "同词族"},
  {"english": "virtually", "ipa": "/ˈvɝtʃuəli/", "pos": "adv.", "zh": "几乎", "relation": "近义"},
  {"english": "almost", "ipa": "/ˈɔlmoʊst/", "pos": "adv.", "zh": "几乎", "relation": "近义"}
]'
WHERE id = 'practically-adv-1' AND related_words_json = '[]';

-- ranking (noun)
UPDATE words
SET related_words_json = '[
  {"english": "rank", "ipa": "/ræŋk/", "pos": "n./v.", "zh": "名次；排名", "relation": "同词族"},
  {"english": "top-ranked", "ipa": "/ˌtɑpˈræŋkt/", "pos": "adj.", "zh": "名列前茅的", "relation": "复合词"},
  {"english": "ranking system", "ipa": "/ˈræŋkɪŋ ˌsɪstəm/", "pos": "n.", "zh": "排名制度", "relation": "搭配"}
]'
WHERE id = 'ranking-n-1' AND related_words_json = '[]';

-- leaderboard (noun)
UPDATE words
SET related_words_json = '[
  {"english": "ranking", "ipa": "/ˈræŋkɪŋ/", "pos": "n.", "zh": "排名；名次", "relation": "相关"},
  {"english": "scoreboard", "ipa": "/ˈskɔrbɔrd/", "pos": "n.", "zh": "记分牌", "relation": "相关"},
  {"english": "top the leaderboard", "ipa": "/ˌtɑp ðə ˈlidərbɔrd/", "pos": "phr.", "zh": "位居榜首", "relation": "搭配"}
]'
WHERE id = 'leaderboard-n-1' AND related_words_json = '[]';

-- respond (verb)
UPDATE words
SET related_words_json = '[
  {"english": "response", "ipa": "/rɪˈspɑns/", "pos": "n.", "zh": "回应；反应", "relation": "衍生"},
  {"english": "responsive", "ipa": "/rɪˈspɑnsɪv/", "pos": "adj.", "zh": "反应迅速的", "relation": "衍生"},
  {"english": "reply", "ipa": "/rɪˈplaɪ/", "pos": "v.", "zh": "回复", "relation": "近义"}
]'
WHERE id = 'respond-v-1' AND related_words_json = '[]';

-- response (noun)
UPDATE words
SET related_words_json = '[
  {"english": "respond", "ipa": "/rɪˈspɑnd/", "pos": "v.", "zh": "回应；反应", "relation": "同词族"},
  {"english": "responsive", "ipa": "/rɪˈspɑnsɪv/", "pos": "adj.", "zh": "反应迅速的", "relation": "同词族"},
  {"english": "in response to", "ipa": "/ɪn rɪˈspɑns tu/", "pos": "phr.", "zh": "作为对……的回应", "relation": "搭配"}
]'
WHERE id = 'response-n-1' AND related_words_json = '[]';

-- responsibility (noun)
UPDATE words
SET related_words_json = '[
  {"english": "responsible", "ipa": "/rɪˈspɑnsəbəl/", "pos": "adj.", "zh": "负责的", "relation": "同词族"},
  {"english": "irresponsibility", "ipa": "/ˌɪrɪˌspɑnsəˈbɪləti/", "pos": "n.", "zh": "不负责任", "relation": "反义"},
  {"english": "accountability", "ipa": "/əˌkaʊntəˈbɪləti/", "pos": "n.", "zh": "问责；责任", "relation": "近义"}
]'
WHERE id = 'responsibility-n-1' AND related_words_json = '[]';

-- responsible (adjective)
UPDATE words
SET related_words_json = '[
  {"english": "responsibility", "ipa": "/rɪˌspɑnsəˈbɪləti/", "pos": "n.", "zh": "责任；职责", "relation": "衍生"},
  {"english": "irresponsible", "ipa": "/ˌɪrɪˈspɑnsəbəl/", "pos": "adj.", "zh": "不负责任的", "relation": "反义"},
  {"english": "accountable", "ipa": "/əˈkaʊntəbəl/", "pos": "adj.", "zh": "须负责的", "relation": "近义"}
]'
WHERE id = 'responsible-adj-1' AND related_words_json = '[]';

-- duty (noun)
UPDATE words
SET related_words_json = '[
  {"english": "dutiful", "ipa": "/ˈdutɪfəl/", "pos": "adj.", "zh": "尽责的；顺从的", "relation": "衍生"},
  {"english": "obligation", "ipa": "/ˌɑbləˈɡeɪʃən/", "pos": "n.", "zh": "义务", "relation": "近义"},
  {"english": "on duty", "ipa": "/ɑn ˈduti/", "pos": "phr.", "zh": "值班；在岗", "relation": "搭配"}
]'
WHERE id = 'duty-n-1' AND related_words_json = '[]';

-- reply (verb & noun)
UPDATE words
SET related_words_json = '[
  {"english": "response", "ipa": "/rɪˈspɑns/", "pos": "n.", "zh": "答复；回应", "relation": "近义"},
  {"english": "respond", "ipa": "/rɪˈspɑnd/", "pos": "v.", "zh": "回应；作出反应", "relation": "近义"},
  {"english": "reply to", "ipa": "/rɪˈplaɪ tu/", "pos": "phr.", "zh": "回复……", "relation": "搭配"}
]'
WHERE id = 'reply-v-1' AND related_words_json = '[]';
