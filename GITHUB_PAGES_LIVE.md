# GitHub Pages + 加密实时数据

这个仓库使用 **GitHub Pages 托管前端 + GitHub Actions 定时生成加密实时数据**。不需要额外的服务器，也不把 DeepSeek Key 放进浏览器。

## 架构

```text
GitHub Actions（每 30 分钟 / 手动 / 手机 dispatch / 设置同步）
  ├─ DeepSeek /user/balance
  ├─ QQQM / VOO 行情（Yahoo → CNBC/Nasdaq 回退）
  ├─ 解密 live/state.enc.json（设备 + Codex + 设置）
  ├─ 合并
  └─ AES-256-GCM 加密 → assets/live.enc.json → 部署 Pages

浏览器
  ├─ 输入口令 → WebCrypto 解密 assets/live.enc.json → 渲染
  └─ 设置修改 → 自动保存 → 用加密数据里的 Actions token dispatch 回 GitHub
```

- `DEEPSEEK_API_KEY`：只存在 Actions Secrets。
- `LIVE_DATA_PASSPHRASE`：Actions Secrets；同时是你在网站上输入的口令。
- `SETTINGS_SYNC_TOKEN`：可选；fine-grained PAT，仅 `Actions: write`。它会被加密后放进 live 数据，用于浏览器自动回写设置。
- `assets/live.enc.json`：公开文件，但只有口令能解开。
- `live/state.enc.json`：设备 / Codex / 设置偏好的加密状态，提交在仓库里，只有口令能解开。
- 页面用 `sessionStorage` 记住当前标签页的口令，关闭标签页后需要重新输入。

## 第一次上线

1. 在仓库 **Settings → Secrets and variables → Actions** 添加：
   - `DEEPSEEK_API_KEY`：DeepSeek 平台 API Key。
   - `LIVE_DATA_PASSPHRASE`：自己设置一段足够长的口令（至少 20 位，建议密码管理器生成）。
   - `SETTINGS_SYNC_TOKEN`：可选，见下面的「设置自动保存 / 跨设备同步」。
2. 打开 **Actions → Deploy dashboard → Run workflow**。
3. 等绿色完成后打开 Pages 地址。
4. 页面会弹出「解锁实时数据」，输入 `LIVE_DATA_PASSPHRASE`。
5. 解锁后设置按钮才会启用；演示数据模式下设置按钮和主题按钮都是禁用的。

> 没有添加 secrets 时，workflow 仍会部署一版 **演示数据** 站点，方便先看页面；但演示模式不能修改设置。

## 行情

当前按顺序尝试：

1. Yahoo Finance chart（可能有地区/频率限制）
2. CNBC quote + Nasdaq 日线 chart（无需 Key）

CNBC/Nasdaq 回退时卡片标注「日线 · 延时」，走势图是最近日线收盘价，不是分时。

## 设置自动保存 / 跨设备同步

- 设置抽屉（我的仪表盘）**只在实时数据解锁后可打开和修改**；演示数据模式下设置按钮、主题按钮都禁用。
- 主表单、主题、背景偏好修改后会自动保存到本机；不需要点「保存设置」。
- 如果配置了 `SETTINGS_SYNC_TOKEN`，修改会通过 `repository_dispatch` 的 `settings` 事件回写 GitHub；Actions 将设置加密进 `live/state.enc.json` 和 live 数据，其他设备解锁后会按 `updatedAt` 自动应用较新的版本。
- 设置和实时/演示数据共用同一套值，只有「数据」区分模式，设置不区分模式。
- 自定义背景**图片文件**仍然只保存在当前浏览器；跨设备同步的是背景偏好，不是图片文件。

### 创建 `SETTINGS_SYNC_TOKEN`

不要复用部署用的 classic token。单独创建一个 fine-grained PAT：

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**。
2. Resource owner 选自己；Repository access 选 **Only select repositories**，只勾选 `sugar-dashboard`。
3. Repository permissions → **Actions: Read and write**。`Metadata: Read` 会自动带上。
4. Expiration 建议 90 天（到期后更新 Secret）。
5. 生成并复制，添加到仓库 **Settings → Secrets and variables → Actions → `SETTINGS_SYNC_TOKEN`**。

这个 token 只会被加密后放进 live 数据，用于触发本仓库的 workflow：

