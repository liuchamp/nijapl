# AGENTS.md — frontend/src/pages

PAGES — 13 dirs (P0-P9, K0-K2), each index.tsx + index.css.
OVERVIEW: Page layer renders; writes only via store/actions; no direct Wails/browser calls.

TABLE: Home(P0) / StageMap(P1) / Study(P2) / VocabDetail(P3) / GrammarList(P4) / GrammarDetail(P5) / Graph(P6) / Review(P7) / Quiz(P8 — NO entry, redline) / Me(P9) / Kana(K0 chart) / KanaStudy(K1 writing) / KanaQuiz(K2 quiz).

CONVENTIONS:
- No <Link>/<NavLink>; navigate via router/navigation.ts useNavigate; paths from constants/routes.ts (studyPath, vocabPath, grammarDetailPath, graphPath, kanaStudyPath, kanaQuizPath, isTabPath).
- TabBar: only 5 tab paths (/, /stages, /grammar, /review, /me); K-routes NOT tabs.
- Study: prefetch next word kana via ttsPrefetch on card change.
- VocabDetail: evaluateSceneEffect on mount + prefetch first 2 sentences ja.
- KanaStudy: call kanaWriteSession.enterKanaGroup(groupId,index) BEFORE navigate (writes store breakpoint); never pass index via query params. Unmount: must call cancelKanaPeek() (dangling timer writes state after leave).
- CSS co-located; rpx rewritten at build; body 14px baseline.

ANTI-PATTERNS:
- Don't add Quiz entry; don't "fix" Quiz-no-entry.
- Don't import port files (*.wails.ts / *.web.ts / tts-client.ts / player*.ts).
- Don't construct selectors that return new objects (infinite re-render).
- Don't pass kana index via URL params; don't skip cancelKanaPeek on unmount.

CITE: constants/routes.ts, router/navigation.ts, services/studySession.ts, services/kanaWriteSession.ts, store/actions.ts, store/selectors.ts.
