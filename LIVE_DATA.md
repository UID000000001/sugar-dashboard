# 接真实数据：从演示模式到自己的数据源

这份文档说明怎么把仪表盘里的 DeepSeek、设备电量、Codex、行情换成真实数据。先说结论：

1. **浏览器只请求你自己的后端**，API Key、Cookie、Codex 凭据、设备上报 token 都留在服务端。
2. **DeepSeek 余额和行情可以比较直接地接**；消费趋势、Codex 周额度、设备电量需要额外的采集或记账。
3. **最省事的部署是本地 / 家用服务器**（或 Tailscale 这样的私有网络），因为 Codex 和手机采集都在你身边。公网部署必须加认证。

---

## 1. 先选运行位置

| 方案 | 适合 | 优点 | 代价 |
| --- | --- | --- | --- |
| 本机 Node 服务 | 只在自己电脑看 | 最简单、Codex 本地文件可直接读、无公网暴露 | 电脑关机就没了 |
| 家用服务器 / NAS + Tailscale | 手机也想看 | 私有网络、可长期运行、设备可上报 | 要维护一台常开的机器 |
| VPS / 云服务器 | 公网访问 | 稳定、可加域名和 HTTPS | 需要认证、Codex 要本机 agent 推送 |
| Serverless（Vercel/Netlify） | 轻量公网 | 免运维 | 不能读本机 Codex；设备状态要外接 KV/数据库 |

**建议先用本机或 NAS 版本跑通，再考虑公网。**

---

## 2. 各数据源的真实情况

| 卡片 | 可行性 | 推荐做法 |
| --- | --- | --- |
| DeepSeek 余额 | 官方接口，简单 | 后端调用 `GET https://api.deepseek.com/user/balance` |
| DeepSeek 消费 / 7 日趋势 | 无公开明细接口 | 记录余额快照做账本，或在自己的 API 代理里按 usage 记账 |
| 行情（QQQM / VOO） | 第三方行情 API | 后端代理 + 60 秒缓存；优先用有免费额度的服务 |
| 设备电量 | 需要手机主动上报 | iOS 快捷指令 / Android Tasker / Home Assistant 推送到后端 |
| Codex 周额度 | 没有稳定的公开额度接口 | 本机采集器读 Codex 本地记录或响应头；或用周预算估算 |
| Codex Token 活动 | 可采集 | 解析本地 Codex 会话日志，或使用 OpenAI 组织 Usage API |

---

## 3. 推荐架构

```text
浏览器 Dashboard ──GET /api/dashboard──▶ 你的后端
                                          ├─▶ DeepSeek /user/balance
                                          ├─▶ 行情 API（缓存）
                                          ├─▶ 设备最新状态（由手机 POST 进来）
                                          └─▶ Codex 采集器写入的 JSON

iPhone / Android ──POST /api/ingest/battery（带 token）──▶ 后端
本机 Codex 采集器 ──POST /api/ingest/codex（带 token）──▶ 后端
```

后端只需要两个面：

- **只读面** `/api/dashboard`：给浏览器用，只返回脱敏后的数字，不返回任何密钥。
- **写入面** `/api/ingest/*`：给手机和 Codex 采集器用，必须校验一个独立的 ingest token。

---

## 4. 环境变量

把 `.env` 放在**静态目录之外**（例如项目上一级），不要放进 `nozoki-dashboard/`，避免被静态服务器意外读取：

```ini
# 浏览器能访问到的站点地址（用于 CORS / cookie）
DASHBOARD_ORIGIN=http://127.0.0.1:8787

# DeepSeek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx

# 行情：先选一个，后面代码按需实现
MARKET_PROVIDER=finnhub
FINNHUB_API_KEY=xxxxxxxxxxxxxxxx
# 或 TWELVE_DATA_API_KEY=...
# 或 ALPHA_VANTAGE_API_KEY=...

# 设备 / Codex 上报
INGEST_TOKEN=请生成一段足够长的随机字符串

# Codex 预算（可选，用于估算周额度）
CODEX_WEEKLY_TOKEN_BUDGET=10000000

# 服务
PORT=8787
```

生成随机 token：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. 统一接口约定

前端目前直接读 `js/data.js` 的 `DATA` 对象。最省事的接法是让后端返回同样形状的 JSON，前端合并后再调用现有的 render 函数：

