# GitHub Pages + 加密实时数据

这个仓库使用 **GitHub Pages 托管前端 + GitHub Actions 定时生成加密实时数据**。不需要额外的服务器，也不把 DeepSeek Key 放进浏览器。

## 架构

```text
GitHub Actions（每 30 分钟 / 手动 / 手机 dispatch）
  ├─ DeepSeek /user/balance
  ├─ QQQM / VOO 行情（Yahoo → CNBC/Nasdaq 回退）
  ├─ 解密 live/state.enc.json（设备 + Codex）
  ├─ 合并
  └─ AES-256-GCM 加密 → assets/live.enc.json → 部署 Pages

浏览器
  └─ 输入口令 → WebCrypto 解密 assets/live.enc.json → 渲染
```

- `DEEPSEEK_API_KEY`：只存在 Actions Secrets。
- `LIVE_DATA_PASSPHRASE`：Actions Secrets；同时是你在网站上输入的口令。
- `assets/live.enc.json`：公开文件，但只有口令能解开。
- `live/state.enc.json`：设备/Codex 的加密状态，提交在仓库里，只有口令能解开。
- 页面用 `sessionStorage` 记住当前标签页的口令，关闭标签页后需要重新输入。

## 第一次上线

1. 在仓库 **Settings → Secrets and variables → Actions** 添加：
   - `DEEPSEEK_API_KEY`：DeepSeek 平台 API Key。
   - `LIVE_DATA_PASSPHRASE`：自己设置一段足够长的口令（至少 20 位，建议密码管理器生成）。
2. 打开 **Actions → Deploy dashboard → Run workflow**。
3. 等绿色完成后打开 Pages 地址。
4. 页面会弹出「解锁实时数据」，输入 `LIVE_DATA_PASSPHRASE`。
5. 如果暂时还没有某个数据源，对应卡片会显示「未配置 / 等待同步」，不会回退成假数据。

> 没有添加 secrets 时，workflow 仍会部署一版 **演示数据** 站点，方便先看页面。

## 行情

当前按顺序尝试：

1. Yahoo Finance chart（可能有地区/频率限制）
2. CNBC quote + Nasdaq 日线 chart（无需 Key）

CNBC/Nasdaq 回退时卡片标注「日线 · 延时」，走势图是最近日线收盘价，不是分时。

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
- PAT 只授权一个仓库的 `Actions: write`；不要用 classic token 的 `repo` 全权限。
- 设备/Codex 的 dispatch payload 会经过 GitHub；部署产物和状态文件是加密的。
- GitHub Pages 本身是公开站点，所以加密只能保护数据内容，不能隐藏「站点存在」这件事。
- 忘记口令：更换 `LIVE_DATA_PASSPHRASE` 后，旧的 `live/state.enc.json` 无法解密；删除或重置它，再重新上报设备/Codex。
- 不要把 `LIVE_DATA_PASSPHRASE` 和 `DEEPSEEK_API_KEY` 发给任何人；只在 GitHub Secrets 里填写。
