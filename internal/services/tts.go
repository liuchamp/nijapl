package services

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"nijapl/internal/config"
)

// TTS 服务：HTTP 合成的 Go 侧实现，替代原 Lynx 工程中前端 `fetch` 直连 ttsedservice。
//
// 为什么下沉到 Go（迁移的关键决策）：
//   - 桌面 WebView（WKWebView / WebView2）同样执行同源策略，`wails://` 页面直连
//     `http://127.0.0.1:8000` 会被 CORS 拦截；
//   - 超时 / 重试 / 缓存 / 在途去重 / 取消，全部是 Go 的强项，且可用 context 真中断；
//   - 前端 `ResolvingTtsPort` 的降级链与互斥编排（M1–M3）**完全不变**，只是数据源换成绑定调用。
//
// 与服务端的契约（沿用原实现，不得漂移）：
//   - `POST {base}/v1/tts/synthesize`，JSON body：`text/lang/rate/volume/pitch/format[/voice]`
//   - 2xx → `{audio(base64), content_type?, voice?, cached?}`
//   - 非 2xx → 响应体 `{reason}`；400→bad-request、503→unavailable、504/408→timeout、其余 error
//   - 503 时去掉 `voice` 重试一次（退避 300ms）；400 不重试只记日志
type TTS struct {
	baseURL string
	client  *http.Client

	cacheMu    sync.Mutex
	cache      map[string]*ttsCacheEntry
	cacheBytes int

	inflightMu sync.Mutex
	inflight   map[string]*ttsInflight

	cancelMu   sync.Mutex
	cancelFunc context.CancelFunc
}

// SynthesizeParams 由前端构造（`engine/tts/request.ts` 的 `buildSynthesisParams`），
// 含前端算好的缓存 key，保证与服务端 `sha256(format\0voice\0rate\0volume\0pitch\0text)` 同序同字段。
type SynthesizeParams struct {
	Text   string `json:"text"`
	Lang   string `json:"lang"`
	Voice  string `json:"voice"`
	Rate   string `json:"rate"`
	Volume string `json:"volume"`
	Pitch  string `json:"pitch"`
	Format string `json:"format"`
	Key    string `json:"key"`
}

// AudioClip 是合成结果（与前端 `TtsAudioClip` 的字段对齐）。
type AudioClip struct {
	Key        string `json:"key"`
	Mime       string `json:"mime"`
	Base64     string `json:"base64"`
	Voice      string `json:"voice"`
	Cached     bool   `json:"cached"`
	ByteLength int    `json:"byteLength"`
}

// SynthesizeResult 是判别联合结果：端口永不返回 error，失败通过 Reason 表达。
type SynthesizeResult struct {
	OK            bool       `json:"ok"`
	Clip          *AudioClip `json:"clip,omitempty"`
	Reason        string     `json:"reason,omitempty"`
	Status        int        `json:"status,omitempty"`
	ServiceReason string     `json:"serviceReason,omitempty"`
}

// 失败原因（原值，前端 `mapSourceFailure` 依赖这些取值做映射）。
const (
	reasonEmptyText   = "empty-text"
	reasonBadRequest  = "bad-request"
	reasonUnavailable = "unavailable"
	reasonTimeout     = "timeout"
	reasonNetwork     = "network"
	reasonError       = "error"
)

const (
	ttsSynthesizePath  = "/v1/tts/synthesize"
	ttsLangDefault     = "ja-JP"
	ttsUserTimeout     = 8 * time.Second
	ttsPrefetchTimeout = 15 * time.Second
	ttsMaxRetries      = 1
	ttsRetryBackoff    = 300 * time.Millisecond
	ttsCacheMaxEntries = 64
	ttsCacheMaxBytes   = 4 * 1024 * 1024
	ttsMaxResponseSize = 16 << 20
)

type ttsCacheEntry struct {
	clip     *AudioClip
	lastUsed time.Time
}

type ttsInflight struct {
	done   chan struct{}
	result SynthesizeResult
}