```json
{
  "updatedAt": "2026-10-24T09:45:00+08:00",
  "deepseek": {
    "balance": 126.40,
    "recharge": 100.00,
    "bonus": 26.40,
    "spend": 73.60,
    "spendSeries": [6.4, 9.2, 4.8, 12.6, 8.1, 15.3, 17.2]
  },
  "devices": [
    { "name": "iPhone 17 Pro", "level": 86, "icon": "phone", "state": "2 分钟前" }
  ],
  "codex": {
    "remaining": 68,
    "reset": "每周额度 · 周日 00:00 重置",
    "tokens7d": 1236000,
    "dailyTokens": [42, 68, 31, 88, 54, 73, 27]
  },
  "market": {
    "updatedLabel": "延时行情",
    "symbols": [
      {
        "symbol": "QQQM",
        "name": "纳指 100 ETF",
        "price": 262.18,
        "prevClose": 260.51,
        "amplitude": 1.08,
        "volume": "3.42M",
        "series": [260.5, 261.2, 262.0, 262.18]
      }
    ]
  }
}
```

`series` 是真实分时数据，可选。前端会优先用它画走势图；没有就继续用现有的模拟曲线。

---

## 6. DeepSeek 余额

官方文档：[Get User Balance](https://api-docs.deepseek.com/api/get-user-balance)，`GET /user/balance`，Bearer Key。

```js
async function getDeepSeekBalance() {
  const res = await fetch("https://api.deepseek.com/user/balance", {
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);

  const data = await res.json();
  const info =
    data.balance_infos.find((item) => item.currency === "CNY") ??
    data.balance_infos[0];

  return {
    balance: Number(info.total_balance),
    recharge: Number(info.topped_up_balance),
    bonus: Number(info.granted_balance),
    isAvailable: data.is_available,
  };
}
```

### 消费金额和 7 日趋势怎么办？

DeepSeek 的公开 API 文档只提供余额查询，**没有公开的“近 30 天消费明细”接口**。三种可行做法：

1. **余额快照账本**：后端每 10–30 分钟记录一次 `total_balance`，用“上次余额 + 期间充值 − 当前余额”估算消费。实现简单，但充值/退款会造成误差。
2. **自己代理 API 调用**：如果所有 DeepSeek 请求都走你的后端，按响应里的 `usage` 和官方价格累计成本，最准确。
3. **平台账单导出**：从 DeepSeek 平台导出账单，整理成 `data/deepseek-usage.json`，后端只负责读取。

建议先只接余额，消费趋势留空或显示“—”，等有账本再接。

---

## 7. 行情

### 方案 A：Yahoo Finance（个人后端代理，最省事）

非官方接口，可能限流或改版；只适合个人低频使用，并遵守服务条款。

```js
async function getQuote(symbol, name) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Quote ${symbol} ${res.status}`);

  const result = (await res.json()).chart?.result?.[0];
  if (!result) throw new Error(`Quote ${symbol} empty`);

  const meta = result.meta;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  const high = meta.regularMarketDayHigh;
  const low = meta.regularMarketDayLow;
  const closes = (result.indicators?.quote?.[0]?.close ?? [])
    .filter((value) => Number.isFinite(value));

  return {
    symbol,
    name,
    price: meta.regularMarketPrice,
    prevClose: prev,
    amplitude: prev ? ((high - low) / prev) * 100 : 0,
    volume: formatVolume(meta.regularMarketVolume),
    series: closes,
    currency: meta.currency,
  };
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}
```

### 方案 B：Finnhub（有免费额度）

```js
// GET https://finnhub.io/api/v1/quote?symbol=QQQM&token=KEY
// 返回 c(现价) d(涨跌额) dp(涨跌幅) h(高) l(低) o(开盘) pc(昨收)
```

Finnhub 的 `/quote` 不返回成交量和分时序列。如果必须保留“成交”和走势图，可以：

- 用 Yahoo 拿完整数据（但要接受非官方风险）；
- 用 Twelve Data / Alpaca / Polygon 等提供 `time_series` 和 volume 的服务；
- 或者把“成交”改成显示“更新时间”，并继续用现有模拟走势图。

无论用哪家，后端都建议 **缓存 30–60 秒**，并加上 `updatedLabel: "延时行情"`，不要假装实时。

---

## 8. 设备电量

浏览器不能直接读手机电量，必须由手机主动上报。

### 8.1 接口

```js
// POST /api/ingest/battery
// Header: x-ingest-token: <INGEST_TOKEN>
{
  "deviceId": "iphone-17-pro",
  "name": "iPhone 17 Pro",
  "level": 86,
  "state": "unplugged",   // charging / full / unplugged
  "timestamp": "2026-10-24T09:45:00+08:00"
}
```

后端按 `deviceId` 保存最新一条，计算“刚刚 / 3 分钟前 / 2 小时前”，超过 2 小时标记为“等待同步”。

### 8.2 iPhone / iPad / Apple Watch：快捷指令

1. 新建快捷指令，例如「上报电量」。
2. 添加「获取电池电量」。
3. 添加「获取当前日期」。
4. 添加「获取 URL 内容」：
   - URL：`https://你的域名/api/ingest/battery`
   - 方法：`POST`
   - 标头：`x-ingest-token` = 你的 token，`Content-Type` = `application/json`
   - 请求体：JSON
     ```json
     {
       "deviceId": "iphone-17-pro",
       "name": "iPhone 17 Pro",
       "level": 电池电量,
       "timestamp": 当前日期
     }
     ```
