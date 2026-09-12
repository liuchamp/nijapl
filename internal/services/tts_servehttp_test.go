package services

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// newHandlerTestTTS 构造指向 fake 上游的 TTS（同包可直接组装私有字段）。
func newHandlerTestTTS(t *testing.T, upstream string) *TTS {
	t.Helper()
	return &TTS{
		baseURL:  strings.TrimRight(upstream, "/"),
		client:   &http.Client{},
		cache:    make(map[string]*ttsCacheEntry),
		inflight: make(map[string]*ttsInflight),
	}
}

// fakeUpstream 返回 canned ttsedservice，并记录收到的 POST body。
func fakeUpstream(t *testing.T, bodies *[]map[string]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != ttsSynthesizePath || r.Method != http.MethodPost {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"reason":"not-found"}`))
			return
		}
		raw, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		var body map[string]string
		_ = json.Unmarshal(raw, &body)
		*bodies = append(*bodies, body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"audio":"` + base64.StdEncoding.EncodeToString([]byte("mp3bytes")) + `","content_type":"audio/mpeg","voice":"ja-JP-NanamiNeural","cached":false}`))
	}))
}

// TestTTS_ServeHTTP_SuccessEnvelope 验证 200 信封：永远 200 + JSON + CORS 头，clip 可播。
func TestTTS_ServeHTTP_SuccessEnvelope(t *testing.T) {
	var bodies []map[string]string
	upstream := fakeUpstream(t, &bodies)
	defer upstream.Close()

	svc := newHandlerTestTTS(t, upstream.URL)
	q := url.Values{}
	q.Set("text", "ねこ")
	q.Set("lang", "ja-JP")
	q.Set("voice", "ja-JP-NanamiNeural")
	q.Set("rate", "+0%")
	q.Set("volume", "+0%")
	q.Set("pitch", "+0Hz")
	q.Set("format", "mp3")
	q.Set("key", "handler-test-1")
	req := httptest.NewRequest(http.MethodGet, "/v1/tts/speech?"+q.Encode(), nil)
	rec := httptest.NewRecorder()

	svc.ServeHTTP(rec, req)

	resp := rec.Result()
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("ServeHTTP 必须永远 200，实际 %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type 应为 application/json，实际 %q", ct)
	}
	if aca := resp.Header.Get("Access-Control-Allow-Origin"); aca != "*" {
		t.Fatalf("Access-Control-Allow-Origin 应为 *，实际 %q", aca)
	}
	var result SynthesizeResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("信封 JSON 解析失败: %v", err)
	}
	if !result.OK || result.Clip == nil {
		t.Fatalf("应成功: reason=%q status=%d serviceReason=%q", result.Reason, result.Status, result.ServiceReason)
	}
	if result.Clip.Base64 == "" {
		t.Fatal("Clip.Base64 不应为空")
	}
	if result.Clip.Mime != "audio/mpeg" {
		t.Fatalf("Mime 应为 audio/mpeg，实际 %q", result.Clip.Mime)
	}
}

// TestTTS_ServeHTTP_EmptyText 验证空文本不打上游，直接 empty-text 信封（仍 200）。
func TestTTS_ServeHTTP_EmptyText(t *testing.T) {
	var bodies []map[string]string
	upstream := fakeUpstream(t, &bodies)
	defer upstream.Close()

	svc := newHandlerTestTTS(t, upstream.URL)
	req := httptest.NewRequest(http.MethodGet, "/v1/tts/speech?text=%20%20&lang=ja-JP", nil)
	rec := httptest.NewRecorder()

	svc.ServeHTTP(rec, req)

	resp := rec.Result()
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("空文本也必须 200，实际 %d", resp.StatusCode)
	}
	var result SynthesizeResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("信封解析失败: %v", err)
	}
	if result.OK {
		t.Fatal("空文本不应 OK")
	}
	if result.Reason != reasonEmptyText {
		t.Fatalf("空文本 reason 应为 %q，实际 %q", reasonEmptyText, result.Reason)
	}
	if len(bodies) != 0 {
		t.Fatalf("空文本不应打上游，实际打了 %d 次", len(bodies))
	}
}

