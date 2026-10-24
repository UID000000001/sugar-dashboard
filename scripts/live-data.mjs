/* =========================================================
   GitHub Actions 实时数据构建脚本
   ---------------------------------------------------------
   1. 读取/解密 encrypted state（设备、Codex）
   2. 抓取 DeepSeek 余额与 QQQM / VOO 行情
   3. 合并后加密为 data/live.enc.json
   4. 若收到 repository_dispatch，则更新 live/state.enc.json

   所有敏感数据只以密文落盘；日志不输出余额/电量/Token。
   ========================================================= */

import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ITERATIONS = 150000;
const STATE_PATH = process.env.LIVE_STATE_PATH || "live/state.enc.json";
const OUTPUT_PATH = process.env.LIVE_OUTPUT_PATH || "assets/live.enc.json";
const PASSPHRASE = process.env.LIVE_DATA_PASSPHRASE || "";

const DEVICE_ORDER = [
  "iphone-17-pro",
  "samsung-s25-ultra",
  "ipad-pro-11",
  "apple-watch-s10",
];

const SYMBOLS = [
  { symbol: "QQQM", name: "纳指 100 ETF" },
  { symbol: "VOO", name: "标普 500 ETF" },
];

const ICONS = new Set(["phone", "tablet", "watch"]);

function encrypt(payload) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(PASSPHRASE, salt, ITERATIONS, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    data: Buffer.concat([ciphertext, tag]).toString("base64"),
    createdAt: new Date().toISOString(),
  };
}

function decrypt(file) {
  if (!file || file.v !== 1 || !file.salt || !file.iv || !file.data) {
    throw new Error("不支持的数据格式");
  }

  const salt = Buffer.from(file.salt, "base64");
  const iv = Buffer.from(file.iv, "base64");
  const raw = Buffer.from(file.data, "base64");
  const tag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(0, raw.length - 16);
  const iterations = Number(file.iterations) || ITERATIONS;
  const key = crypto.pbkdf2Sync(PASSPHRASE, salt, iterations, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

async function loadState() {
  const file = await readJson(STATE_PATH);
  if (!file) return { devices: {}, codex: null };

  try {
    const state = decrypt(file);
    return {
      devices: state && typeof state.devices === "object" ? state.devices : {},
      codex: state?.codex || null,
    };
  } catch (error) {
    console.warn("encrypted state 无法解密，本轮按空状态处理");
    return { devices: {}, codex: null };
  }
}

function cleanText(value, maxLength = 60) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function applyDispatch(state, event) {
  if (!event || process.env.GITHUB_EVENT_NAME !== "repository_dispatch") {
    return false;
  }

  const type = cleanText(event.action, 20);
  const payload = event.client_payload || {};

  if (type === "battery") {
    const deviceId = cleanText(payload.deviceId, 40).toLowerCase();
    const level = Number(payload.level);
    if (!/^[a-z0-9-]{1,40}$/.test(deviceId) || !Number.isFinite(level)) {
      console.warn("忽略无效的设备上报");
      return false;
    }

    const icon = ICONS.has(payload.icon) ? payload.icon : "phone";
    state.devices[deviceId] = {
      name: cleanText(payload.name, 40) || deviceId,
      level: Math.round(Math.min(100, Math.max(0, level))),
      icon,
      batteryState: cleanText(payload.state, 20) || "unplugged",
      updatedAt: new Date().toISOString(),
    };
    return true;
  }

  if (type === "codex") {
    const remaining = Number(payload.remaining);
    if (!Number.isFinite(remaining)) {
      console.warn("忽略无效的 Codex 上报");
      return false;
    }

    const tokens7d = Number(payload.tokens7d);
    const dailyTokens = Array.isArray(payload.dailyTokens)
      ? payload.dailyTokens
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0)
          .slice(-7)
      : [];

    state.codex = {
      remaining: Math.round(Math.min(100, Math.max(0, remaining))),
      reset: cleanText(payload.reset, 80) || "每周额度",
      tokens7d: Number.isFinite(tokens7d) ? Math.max(0, Math.round(tokens7d)) : 0,
      dailyTokens,
      updatedAt: new Date().toISOString(),
    };
    return true;
  }

  return false;
}

function relativeTime(iso) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "刚刚同步";

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 90) return "刚刚同步";
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
  return `${Math.round(seconds / 86400)} 天前`;
}