5. 在「自动化」里触发：
   - 电量低于 / 高于某个阈值；
   - 连接 / 断开电源；
   - 每天固定时间；
   - 或者用 Pushcut / Scriptable 做更频繁的定时上报。

> iOS 不允许普通快捷指令在后台每分钟运行。想要接近实时，优先用 Home Assistant Companion（它的电量传感器会定期上报），或接受“阈值 / 充电时更新”。

### 8.3 Android：Tasker / MacroDroid

- Profile：`Battery Level` 变化 → HTTP Request POST 上面的 JSON。
- 或 `State → Power` 连接/断开时触发。
- 三星、Pixel 都类似；后台电池优化要放行 Tasker。

### 8.4 Home Assistant（最稳）

如果已经有 HA：

- 手机装 HA Companion，开启电池传感器；
- 用 HA 的 automation 把 `sensor.xxx_battery_level` POST 到 `/api/ingest/battery`；
- 或者让 Dashboard 后端直接读 HA REST API（`/api/states/...`），这样就不需要手机快捷指令。

---

## 9. Codex 周额度 / Token 活动

这是四个卡片里最不确定的一块：**Codex 没有一条像 DeepSeek 余额那样稳定的公开额度接口**。可以按可行性从高到低选：

### 方案 A：本地采集 + 自己设预算（最稳）

1. 本机脚本定时读取 Codex 的会话日志（常见在 `~/.codex/sessions/`，具体路径随版本可能变化），汇总最近 7 天和每天的 token 使用量。
2. 在 `.env` 里设置 `CODEX_WEEKLY_TOKEN_BUDGET`。
3. 计算：
   ```js
   remaining = Math.max(0, 100 - (tokens7d / budget) * 100);
   ```
4. 采集器 POST 到 `/api/ingest/codex`：
   ```json
   { "remaining": 68, "reset": "每周额度 · 周日 00:00 重置", "tokens7d": 1236000, "dailyTokens": [42,68,31,88,54,73,27] }
   ```

这不是官方“剩余额度”，而是你自己预算的完成度；在 UI 里最好把文案改成“本周预算剩余”或“估算额度”，避免误解。

### 方案 B：从 Codex 客户端响应头采集

一些第三方实现会记录 Codex 响应头里的额度字段，例如 `x-codex-primary-used-percent`、`x-codex-primary-window-minutes` 等。如果你能在自己的调用链 / 代理里拿到这些头，可以写一个采集器转成 `remaining`。

**注意**：这些不是公开稳定 API，随时可能变更；不要把这类私有接口当成长期依赖。

### 方案 C：OpenAI 组织 Usage API

用 OpenAI **Admin Key** 调组织用量接口：

- `GET /v1/organization/usage/completions`
- `GET /v1/organization/costs`

它能给出 API 的 usage / 成本趋势，但**不等于 ChatGPT / Codex 订阅的周额度**。适合把 Codex 卡片改成“API 用量 / 成本”卡片。

### 方案 D：手动填写

如果只是自己看，做一个 `data/codex.json`，每周手动更新一次也完全够用；后端读取它即可。

---

