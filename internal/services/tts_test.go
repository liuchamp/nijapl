package services

import (
	"net/http"
	"testing"
	"time"

	"nijapl/internal/config"
)

// ttsReachable 探测本地 TTS 服务是否可用。
//
// 纪律：不可达时**跳过**真实集成用例，绝不用 mock 数据冒充「通过」——
// 与前端 `tests/qa/tts/tts-http.integration.qa.test.ts` 的处理方式保持一致。
func ttsReachable(t *testing.T) bool {
	t.Helper()
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(config.TTSBaseURL())
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return true
}

// realParams 构造一份与服务端契约一致的合成参数（与前端 `buildSynthesisParams` 同字段）。
func realParams(key string) SynthesizeParams {
	return SynthesizeParams{
		Text:   "わたし",
		Lang:   "ja-JP",
		Voice:  "ja-JP-NanamiNeural",
		Rate:   "+0%",
		Volume: "+0%",
		Pitch:  "+0Hz",
		Format: "mp3",
		Key:    key,
	}
}

// TestTTS_EmptyTextShortCircuits 验证空文本在**不发起任何网络请求**的前提下短路，
// 返回 `empty-text`（前端 `mapSourceFailure`/`ResolvingTtsPort` 依赖此取值做降级判定）。
func TestTTS_EmptyTextShortCircuits(t *testing.T) {
	svc := NewTTS()
	for _, text := range []string{"", "   ", "\t\n "} {
		res := svc.Synthesize(SynthesizeParams{Text: text, Key: "empty-" + text})
		if res.OK {
			t.Fatalf("空文本不应成功（输入 %q）", text)
		}
		if res.Reason != reasonEmptyText {
			t.Fatalf("空文本 reason 应为 %q，实际 %q（输入 %q）", reasonEmptyText, res.Reason, text)
		}
		if res.Clip != nil {
			t.Fatalf("失败结果不应携带 Clip（输入 %q）", text)
		}
	}
}

// TestTTS_Synthesize_RealService 真实服务端到端：首次合成 → 二次命中缓存。
//
// 覆盖：POST `/v1/tts/synthesize`、base64 音频解码长度、LRU 写缓存与 `Cached` 标记。
func TestTTS_Synthesize_RealService(t *testing.T) {
	if !ttsReachable(t) {
		t.Skipf("TTS 服务不可达（%s）→ 跳过真实集成用例", config.TTSBaseURL())
	}

	svc := NewTTS()
	params := realParams("go-test-real-1")
	first := svc.Synthesize(params)
	if !first.OK {
		t.Fatalf("合成失败: reason=%q status=%d serviceReason=%q", first.Reason, first.Status, first.ServiceReason)
	}
	if first.Clip == nil {
		t.Fatal("OK 但 Clip 为 nil")
	}
	if first.Clip.Base64 == "" {
		t.Fatal("OK 但 Base64 为空")
	}
	if first.Clip.ByteLength <= 0 {
		t.Fatalf("ByteLength 应 > 0，实际 %d", first.Clip.ByteLength)
	}
	// 注意：`Clip.Cached` 是**服务端**返回的缓存标记（ttsedservice 自身有缓存，
	// 同一文本在服务端重启前可能一直是 true），不代表 Go 侧 LRU 命中。
	// Go 侧缓存的正确验证方式是直接查 `cacheGet`（见下方）与 TestTTS_PrefetchThenHitCache。
	t.Logf("首次合成: mime=%q bytes=%d voice=%q serverCached=%v",
		first.Clip.Mime, first.Clip.ByteLength, first.Clip.Voice, first.Clip.Cached)

	if svc.cacheGet(params.Key) == nil {
		t.Error("合成成功后应写入 Go 侧 LRU 缓存")
	}

	second := svc.Synthesize(params)
	if !second.OK || second.Clip == nil {
		t.Fatalf("二次调用应命中缓存并成功: reason=%q", second.Reason)
	}
	if second.Clip.Base64 != first.Clip.Base64 {
		t.Error("二次调用返回的音频应与首次一致")
	}
}

// TestTTS_Synthesize_SpecialChars 验证 `rate/volume/pitch` 含 `+`、`%` 等特殊字符时
// 端到端仍成功（前端 H13「编码坑」在 Go 侧的表现：参数须原样送达服务端）。
func TestTTS_Synthesize_SpecialChars(t *testing.T) {
	if !ttsReachable(t) {
		t.Skipf("TTS 服务不可达（%s）→ 跳过", config.TTSBaseURL())
	}

	svc := NewTTS()
	params := realParams("go-test-special-1")
	params.Text = "ありがとうございます"
	params.Rate = "-20%"
	params.Pitch = "+2Hz"

	res := svc.Synthesize(params)
	if !res.OK {
		t.Fatalf("含特殊字符（+/-/%%）的参数合成失败: reason=%q status=%d serviceReason=%q",
			res.Reason, res.Status, res.ServiceReason)
	}
}

// TestTTS_PrefetchThenHitCache 验证 `Prefetch`（fire-and-forget）落缓存后，
// 随后同步 `Synthesize` 能直接命中，不重复走网络。
func TestTTS_PrefetchThenHitCache(t *testing.T) {
	if !ttsReachable(t) {
		t.Skipf("TTS 服务不可达（%s）→ 跳过", config.TTSBaseURL())
	}

	svc := NewTTS()
	params := realParams("go-test-prefetch-1")
	svc.Prefetch(params)

	// 预取为异步，轮询等待其落缓存（上限 5s，避免悬挂）。
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if clip := svc.cacheGet(params.Key); clip != nil {
			res := svc.Synthesize(params)
			if !res.OK || res.Clip == nil {
				t.Fatalf("预取后同步合成应成功: reason=%q", res.Reason)
			}
			if !res.Clip.Cached {
				t.Error("预取后同步合成应命中缓存")
			}
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("预取在 5s 内未落缓存")
}