function buildDevices(state) {
  const ids = Object.keys(state.devices || {});
  ids.sort((a, b) => {
    const indexA = DEVICE_ORDER.indexOf(a);
    const indexB = DEVICE_ORDER.indexOf(b);
    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    }
    return a.localeCompare(b);
  });

  return ids.map((id) => {
    const device = state.devices[id];
    return {
      name: device.name || id,
      level: device.level,
      icon: device.icon || "phone",
      state: relativeTime(device.updatedAt),
      batteryState: device.batteryState || "unplugged",
      updatedAt: device.updatedAt,
    };
  });
}

async function fetchDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return { available: false, note: "未配置 DEEPSEEK_API_KEY" };
  }

  try {
    const response = await fetch("https://api.deepseek.com/user/balance", {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const infos = Array.isArray(data.balance_infos) ? data.balance_infos : [];
    const info = infos.find((item) => item.currency === "CNY") || infos[0] || {};

    return {
      available: true,
      balance: Number(info.total_balance),
      recharge: Number(info.topped_up_balance),
      bonus: Number(info.granted_balance),
      spend: null,
      spendSeries: [],
      note: "DeepSeek 官方余额接口",
    };
  } catch (error) {
    console.warn("DeepSeek 余额读取失败");
    return { available: false, note: "DeepSeek 余额读取失败" };
  }
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function fetchYahooQuote({ symbol, name }) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; sugar-dashboard/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("empty result");

    const meta = result.meta || {};
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose);
    const high = Number(meta.regularMarketDayHigh);
    const low = Number(meta.regularMarketDayLow);
    const closes = (result.indicators?.quote?.[0]?.close || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) {
      throw new Error("incomplete quote");
    }

    return {
      symbol,
      name,
      price,
      prevClose,
      amplitude:
        Number.isFinite(high) && Number.isFinite(low)
          ? ((high - low) / prevClose) * 100
          : 0,
      volume: formatVolume(Number(meta.regularMarketVolume)),
      series: closes,
      source: "yahoo",
    };
  } catch (error) {
    return null;
  }
}

async function fetchCnbcQuote(symbol) {
  const url =
    "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol" +
    `?symbols=${encodeURIComponent(symbol)}&requestMethod=itv&noform=1&partnerId=2` +
    "&fund=1&exthrs=1&output=json&events=1";

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; sugar-dashboard/1.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`CNBC HTTP ${response.status}`);

  const data = await response.json();
  const quote = data?.FormattedQuoteResult?.FormattedQuote?.[0];
  if (!quote) throw new Error("CNBC empty quote");

  const price = parseNumber(quote.last);
  const prevClose = parseNumber(quote.previous_day_closing);
  const high = parseNumber(quote.high);
  const low = parseNumber(quote.low);

  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) {
    throw new Error("CNBC incomplete quote");
  }

  return {
    price,
    prevClose,
    amplitude:
      Number.isFinite(high) && Number.isFinite(low)
        ? ((high - low) / prevClose) * 100
        : 0,
    volume: quote.volume_alt || formatVolume(parseNumber(quote.volume)),
    quoteTime: quote.last_time || "",
  };
}