## 10. 前端怎么切到 live 模式

新增一个只读配置，例如 `js/config.js`：

```js
window.DASHBOARD_CONFIG = {
  apiBase: "/api",
  pollMs: 60000,
  dataMode: "live", // "demo" | "live"
};
```

在 `js/app.js` 启动逻辑里，如果是 `live`：

```js
async function loadLiveDashboard() {
  try {
    const res = await fetch(`${window.DASHBOARD_CONFIG.apiBase}/dashboard`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const live = await res.json();
    Object.assign(DATA.deepseek, live.deepseek);
    DATA.devices = live.devices;
    Object.assign(DATA.codex, live.codex);
    Object.assign(DATA.market, live.market);

    renderDeepSeek();
    renderDevices();
    renderCodex();
    renderMarket();
    setServiceOnline();
  } catch (error) {
    // 不要用演示数据覆盖最后一次真实数据；只标记离线
    setServiceOffline();
  }
}

loadLiveDashboard();
setInterval(loadLiveDashboard, window.DASHBOARD_CONFIG.pollMs);
```

同时做三件小事：

1. **跳过演示定时器**：live 模式下不要执行 `setTimeout(renderDeepSeek, 850)` 那一组，否则会把真实数据覆盖成演示值。
2. **真实走势图**：`renderMarket()` 里优先使用后端返回的 `symbol.series`：
   ```js
   const values =
     Array.isArray(symbol.series) && symbol.series.length > 2
       ? symbol.series
       : buildSeries(symbol.seed || 1, symbol.prevClose, symbol.price, 34);
   ```
3. **状态标记**：把页脚的 `DEMO · 演示数据` 改成 `LIVE` / `DEMO` 两种状态，并在数据异常时显示“数据源离线”。

设备列表目前是 HTML 里固定的四行；如果后端设备数量会变，需要把 `renderDevices()` 改成根据数组动态生成行。

---

## 11. 安全清单

- **Key 只在后端**：DeepSeek Key、行情 Key、OpenAI Key、Codex 凭据都不要出现在 `index.html` / `js/*.js` / 浏览器 Network 里。
- **`.env` 和运行数据不要放进静态站点目录**。`serve.mjs` 现在会拒绝 `.env`、`data/`、`node_modules/` 这类路径，但更稳妥的是把它们放在站点目录外。
- **公网必须认证**：优先 Cloudflare Access / Tailscale / 反向代理 Basic Auth；自己写登录就用 HttpOnly + Secure + SameSite 的 session cookie，不要把密码放进前端。
- **本机优先绑定 `127.0.0.1`**；手机要访问就用 Tailscale 或 Cloudflare Tunnel，不要直接把 8787 暴露到公网。
- **设备/Codex 上报用独立的 `INGEST_TOKEN`**，放在 Header 里；不要复用登录密码。支持轮换。
- **HTTPS**：手机快捷指令、公网域名都必须走 HTTPS。
- **限流 + 输入校验**：上报接口限制频率，校验 level 在 0–100、timestamp 合法、deviceId 白名单。
- **不要记录完整密钥**；日志里只保留前后几位。
- **行情数据**遵守提供方条款；延迟数据要明确标注。

---

## 12. 推荐落地顺序

1. **只接 DeepSeek 余额 + 行情**（只读、风险最低），把前端 live 模式跑通。
2. 加 **设备上报接口**，先用 curl / 快捷指令测通，再把四个设备接上。
3. 加 **Codex 采集器**，先用手动 `codex.json`，再考虑本地日志/响应头。
4. 最后加 **认证**，再决定要不要公网访问。
5. 消费趋势/7 日账本属于锦上添花，可以后补。

---

## 13. 需要我直接帮你接的话

告诉我这四点，我就可以在这个项目里把后端和前端一起接好：

1. **跑在哪里**：只在本机 / NAS / VPS / Vercel？
2. **手机系统**：iPhone / Android / 有 Home Assistant 吗？
3. **Codex 怎么用**：Codex CLI、ChatGPT 桌面端，还是 OpenAI API？
4. **行情用哪家**：已有 Finnhub / Twelve Data / 其他 Key，还是让我选一个免费的先用？

在没有 Key 的情况下，我可以先把后端骨架、`/api/dashboard` 契约、设备上报接口和 live 前端开关搭好，你填 `.env` 就能跑。