// NewTTS 构造 TTS 服务（地址来自 `config.TTSBaseURL()`）。
func NewTTS() *TTS {
	baseURL := strings.TrimRight(config.TTSBaseURL(), "/")
	log.Printf("[tts] baseURL=%s", baseURL)
	return &TTS{
		baseURL:  baseURL,
		client:   &http.Client{Timeout: ttsPrefetchTimeout + 5*time.Second},
		cache:    make(map[string]*ttsCacheEntry),
		inflight: make(map[string]*ttsInflight),
	}
}

// Synthesize 合成音频。永不 panic / 不返回 error；失败体现在 Reason。
//
// 流程：空文本短路 → 缓存命中 → 在途去重（singleflight）→ 带重试的请求 → 写缓存。
func (t *TTS) Synthesize(params SynthesizeParams) SynthesizeResult {
	if strings.TrimSpace(params.Text) == "" {
		return SynthesizeResult{Reason: reasonEmptyText}
	}
	if clip := t.cacheGet(params.Key); clip != nil {
		return SynthesizeResult{OK: true, Clip: clip}
	}

	call, leader := t.beginInflight(params.Key)
	if !leader {
		// 已有同 key 的请求在途：等待它，避免同一文本并发打两条请求。
		select {
		case <-call.done:
			return call.result
		case <-time.After(ttsPrefetchTimeout + time.Second):
			return SynthesizeResult{Reason: reasonTimeout}
		}
	}

	result := t.fetchWithRetry(params, ttsUserTimeout)
	call.result = result
	close(call.done)
	t.endInflight(params.Key)

	if result.OK && result.Clip != nil {
		t.cachePut(params.Key, result.Clip)
	}
	return result
}

// Prefetch 预取（fire-and-forget）：不阻塞 UI，失败静默（与原前端 `prefetch` 语义一致）。
func (t *TTS) Prefetch(params SynthesizeParams) {
	if strings.TrimSpace(params.Text) == "" {
		return
	}
	go func() {
		if clip := t.cacheGet(params.Key); clip != nil {
			return
		}
		call, leader := t.beginInflight(params.Key)
		if !leader {
			return
		}
		result := t.fetchWithRetry(params, ttsPrefetchTimeout)
		call.result = result
		close(call.done)
		t.endInflight(params.Key)
		if result.OK && result.Clip != nil {
			t.cachePut(params.Key, result.Clip)
		}
	}()
}

// Cancel 中断在途请求（用户连点 / 切换卡片时由前端调用）。
//
// 前端仍有自己的 `gen` 代数检查用于丢弃迟到响应；两者互补：
// Cancel 负责真正断开连接，gen 负责丢弃已到达的结果。
func (t *TTS) Cancel() {
	t.cancelMu.Lock()
	if t.cancelFunc != nil {
		t.cancelFunc()
		t.cancelFunc = nil
	}
	t.cancelMu.Unlock()
}