async function fetchNasdaqHistory(symbol) {
  const to = new Date();
  const from = new Date(Date.now() - 45 * 86400000);
  const day = (date) => date.toISOString().slice(0, 10);
  const url =
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/chart` +
    `?assetclass=etf&fromdate=${day(from)}&todate=${day(to)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; sugar-dashboard/1.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Nasdaq HTTP ${response.status}`);

  const data = await response.json();
  const chart = data?.data?.chart;
  if (!Array.isArray(chart) || !chart.length) throw new Error("Nasdaq empty chart");

  const last = chart[chart.length - 1];
  const previous = chart.length > 1 ? chart[chart.length - 2] : null;
  const price = parseNumber(last?.y ?? data?.data?.lastSalePrice);
  const prevClose = parseNumber(
    data?.data?.previousClose ?? previous?.y ?? last?.z?.close
  );
  const high = parseNumber(last?.z?.high);
  const low = parseNumber(last?.z?.low);

  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) {
    throw new Error("Nasdaq incomplete quote");
  }

  return {
    price,
    prevClose,
    amplitude:
      Number.isFinite(high) && Number.isFinite(low)
        ? ((high - low) / prevClose) * 100
        : 0,
    volume: formatVolume(parseNumber(last?.z?.volume)),
    series: chart
      .map((row) => Number(row?.y))
      .filter((value) => Number.isFinite(value)),
  };
}

async function fetchFallbackQuote({ symbol, name }) {
  const [cnbc, nasdaq] = await Promise.allSettled([
    fetchCnbcQuote(symbol),
    fetchNasdaqHistory(symbol),
  ]);

  const cnbcQuote = cnbc.status === "fulfilled" ? cnbc.value : null;
  const nasdaqQuote = nasdaq.status === "fulfilled" ? nasdaq.value : null;
  const quote = cnbcQuote || nasdaqQuote || null;

  if (!quote) return null;

  return {
    symbol,
    name,
    price: quote.price,
    prevClose: quote.prevClose,
    amplitude: quote.amplitude,
    volume: quote.volume || "—",
    series: nasdaqQuote?.series?.length ? nasdaqQuote.series : [],
    source: cnbcQuote ? "cnbc" : "nasdaq",
  };
}

async function fetchQuote(symbolInfo) {
  const yahoo = await fetchYahooQuote(symbolInfo);
  if (yahoo) return yahoo;

  console.warn(`Yahoo 不可用，${symbolInfo.symbol} 切换到 CNBC / Nasdaq`);
  return fetchFallbackQuote(symbolInfo);
}

async function fetchMarket() {
  const symbols = (await Promise.all(SYMBOLS.map(fetchQuote))).filter(Boolean);
  const usedFallback = symbols.some(
    (symbol) => symbol.source && symbol.source !== "yahoo"
  );

  return {
    updatedLabel: usedFallback ? "日线 · 延时" : "延时行情",
    symbols,
  };
}

async function main() {
  if (!PASSPHRASE) {
    console.log("LIVE_DISABLED: 未设置 LIVE_DATA_PASSPHRASE，部署演示版");
    return;
  }

  const state = await loadState();
  let stateChanged = false;

  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (eventPath) {
      const event = await readJson(eventPath);
      stateChanged = applyDispatch(state, event);
    }
  } catch (error) {
    console.warn("处理 repository_dispatch 失败");
  }

  const [deepseek, market] = await Promise.all([fetchDeepSeek(), fetchMarket()]);

  const live = {
    updatedAt: new Date().toISOString(),
    deepseek,
    devices: buildDevices(state),
    codex: state.codex
      ? {
          available: true,
          remaining: state.codex.remaining,
          reset: state.codex.reset,
          tokens7d: state.codex.tokens7d,
          dailyTokens: state.codex.dailyTokens || [],
        }
      : { available: false, note: "等待 Codex 采集器上报" },
    market,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(encrypt(live), null, 2), "utf8");

  if (stateChanged) {
    await mkdir(path.dirname(STATE_PATH), { recursive: true });
    await writeFile(STATE_PATH, JSON.stringify(encrypt(state), null, 2), "utf8");
  }

  console.log(
    `LIVE_OK: deepseek=${deepseek.available ? "yes" : "no"} ` +
      `symbols=${market.symbols.length} devices=${live.devices.length} ` +
      `codex=${live.codex.available ? "yes" : "no"} stateChanged=${stateChanged}`
  );
}

main().catch((error) => {
  console.error("LIVE_FAILED:", error.message);
  process.exit(1);
});
