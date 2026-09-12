package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"nijapl/internal/config"
)

const (
	kvStoreFileName = "store.json"
	// zustand `persist` 每次 setState 都会写一次，必须防抖，否则高频写盘拖慢 UI。
	kvFlushDebounce = 250 * time.Millisecond
)

// KVStore 是 `StoragePort` 的 Go 侧实现，替代原 Lynx 的 `NativeModules.LynxStorage`。
//
// 契约（与 `src/types/ports.ts` 一致）：
//   - 端口**永不 throw**：所有 error 在内部消化，绑定方法一律返回 nil error；
//   - `Get` 返回 `*string`：nil 在 JS 侧映射为 `null`（"不存在"语义）。
//
// 落盘策略：内存 map 为唯一真相，防抖 + 临时文件 + `os.Rename` 原子替换。
type KVStore struct {
	path string

	mu    sync.RWMutex
	data  map[string]string
	timer *time.Timer
}

// NewKVStore 构造并加载已有数据（加载失败按空数据处理，等价于内存兜底）。
func NewKVStore() *KVStore {
	s := &KVStore{
		path: filepath.Join(config.DataDir(), kvStoreFileName),
		data: make(map[string]string),
	}
	s.load()
	return s
}

func (s *KVStore) load() {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var data map[string]string
	if err := json.Unmarshal(raw, &data); err != nil || data == nil {
		return
	}
	s.data = data
}

// Get 读取键值；不存在返回 nil（JS 侧为 null）。
func (s *KVStore) Get(key string) *string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[key]
	if !ok {
		return nil
	}
	return &v
}

// Set 写入键值（同步进内存，异步落盘）。
func (s *KVStore) Set(key, value string) error {
	s.mu.Lock()
	s.data[key] = value
	s.mu.Unlock()
	s.scheduleFlush()
	return nil
}

// Remove 删除键（同步进内存，异步落盘）。
func (s *KVStore) Remove(key string) error {
	s.mu.Lock()
	delete(s.data, key)
	s.mu.Unlock()
	s.scheduleFlush()
	return nil
}

// Flush 立即落盘（原子替换），供退出前或测试直接调用。
func (s *KVStore) Flush() error {
	s.mu.RLock()
	snapshot := make(map[string]string, len(s.data))
	for k, v := range s.data {
		snapshot[k] = v
	}
	s.mu.RUnlock()

	raw, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *KVStore) scheduleFlush() {
	s.mu.Lock()
	if s.timer != nil {
		s.timer.Stop()
	}
	s.timer = time.AfterFunc(kvFlushDebounce, func() {
		_ = s.Flush()
	})
	s.mu.Unlock()
}