// ServeHTTP 将 TTS 挂到 Wails 内部 asset server（Route "/wails/tts"）供 APK 同源调用。
//
// Wails tutorial "Alternative Approach: HTTP Handler" 形态：APK WebView 只把
// `/wails/*` 转发给 Go（query 保留、body 丢弃），且 Java 侧把任何非 200 映射成
// 500 "{}"；桌面 asset server 对 service Route 做前缀匹配、无保留前缀，
// 因此 Route "/wails/tts" 在双端都安全。
//
// 约定：只支持 GET（query 传参，无 body）；忽略子路径（asset server 已剥掉
// Route 前缀，query 保留）；**永远写 HTTP 200** + `application/json` /
// `Access-Control-Allow-Origin: *`，把 SynthesizeResult 原样编码（Go 的
// 缓存/重试/去重全部复用，客户端不做缓存与重试）。
func (t *TTS) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var result SynthesizeResult
	if r.Method != http.MethodGet {
		result = SynthesizeResult{Reason: reasonError, ServiceReason: "method-not-allowed"}
	} else {
		q := r.URL.Query()
		result = t.Synthesize(SynthesizeParams{
			Text:   q.Get("text"),
			Lang:   q.Get("lang"),
			Voice:  q.Get("voice"),
			Rate:   repairPlusSign(q.Get("rate")),
			Volume: repairPlusSign(q.Get("volume")),
			Pitch:  repairPlusSign(q.Get("pitch")),
			Format: q.Get("format"),
			Key:    q.Get("key"),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(result)
}

// repairPlusSign 修回被 Android 转发层吃掉的前导 '+'。
//
// 调用链：前端 URLSearchParams 正确发出 `rate=%2B0%25` →
// MainActivity.shouldInterceptRequest 用 `getUrl().getQuery()`（百分号解码一次）
// 取 query 再拼回 path → Go 侧 raw query 里变成字面 `+0%` →
// Go form 解析把 '+' 视为空格 → 上游收到 `" 0%"` → 400（即 H13 的跨层复现）。
//
// rate/volume/pitch 恒为 `+n%` / `-n%` / `+nHz` 形态，合法值永不以前导空格开头，
// 因此单个前导空格必为 corruption，可安全修回 '+'。text 等其它参数不走这里
// （空格即空格，form 语义正确）。桌面直达路径（无 Java 解码层）中该函数恒为
// no-op，双向兼容。
func repairPlusSign(v string) string {
	if strings.HasPrefix(v, " ") {
		return "+" + v[1:]
	}
	return v
}

func (t *TTS) fetchWithRetry(params SynthesizeParams, timeout time.Duration) SynthesizeResult {
	current := params
	for attempt := 0; ; attempt++ {
		result := t.attempt(current, timeout)
		if result.OK {
			return result
		}
		if result.Reason == reasonBadRequest {
			// 400 是程序性错误（参数/编码问题），重试无意义。
			log.Printf("[tts] bad-request (client bug?): status=%d reason=%s", result.Status, result.ServiceReason)
			return result
		}
		if !isRetriable(result.Reason) || attempt >= ttsMaxRetries {
			if !result.OK {
				log.Printf("[tts] fetch failed: baseURL=%s reason=%s status=%d serviceReason=%s", t.baseURL, result.Reason, result.Status, result.ServiceReason)
			}
			return result
		}
		if result.Reason == reasonUnavailable && current.Voice != "" {
			// 503：音色可能不被上游识别 → 去掉 voice，回落到 lang 默认音色。
			current.Voice = ""
		}
		time.Sleep(ttsRetryBackoff)
	}
}

func (t *TTS) attempt(params SynthesizeParams, timeout time.Duration) SynthesizeResult {
	lang := params.Lang
	if lang == "" {
		lang = ttsLangDefault // H4：lang 恒传，禁止省略（省略会落到服务端中文兜底音色）
	}
	// 注意：字段顺序无关，但**必须显式发送 volume**（对齐服务端缓存 key）。
	body := map[string]string{
		"text":   params.Text,
		"lang":   lang,
		"rate":   params.Rate,
		"volume": params.Volume,
		"pitch":  params.Pitch,
		"format": params.Format,
	}
	if params.Voice != "" {
		body["voice"] = params.Voice
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return SynthesizeResult{Reason: reasonError}
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	t.setCancel(cancel)
	defer t.clearCancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.baseURL+ttsSynthesizePath, bytes.NewReader(payload))
	if err != nil {
		return SynthesizeResult{Reason: reasonNetwork}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return SynthesizeResult{Reason: reasonTimeout}
		}
		if ctx.Err() == context.Canceled {
			return SynthesizeResult{Reason: reasonError, ServiceReason: "canceled"}
		}
		return SynthesizeResult{Reason: reasonNetwork}
	}
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, ttsMaxResponseSize))
	if err != nil {
		return SynthesizeResult{Reason: reasonNetwork, Status: resp.StatusCode}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SynthesizeResult{
			Reason:        mapStatusToReason(resp.StatusCode),
			Status:        resp.StatusCode,
			ServiceReason: parseServiceReason(raw),
		}
	}

	var data struct {
		Audio       string `json:"audio"`
		ContentType string `json:"content_type"`
		Voice       string `json:"voice"`
		Cached      *bool  `json:"cached"`
	}
	if err := json.Unmarshal(raw, &data); err != nil || data.Audio == "" {
		return SynthesizeResult{Reason: reasonError, Status: resp.StatusCode}
	}

	mime := data.ContentType
	if mime == "" {
		mime = resp.Header.Get("Content-Type")
	}
	if mime == "" {
		mime = "audio/mpeg"
	}
	clip := &AudioClip{
		Key:        params.Key,
		Mime:       mime,
		Base64:     data.Audio,
		Voice:      data.Voice,
		ByteLength: estimateBase64Size(len(data.Audio)),
	}
	if data.Cached != nil {
		clip.Cached = *data.Cached
	}
	return SynthesizeResult{OK: true, Clip: clip}
}