// TestTTS_ServeHTTP_QueryMapping 验证 query→SynthesizeParams 原样透传（含 +/% 编码）。
func TestTTS_ServeHTTP_QueryMapping(t *testing.T) {
	var bodies []map[string]string
	upstream := fakeUpstream(t, &bodies)
	defer upstream.Close()

	svc := newHandlerTestTTS(t, upstream.URL)
	q := url.Values{}
	q.Set("text", "ありがとう")
	q.Set("lang", "ja-JP")
	q.Set("voice", "ja-JP-KeitaNeural")
	q.Set("rate", "-20%")
	q.Set("volume", "+0%")
	q.Set("pitch", "+2Hz")
	q.Set("format", "mp3")
	q.Set("key", "handler-test-map-1")
	req := httptest.NewRequest(http.MethodGet, "/ignored-subpath?"+q.Encode(), nil)
	rec := httptest.NewRecorder()

	svc.ServeHTTP(rec, req)

	resp := rec.Result()
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("必须 200，实际 %d", resp.StatusCode)
	}
	if len(bodies) != 1 {
		t.Fatalf("上游应被打 1 次，实际 %d 次", len(bodies))
	}
	got := bodies[0]
	for k, want := range map[string]string{
		"text": "ありがとう", "lang": "ja-JP", "voice": "ja-JP-KeitaNeural",
		"rate": "-20%", "volume": "+0%", "pitch": "+2Hz", "format": "mp3",
	} {
		if got[k] != want {
			t.Fatalf("上游 body[%q] 应为 %q，实际 %q（全量 %v）", k, want, got[k], got)
		}
	}
}

// TestTTS_ServeHTTP_NeverNon200 验证非 GET 也仍回 200 信封（Java 把非 200 映射成 500）。
func TestTTS_ServeHTTP_NeverNon200(t *testing.T) {
	svc := newHandlerTestTTS(t, "http://127.0.0.1:1")
	req := httptest.NewRequest(http.MethodPost, "/v1/tts/speech?text=ねこ", strings.NewReader("{}"))
	rec := httptest.NewRecorder()

	svc.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("非 GET 也必须 200，实际 %d", rec.Code)
	}
}

// TestTTS_ServeHTTP_AndroidPlusRepair 回归：Android Java 用 getQuery()（解码一次）
// 再拼回 path，Go 侧 raw query 里变成字面 '+'，form 解析将其视为空格。
// 此处手写 RawQuery（字面 '+'，即 Java 转发后的状态），要求上游仍收到 '+0%'。
func TestTTS_ServeHTTP_AndroidPlusRepair(t *testing.T) {
	var bodies []map[string]string
	upstream := fakeUpstream(t, &bodies)
	defer upstream.Close()

	svc := newHandlerTestTTS(t, upstream.URL)
	raw := "text=%E3%81%AD%E3%81%93&lang=ja-JP&voice=ja-JP-NanamiNeural" +
		"&rate=+0%25&volume=+0%25&pitch=+0Hz&format=mp3&key=handler-test-plus-1"
	req := httptest.NewRequest(http.MethodGet, "/v1/tts/speech?"+raw, nil)
	rec := httptest.NewRecorder()

	svc.ServeHTTP(rec, req)

	resp := rec.Result()
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("必须 200，实际 %d", resp.StatusCode)
	}
	if len(bodies) != 1 {
		t.Fatalf("上游应被打 1 次，实际 %d 次", len(bodies))
	}
	got := bodies[0]
	for k, want := range map[string]string{
		"rate": "+0%", "volume": "+0%", "pitch": "+0Hz",
	} {
		if got[k] != want {
			t.Fatalf("上游 body[%q] 应为 %q（repair 生效），实际 %q（全量 %v）", k, want, got[k], got)
		}
	}
}
