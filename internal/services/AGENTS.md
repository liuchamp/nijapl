# AGENTS.md — internal/services

OVERVIEW: Go services for Wails v3 desktop app. KVStore (kvstore.go), TTS (tts.go), System (system.go). Never surface errors across bindings.

SERVICE TABLE:
- kvstore.go: KVStore Get/Set/Remove/Flush; in-memory map; 250ms debounce; atomic tmp+rename; load fail -> empty.
- tts.go: Synthesize/Prefetch/Cancel; ServeHTTP /wails/tts; 8s user / 15s prefetch timeout; retry once 300ms; LRU 64 + byte cap; singleflight; status mapping 400/503/504/408; repairPlusSign.
- system.go: Platform()=runtime.GOOS; SetClipboard()=darwin pbcopy else false.
- tts_test.go + tts_servehttp_test.go: skip if unreachable, mark unexecuted, no mocks.

CONVENTIONS: methods return nil error / bool / discriminated result; frontend ports never throw. Config: internal/config/config.go (NIJAPL_TTS_BASE_URL > ldflags > default). ServeHTTP: GET only, ignores subpath, 200 + JSON + CORS, SynthesizeResult envelope.

ANTI-PATTERNS: NEVER return Go errors across bindings. Query building: url.Values.Encode, NOT Sprintf. Never mock TTS in tests. Registered in main.go (Route /wails/tts).

COMMANDS: go build ./... && go vet ./internal/... . ; go test ./internal/... .
