/* =========================================================
   触发 GitHub Actions 的 repository_dispatch
   ---------------------------------------------------------
   用途：本机 / 手机把设备电量或 Codex 数据推给 GitHub Actions。
   需要一个 fine-grained PAT，仅授予该仓库 Actions: write 权限。

   用法：
     GITHUB_TOKEN=github_pat_xxx \
     GITHUB_REPOSITORY=owner/repo \
     node scripts/dispatch.mjs battery '{"deviceId":"iphone-17-pro","name":"iPhone 17 Pro","level":86,"icon":"phone","state":"unplugged"}'

     GITHUB_TOKEN=... GITHUB_REPOSITORY=... \
     node scripts/dispatch.mjs codex '{"remaining":68,"tokens7d":1236000,"reset":"每周额度"}'
   ========================================================= */

const type = process.argv[2];
const payloadArg = process.argv[3] || "{}";
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!["battery", "codex"].includes(type)) {
  console.error("用法: node scripts/dispatch.mjs battery|codex '<json>'");
  process.exit(1);
}

if (!token || !repository) {
  console.error("缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(payloadArg);
} catch (error) {
  console.error("JSON 参数格式不正确");
  process.exit(1);
}

const response = await fetch(
  `https://api.github.com/repos/${repository}/dispatches`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sugar-dashboard-dispatch",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: type,
      client_payload: payload,
    }),
  }
);

if (!response.ok) {
  console.error(`Dispatch 失败: HTTP ${response.status}`);
  const text = await response.text();
  if (text) console.error(text.slice(0, 300));
  process.exit(1);
}

console.log(`已触发 ${type} 更新；Actions 会在几十秒内重新部署。`);
