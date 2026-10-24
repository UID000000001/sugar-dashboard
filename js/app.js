/* =========================================================
   Soki Sugar Life · Dashboard
   交互逻辑：时钟 / 工作状态 / 设置 / 演示数据渲染
   ========================================================= */

(() => {
  "use strict";

  const DATA = window.SUGAR || {};
  const TZ = DATA.work?.timeZone || "Asia/Shanghai";
  const STORAGE_KEY = "sugar-dashboard:settings:v1";
  const LAST_BG_KEY = "sugar-dashboard:last-background:v1";
  const LIVE_FILE = "assets/live.enc.json";
  const LIVE_SESSION_KEY = "sugar-dashboard:live-passphrase";
  const BACKGROUND_STORE = window.SugarBackgrounds || null;
  const MAX_BG_IMAGES = 24;
  const BG_INTERVAL_OPTIONS = new Set([1, 5, 10, 30, 60]);

  const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  const DEFAULTS = Object.freeze({
    siteName: DATA.site?.name || "Soki Sugar Life",
    workStart: DATA.work?.start || "08:30",
    workEnd: DATA.work?.end || "17:00",
    restMode: DATA.work?.restMode === "single" ? "single" : "double",
    blogUrl: "https://soki.moe/",
    githubUrl: "https://github.com/users/SokiSama/projects",
    alpha: 80,
    dancer: false,
    noMotion: false,
    theme: "dark",
    bgEnabled: false,
    bgOrder: "sequential",
    bgInterval: 10,
    bgTheme: true,
    bgOverlay: 50,
    updatedAt: 0,
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pad = (value) => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const els = {
    page: $(".page"),
    brandName: $("#brandName"),
    brandSub: $("#brandSub"),
    servicePill: $("#servicePill"),
    serviceLabel: $("#serviceLabel"),
    serviceSub: $("#serviceSub"),
    clockTime: $("#clockTime"),
    clockDate: $("#clockDate"),
    themeBtn: $("#themeBtn"),
    themeColorMeta: $("#themeColor"),
    settingsBtn: $("#settingsBtn"),
    footerSettingsBtn: $("#footerSettingsBtn"),
    drawer: $("#settingsDrawer"),
    backdrop: $("#drawerBackdrop"),
    form: $("#settingsForm"),
    toast: $("#toast"),
    workState: $("#workState"),
    countdownLabel: $("#countdownLabel"),
    offCountdown: $("#offCountdown"),
    quoteText: $("#quoteText"),
    workProgressText: $("#workProgressText"),
    workProgressBar: $("#workProgressBar"),
    workProgressWrap: $("#workProgressBarWrap"),
    workStartLabel: $("#workStartLabel"),
    workEndLabel: $("#workEndLabel"),
    dayRing: $("#dayRing"),
    dayNum: $("#dayNum"),
    dayWeek: $("#dayWeek"),
    dayMonth: $("#dayMonth"),
    holidayDays: $("#holidayDays"),
    holidayName: $("#holidayName"),
    weekRange: $("#weekRange"),
    weekDays: $("#weekDays"),
    restModeLabel: $("#restModeLabel"),
    weekWorkdays: $("#weekWorkdays"),
    monthWorkdays: $("#monthWorkdays"),
    marketSync: $("#marketSync"),
    dsChip: $("#dsChip"),
    dsBalance: $("#dsBalance"),
    dsRecharge: $("#dsRecharge"),
    dsBonus: $("#dsBonus"),
    dsSpend: $("#dsSpend"),
    dsSparkTotal: $("#dsSparkTotal"),
    dsNote: $("#dsNote"),
    dsLine: $("#dsLine"),
    dsArea: $("#dsArea"),
    dsPoint: $("#dsPoint"),
    devicesChip: $("#devicesChip"),
    devicesNote: $("#devicesNote"),
    deviceList: $("#deviceList"),
    codexRing: $("#codexRing"),
    codexValue: $("#codexValue"),
    codexChip: $("#codexChip"),
    codexReset: $("#codexReset"),
    codexNote: $("#codexNote"),
    tokenBars: $("#tokenBars"),
    alphaInput: $("#optAlpha"),
    alphaOutput: $("#alphaOutput"),
    siteNameInput: $("#optSiteName"),
    workStartInput: $("#optWorkStart"),
    workEndInput: $("#optWorkEnd"),
    blogInput: $("#optBlogUrl"),
    githubInput: $("#optGithubUrl"),
    dancerInput: $("#optDancer"),
    noMotionInput: $("#optNoMotion"),
    copyrightYear: $("#copyrightYear"),
    easter: $("#easter"),
    dataModeTag: $("#dataModeTag"),
    liveGate: $("#liveGate"),
    liveGateForm: $("#liveGateForm"),
    livePassphrase: $("#livePassphrase"),
    liveGateError: $("#liveGateError"),
    liveUnlockBtn: $("#liveUnlockBtn"),
    liveGateLater: $("#liveGateLater"),
    wallpaper: $("#wallpaper"),
    wallpaperA: $("#wallpaperA"),
    wallpaperB: $("#wallpaperB"),
    bgDrop: $("#bgDrop"),
    bgInput: $("#bgInput"),
    bgAddBtn: $("#bgAddBtn"),
    bgAddLabel: $("#bgAddLabel"),
    bgGrid: $("#bgGrid"),
    bgCount: $("#bgCount"),
    bgHint: $("#bgHint"),
    bgPalette: $("#bgPalette"),
    bgEnabledInput: $("#optBgEnabled"),
    bgIntervalInput: $("#optBgInterval"),
    bgThemeInput: $("#optBgTheme"),
    bgOverlayInput: $("#optBgOverlay"),
    bgOverlayOutput: $("#bgOverlayOutput"),
    settingsSaveState: $("#settingsSaveState"),
    settingsSyncCard: $("#settingsSyncCard"),
    settingsSyncDot: $("#settingsSyncDot"),
    settingsSyncTitle: $("#settingsSyncTitle"),
    settingsSyncHint: $("#settingsSyncHint"),
  };

  let settings = { ...DEFAULTS, ...loadStoredSettings() };
  if (!Number.isFinite(Number(settings.updatedAt)) || Number(settings.updatedAt) < 0) {
    settings.updatedAt = 0;
  }
  let drawerOpen = false;
  let formDirty = false;
  let lastFocus = null;
  let lastDateKey = "";
  let lastScheduleKey = "";
  let lastRingMinute = -1;
  let toastTimer = 0;
  let themeTimer = 0;
  let demoStarted = false;
  let applyingRemoteSettings = false;
  let formSaveTimer = 0;
  let settingsSyncTimer = 0;
  let settingsSyncBusy = false;
  let settingsSyncQueued = false;

  const systemThemeQuery =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");

  const liveState = {
    mode: "demo",
    file: null,
    payload: null,
    passphrase: "",
    updatedAt: "",
    pollTimer: 0,
    busy: false,
    syncToken: "",
    repo: "",
    lastSettingsSyncAt: 0,
    settingsSeedAttempted: false,
  };

  const bgState = {
    supported: Boolean(BACKGROUND_STORE?.supported),
    loaded: false,
    error: "",
    images: [],
    urls: new Map(),
    currentId: null,
    currentRecord: null,
    currentColors: [],
    activeLayer: 0,
    switchToken: 0,
    timer: 0,
    timerInterval: 0,
    lastSwitchAt: 0,
    uploadBusy: false,
    appliedVars: [],
    overlayTimer: 0,
  };

  const FALLBACK_PALETTE = [
    { h: 330, s: 0.62 },
    { h: 265, s: 0.58 },
    { h: 168, s: 0.5 },
    { h: 38, s: 0.7 },
  ];

  /* ---------------------------------------------------------
     设置存取
     --------------------------------------------------------- */

  function loadStoredSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return sanitizeSettings(parsed);
    } catch (error) {
      return {};
    }
  }

  function sanitizeSettings(input) {
    const output = {};
    if (!input || typeof input !== "object") return output;

    if (typeof input.siteName === "string" && input.siteName.trim()) {
      output.siteName = input.siteName.trim().slice(0, 28);
    }
    if (isTimeString(input.workStart)) output.workStart = input.workStart;
    if (isTimeString(input.workEnd)) output.workEnd = input.workEnd;
    if (input.restMode === "single" || input.restMode === "double") {
      output.restMode = input.restMode;
    }
    if (typeof input.blogUrl === "string") output.blogUrl = input.blogUrl.trim();
    if (typeof input.githubUrl === "string") output.githubUrl = input.githubUrl.trim();

    const alpha = Number(input.alpha);
    if (Number.isFinite(alpha)) output.alpha = clamp(Math.round(alpha / 5) * 5, 40, 100);

    if (typeof input.dancer === "boolean") output.dancer = input.dancer;
    if (typeof input.noMotion === "boolean") output.noMotion = input.noMotion;
    if (input.theme === "dark" || input.theme === "light" || input.theme === "auto") {
      output.theme = input.theme;
    }

    if (typeof input.bgEnabled === "boolean") output.bgEnabled = input.bgEnabled;
    if (input.bgOrder === "sequential" || input.bgOrder === "random") {
      output.bgOrder = input.bgOrder;
    }
    const interval = Number(input.bgInterval);
    if (BG_INTERVAL_OPTIONS.has(interval)) output.bgInterval = interval;
    if (typeof input.bgTheme === "boolean") output.bgTheme = input.bgTheme;
    const overlay = Number(input.bgOverlay);
    if (Number.isFinite(overlay)) {
      output.bgOverlay = clamp(Math.round(overlay / 5) * 5, 0, 80);
    }

    const updatedAt = Number(input.updatedAt);
    if (Number.isFinite(updatedAt) && updatedAt > 0) {
      output.updatedAt = Math.floor(updatedAt);
    }

    return output;
  }

  function storeSettings(options = {}) {
    const touch = options.touch !== false;

    if (touch && !applyingRemoteSettings) {
      settings.updatedAt = Date.now();
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      return false;
    }

    if (touch && !applyingRemoteSettings) {
      scheduleSettingsSync();
    }

    return true;
  }

  function isTimeString(value) {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  /* ---------------------------------------------------------
     上海时间
     --------------------------------------------------------- */

  const partsFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  function getNow() {
    const map = {};
    for (const part of partsFormatter.formatToParts(new Date())) {
      if (part.type !== "literal") map[part.type] = part.value;
    }

    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);
    const hour = Number(map.hour) % 24;
    const minute = Number(map.minute);
    const second = Number(map.second);

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      dateKey: `${year}-${pad(month)}-${pad(day)}`,
      minutes: hour * 60 + minute + second / 60,
    };
  }

  const clockStamp = (now) => `${pad(now.hour)}:${pad(now.minute)}`;
  const fullStamp = (now) => `${pad(now.hour)}:${pad(now.minute)}:${pad(now.second)}`;
  const liveStamp = (iso) => {
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso));
    } catch (error) {
      return clockStamp(getNow());
    }
  };
  const toMinutes = (value) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
  }

  /* ---------------------------------------------------------
     时钟与工作状态
     --------------------------------------------------------- */

  function tick() {
    const now = getNow();

    els.clockTime.textContent = fullStamp(now);
    els.clockTime.setAttribute(
      "datetime",
      `${now.year}-${pad(now.month)}-${pad(now.day)}T${fullStamp(now)}+08:00`
    );
    els.clockDate.textContent = `${now.month}月${now.day}日 ${WEEK[now.weekday]}`;
    els.copyrightYear.textContent = String(now.year);

    renderWork(now);

    if (now.dateKey !== lastDateKey) {
      lastDateKey = now.dateKey;
      renderDayRing(now, true);
      renderHoliday(now);
    } else if (now.minute !== lastRingMinute) {
      renderDayRing(now, false);
    }

    const scheduleKey = `${now.dateKey}:${settings.restMode}`;
    if (scheduleKey !== lastScheduleKey) {
      lastScheduleKey = scheduleKey;
      renderWeekRhythm(now);
      renderScheduleMeta(now);
    }
  }

  function isRestDay(weekday, restMode) {
    if (restMode === "single") return weekday === 0;
    return weekday === 0 || weekday === 6;
  }

  function renderWork(now) {
    els.workStartLabel.textContent = settings.workStart;
    els.workEndLabel.textContent = settings.workEnd;

    let start = toMinutes(settings.workStart);
    let end = toMinutes(settings.workEnd);
    const overnight = end <= start;
    if (overnight) end += 24 * 60;

    let nowMinutes = now.minutes;
    if (overnight && nowMinutes < end - 24 * 60) nowMinutes += 24 * 60;

    const restDay = isRestDay(now.weekday, settings.restMode);
    let state = "工作中";
    let label = "距离快乐下班还有";
    let countdown = "00:00:00";
    let progress = 0;
    let quote = DATA.quotes?.working || "";
    let countdownClass = "";
    let progressLabel = "0%";

    if (restDay) {
      state = "休息中";
      label = "今天不上班，好好休息";
      countdown = "休息中";
      progress = 0;
      progressLabel = "—";
      quote = DATA.quotes?.resting || quote;
      countdownClass = "is-rest";
    } else if (nowMinutes < start) {
      state = "待上班";
      label = "距离上班还有";
      countdown = formatDuration((start - nowMinutes) * 60);
      progress = 0;
      progressLabel = "0%";
      quote = DATA.quotes?.before || quote;
    } else if (nowMinutes >= end) {
      state = "已下班";
      label = "今天已经下班啦";
      countdown = "00:00:00";
      progress = 100;
      progressLabel = "100%";
      quote = DATA.quotes?.off || quote;
      countdownClass = "is-off";
    } else {
      state = "工作中";
      label = "距离快乐下班还有";
      countdown = formatDuration((end - nowMinutes) * 60);
      progress = clamp(((nowMinutes - start) / (end - start)) * 100, 0, 100);
      progressLabel = `${Math.round(progress)}%`;
      quote = DATA.quotes?.working || quote;
    }

    els.workState.textContent = state;
    els.countdownLabel.textContent = label;
    els.offCountdown.textContent = countdown;
    els.offCountdown.classList.toggle("is-off", countdownClass === "is-off");
    els.offCountdown.classList.toggle("is-rest", countdownClass === "is-rest");
    els.quoteText.textContent = quote;
    els.workProgressText.textContent = progressLabel;
    els.workProgressBar.style.width = `${progress.toFixed(2)}%`;
    els.workProgressWrap.setAttribute("aria-valuenow", String(Math.round(progress)));
  }

  function renderDayRing(now, force) {
    if (!force && now.minute === lastRingMinute) return;
    lastRingMinute = now.minute;

    const dayProgress = clamp((now.minutes / (24 * 60)) * 100, 0, 100);
    els.dayRing.style.setProperty("--p", dayProgress.toFixed(2));
    els.dayNum.textContent = String(now.day);
    els.dayWeek.textContent = WEEK[now.weekday];
    els.dayMonth.textContent = `${now.month} 月`;
  }

  function renderHoliday(now) {
    const holidays = (Array.isArray(DATA.holidays) ? DATA.holidays : [])
      .map((item) => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.date || "");
        if (!match) return null;
        return {
          name: item.name || "假期",
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
          timestamp: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);

    const today = Date.UTC(now.year, now.month - 1, now.day);
    const next = holidays.find((item) => item.timestamp >= today);

    if (!next) {
      els.holidayDays.textContent = "—";
      els.holidayName.textContent = "暂无临近节假日";
      return;
    }

    const days = Math.round((next.timestamp - today) / 86400000);
    els.holidayDays.textContent = String(days);
    els.holidayName.textContent =
      days === 0
        ? `今天就是${next.name} · 放假啦`
        : `${next.name} · ${next.month} 月 ${next.day} 日`;
  }

  function renderWeekRhythm(now) {
    if (!els.weekDays) return;

    const today = Date.UTC(now.year, now.month - 1, now.day);
    const monday = new Date(today);
    monday.setUTCDate(monday.getUTCDate() - ((now.weekday + 6) % 7));

    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    const cells = labels.map((label, index) => {
      const day = new Date(monday);
      day.setUTCDate(monday.getUTCDate() + index);
      const weekday = day.getUTCDay();
      const classes = ["week-day"];
      const isToday = day.getTime() === today;

      if (isRestDay(weekday, settings.restMode)) classes.push("is-rest");
      if (day.getTime() < today) classes.push("is-past");
      if (isToday) classes.push("is-today");

      return `<div class="${classes.join(" ")}"${isToday ? ' aria-current="date"' : ""}><i>${label}</i><b>${day.getUTCDate()}</b></div>`;
    });

    els.weekDays.innerHTML = cells.join("");

    if (els.weekRange) {
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const stamp = (date) => `${date.getUTCMonth() + 1}.${pad(date.getUTCDate())}`;
      els.weekRange.textContent = `${stamp(monday)} – ${stamp(sunday)}`;
    }
  }

  function countWorkdays(year, month, fromDay) {
    const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let count = 0;

    for (let day = fromDay; day <= totalDays; day += 1) {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      if (!isRestDay(weekday, settings.restMode)) count += 1;
    }

    return count;
  }

  function renderScheduleMeta(now) {
    if (els.restModeLabel) {
      els.restModeLabel.textContent = settings.restMode === "single" ? "单休" : "双休";
    }
    if (els.weekWorkdays) {
      els.weekWorkdays.textContent = `${settings.restMode === "single" ? 6 : 5} 天`;
    }
    if (els.monthWorkdays) {
      els.monthWorkdays.textContent = `${countWorkdays(now.year, now.month, now.day)} 天`;
    }
  }

  /* ---------------------------------------------------------
     图表
     --------------------------------------------------------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildSeries(seed, startValue, endValue, count = 34) {
    const random = mulberry32(seed);
    const values = [];
    let value = startValue;

    for (let index = 0; index < count; index += 1) {
      const target = startValue + (endValue - startValue) * (index / (count - 1));
      value += (random() - 0.5) * startValue * 0.0045 + (target - value) * 0.16;
      values.push(value);
    }

    values[0] = startValue;
    values[count - 1] = endValue;
    return values;
  }

  function drawLine(line, area, values, options = {}) {
    if (!line || !area || !Array.isArray(values) || values.length < 2) return null;

    const width = 240;
    const height = options.height || 44;
    const padding = options.padding ?? 6;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return [x, y];
    });

    const path = points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");

    line.setAttribute("d", path);
    area.setAttribute("d", `${path} L${width},${height} L0,${height} Z`);
    return points;
  }

  const formatMoney = (value) =>
    Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  function reducedMotion() {
    return (
      settings.noMotion ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    );
  }

  function animateNumber(node, target, options = {}) {
    if (!node) return;
    const decimals = options.decimals ?? 2;
    const duration = options.duration ?? 900;
    const format = (value) =>
      Number(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    if (reducedMotion()) {
      node.textContent = format(target);
      return;
    }

    const startAt = performance.now();
    const step = (time) => {
      const progress = clamp((time - startAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = format(target * eased);
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------
     演示数据渲染
     --------------------------------------------------------- */

  function setDataModeTag(mode) {
    if (!els.dataModeTag) return;

    els.dataModeTag.classList.toggle("is-live", mode === "live");
    els.dataModeTag.classList.toggle("is-locked", mode === "locked");

    if (mode === "live") {
      els.dataModeTag.textContent = "LIVE · 加密数据";
      els.dataModeTag.title = "已通过口令解密实时数据；数据来自加密的 GitHub Actions 产物";
    } else if (mode === "locked") {
      els.dataModeTag.textContent = "LIVE · 未解锁";
      els.dataModeTag.title = "检测到加密实时数据，刷新页面或重新进入以输入口令";
    } else {
      els.dataModeTag.textContent = "DEMO · 演示数据";
      els.dataModeTag.title = "页面当前使用演示数据";
    }
  }

  function initDevices() {
    if (!Array.isArray(DATA.devices)) return;
    const rows = $$(".device", els.deviceList);

    DATA.devices.forEach((device, index) => {
      const row = rows[index];
      if (!row) return;

      row.dataset.level = String(device.level ?? "");
      row.classList.toggle(
        "is-low",
        Number.isFinite(Number(device.level)) && Number(device.level) < 45
      );
      const name = $(".device-name", row);
      const glyphUse = $(".device-glyph use", row);
      if (name) name.textContent = device.name;
      if (glyphUse) glyphUse.setAttribute("href", `#i-${device.icon || "phone"}`);
    });
  }

  function renderDevices() {
    if (!Array.isArray(DATA.devices)) return;
    const rows = $$(".device", els.deviceList);

    rows.forEach((row, index) => {
      const device = DATA.devices[index];
      if (!device) return;

      const level = Number(device.level);
      const hasLevel = Number.isFinite(level);
      const nameNode = $(".device-name", row);
      const glyphUse = $(".device-glyph use", row);

      if (nameNode && device.name) nameNode.textContent = device.name;
      if (glyphUse && device.icon) {
        glyphUse.setAttribute("href", `#i-${device.icon}`);
      }
      row.classList.toggle("is-low", hasLevel && level < 45);

      window.setTimeout(() => {
        const pct = $(".device-pct", row);
        const meter = $(".device-meter span", row);
        const state = $(".device-state", row);
        if (pct) pct.textContent = hasLevel ? `${Math.round(level)}%` : "—%";
        if (meter) meter.style.width = hasLevel ? `${clamp(level, 0, 100)}%` : "0%";
        if (state) {
          state.textContent =
            device.state || (hasLevel ? "刚刚同步" : "等待同步");
        }
      }, index * 110);
    });

    if (els.devicesChip) {
      if (DATA.devices.length) {
        els.devicesChip.textContent = `${DATA.devices.length} 台设备`;
        els.devicesChip.classList.add("is-ready");
      } else {
        els.devicesChip.textContent = "等待同步";
        els.devicesChip.classList.remove("is-ready");
      }
    }
    if (els.devicesNote) {
      if (!DATA.devices.length) {
        els.devicesNote.textContent = "还没有设备上报电量";
      } else if (liveState.mode === "live") {
        els.devicesNote.textContent = `最近同步 · ${liveStamp(liveState.updatedAt)}`;
      } else {
        els.devicesNote.textContent = `最近同步 · ${clockStamp(getNow())}`;
      }
    }
  }

  function renderDeepSeek() {
    const deepseek = DATA.deepseek;
    if (!deepseek) return;

    const balance = Number(deepseek.balance);
    if (Number.isFinite(balance)) {
      animateNumber(els.dsBalance, balance, { decimals: 2, duration: 1000 });
    } else if (els.dsBalance) {
      els.dsBalance.textContent = "—";
    }

    const money = (value) =>
      Number.isFinite(Number(value)) ? `¥ ${formatMoney(value)}` : "—";

    if (els.dsRecharge) els.dsRecharge.textContent = money(deepseek.recharge);
    if (els.dsBonus) els.dsBonus.textContent = money(deepseek.bonus);
    if (els.dsSpend) els.dsSpend.textContent = money(deepseek.spend);
    if (els.dsSparkTotal) els.dsSparkTotal.textContent = money(deepseek.spend);

    const series =
      Array.isArray(deepseek.spendSeries) && deepseek.spendSeries.length > 1
        ? deepseek.spendSeries
        : null;

    if (series) {
      const points = drawLine(els.dsLine, els.dsArea, series, {
        height: 56,
        padding: 7,
      });
      if (points && els.dsPoint) {
        const [x, y] = points[points.length - 1];
        els.dsPoint.setAttribute("cx", x.toFixed(2));
        els.dsPoint.setAttribute("cy", y.toFixed(2));
        els.dsPoint.setAttribute("opacity", "1");
      }
    } else {
      els.dsLine?.setAttribute("d", "");
      els.dsArea?.setAttribute("d", "");
      els.dsPoint?.setAttribute("opacity", "0");
    }

    if (els.dsChip) {
      els.dsChip.textContent = "已连接";
      els.dsChip.classList.add("is-ready");
      els.dsChip.classList.remove("is-warn");
    }
    if (els.dsNote) {
      els.dsNote.textContent =
        liveState.mode === "live"
          ? `余额更新于 ${liveStamp(liveState.updatedAt)} · 加密同步`
          : `余额更新于 ${clockStamp(getNow())} · 演示数据`;
    }
  }

  function initTokenBars() {
    const values = DATA.codex?.dailyTokens;
    if (!Array.isArray(values) || !els.tokenBars) return;
    els.tokenBars.innerHTML = values.map(() => '<span style="height:4%"></span>').join("");
  }

  function renderCodex() {
    const codex = DATA.codex;
    if (!codex) return;

    const remaining = Number(codex.remaining);
    if (!Number.isFinite(remaining)) return;

    if (els.codexRing) els.codexRing.style.setProperty("--p", String(remaining));
    if (els.codexValue) {
      els.codexValue.innerHTML = `${Math.round(remaining)}<small>%</small>`;
    }
    if (els.codexChip) {
      els.codexChip.textContent = "本周";
      els.codexChip.classList.add("is-ready");
      els.codexChip.classList.remove("is-warn");
    }
    if (els.codexReset) {
      els.codexReset.textContent = codex.reset || "每周额度 · 周日 00:00 重置";
    }
    if (els.codexNote) {
      const tokens = Number(codex.tokens7d);
      els.codexNote.textContent = Number.isFinite(tokens)
        ? `过去 7 天 · ${(tokens / 1_000_000).toFixed(2)}M tokens`
        : "Token 活动已同步";
    }

    if (Array.isArray(codex.dailyTokens) && els.tokenBars) {
      const bars = $$("span", els.tokenBars);
      const max = Math.max(...codex.dailyTokens, 1);
      bars.forEach((bar, index) => {
        const value = codex.dailyTokens[index] ?? 0;
        const height = Math.max(8, Math.round((value / max) * 100));
        window.setTimeout(() => {
          bar.style.height = `${height}%`;
        }, index * 55);
      });
    }
  }

  function renderMarket() {
    const market = DATA.market;
    if (!market || !Array.isArray(market.symbols)) return;

    market.symbols.forEach((symbol) => {
      const key = String(symbol.symbol).toLowerCase();
      const priceNode = $(`#${key}Price`);
      const changeNode = $(`#${key}Change`);
      const prevNode = $(`#${key}Prev`);
      const ampNode = $(`#${key}Amp`);
      const volNode = $(`#${key}Vol`);
      const chart = $(`#${key}Chart`);

      const price = Number(symbol.price);
      const previous = Number(symbol.prevClose);

      if (!Number.isFinite(price) || !Number.isFinite(previous) || previous === 0) {
        if (priceNode) priceNode.textContent = "—";
        if (changeNode) changeNode.textContent = "—";
        if (prevNode) prevNode.textContent = "—";
        if (ampNode) ampNode.textContent = "—";
        if (volNode) volNode.textContent = "—";
        return;
      }

      const change = ((price - previous) / previous) * 100;
      const amplitude = Number(symbol.amplitude);

      if (priceNode) priceNode.textContent = formatMoney(price);
      if (changeNode) {
        changeNode.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
        changeNode.classList.toggle("down", change < 0);
      }
      if (prevNode) prevNode.textContent = formatMoney(previous);
      if (ampNode) {
        ampNode.textContent = Number.isFinite(amplitude)
          ? `${amplitude.toFixed(2)}%`
          : "—";
      }
      if (volNode) volNode.textContent = symbol.volume || "—";

      if (chart) {
        const realSeries = Array.isArray(symbol.series)
          ? symbol.series.filter((value) => Number.isFinite(Number(value)))
          : [];
        const values =
          realSeries.length > 2
            ? realSeries
            : liveState.mode === "live"
              ? []
              : buildSeries(symbol.seed || 1, previous, price, 34);
        const line = $(".chart-line", chart);
        const area = $(".chart-area", chart);

        if (values.length > 2) {
          drawLine(line, area, values, { height: 44, padding: 5 });
        } else {
          line?.setAttribute("d", "");
          area?.setAttribute("d", "");
        }
      }
    });

    if (els.marketSync) {
      const stamp =
        liveState.mode === "live"
          ? liveStamp(liveState.updatedAt)
          : clockStamp(getNow());
      els.marketSync.textContent = `${market.updatedLabel || "延时行情"} · ${stamp}`;
    }
  }

  function setServiceOnline() {
    if (!els.servicePill) return;
    els.servicePill.dataset.state = "online";
    if (els.serviceLabel) els.serviceLabel.textContent = "ONLINE";
    if (els.serviceSub) {
      els.serviceSub.textContent =
        liveState.mode === "live"
          ? "实时数据已解锁"
          : liveState.mode === "locked"
            ? "等待解锁实时数据"
            : "服务运行正常";
    }
  }

  /* ---------------------------------------------------------
     加密实时数据
     --------------------------------------------------------- */

  function base64ToBytes(value) {
    const binary = atob(String(value));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function decryptLiveFile(file, passphrase) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("当前浏览器不支持 WebCrypto");
    }
    if (!file || file.v !== 1 || !file.salt || !file.iv || !file.data) {
      throw new Error("实时数据格式不正确");
    }

    const iterations = Number(file.iterations) || 150000;
    if (iterations < 50000 || iterations > 2000000) {
      throw new Error("实时数据参数不正确");
    }

    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: base64ToBytes(file.salt),
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plain = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(file.iv) },
      key,
      base64ToBytes(file.data)
    );

    return JSON.parse(new TextDecoder().decode(plain));
  }

  function showLiveGate() {
    if (!els.liveGate) return;
    els.liveGate.hidden = false;
    document.body.classList.add("live-locked");
    if (els.page) els.page.inert = true;
    setDataModeTag("locked");
    if (els.liveGateError) els.liveGateError.textContent = "";
    els.liveGate.addEventListener("keydown", onLiveGateKeydown);
    window.setTimeout(() => els.livePassphrase?.focus(), 80);
  }

  function hideLiveGate() {
    if (!els.liveGate) return;
    els.liveGate.hidden = true;
    document.body.classList.remove("live-locked");
    if (els.page) els.page.inert = false;
    els.liveGate.removeEventListener("keydown", onLiveGateKeydown);
  }

  function onLiveGateKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      skipLiveData();
      return;
    }
    if (event.key !== "Tab") return;

    const focusables = $$(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      els.liveGate
    ).filter((node) => node.offsetParent !== null);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function skipLiveData() {
    hideLiveGate();
    liveState.mode = "demo";
    setDataModeTag("demo");
    if (els.serviceSub) els.serviceSub.textContent = "服务运行正常";
    updateSettingsAccess();
    startDemoSequence();
  }

  function startDemoSequence() {
    if (demoStarted || liveState.mode === "live") return;
    demoStarted = true;
    setDataModeTag("demo");

    window.setTimeout(renderDevices, 650);
    window.setTimeout(renderDeepSeek, 850);
    window.setTimeout(renderCodex, 1100);
    window.setTimeout(renderMarket, 950);
  }

  function applyLivePayload(payload) {
    if (!payload || typeof payload !== "object") return;

    liveState.payload = payload;
    liveState.updatedAt = payload.updatedAt || new Date().toISOString();
    liveState.mode = "live";
    liveState.syncToken =
      typeof payload.settingsSyncToken === "string" ? payload.settingsSyncToken : "";
    liveState.repo =
      typeof payload.repo === "string" && payload.repo.includes("/")
        ? payload.repo.trim()
        : deriveSyncRepo();
    setDataModeTag("live");
    if (els.serviceSub) els.serviceSub.textContent = "实时数据已解锁";

    if (payload.settings) applyRemoteSettings(payload.settings);
    else if (canSyncSettings() && !liveState.settingsSeedAttempted) {
      liveState.settingsSeedAttempted = true;
      scheduleSettingsSync();
    }

    const deepseek = payload.deepseek;
    if (deepseek && deepseek.available) {
      DATA.deepseek = { ...DATA.deepseek, ...deepseek };
      renderDeepSeek();
    } else {
      DATA.deepseek = { ...DATA.deepseek, available: false };
      if (els.dsChip) {
        els.dsChip.textContent = "未配置";
        els.dsChip.classList.remove("is-ready");
        els.dsChip.classList.add("is-warn");
      }
      if (els.dsBalance) els.dsBalance.textContent = "—";
      if (els.dsRecharge) els.dsRecharge.textContent = "—";
      if (els.dsBonus) els.dsBonus.textContent = "—";
      if (els.dsSpend) els.dsSpend.textContent = "—";
      if (els.dsSparkTotal) els.dsSparkTotal.textContent = "—";
      els.dsLine?.setAttribute("d", "");
      els.dsArea?.setAttribute("d", "");
      els.dsPoint?.setAttribute("opacity", "0");
      if (els.dsNote) {
        els.dsNote.textContent = deepseek?.note || "DeepSeek Key 未配置";
      }
    }

    if (Array.isArray(payload.devices)) {
      DATA.devices = payload.devices;
      renderDevices();
    }

    if (payload.codex && payload.codex.available) {
      DATA.codex = { ...DATA.codex, ...payload.codex };
      initTokenBars();
      renderCodex();
    } else {
      if (els.codexChip) {
        els.codexChip.textContent = "未采集";
        els.codexChip.classList.remove("is-ready");
        els.codexChip.classList.add("is-warn");
      }
      if (els.codexValue) els.codexValue.innerHTML = "—<small>%</small>";
      if (els.codexRing) els.codexRing.style.setProperty("--p", "0");
      if (els.tokenBars) els.tokenBars.innerHTML = "";
      if (els.codexNote) els.codexNote.textContent = "等待 Codex 采集器上报";
    }

    if (
      payload.market &&
      Array.isArray(payload.market.symbols) &&
      payload.market.symbols.length
    ) {
      DATA.market = { ...DATA.market, ...payload.market };
      renderMarket();
    } else if (els.marketSync) {
      els.marketSync.textContent = "行情暂不可用";
    }

    updateSettingsAccess();
  }

  async function unlockLiveData(passphrase) {
    if (!liveState.file || liveState.busy) return;
    const value = String(passphrase || "").trim();
    if (!value) {
      if (els.liveGateError) els.liveGateError.textContent = "请输入数据口令";
      return;
    }

    liveState.busy = true;
    if (els.liveUnlockBtn) els.liveUnlockBtn.disabled = true;
    if (els.liveGateError) els.liveGateError.textContent = "正在解密…";

    try {
      const payload = await decryptLiveFile(liveState.file, value);
      liveState.passphrase = value;
      try {
        sessionStorage.setItem(LIVE_SESSION_KEY, value);
      } catch (error) {
        // 隐私模式下忽略
      }

      hideLiveGate();
      applyLivePayload(payload);
      startLivePolling();
      if (els.livePassphrase) els.livePassphrase.value = "";
      if (els.liveGateError) els.liveGateError.textContent = "";
    } catch (error) {
      if (els.liveGateError) {
        els.liveGateError.textContent = "口令不正确，或数据已更新；请重试。";
      }
      els.livePassphrase?.select();
    } finally {
      liveState.busy = false;
      if (els.liveUnlockBtn) els.liveUnlockBtn.disabled = false;
    }
  }

  async function initLiveData() {
    if (!window.crypto || !window.crypto.subtle) return false;

    try {
      const res = await fetch(`${LIVE_FILE}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return false;

      const file = await res.json();
      if (!file || file.v !== 1 || !file.data) return false;
      liveState.file = file;
      liveState.mode = "locked";
      setDataModeTag("locked");

      let saved = "";
      try {
        saved = sessionStorage.getItem(LIVE_SESSION_KEY) || "";
      } catch (error) {
        // 忽略
      }

      if (saved) {
        try {
          const payload = await decryptLiveFile(file, saved);
          liveState.passphrase = saved;
          applyLivePayload(payload);
          startLivePolling();
          return true;
        } catch (error) {
          try {
            sessionStorage.removeItem(LIVE_SESSION_KEY);
          } catch (removeError) {
            // 忽略
          }
        }
      }

      showLiveGate();
      return true;
    } catch (error) {
      return false;
    }
  }

  function startLivePolling() {
    window.clearInterval(liveState.pollTimer);
    liveState.pollTimer = window.setInterval(async () => {
      if (document.hidden || !liveState.passphrase) return;

      try {
        const res = await fetch(`${LIVE_FILE}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const file = await res.json();
        if (!file || file.v !== 1 || !file.data) return;
        if (liveState.file && file.data === liveState.file.data) return;

        const payload = await decryptLiveFile(file, liveState.passphrase);
        liveState.file = file;
        applyLivePayload(payload);
      } catch (error) {
        // 保留上一次成功的数据；下一次轮询再试
      }
    }, 60000);
  }

  /* ---------------------------------------------------------
     自定义背景 / 图片主题
     --------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[character] || character;
    });
  }

  function readLastBgId() {
    try {
      return localStorage.getItem(LAST_BG_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function saveLastBgId(id) {
    try {
      localStorage.setItem(LAST_BG_KEY, id);
    } catch (error) {
      // 忽略隐私模式下的写入失败
    }
  }

  function ensureBackgroundUrls(record) {
    if (!record) return null;
    if (bgState.urls.has(record.id)) return bgState.urls.get(record.id);

    const full = record.blob ? URL.createObjectURL(record.blob) : "";
    const thumb = record.thumb
      ? URL.createObjectURL(record.thumb)
      : full;
    const urls = { full, thumb };
    bgState.urls.set(record.id, urls);
    return urls;
  }

  function releaseBackgroundUrls(id, delay = 0) {
    const release = () => {
      const urls = bgState.urls.get(id);
      if (!urls) return;
      if (urls.full) URL.revokeObjectURL(urls.full);
      if (urls.thumb && urls.thumb !== urls.full) URL.revokeObjectURL(urls.thumb);
      bgState.urls.delete(id);
    };

    if (delay > 0) window.setTimeout(release, delay);
    else release();
  }

  function normalisePalette(record) {
    const source = record?.palette?.colors;
    const colors = Array.isArray(source)
      ? source
          .filter(
            (color) =>
              color &&
              Number.isFinite(Number(color.h)) &&
              Number.isFinite(Number(color.s))
          )
          .slice(0, 4)
          .map((color) => ({
            h: ((Number(color.h) % 360) + 360) % 360,
            s: clamp(Number(color.s), 0.2, 0.9),
          }))
      : [];

    while (colors.length < 4) colors.push(FALLBACK_PALETTE[colors.length]);
    return colors;
  }

  function buildImagePalette(record) {
    const colors = normalisePalette(record);
    const dark = document.documentElement.dataset.theme !== "light";

    const hue = (color) => Math.round(color.h);
    const saturation = (color) => Math.round(clamp(color.s * 100, 42, 86));

    const h1 = hue(colors[0]);
    const h2 = hue(colors[1]);
    const h3 = hue(colors[2]);
    const h4 = hue(colors[3]);
    const s1 = saturation(colors[0]);
    const s2 = saturation(colors[1]);
    const s3 = saturation(colors[2]);
    const s4 = saturation(colors[3]);

    const solid = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;
    const soft = (h, s, l, a) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

    const vars = {
      "--pink": solid(h1, s1, dark ? 70 : 44),
      "--pink-strong": solid(h1, Math.min(90, s1 + 4), dark ? 62 : 38),
      "--lilac": solid(h2, s2, dark ? 72 : 46),
      "--mint": solid(h3, s3, dark ? 70 : 42),
      "--blue": solid(h2, s2, dark ? 72 : 43),
      "--gold": solid(h4, s4, dark ? 68 : 46),
      "--accent-soft-1": soft(h1, s1, dark ? 62 : 56, dark ? 0.26 : 0.3),
      "--accent-soft-2": soft(h2, s2, dark ? 60 : 56, dark ? 0.2 : 0.24),
      "--accent-border": soft(h1, s1, dark ? 60 : 52, 0.45),
      "--accent-border-mint": soft(h3, s3, dark ? 55 : 46, 0.4),
      "--pink-soft": soft(h1, s1, dark ? 58 : 52, dark ? 0.14 : 0.11),
      "--mint-soft": soft(h3, s3, dark ? 55 : 48, dark ? 0.14 : 0.11),
      "--lilac-soft": soft(h2, s2, dark ? 58 : 52, dark ? 0.16 : 0.12),
      "--ring-track": dark ? "rgba(255, 255, 255, 0.085)" : "rgba(76, 48, 100, 0.1)",
      "--ring-inner": dark ? "rgba(22, 15, 35, 0.94)" : "rgba(255, 255, 255, 0.94)",
      "--selected-ink": dark ? "#ffffff" : "#33202e",
      "--aurora-1": soft(h1, s1, 58, dark ? 0.45 : 0.35),
      "--aurora-2": soft(h2, s2, 58, dark ? 0.4 : 0.3),
      "--aurora-3": soft(h3, s3, 55, dark ? 0.3 : 0.25),
      "--accent-glow-1": soft(h1, s1, 52, dark ? 0.18 : 0.14),
      "--accent-glow-2": soft(h2, s2, 52, dark ? 0.12 : 0.1),
      "--wallpaper-glow": soft(h1, s1, 52, dark ? 0.32 : 0.24),
    };

    return {
      vars,
      colors: [vars["--pink"], vars["--lilac"], vars["--mint"], vars["--gold"]],
    };
  }

  function updatePaletteStrip() {
    if (!els.bgPalette) return;

    const show =
      settings.bgEnabled &&
      settings.bgTheme &&
      Boolean(bgState.currentRecord) &&
      bgState.currentColors.length === 4;

    els.bgPalette.hidden = !show;
    if (!show) return;

    $$(".swatch", els.bgPalette).forEach((swatch, index) => {
      swatch.style.background = bgState.currentColors[index] || "transparent";
    });
  }

  function clearImageTheme() {
    const root = document.documentElement;
    bgState.appliedVars.forEach((key) => root.style.removeProperty(key));
    bgState.appliedVars = [];
    bgState.currentColors = [];
    root.classList.remove("has-image-theme");
    updatePaletteStrip();
  }

  function applyImageTheme(record = bgState.currentRecord) {
    const root = document.documentElement;

    if (
      !settings.bgEnabled ||
      !settings.bgTheme ||
      !record ||
      !root.classList.contains("has-wallpaper")
    ) {
      clearImageTheme();
      return;
    }

    bgState.appliedVars.forEach((key) => root.style.removeProperty(key));
    const palette = buildImagePalette(record);
    Object.entries(palette.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    bgState.appliedVars = Object.keys(palette.vars);
    bgState.currentColors = palette.colors;
    root.classList.add("has-image-theme");
    updatePaletteStrip();
  }

  function refreshImageTheme() {
    if (
      settings.bgEnabled &&
      settings.bgTheme &&
      bgState.currentRecord &&
      document.documentElement.classList.contains("has-wallpaper")
    ) {
      applyImageTheme(bgState.currentRecord);
    } else {
      clearImageTheme();
    }
  }

  function updateBackgroundHint() {
    if (!els.bgHint) return;

    if (!bgState.supported) {
      els.bgHint.textContent = bgState.error || "当前浏览器不支持本地图片存储。";
      return;
    }
    if (bgState.error) {
      els.bgHint.textContent = bgState.error;
      return;
    }
    if (!bgState.loaded) {
      els.bgHint.textContent = "正在读取本机背景图片…";
      return;
    }
    if (bgState.uploadBusy) {
      els.bgHint.textContent = "正在压缩并保存图片，请稍候…";
      return;
    }

    const count = bgState.images.length;
    if (!count) {
      els.bgHint.textContent = "还没有背景图片。添加两张以上后，刷新页面会自动换图。";
      return;
    }
    if (count === 1) {
      els.bgHint.textContent = "已添加 1 张。再添加几张，刷新页面或等待间隔时会自动切换。";
      return;
    }
    if (!settings.bgEnabled) {
      els.bgHint.textContent = `已添加 ${count} 张，打开「使用自定义背景」即可启用。`;
      return;
    }
    const order = settings.bgOrder === "random" ? "随机" : "按顺序";
    els.bgHint.textContent = `${order}切换 · 每次重新打开页面先换一张，停留时每 ${settings.bgInterval} 分钟换一张。`;
  }

  function updateCurrentBackgroundBadge() {
    if (!els.bgGrid) return;
    $$(".bg-thumb", els.bgGrid).forEach((thumb) => {
      const isCurrent = thumb.dataset.bgId === bgState.currentId;
      thumb.classList.toggle("is-current", isCurrent);
      let badge = $(".bg-current-badge", thumb);

      if (isCurrent && !badge) {
        badge = document.createElement("span");
        badge.className = "bg-current-badge";
        badge.textContent = "当前";
        thumb.appendChild(badge);
      } else if (!isCurrent && badge) {
        badge.remove();
      }
    });
  }

  function renderBackgroundManager() {
    if (!els.bgGrid) return;

    if (!bgState.loaded) {
      els.bgGrid.innerHTML = "";
      if (els.bgCount) els.bgCount.textContent = "读取中";
      updateBackgroundControls();
      return;
    }

    const count = bgState.images.length;
    if (els.bgCount) els.bgCount.textContent = `${count} 张`;

    if (!count) {
      els.bgGrid.innerHTML = "";
      updateBackgroundControls();
      return;
    }

    els.bgGrid.innerHTML = bgState.images
      .map((record) => {
        const urls = ensureBackgroundUrls(record);
        const isCurrent = record.id === bgState.currentId;
        return `<li class="bg-thumb${isCurrent ? " is-current" : ""}" data-bg-id="${escapeHtml(record.id)}">
          <img src="${urls.thumb}" alt="" loading="lazy" draggable="false">
          <span class="bg-thumb-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</span>
          ${isCurrent ? '<span class="bg-current-badge">当前</span>' : ""}
          <button class="bg-remove" type="button" data-remove-bg="${escapeHtml(record.id)}" aria-label="删除 ${escapeHtml(record.name)}">×</button>
        </li>`;
      })
      .join("");

    updateBackgroundControls();
  }

  function updateBackgroundControls() {
    if (els.bgEnabledInput) {
      els.bgEnabledInput.checked = Boolean(settings.bgEnabled);
      els.bgEnabledInput.disabled = !bgState.images.length || !bgState.supported;
    }

    const order = $(
      `input[name="bgOrder"][value="${settings.bgOrder}"]`,
      els.form || document
    );
    if (order) order.checked = true;

    if (els.bgIntervalInput) els.bgIntervalInput.value = String(settings.bgInterval);
    if (els.bgThemeInput) els.bgThemeInput.checked = Boolean(settings.bgTheme);
    if (els.bgOverlayInput) els.bgOverlayInput.value = String(settings.bgOverlay);
    if (els.bgOverlayOutput) els.bgOverlayOutput.textContent = `${settings.bgOverlay}%`;

    if (els.bgAddBtn) {
      els.bgAddBtn.disabled =
        bgState.uploadBusy ||
        !bgState.supported ||
        bgState.images.length >= MAX_BG_IMAGES;
      if (els.bgAddLabel) {
        els.bgAddLabel.textContent = bgState.uploadBusy ? "处理中…" : "添加图片";
      }
    }

    if (els.bgCount) {
      els.bgCount.textContent = !bgState.loaded
        ? "读取中"
        : `${bgState.images.length} 张`;
    }

    updatePaletteStrip();
    updateBackgroundHint();
  }

  function pickNextBackground() {
    const list = bgState.images;
    if (!list.length) return null;
    if (list.length === 1) return list[0];

    const lastId = bgState.currentId || readLastBgId();

    if (settings.bgOrder === "random") {
      const candidates = list.filter((record) => record.id !== lastId);
      return candidates[Math.floor(Math.random() * candidates.length)] || list[0];
    }

    const index = list.findIndex((record) => record.id === lastId);
    return list[(index + 1) % list.length];
  }

  async function showBackground(record, options = {}) {
    if (!record || !settings.bgEnabled) return;

    const layers = [els.wallpaperA, els.wallpaperB];
    if (!layers[0] || !layers[1]) return;

    const urls = ensureBackgroundUrls(record);
    if (!urls.full) return;

    const token = ++bgState.switchToken;
    const same =
      bgState.currentId === record.id &&
      document.documentElement.classList.contains("has-wallpaper");

    if (same) {
      bgState.currentRecord = record;
      applyImageTheme(record);
      updateCurrentBackgroundBadge();
      return;
    }

    const incoming = layers[bgState.activeLayer ^ 1];
    const outgoing = layers[bgState.activeLayer];

    incoming.classList.remove("is-active", "is-incoming");
    incoming.src = urls.full;

    try {
      await incoming.decode();
    } catch (error) {
      // 已缓存或解码失败时仍尝试显示
    }

    if (token !== bgState.switchToken) return;

    incoming.classList.add("is-incoming");
    void incoming.offsetWidth;
    document.documentElement.classList.add("has-wallpaper");
    incoming.classList.add("is-active");
    outgoing.classList.remove("is-active");

    bgState.activeLayer ^= 1;
    bgState.currentId = record.id;
    bgState.currentRecord = record;
    bgState.lastSwitchAt = Date.now();
    saveLastBgId(record.id);

    if (settings.bgTheme) applyImageTheme(record);
    else clearImageTheme();

    updateCurrentBackgroundBadge();
    updatePaletteStrip();

    window.setTimeout(
      () => {
        if (incoming.classList.contains("is-active")) {
          incoming.classList.remove("is-incoming");
        }
      },
      reducedMotion() ? 0 : 1200
    );
  }

  function showNextBackground(options = {}) {
    if (!settings.bgEnabled) return;
    const next = pickNextBackground();
    if (next) showBackground(next, options);
  }

  function stopBackgroundTimer() {
    if (bgState.timer) {
      window.clearInterval(bgState.timer);
      bgState.timer = 0;
    }
    bgState.timerInterval = 0;
  }

  function startBackgroundTimer() {
    if (!settings.bgEnabled || bgState.images.length < 2) {
      stopBackgroundTimer();
      return;
    }

    if (bgState.timer && bgState.timerInterval === settings.bgInterval) {
      return;
    }

    stopBackgroundTimer();

    bgState.timer = window.setInterval(() => {
      if (document.hidden) return;
      showNextBackground({ reason: "interval" });
    }, Math.max(1, settings.bgInterval) * 60 * 1000);
    bgState.timerInterval = settings.bgInterval;
  }

  function hideBackground() {
    document.documentElement.classList.remove("has-wallpaper");
    stopBackgroundTimer();
    clearImageTheme();
    updateCurrentBackgroundBadge();
  }

  function applyBackgroundPreferences() {
    const root = document.documentElement;
    root.style.setProperty(
      "--bg-overlay",
      (clamp(settings.bgOverlay, 0, 80) / 100).toFixed(2)
    );

    updateBackgroundControls();

    if (!bgState.loaded || !bgState.supported) return;

    if (!settings.bgEnabled || !bgState.images.length) {
      hideBackground();
      return;
    }

    const hasWallpaper = root.classList.contains("has-wallpaper");

    if (!hasWallpaper || !bgState.currentRecord) {
      const target = bgState.currentRecord || pickNextBackground();
      if (target) showBackground(target);
    } else {
      applyImageTheme(bgState.currentRecord);
    }

    startBackgroundTimer();
  }

  async function initBackgrounds() {
    if (!els.wallpaper) return;

    if (!BACKGROUND_STORE) {
      bgState.supported = false;
      bgState.loaded = true;
      bgState.error = "背景图片模块未加载";
      updateBackgroundControls();
      return;
    }

    if (!bgState.supported) {
      bgState.loaded = true;
      bgState.error = "当前浏览器不支持本地图片存储，无法使用自定义背景。";
      updateBackgroundControls();
      return;
    }

    try {
      const records = (await BACKGROUND_STORE.getAll()).filter(
        (record) => record && record.id && record.blob
      );
      bgState.images = records;
      bgState.loaded = true;
      records.forEach(ensureBackgroundUrls);

      renderBackgroundManager();

      if (settings.bgEnabled && records.length) {
        showNextBackground();
        startBackgroundTimer();
      } else {
        hideBackground();
      }
    } catch (error) {
      bgState.loaded = true;
      bgState.error = "读取本机图片失败，请检查浏览器的本地存储权限。";
      console.warn("背景图片读取失败", error);
      updateBackgroundControls();
    }
  }

  async function handleBackgroundFiles(fileList) {
    if (!BACKGROUND_STORE || !bgState.supported) {
      showToast("当前浏览器不支持本地背景图片");
      return;
    }
    if (bgState.uploadBusy) return;

    const files = Array.from(fileList || []).filter((file) =>
      BACKGROUND_STORE.isImageFile(file)
    );
    if (!files.length) {
      showToast("请选择图片文件");
      return;
    }

    const room = MAX_BG_IMAGES - bgState.images.length;
    if (room <= 0) {
      showToast(`最多添加 ${MAX_BG_IMAGES} 张背景图片`);
      return;
    }

    const batch = files.slice(0, room);
    const wasEmpty = bgState.images.length === 0;
    const baseTime = Date.now();
    let added = 0;
    let failed = 0;

    bgState.uploadBusy = true;
    updateBackgroundControls();

    for (let index = 0; index < batch.length; index += 1) {
      try {
        const prepared = await BACKGROUND_STORE.prepareFile(batch[index]);
        const record = { ...prepared, addedAt: baseTime + index };
        await BACKGROUND_STORE.add(record);
        bgState.images.push(record);
        ensureBackgroundUrls(record);
        added += 1;
      } catch (error) {
        failed += 1;
        console.warn("背景图片处理失败", batch[index]?.name, error);
      }
    }

    bgState.images.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    bgState.uploadBusy = false;
    if (els.bgInput) els.bgInput.value = "";

    renderBackgroundManager();

    if (added > 0 && wasEmpty && !settings.bgEnabled) {
      settings.bgEnabled = true;
      storeSettings();
      applyBackgroundPreferences();
      showToast(
        failed > 0
          ? `已添加 ${added} 张，${failed} 张处理失败`
          : `已添加 ${added} 张图片并启用背景`
      );
    } else if (added > 0) {
      if (settings.bgEnabled) applyBackgroundPreferences();
      showToast(
        failed > 0
          ? `已添加 ${added} 张，${failed} 张处理失败`
          : `已添加 ${added} 张背景图片`
      );
    } else {
      showToast("图片添加失败，请换一张试试");
    }

    updateBackgroundControls();
  }

  async function removeBackground(id) {
    if (!BACKGROUND_STORE) return;

    const record = bgState.images.find((item) => item.id === id);
    if (!record) return;

    try {
      await BACKGROUND_STORE.remove(id);
    } catch (error) {
      showToast("删除失败，请稍后再试");
      return;
    }

    const wasCurrent = bgState.currentId === id;
    bgState.images = bgState.images.filter((item) => item.id !== id);

    if (readLastBgId() === id) {
      try {
        localStorage.removeItem(LAST_BG_KEY);
      } catch (error) {
        // 忽略
      }
    }

    if (wasCurrent) {
      bgState.currentId = null;
      bgState.currentRecord = null;
      bgState.currentColors = [];
    }

    releaseBackgroundUrls(id, 1400);

    if (!bgState.images.length) {
      settings.bgEnabled = false;
      storeSettings();
      hideBackground();
      showToast("背景图片已全部删除，已恢复默认背景");
    } else if (wasCurrent && settings.bgEnabled) {
      showNextBackground();
    } else {
      updateCurrentBackgroundBadge();
    }

    renderBackgroundManager();
    updateBackgroundControls();
    startBackgroundTimer();
  }

  /* ---------------------------------------------------------
     设置应用
     --------------------------------------------------------- */

  const THEME_MODES = new Set(["dark", "light", "auto"]);

  function resolveTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    return systemThemeQuery?.matches ? "light" : "dark";
  }

  function syncThemeRadios(mode) {
    $$('input[name="theme"]').forEach((input) => {
      input.checked = input.value === mode;
    });
  }

  function applyTheme(mode, animate = false) {
    const normalized = THEME_MODES.has(mode) ? mode : "dark";
    const resolved = resolveTheme(normalized);
    const light = resolved === "light";

    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;

    if (els.themeColorMeta) {
      els.themeColorMeta.setAttribute("content", light ? "#fbf7ff" : "#0b0813");
    }

    if (els.themeBtn) {
      const label = light ? "切换到深色模式" : "切换到浅色模式";
      els.themeBtn.setAttribute("aria-label", label);
      els.themeBtn.setAttribute("title", label);
      els.themeBtn.setAttribute("aria-pressed", light ? "true" : "false");
    }

    syncThemeRadios(normalized);
    refreshImageTheme();

    if (!animate || reducedMotion()) return;

    document.documentElement.classList.add("theme-switching");
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("theme-switching");
    }, 420);
  }

  function toggleTheme() {
    if (liveState.mode !== "live") {
      showToast("解锁实时数据后才能修改设置");
      return;
    }

    const next = resolveTheme(settings.theme) === "light" ? "dark" : "light";
    settings.theme = next;
    storeSettings();
    applyTheme(next, true);
  }

  function applySettings(animateTheme = false) {
    document.documentElement.style.setProperty("--card-alpha", (settings.alpha / 100).toFixed(2));
    document.documentElement.style.setProperty(
      "--bg-overlay",
      (clamp(settings.bgOverlay, 0, 80) / 100).toFixed(2)
    );
    document.documentElement.classList.toggle("no-motion", Boolean(settings.noMotion));
    document.body.classList.toggle("is-dancer", Boolean(settings.dancer));

    applyTheme(settings.theme, animateTheme);

    if (els.brandName) els.brandName.textContent = settings.siteName;
    if (els.brandSub) els.brandSub.textContent = DATA.site?.subtitle || "Sugar Life / Dashboard";

    document.title = `${settings.siteName} · Dashboard`;

    els.workStartLabel.textContent = settings.workStart;
    els.workEndLabel.textContent = settings.workEnd;

    const links = $$(".foot-links a.foot-link");
    if (links[0]) {
      links[0].href = safeUrl(settings.blogUrl) || "#";
    }
    if (links[1]) {
      links[1].href = safeUrl(settings.githubUrl) || "#";
    }

    if (els.alphaInput) els.alphaInput.value = String(settings.alpha);
    if (els.alphaOutput) els.alphaOutput.textContent = `${settings.alpha}%`;

    applyBackgroundPreferences();
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.toString();
    } catch (error) {
      return "";
    }
  }

  function fillForm() {
    if (!els.form) return;
    if (els.siteNameInput) els.siteNameInput.value = settings.siteName;
    if (els.workStartInput) els.workStartInput.value = settings.workStart;
    if (els.workEndInput) els.workEndInput.value = settings.workEnd;
    const rest = $(`input[name="restMode"][value="${settings.restMode}"]`, els.form);
    if (rest) rest.checked = true;
    const theme = $(`input[name="theme"][value="${settings.theme}"]`, els.form);
    if (theme) theme.checked = true;
    if (els.blogInput) els.blogInput.value = settings.blogUrl;
    if (els.githubInput) els.githubInput.value = settings.githubUrl;
    if (els.alphaInput) els.alphaInput.value = String(settings.alpha);
    if (els.alphaOutput) els.alphaOutput.textContent = `${settings.alpha}%`;
    if (els.dancerInput) els.dancerInput.checked = Boolean(settings.dancer);
    if (els.noMotionInput) els.noMotionInput.checked = Boolean(settings.noMotion);

    updateBackgroundControls();
  }

  function readForm() {
    const rest = $('input[name="restMode"]:checked', els.form);
    const theme = $('input[name="theme"]:checked', els.form);
    const bgOrder = $('input[name="bgOrder"]:checked', els.form);
    return {
      siteName: els.siteNameInput.value.trim(),
      workStart: els.workStartInput.value,
      workEnd: els.workEndInput.value,
      restMode: rest ? rest.value : "double",
      theme: theme ? theme.value : "dark",
      blogUrl: els.blogInput.value.trim(),
      githubUrl: els.githubInput.value.trim(),
      alpha: Number(els.alphaInput.value),
      dancer: Boolean(els.dancerInput.checked),
      noMotion: Boolean(els.noMotionInput.checked),
      bgEnabled: els.bgEnabledInput ? Boolean(els.bgEnabledInput.checked) : false,
      bgOrder: bgOrder ? bgOrder.value : "sequential",
      bgInterval: els.bgIntervalInput ? Number(els.bgIntervalInput.value) : 10,
      bgTheme: els.bgThemeInput ? Boolean(els.bgThemeInput.checked) : true,
      bgOverlay: els.bgOverlayInput ? Number(els.bgOverlayInput.value) : 45,
    };
  }

  function validateSettings(values) {
    if (!values.siteName) return "主页名称不能为空";
    if (!isTimeString(values.workStart) || !isTimeString(values.workEnd)) {
      return "请填写完整的上下班时间";
    }
    if (values.workStart === values.workEnd) return "上班时间和下班时间不能相同";
    if (!THEME_MODES.has(values.theme)) return "外观主题设置有误";
    if (values.blogUrl && !safeUrl(values.blogUrl)) return "博客地址需要以 http(s) 开头";
    if (values.githubUrl && !safeUrl(values.githubUrl)) return "GitHub 地址需要以 http(s) 开头";
    if (!Number.isFinite(values.alpha)) return "卡片不透明度设置有误";
    if (values.bgOrder !== "sequential" && values.bgOrder !== "random") {
      return "背景切换方式设置有误";
    }
    if (!BG_INTERVAL_OPTIONS.has(Number(values.bgInterval))) {
      return "背景切换间隔设置有误";
    }
    if (
      !Number.isFinite(values.bgOverlay) ||
      values.bgOverlay < 0 ||
      values.bgOverlay > 80
    ) {
      return "背景遮罩设置有误";
    }
    return "";
  }

  /* ---------------------------------------------------------
     设置自动保存 / 跨设备同步
     --------------------------------------------------------- */

  function deriveSyncRepo() {
    if (
      DATA.sync &&
      typeof DATA.sync.repo === "string" &&
      DATA.sync.repo.includes("/")
    ) {
      return DATA.sync.repo.trim();
    }

    const host = window.location.hostname;
    if (host.endsWith(".github.io")) {
      const owner = host.slice(0, -".github.io".length);
      const repo = window.location.pathname.split("/").filter(Boolean)[0];
      if (owner && repo) return `${owner}/${repo}`;
    }

    return "";
  }

  function getSyncRepo() {
    const repo = String(liveState.repo || deriveSyncRepo() || "").trim();
    return /^[^/\s]+\/[^/\s]+$/.test(repo) ? repo : "";
  }

  function canSyncSettings() {
    return (
      liveState.mode === "live" &&
      Boolean(liveState.syncToken) &&
      Boolean(getSyncRepo())
    );
  }

  function settingsForSync() {
    return {
      siteName: settings.siteName,
      workStart: settings.workStart,
      workEnd: settings.workEnd,
      restMode: settings.restMode,
      theme: settings.theme,
      blogUrl: settings.blogUrl,
      githubUrl: settings.githubUrl,
      alpha: settings.alpha,
      dancer: Boolean(settings.dancer),
      noMotion: Boolean(settings.noMotion),
      bgEnabled: Boolean(settings.bgEnabled),
      bgOrder: settings.bgOrder,
      bgInterval: settings.bgInterval,
      bgTheme: Boolean(settings.bgTheme),
      bgOverlay: settings.bgOverlay,
      updatedAt: Number(settings.updatedAt) || 0,
    };
  }

  function setSaveState(message, state = "saved") {
    if (!els.settingsSaveState) return;
    els.settingsSaveState.textContent = message;
    els.settingsSaveState.classList.toggle("is-pending", state === "pending");
    els.settingsSaveState.classList.toggle("is-local", state === "local");
    els.settingsSaveState.classList.toggle("is-error", state === "error");
  }

  function updateSyncCard() {
    if (!els.settingsSyncTitle) return;

    const unlocked = liveState.mode === "live";
    const hasToken = Boolean(liveState.syncToken);
    const repo = getSyncRepo();
    const dot = els.settingsSyncDot;
    dot?.classList.remove("is-on", "is-warn");

    if (!unlocked) {
      els.settingsSyncTitle.textContent = "跨设备同步";
      els.settingsSyncHint.textContent = "解锁实时数据后启用。";
      return;
    }

    if (!hasToken || !repo) {
      els.settingsSyncTitle.textContent = "仅本机自动保存";
      els.settingsSyncHint.textContent =
        "在仓库 Secrets 添加 SETTINGS_SYNC_TOKEN 后开启跨设备同步。";
      dot?.classList.add("is-warn");
      return;
    }

    els.settingsSyncTitle.textContent = "跨设备同步已开启";
    els.settingsSyncHint.textContent =
      "修改会自动加密同步；背景图片仍只保存在当前设备。";
    dot?.classList.add("is-on");
  }

  function scheduleSettingsSync() {
    if (!canSyncSettings()) {
      updateSyncCard();
      return;
    }

    window.clearTimeout(settingsSyncTimer);
    settingsSyncTimer = window.setTimeout(syncSettingsNow, 900);
  }

  async function syncSettingsNow() {
    if (!canSyncSettings()) return;

    if (settingsSyncBusy) {
      settingsSyncQueued = true;
      return;
    }

    settingsSyncBusy = true;
    settingsSyncQueued = false;
    const repo = getSyncRepo();
    const payload = settingsForSync();
    setSaveState("正在同步到云端…", "pending");

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${liveState.syncToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            event_type: "settings",
            client_payload: { settings: payload },
          }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      liveState.lastSettingsSyncAt = Date.now();
      setSaveState(`已同步 · ${clockStamp(getNow())}`, "saved");
      updateSyncCard();
    } catch (error) {
      setSaveState("本机已保存；云端同步失败，稍后会再试", "error");
      updateSyncCard();
    } finally {
      settingsSyncBusy = false;
      if (settingsSyncQueued) {
        settingsSyncQueued = false;
        scheduleSettingsSync();
      }
    }
  }

  function applyRemoteSettings(remote) {
    if (!remote || typeof remote !== "object") return false;

    const normalized = sanitizeSettings(remote);
    const remoteAt = Number(normalized.updatedAt) || 0;
    const localAt = Number(settings.updatedAt) || 0;

    if (remoteAt <= localAt) {
      if (canSyncSettings() && localAt > remoteAt) scheduleSettingsSync();
      return false;
    }

    applyingRemoteSettings = true;
    settings = { ...settings, ...normalized, updatedAt: remoteAt };
    storeSettings({ touch: false });
    applyingRemoteSettings = false;

    applySettings(false);
    if (drawerOpen) fillForm();
    tick();
    renderHoliday(getNow());
    renderDayRing(getNow(), true);
    setSaveState(`已从云端同步 · ${clockStamp(getNow())}`, "saved");
    updateSyncCard();
    return true;
  }

  function updateSettingsAccess() {
    const unlocked = liveState.mode === "live";
    const buttons = [els.themeBtn, els.settingsBtn, els.footerSettingsBtn];

    buttons.forEach((button) => {
      if (!button) return;
      button.disabled = !unlocked;
      button.setAttribute("aria-disabled", String(!unlocked));
    });

    if (unlocked) {
      if (els.settingsBtn) {
        els.settingsBtn.setAttribute("aria-label", "打开我的仪表盘设置");
        els.settingsBtn.title = "打开我的仪表盘设置";
      }
      if (els.footerSettingsBtn) {
        els.footerSettingsBtn.title = "打开我的仪表盘设置";
      }
      applyTheme(settings.theme, false);
    } else {
      if (els.themeBtn) {
        els.themeBtn.setAttribute("aria-label", "解锁实时数据后可修改设置");
        els.themeBtn.title = "解锁实时数据后可修改设置";
      }
      if (els.settingsBtn) {
        els.settingsBtn.setAttribute(
          "aria-label",
          "解锁实时数据后可打开我的仪表盘设置"
        );
        els.settingsBtn.title = "解锁实时数据后可修改设置";
      }
      if (els.footerSettingsBtn) {
        els.footerSettingsBtn.title = "解锁实时数据后可修改设置";
      }
      if (drawerOpen) closeDrawer();
    }

    document.body.classList.toggle("settings-locked", !unlocked);
    updateSyncCard();
  }

  function saveFormSettings() {
    if (liveState.mode !== "live") return false;

    const values = readForm();
    const error = validateSettings(values);
    if (error) {
      setSaveState(`未保存：${error}`, "error");
      return false;
    }

    settings = { ...settings, ...values };
    const stored = storeSettings();
    formDirty = false;
    applySettings(false);
    tick();
    renderHoliday(getNow());
    renderDayRing(getNow(), true);
    setSaveState(
      stored ? `已自动保存 · ${clockStamp(getNow())}` : "浏览器拒绝了本地保存",
      stored ? "saved" : "error"
    );
    return stored;
  }

  function queueFormAutoSave() {
    if (liveState.mode !== "live") return;
    formDirty = true;
    window.clearTimeout(formSaveTimer);
    setSaveState("编辑中…", "pending");
    formSaveTimer = window.setTimeout(() => {
      formSaveTimer = 0;
      saveFormSettings();
    }, 700);
  }

  function flushFormAutoSave() {
    window.clearTimeout(formSaveTimer);
    formSaveTimer = 0;
    if (!formDirty) return true;
    return saveFormSettings();
  }

  /* ---------------------------------------------------------
     抽屉交互
     --------------------------------------------------------- */

  function openDrawer() {
    if (drawerOpen) return;
    if (liveState.mode !== "live") {
      showToast("解锁实时数据后才能打开和修改设置");
      return;
    }

    drawerOpen = true;
    lastFocus = document.activeElement;
    formDirty = false;
    fillForm();
    setSaveState("修改会自动保存", "saved");
    updateSyncCard();

    if (els.backdrop) {
      els.backdrop.hidden = false;
      requestAnimationFrame(() => els.backdrop?.classList.add("is-open"));
    }

    els.drawer.classList.add("is-open");
    els.drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    els.settingsBtn?.setAttribute("aria-expanded", "true");
    els.footerSettingsBtn?.setAttribute("aria-expanded", "true");
    if (els.page) els.page.inert = true;

    els.drawer.addEventListener("keydown", onDrawerKeydown);
    window.setTimeout(() => els.siteNameInput?.focus({ preventScroll: true }), 260);
  }

  function closeDrawer() {
    if (!drawerOpen) return;

    if (formDirty && liveState.mode === "live") {
      if (!flushFormAutoSave()) {
        showToast(els.settingsSaveState?.textContent || "设置未保存，请检查输入");
        return;
      }
    }

    drawerOpen = false;

    els.drawer.classList.remove("is-open");
    els.backdrop?.classList.remove("is-open");
    document.body.classList.remove("drawer-open");

    if (els.page) els.page.inert = false;
    els.settingsBtn?.setAttribute("aria-expanded", "false");
    els.footerSettingsBtn?.setAttribute("aria-expanded", "false");

    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    }

    els.drawer.setAttribute("aria-hidden", "true");
    els.drawer.removeEventListener("keydown", onDrawerKeydown);

    formDirty = false;

    window.setTimeout(() => {
      if (!drawerOpen && els.backdrop) els.backdrop.hidden = true;
    }, 380);
  }

  function onDrawerKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== "Tab") return;

    const focusables = $$(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      els.drawer
    ).filter((node) => node.offsetParent !== null);

    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showToast(message) {
    if (!els.toast) return;
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 2600);
  }

  /* ---------------------------------------------------------
     事件绑定
     --------------------------------------------------------- */

  function bindEvents() {
    els.themeBtn?.addEventListener("click", toggleTheme);
    els.settingsBtn?.addEventListener("click", openDrawer);
    els.footerSettingsBtn?.addEventListener("click", openDrawer);
    $("#drawerCloseBtn")?.addEventListener("click", closeDrawer);
    els.backdrop?.addEventListener("click", closeDrawer);

    els.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!flushFormAutoSave()) return;
      closeDrawer();
      showToast("设置已自动保存");
    });

    els.liveGateForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      unlockLiveData(els.livePassphrase?.value);
    });

    els.liveGateLater?.addEventListener("click", skipLiveData);

    [...$$("input, select", els.form || document)].forEach((input) => {
      input.addEventListener("input", () => {
        if (input === els.alphaInput) {
          const value = Number(els.alphaInput.value);
          if (els.alphaOutput) els.alphaOutput.textContent = `${value}%`;
          document.documentElement.style.setProperty(
            "--card-alpha",
            (value / 100).toFixed(2)
          );
        }
        queueFormAutoSave();
      });
      input.addEventListener("change", () => {
        queueFormAutoSave();
      });
    });

    $$('input[name="theme"]', els.form || document).forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) applyTheme(input.value, true);
      });
    });

    els.bgAddBtn?.addEventListener("click", () => {
      els.bgInput?.click();
    });

    els.bgInput?.addEventListener("change", () => {
      handleBackgroundFiles(els.bgInput.files);
    });

    els.bgDrop?.addEventListener("click", (event) => {
      if (event.target.closest(".bg-add")) return;
      els.bgInput?.click();
    });

    els.bgDrop?.addEventListener("dragover", (event) => {
      event.preventDefault();
      els.bgDrop.classList.add("is-dragover");
    });

    els.bgDrop?.addEventListener("dragleave", () => {
      els.bgDrop.classList.remove("is-dragover");
    });

    els.bgDrop?.addEventListener("drop", (event) => {
      event.preventDefault();
      els.bgDrop.classList.remove("is-dragover");
      handleBackgroundFiles(event.dataTransfer?.files);
    });

    els.bgGrid?.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-bg]");
      if (!removeButton) return;
      event.preventDefault();
      event.stopPropagation();
      removeBackground(removeButton.getAttribute("data-remove-bg"));
    });

    els.bgEnabledInput?.addEventListener("change", () => {
      settings.bgEnabled = Boolean(els.bgEnabledInput.checked);
      storeSettings();
      applyBackgroundPreferences();
      updateBackgroundControls();
    });

    $$('input[name="bgOrder"]', els.form || document).forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        settings.bgOrder = input.value;
        storeSettings();
        startBackgroundTimer();
        updateBackgroundControls();
      });
    });

    els.bgIntervalInput?.addEventListener("change", () => {
      const value = Number(els.bgIntervalInput.value);
      if (!BG_INTERVAL_OPTIONS.has(value)) return;
      settings.bgInterval = value;
      storeSettings();
      startBackgroundTimer();
      updateBackgroundControls();
    });

    els.bgThemeInput?.addEventListener("change", () => {
      settings.bgTheme = Boolean(els.bgThemeInput.checked);
      storeSettings();
      refreshImageTheme();
      updateBackgroundControls();
    });

    els.bgOverlayInput?.addEventListener("input", () => {
      const value = clamp(Number(els.bgOverlayInput.value), 0, 80);
      settings.bgOverlay = value;
      if (els.bgOverlayOutput) els.bgOverlayOutput.textContent = `${value}%`;
      document.documentElement.style.setProperty(
        "--bg-overlay",
        (value / 100).toFixed(2)
      );
      window.clearTimeout(bgState.overlayTimer);
      bgState.overlayTimer = window.setTimeout(storeSettings, 300);
    });

    els.bgOverlayInput?.addEventListener("change", () => {
      const value = clamp(Number(els.bgOverlayInput.value), 0, 80);
      settings.bgOverlay = value;
      storeSettings();
    });

    if (systemThemeQuery) {
      const onSystemThemeChange = () => {
        if (settings.theme === "auto") applyTheme("auto", true);
      };
      if (typeof systemThemeQuery.addEventListener === "function") {
        systemThemeQuery.addEventListener("change", onSystemThemeChange);
      } else if (typeof systemThemeQuery.addListener === "function") {
        systemThemeQuery.addListener(onSystemThemeChange);
      }
    }

    $("#resetBtn")?.addEventListener("click", () => {
      if (liveState.mode !== "live") return;
      fillDefaultsIntoForm();
      formDirty = true;
      const alpha = DEFAULTS.alpha;
      document.documentElement.style.setProperty("--card-alpha", (alpha / 100).toFixed(2));
      applyTheme(DEFAULTS.theme, true);
      saveFormSettings();
      showToast("已恢复默认并自动保存");
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      tick();

      if (
        settings.bgEnabled &&
        bgState.images.length > 1 &&
        bgState.lastSwitchAt &&
        Date.now() - bgState.lastSwitchAt >= settings.bgInterval * 60 * 1000
      ) {
        showNextBackground({ reason: "resume" });
        stopBackgroundTimer();
        startBackgroundTimer();
      }
    });
  }

  function fillDefaultsIntoForm() {
    if (!els.form) return;
    els.siteNameInput.value = DEFAULTS.siteName;
    els.workStartInput.value = DEFAULTS.workStart;
    els.workEndInput.value = DEFAULTS.workEnd;
    const rest = $(`input[name="restMode"][value="${DEFAULTS.restMode}"]`, els.form);
    if (rest) rest.checked = true;
    const theme = $(`input[name="theme"][value="${DEFAULTS.theme}"]`, els.form);
    if (theme) theme.checked = true;
    els.blogInput.value = DEFAULTS.blogUrl;
    els.githubInput.value = DEFAULTS.githubUrl;
    els.alphaInput.value = String(DEFAULTS.alpha);
    els.alphaOutput.textContent = `${DEFAULTS.alpha}%`;
    els.dancerInput.checked = DEFAULTS.dancer;
    els.noMotionInput.checked = DEFAULTS.noMotion;
  }

  function populateEaster() {
    if (!els.easter) return;
    els.easter.innerHTML = Array.from({ length: 8 }, () => "<span></span>").join("");
  }

  /* ---------------------------------------------------------
     启动
     --------------------------------------------------------- */

  async function boot() {
    if (!DATA || !DATA.deepseek) {
      console.warn("SUGAR 数据未加载，仪表盘将以占位状态展示。");
    }

    initDevices();
    initTokenBars();
    populateEaster();
    bindEvents();
    applySettings();
    fillForm();
    initBackgrounds();
    tick();
    renderDayRing(getNow(), true);
    renderHoliday(getNow());

    els.settingsBtn?.setAttribute("aria-expanded", "false");
    els.footerSettingsBtn?.setAttribute("aria-expanded", "false");

    window.setInterval(tick, 1000);
    window.setTimeout(setServiceOnline, 1400);

    const hasLiveData = await initLiveData();
    updateSettingsAccess();
    if (!hasLiveData) {
      startDemoSequence();
    }

    if (
      window.location.hash === "#settings" &&
      liveState.mode === "live"
    ) {
      window.setTimeout(openDrawer, 500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