func (t *TTS) setCancel(cancel context.CancelFunc) {
	t.cancelMu.Lock()
	t.cancelFunc = cancel
	t.cancelMu.Unlock()
}

func (t *TTS) clearCancel() {
	t.cancelMu.Lock()
	t.cancelFunc = nil
	t.cancelMu.Unlock()
}

func (t *TTS) beginInflight(key string) (*ttsInflight, bool) {
	t.inflightMu.Lock()
	defer t.inflightMu.Unlock()
	if key == "" {
		return &ttsInflight{done: make(chan struct{})}, true
	}
	if existing, ok := t.inflight[key]; ok {
		return existing, false
	}
	call := &ttsInflight{done: make(chan struct{})}
	t.inflight[key] = call
	return call, true
}

func (t *TTS) endInflight(key string) {
	if key == "" {
		return
	}
	t.inflightMu.Lock()
	delete(t.inflight, key)
	t.inflightMu.Unlock()
}

func (t *TTS) cacheGet(key string) *AudioClip {
	if key == "" {
		return nil
	}
	t.cacheMu.Lock()
	defer t.cacheMu.Unlock()
	entry, ok := t.cache[key]
	if !ok {
		return nil
	}
	entry.lastUsed = time.Now() // LRU 触碰
	return entry.clip
}

func (t *TTS) cachePut(key string, clip *AudioClip) {
	if key == "" || clip == nil {
		return
	}
	t.cacheMu.Lock()
	defer t.cacheMu.Unlock()
	for len(t.cache) > 0 &&
		(len(t.cache) >= ttsCacheMaxEntries || t.cacheBytes+clip.ByteLength > ttsCacheMaxBytes) {
		oldestKey := ""
		var oldest time.Time
		for k, e := range t.cache {
			if oldestKey == "" || e.lastUsed.Before(oldest) {
				oldestKey, oldest = k, e.lastUsed
			}
		}
		if oldestKey == "" {
			break
		}
		t.cacheBytes -= t.cache[oldestKey].clip.ByteLength
		delete(t.cache, oldestKey)
	}
	if old, ok := t.cache[key]; ok {
		t.cacheBytes -= old.clip.ByteLength
	}
	t.cache[key] = &ttsCacheEntry{clip: clip, lastUsed: time.Now()}
	t.cacheBytes += clip.ByteLength
}

func isRetriable(reason string) bool {
	return reason == reasonNetwork || reason == reasonTimeout || reason == reasonUnavailable
}

func mapStatusToReason(status int) string {
	switch status {
	case http.StatusBadRequest: // 400
		return reasonBadRequest
	case http.StatusServiceUnavailable: // 503
		return reasonUnavailable
	case http.StatusGatewayTimeout, http.StatusRequestTimeout: // 504 / 408
		return reasonTimeout
	default:
		return reasonError
	}
}

func parseServiceReason(raw []byte) string {
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return ""
	}
	if reason, ok := data["reason"].(string); ok {
		return reason
	}
	return ""
}

// estimateBase64Size 由 base64 长度估算原始字节数（4 字符 → 3 字节）。
func estimateBase64Size(length int) int {
	return length / 4 * 3
}
