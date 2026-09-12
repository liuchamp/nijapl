# APK Debug 联调手册

本文描述本项目 Android APK 从打包、装机到排障的完整过程。
默认包名 `APP_ID=com.wails.app`，产物在 `bin/nijapl.apk`。

> 背景：TTS 合成走 Go 绑定（`internal/services/tts.go`），地址由 Go 侧持有，
> 前端拿不到；生产 host 靠构建期烘进包（`TTS_BASE_URL`，见下文 §2）。

## 0. 环境准备

| 依赖 | 说明 |
|---|---|
| JDK | `java -version` 能跑即可（缺失会报 `Java not found`，如 `brew install openjdk@21`） |
| Android SDK | `platform-tools`（adb）、`emulator`（模拟器）、`ANDROID_HOME` 指向 SDK |
| NDK | 任一已安装版本即可，Taskfile 自动找最新（缺失时按提示 `sdkmanager 'ndk;26.3.11579264'` 或设 `ANDROID_NDK_HOME`） |
| AVD | 跑模拟器才需要；`task android:run` 会在无 AVD 时尝试自动创建一个 |

```bash
task android:install:deps   # 检查并安装 Android 依赖（首次执行一次）
```

## 1. 包类型

| 命令 | 产物 | 说明 |
|---|---|---|
| `task android:build` | `libwails.so`（未组 APK） | debug `.so`，改 Go 代码后验证编译用 |
| `task android:run` | 装到模拟器并启动 | 自动起 emulator（`ensure-emulator`），`ARCH` 默认本机架构 |
| `task android:run:device` | 装到真机并启动 | `ARCH=arm64`，自动挑第一台非模拟器设备；多台用 `DEVICE_ID=<serial>` 指定 |
| `task android:package` | `bin/nijapl.apk`（release 签名，默认 debug keystore） | 默认 `ARCH=arm64`；`task android:package:fat` 打全架构通用包 |
| `task android:deploy-device` | release 包上真机 | 先 `package` 再安装启动 |

```bash
task android:device:list          # 看已连接设备 serial
TTS_BASE_URL=http://192.168.1.10:8000 task android:run:device
```

## 2. TTS host：打包时自定

APK 进程读不到运行期环境变量（`NIJAPL_TTS_BASE_URL` 在手机上恒为空），
host 必须在**构建期**烘进 `libwails.so`。统一入口只有一个：

```bash
TTS_BASE_URL=http://192.168.1.10:8000 task android:package
TTS_BASE_URL=http://192.168.1.10:8000 task android:run:device   # 真机联调
```

- 优先级：运行期 `NIJAPL_TTS_BASE_URL`（桌面 `wails3 dev` 用）> 构建期 `TTS_BASE_URL` > 默认 `http://127.0.0.1:8000`；
- 不传 `TTS_BASE_URL` = 原来行为（默认 127.0.0.1，手机上即手机自己，必连不上）；
- 前端 `VITE_TTS_BASE_URL` 会自动复用该值（仅浏览器直连回退路径用，真机用不上）。

> 切 host 必须**重打**（值烘在 so 里）。换 server 地址不用改代码，只换变量重打。

## 3. 明文 http

`build/android/app/src/main/AndroidManifest.xml` 已开：

```xml
<application android:usesCleartextTraffic="true" ...>
```

- 联调期 `http://192.168.x.x:8000` 可直连（系统层 + WebView 都放行）；
- 正式包建议切 `https` 并关掉这一项。

## 4. 本机 TTS 服务联调（`adb reverse`）

电脑起 TTS 服务（默认 8000 端口），把手机的 8000 映射回电脑，
包里继续用默认 `127.0.0.1:8000` 即可，**不用重打**：

```bash
adb -s <serial> reverse tcp:8000 tcp:8000
task android:run:device
# 用完清理
adb -s <serial> reverse --remove tcp:8000
```

模拟器同样走 `adb reverse`（不要用 `10.0.2.2`，那要改代码）。

## 5. 看日志

### 5.1 一行命令看全部应用日志

```bash
task android:logs        # adb logcat -v time | grep -E "(Wails|nijapl)"
task android:logs:all    # 全量 logcat（吵，用作兜底）
```

### 5.2 只看 TTS 地址（确认烘进去的是哪个 host）

`NewTTS` 构造时打一行，可在 logcat 直接验证：

```bash
adb logcat -v time | grep -F "[tts]"
# 期望：[tts] baseURL=http://192.168.1.10:8000
```

- 看到的是**去尾斜杠后的最终生效值**；
- 看不到这一行 = App 进程还没起来（先确认是否安装启动成功，见 §6）；
- 值不对 = 打包时 `TTS_BASE_URL` 没传进去（`§2` 重打；也可用
  `unzip -p bin/nijapl.apk lib/arm64-v8a/libwails.so | strings | grep -F "192.168"` 静态验证）。

### 5.3 发音链路排障顺序

1. 先看 `[tts] baseURL=` 对不对（§5.2）。不对 → 重打。
2. 对但无声：看 logcat 有无 `[tts] bad-request`（参数/编码问题，不重试的那条）。
   有 → 贴完整行（含 `status=` / `reason=`）回来定位。
3. 无任何 `[tts]` 错误但无声 → 大概率掉进系统语音兜底：
   真机可能无日语语音包，`speechSynthesis` 返回成功但不出声。
   此时去系统设置确认“文字转语音 / 日语语音数据”已安装。
4. 前端侧（按钮高亮、报错文案）用 Chrome 看：**debug 包** + 真机开 USB 调试后，
   电脑 Chrome 打开 `chrome://inspect`，能看到 App 的 WebView，
   进 DevTools 看 Console（`ttsController` 的 notice 会进界面提示，
   无提示 + 无声 = HTTP 与兜底都“成功”了，按第 3 条查）。

> 历史坑（已修，`8cb240d`）：Wails 侧 `gen` 计数器两域未同步，
> 首击必判 `stale-gen` 导致 HTTP 永走不通、静默掉进兜底。
> 若复现“点‘再听一次’无声也无报错”，先确认包是该提交之后打的。

## 6. 常见失败对照

| 现象 | 查哪里 |
|---|---|
| `Java not found` | 装 JDK / 设 `JAVA_HOME` |
| `Android NDK not found` | `sdkmanager 'ndk;...'` 或设 `ANDROID_NDK_HOME` |
| `no connected physical Android device` | 线/驱动/USB 调试；`task android:device:list` 确认；多台传 `DEVICE_ID=` |
| 装包后启动黑屏/闪退 | `task android:logs:all` 看头 50 行（多为 so 架构不对：真机必须 arm64 包） |
| 发音无声无报错 | §5.3 三步 |
| `http://` 报 `ERR_CLEARTEXT_NOT_PERMITTED` | manifest 的 `usesCleartextTraffic` 被改掉了，加回来重打 |

## 7. 发 release 前检查

- [ ] `TTS_BASE_URL` 换成正式域名（建议 `https`）重打；
- [ ] 关 `usesCleartextTraffic`（改回 `false` 或删除该行）；
- [ ] 删/降级 `[tts] baseURL=` 启动日志（会把内网地址打进用户手机日志）；
- [ ] 用正式签名打（设 `ANDROID_KEYSTORE_FILE*`，否则是 debug keystore，只能自测不能上架）。