- 它只有 `Actions: write`，不能读代码、改代码或读取其他仓库。
- 任何拿到 `LIVE_DATA_PASSPHRASE` 的人都能在浏览器里解出它，因此口令必须足够强。
- 没有配置时，设置面板会显示「仅本机自动保存」，本机自动保存仍然有效。
- token 撤销 / 过期后，云端同步会失败，但本机保存不受影响；更新 Secret 后重新跑一次 workflow 即可。

## 设备电量上报

设备需要主动推送。使用 **fine-grained PAT**，只给当前仓库 `Actions: write` 权限，设置较短有效期。

iOS 快捷指令「上报电量」：

1. 获取电池电量
2. 获取当前日期
3. 获取 URL 内容：
   - URL：`https://api.github.com/repos/<owner>/<repo>/dispatches`
   - 方法：`POST`
   - 标头：
     - `Authorization: Bearer <你的 fine-grained PAT>`
     - `Accept: application/vnd.github+json`
     - `Content-Type: application/json`
   - 请求体：
     ```json
     {
       "event_type": "battery",
       "client_payload": {
         "deviceId": "iphone-17-pro",
         "name": "iPhone 17 Pro",
         "level": 86,
         "icon": "phone",
         "state": "unplugged"
       }
     }
     ```
4. 自动化：充电器连接 / 断开、电量低于阈值、每天固定时间。iOS 不支持后台每分钟运行，想要更连续可以使用 Home Assistant Companion。

Android / Tasker：用 HTTP Request 发同样的 JSON。

电脑上测试也可以用：

```bash
GITHUB_TOKEN=github_pat_xxx \
GITHUB_REPOSITORY=<owner>/<repo> \
node scripts/dispatch.mjs battery '{"deviceId":"iphone-17-pro","name":"iPhone 17 Pro","level":86,"icon":"phone"}'
```

## Codex 数据

Codex 没有稳定的公开周额度接口，所以这里采用「采集器推送」的方式：

```bash
GITHUB_TOKEN=... GITHUB_REPOSITORY=<owner>/<repo> \
node scripts/dispatch.mjs codex '{
  "remaining": 68,
  "reset": "每周额度 · 周日 00:00 重置",
  "tokens7d": 1236000,
  "dailyTokens": [42,68,31,88,54,73,27]
}'
```

- `remaining` 是 0–100 的百分比。
- 可以按你设定的周 Token 预算估算：`100 - tokens7d / budget * 100`。
- 也可以从 Codex 客户端响应头 / 本地会话记录里采集；这些属于非公开实现，升级后可能变化。
- 把上面的命令放进本机计划任务即可定时上报；不要在手机/网页里暴露 Codex 凭据。

## 手动触发一次刷新

- GitHub → Actions → Deploy dashboard → Run workflow。
- 或本地运行 `node scripts/dispatch.mjs ...` 触发设备/Codex 更新。
- 定时任务每 30 分钟一次；GitHub 的 schedule 可能延迟几分钟，这是正常的。

## 本地测试

```bash
LIVE_DATA_PASSPHRASE='testpass-123' node scripts/live-data.mjs
node serve.mjs
# 打开 http://127.0.0.1:4173，输入 testpass-123
```

生成的 `assets/live.enc.json` 和 `live/state.enc.json` 已被 `.gitignore` 或刻意排除，不会被提交。

## 安全说明

- 不要在前端、README、commit 里写 DeepSeek Key、GitHub PAT 或口令。
- 部署用的 classic PAT 只应临时存在，推送完成后撤销；不要把它放进站点。
- `SETTINGS_SYNC_TOKEN` 必须单独创建，只授权一个仓库的 `Actions: write`；不要用 classic token 的 `repo` 全权限。
- 这个 settings token 会被加密后放进 `assets/live.enc.json`；它能触发本仓库 workflow，不能读代码或修改代码。口令是它的安全边界，务必使用强口令。
- 设置同步的 `repository_dispatch` payload 只包含站点偏好，不包含 DeepSeek Key、设备 token 或口令。
- 设备/Codex 的 dispatch payload 会经过 GitHub；部署产物和状态文件是加密的。
- GitHub Pages 本身是公开站点，所以加密只能保护数据内容，不能隐藏「站点存在」这件事。
- 忘记口令：更换 `LIVE_DATA_PASSPHRASE` 后，旧的 `live/state.enc.json` 无法解密；删除或重置它，再重新上报设备/Codex，并重新保存一次设置。
- 不要把 `LIVE_DATA_PASSPHRASE`、`DEEPSEEK_API_KEY`、`SETTINGS_SYNC_TOKEN` 发给任何人；只在 GitHub Secrets 里填写。
