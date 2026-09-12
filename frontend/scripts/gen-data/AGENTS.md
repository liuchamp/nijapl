AGENTS.md — seed→JSON pipeline (frontend/scripts/gen-data/)

OVERVIEW: index.ts builds W (stages/modules/words/grammar/sentences) then K (kana.json) → frontend/data/build/*.json; validate; exit 1 on fail. `npm run gen:data` (tsx).

PIPELINE: seed/*.ts (W) + source/kana/{index,groups,kana}.ts (K) → build-*.ts / build-kana.ts (pure, deterministic) → data/build/*.json → validate.ts / validate-kana.ts.

CONVENTIONS: kana id=romaji; hiragana/katakana split by code-point stride (2-cp 拗音); strokePaths=[] v1 (reserved); confusable symmetric closure; group kanaIds from declaration order; kana build two-pass (clear rows index leading kana, then 拗音 resolve baseKanaId via baseFromFirst); row errors throw '[build-kana]'.

ANTI-PATTERNS: never hand-edit data/build; never fabricate content to pass validation (missing examples = fail, no fake fallback); never merge kana.json into BuildData (W contract frozen); pages/engines query repository.ts, never JSON directly.

KEY PATHS: index.ts, build-*.ts, build-kana.ts, validate.ts, validate-kana.ts, source/seed/, source/kana/, data/build/, repository.ts.
