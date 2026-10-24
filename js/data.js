/* =========================================================
   仪表盘数据源
   ---------------------------------------------------------
   当前是「演示模式」：所有数字都来自本文件，不会请求任何接口。
   要接入真实数据，可以把对应字段换成一次 fetch 的结果，
   或在 js/app.js 的 render 函数里调用你自己的后端。
   ========================================================= */

window.SUGAR = {
  version: "1.0.0",

  site: {
    name: "Soki Sugar Life",
    subtitle: "Sugar Life / Dashboard",
    theme: "水光",
  },

  // 时间与工作状态
  work: {
    start: "08:30",
    end: "17:00",
    restMode: "double", // double = 双休；single = 单休
    timeZone: "Asia/Shanghai",
  },

  // DeepSeek 余额（演示值）
  deepseek: {
    currency: "CNY",
    balance: 126.4,
    recharge: 100.0,
    bonus: 26.4,
    spend: 73.6,
    // 近 7 天消费，用于右侧迷你趋势图
    spendSeries: [6.4, 9.2, 4.8, 12.6, 8.1, 15.3, 17.2],
    note: "演示数据 · 接入 API 后显示实时余额",
  },

  // 设备电量（演示值）
  devices: [
    { name: "iPhone 17 Pro", level: 86, icon: "phone", state: "刚刚同步" },
    { name: "Samsung S25 Ultra", level: 64, icon: "phone", state: "3 分钟前" },
    { name: "iPad Pro 11-inch", level: 92, icon: "tablet", state: "8 分钟前" },
    { name: "Apple Watch S10", level: 41, icon: "watch", state: "12 分钟前" },
  ],

  // Codex 额度（演示值）
  codex: {
    remaining: 68,
    reset: "每周额度 · 周日 00:00 重置",
    tokens7d: 1236000,
    dailyTokens: [42, 68, 31, 88, 54, 73, 27],
  },

  // 持仓行情（演示值，非实时报价）
  market: {
    updatedLabel: "延时行情",
    symbols: [
      {
        symbol: "QQQM",
        name: "纳指 100 ETF",
        currency: "USD",
        price: 262.18,
        prevClose: 260.51,
        amplitude: 1.08,
        volume: "3.42M",
        seed: 20261024,
        trend: 0.16,
      },
      {
        symbol: "VOO",
        name: "标普 500 ETF",
        currency: "USD",
        price: 629.74,
        prevClose: 631.06,
        amplitude: 0.87,
        volume: "5.18M",
        seed: 20261025,
        trend: -0.08,
      },
    ],
  },

  // 节假日：用于「距离放假还有」。
  // 按需增删即可，日期格式 YYYY-MM-DD。此处为常见公历日期，未包含调休。
  holidays: [
    { date: "2026-10-01", name: "国庆节" },
    { date: "2027-01-01", name: "元旦" },
    { date: "2027-02-06", name: "春节" },
    { date: "2027-04-05", name: "清明节" },
    { date: "2027-05-01", name: "劳动节" },
    { date: "2027-06-09", name: "端午节" },
    { date: "2027-09-15", name: "中秋节" },
    { date: "2027-10-01", name: "国庆节" },
  ],

  quotes: {
    working: "工位可以控住你的肉体，但控不住你的灵魂",
    before: "早起的空气是甜的，先给自己一杯咖啡。",
    resting: "休息日，宜发呆、晒太阳、看云。",
    off: "下班了，把今天调成静音模式。",
  },
};
