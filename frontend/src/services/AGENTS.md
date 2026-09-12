# AGENTS.md — frontend/src/services

OVERVIEW: services/ orchestration layer. Thin page<->store translation; timers live here; only clipboard.ts imports bindings directly.

WHERE TO LOOK:
- studySession.ts: beginStudy / applySelfEvaluation / evaluateSceneEffect
- jumpService.ts: JumpDecision -> StudyEffect
- ttsController.ts: visual feedback <=100ms, sync prime?, describeTtsFailure (7 branches), copyKana
- quiz.ts: deterministic build, no shuffle
- kanaWriteSession.ts: revealKanaPeek / cancelKanaPeek / enterKanaGroup; KANA_PEEK_MS=2000 timer
- ttsPrefetch.ts: queue, concurrency 2 (per-tick slot release), silent failures only
- clipboard.ts: navigator.clipboard -> System.SetClipboard; returns bool; P9 export fallback
- __tests__/: 5 files

CONVENTIONS:
- Write ops converge on store/actions.ts; services never setState directly.
- Timers (setTimeout) live HERE, not in actions (pure sync only). kanaWriteSession: single pending peek timer, cleared on re-tap/unmount via cancelKanaPeek.
- Only clipboard.ts may import frontend/bindings System directly (sole exception).
- Prefetch: Study -> next word kana; VocabDetail -> first 2 sentence ja. Failures silent (only sanctioned silence).
- Dependency: zustand vanilla store (store/index.ts) only; no React bindings (runs in Node smoke tests).

ANTI-PATTERNS:
- Never put setTimeout in store/actions.ts.
- Never import bindings outside clipboard.ts.
- Never shuffle in quiz.ts; never throw in port layer (see parent).
- Never set state directly; always dispatch actions.
