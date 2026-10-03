// Run after npm run build. Uses a temporary SQLite database and deterministic
// TMDb fixture; no personal key or production collection is read or changed.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "../..");
const dir = await mkdtemp(join(tmpdir(), "sakurareel-smoke-"));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIYQAAAAASUVORK5CYII=",
  "base64",
);
let failedImage = false;
let failedArchive = true;
const assets = new Map();
const extended = {
  original_name: "テストアニメ",
  genres: [
    { id: 16, name: "动画" },
    { id: 18, name: "剧情" },
  ],
  status: "Ended",
  tagline: "在一个新的世界，寻找自己的故事。",
  original_language: "ja",
  last_air_date: "2026-03-25",
  number_of_seasons: 2,
  vote_average: 8.4,
  vote_count: 312,
  production_countries: [{ name: "日本", iso_3166_1: "JP" }],
  spoken_languages: [{ name: "日本語" }],
  networks: [{ name: "测试电视台" }],
  created_by: [{ id: 3, name: "测试创作者", profile_path: "/portrait.png" }],
  homepage: "https://example.com",
  alternative_titles: {
    results: [{ title: "测试番剧别名", iso_3166_1: "CN", type: "译名" }],
  },
  translations: {
    translations: [
      {
        english_name: "Japanese",
        iso_639_1: "ja",
        iso_3166_1: "JP",
        data: { name: "テストアニメ", overview: "原语言作品简介" },
      },
    ],
  },
  keywords: { results: [{ name: "异世界" }, { name: "成长" }] },
  external_ids: { imdb_id: "tt1234567" },
  videos: {
    results: [
      {
        name: "官方预告片",
        site: "YouTube",
        key: "fixture-video",
        type: "Trailer",
        official: true,
        iso_639_1: "ja",
      },
    ],
  },
  content_ratings: { results: [{ iso_3166_1: "JP", rating: "PG12" }] },
  release_dates: {
    results: [
      {
        iso_3166_1: "JP",
        release_dates: [
          {
            certification: "PG12",
            release_date: "2026-04-01T00:00:00.000Z",
            type: 3,
          },
        ],
      },
    ],
  },
};

const seasonList = [0, 1, 2].map((n) => ({
  season_number: n,
  name: n ? `第 ${n} 季` : "特别篇",
  overview: `第 ${n} 季摘要`,
  air_date: "2026-01-01",
  episode_count: 2,
}));
const works = [
  {
    id: 101,
    name: "验收日本动画",
    genre_ids: [16],
    origin_country: ["JP"],
    first_air_date: "2026-01-01",
  },
  {
    id: 102,
    name: "验收海外动画",
    genre_ids: [16],
    origin_country: ["US"],
    first_air_date: "2026-02-01",
  },
  {
    id: 103,
    name: "验收节目",
    genre_ids: [18],
    origin_country: ["JP"],
    first_air_date: "2026-03-01",
  },
];
const imageInfo = {
  posters: [
    { file_path: "/poster.png" },
    { file_path: "/poster2.png" },
    { file_path: "/poster3.png" },
  ],
  backdrops: [{ file_path: "/backdrop.png" }],
  logos: [{ file_path: "/logo.svg", iso_639_1: "zh" }],
};
const fixture = createServer((req, res) => {
  const url = new URL(req.url, "http://fixture");
  if (url.pathname.startsWith("/images/")) {
    if (failedImage && url.pathname.endsWith("backdrop.png")) {
      res.writeHead(500);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": url.pathname.endsWith(".svg")
        ? "image/svg+xml"
        : "image/png",
    });
    res.end(assets.get(url.pathname.split("/").at(-1)) || png);
    return;
  }
  if (url.searchParams.get("api_key") !== "fixture-key") {
    res.writeHead(401);
    res.end("{}");
    return;
  }
  const q = url.searchParams.get("query");
  if (q === "限流") {
    res.writeHead(429);
    res.end("{}");
    return;
  }
  let data = {};
  const section = url.pathname.split("/").at(-1);
  if (section === "translations" && failedArchive) {
    res.writeHead(503);
    res.end("{}");
    return;
  }
  if (extended[section] && !url.pathname.includes("/season/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(extended[section]));
    return;
  }

  if (/\/(discover|search)\//.test(url.pathname)) {
    const movies = [
      {
        id: 201,
        title: "验收电影",
        overview: "电影简介",
        release_date: "2026-04-01",
        poster_path: "/poster.png",
      },
    ];
    data = {
      page: Number(url.searchParams.get("page") || 1),
      total_pages: 2,
      results: url.pathname.endsWith("movie")
        ? movies
        : works.map((w) => ({
            ...w,
            overview: "剧集简介",
            poster_path: "/poster.png",
          })),
    };
  } else if (url.pathname.includes("/season/")) {
    const n = Number(url.pathname.split("/").at(-1));
    data = {
      ...seasonList.find((s) => s.season_number === n),
      poster_path: "/poster.png",
      images: imageInfo,
      overview: `第 ${n} 季摘要`,
      episodes: [1, 2].map((i) => ({
        season_number: n,
        episode_number: i,
        name: `第 ${i} 集标题`,
        overview: `第 ${i} 集摘要`,
        air_date: "2026-01-01",
        runtime: 24,
      })),
    };
  } else if (url.pathname.includes("/tv/")) {
    data = {
      ...extended,
      ...works.find((w) => w.id === Number(url.pathname.split("/").at(-1))),
      overview: "整剧简介",
      seasons: seasonList,
      number_of_episodes: 4,
      episode_run_time: [24],
      poster_path: "/poster.png",
      backdrop_path: "/backdrop.png",
      images: imageInfo,
      production_companies: [{ name: "测试制作公司" }],
      credits: {
        cast: [
          {
            id: 1,
            name: "测试演员",
            character: "主角",
            profile_path: "/portrait.png",
          },
        ],
        crew: [
          {
            id: 2,
            name: "测试导演",
            job: "Director",
            profile_path: "/portrait.png",
          },
        ],
      },
    };
  } else if (url.pathname.includes("/movie/")) {
    data = {
      ...extended,
      budget: 15000000,
      revenue: 64000000,
      belongs_to_collection: { name: "测试电影系列" },
      id: 201,
      title: "验收电影",
      overview: "电影简介",
      release_date: "2026-04-01",
      runtime: 120,
      poster_path: "/poster.png",
      backdrop_path: "/backdrop.png",
      images: imageInfo,
    };
  }
  if (failedArchive && data.translations) delete data.translations;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const fixtureURL = `http://127.0.0.1:${fixture.address().port}`;
const binary = join(dir, "server");
execFileSync("go", ["build", "-o", binary, "."], { cwd: join(root, "server") });
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const service = spawn(binary, ["-data", dir, "-port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    TMDB_API_KEY: "fixture-key",
    TMDB_READ_TOKEN: "",
    TMDB_API_BASE: fixtureURL + "/3",
    TMDB_IMAGE_BASE: fixtureURL + "/images",
  },
});
let logs = "";
service.stdout.on("data", (b) => (logs += b));
service.stderr.on("data", (b) => (logs += b));
const base = `http://127.0.0.1:${port}`;
let browser;
let debugPage;
async function api(path, body, method = "POST") {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const out = await res.json();
  assert(out.ok, out.error);
  return out.data;
}
try {
  for (let n = 0; n < 50; n++) {
    try {
      await fetch(base + "/api/health");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const old = await api("/anime", {
    title: "手动旧收藏",
    category: "watched",
    rating: 9,
    note: "我的旧短评",
    poster: "",
    watch_date: "2026-05",
    play_link: "https://example.com",
  });
  await api("/anime", {
    title: "同月收藏",
    category: "watched",
    rating: 9,
    note: "",
    poster: "",
    watch_date: "2026-05",
    play_link: "",
  });
  browser = await chromium.launch({ headless: true });
  // Illustrated fixtures make image cropping, selection and hero contrast reviewable.
  const art = await browser.newPage({ viewport: { width: 400, height: 600 } });
  for (const [index, name] of [
    "poster.png",
    "poster2.png",
    "poster3.png",
    "backdrop.png",
    "portrait.png",
  ].entries()) {
    const colors = [
      ["#b9e2ed", "#e7b9d0"],
      ["#f8d194", "#bf7691"],
      ["#c9c5ef", "#729fbe"],
      ["#b3d4e9", "#e3bccd"],
      ["#e6cbdb", "#aa8baf"],
    ][index];
    await art.setContent(
      `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><circle cx="300" cy="130" r="65" fill="#fff1d1"/><path d="M0 350 150 150 340 420 400 320V600H0Z" fill="#637b9b" opacity=".6"/><path d="M0 470 200 290 400 500V600H0Z" fill="#425575" opacity=".8"/><path d="M145 600 174 410 226 410 255 600Z" fill="#eee4ec"/><circle cx="200" cy="385" r="33" fill="#f4d7ca"/><path d="M166 390q-4-67 43-52 38 8 25 65l-18-29-50 16Z" fill="#555268"/><text x="30" y="65" fill="white" font-family="sans-serif" font-size="22" letter-spacing="5">SAKURA REEL</text><text x="30" y="540" fill="white" font-family="sans-serif" font-size="30">世界の物語 ${index + 1}</text></svg></body></html>`,
    );
    assets.set(name, await art.screenshot());
  }
  assets.set(
    "logo.svg",
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="130"><text x="280" y="92" text-anchor="middle" fill="white" font-size="78" font-family="sans-serif" font-weight="bold">SakuraReel</text></svg>',
    ),
  );
  await art.close();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  debugPage = page;
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  async function continueRecord(target = page) {
    await target
      .getByRole("dialog", { name: "导入预览", exact: true })
      .waitFor();
  }
  async function finishRecord(target = page, custom = false) {
    const record = target.getByRole("dialog", {
      name: "添加影视剧",
      exact: true,
    });
    const preview = target.getByRole("dialog", {
      name: "导入预览",
      exact: true,
    });
    await record
      .or(preview)
      .or(target.getByRole("dialog", { name: "作品详情", exact: true }))
      .waitFor();
    if (await record.isVisible()) {
      await target.waitForFunction(() => {
        const el = document.querySelector(".sakura-record-editor");
        return (
          el &&
          getComputedStyle(el).opacity === "1" &&
          new DOMMatrix(getComputedStyle(el).transform).isIdentity
        );
      });
      if (typeof custom === "string") {
        await record.getByLabel("片名", { exact: true }).fill("");
        await record
          .getByLabel("片名", { exact: true })
          .pressSequentially(custom);
      } else if (custom) {
        await record.getByRole("button", { name: "在看", exact: true }).click();
        await record.getByTitle("8 分", { exact: true }).click();
        await record.locator("input[type=month]").fill("2025-06");
        await record.getByPlaceholder("写点感想...").fill("导入填写短评");
        await record
          .getByPlaceholder("输入播放链接（如 https://...）")
          .fill("https://example.org/watch");
        await target.screenshot({
          path: join(dir, "desktop-import-record.png"),
        });
      }
      const width = target.viewportSize().width;
      if (target !== page)
        await target.screenshot({
          path: join(
            dir,
            `${width <= 640 ? "mobile" : width < 1000 ? "tablet" : "desktop"}-import-record.png`,
          ),
        });
      await record
        .getByRole("button", { name: "保存并收藏", exact: true })
        .click();
    }
  }
  console.log("Checking search, classification and import");
  await page.getByTitle("添加影视剧").click();
  let dialog = page.getByRole("dialog", { name: "搜索作品", exact: true });
  const guide = page.getByRole("dialog", {
    name: "TMDb 使用指引",
    exact: true,
  });
  await guide.getByRole("button", { name: "关闭", exact: true }).focus();
  await page.keyboard.press("Tab");
  await guide.focus();
  await page.screenshot({ path: join(dir, "desktop-guide.png") });
  await guide.getByRole("button", { name: "手动添加", exact: false }).count();
  await guide
    .getByRole("textbox", { name: "个人 API Key／读取访问令牌" })
    .count();
  await guide.locator("input[type=password]").fill("fixture-key");
  // Connection settings are their own page, reached from the search toolbar.
  await page.route(
    "**/api/tmdb/validate",
    (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "模拟无效 Key" }),
      }),
    { times: 1 },
  );
  await guide.getByRole("button", { name: "保存并搜索", exact: true }).click();
  await guide.getByRole("alert").waitFor();
  await guide.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByRole("dialog", { name: "有未保存的修改" })
    .getByRole("button", { name: "放弃修改" })
    .click();
  await page.evaluate((url) => {
    sessionStorage.setItem("tmdb-key", "fixture-key");
    localStorage.setItem(
      "tmdb-options",
      JSON.stringify({
        language: "zh-CN",
        api_base: url + "/3",
        image_base: url + "/images",
      }),
    );
  }, fixtureURL);
  await page.getByTitle("添加影视剧").click();
  dialog = page.getByRole("dialog", { name: "搜索作品", exact: true });
  await dialog.getByRole("button", { name: "API 设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "API 设置", exact: true });
  await settings
    .getByPlaceholder("https://api.themoviedb.org/3")
    .fill(fixtureURL + "/3");
  await settings
    .getByPlaceholder("https://image.tmdb.org/t/p")
    .fill(fixtureURL + "/images");
  await settings
    .getByRole("button", { name: "保存并搜索", exact: true })
    .click();
  await dialog
    .getByRole("heading", { name: "验收日本动画", exact: true })
    .waitFor();
  await page.screenshot({ path: join(dir, "desktop-search.png") });
  assert.equal(
    await dialog
      .getByRole("heading", { name: "验收海外动画", exact: true })
      .count(),
    0,
  );
  const hoverCard = dialog.getByRole("button", {
    name: "选择作品 验收日本动画",
    exact: true,
  });
  await hoverCard.hover();
  await page.waitForFunction(() => {
    const el = document.querySelector(".tmdb-result:hover");
    return el && new DOMMatrix(getComputedStyle(el).transform).m42 < -1;
  });
  await page.screenshot({ path: join(dir, "desktop-card-hover.png") });
  const searchHeight = (await dialog.boundingBox()).height;
  await page.route(
    "**/api/tmdb/search",
    async (route) => {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 900));
      await route.fulfill({ response }).catch(() => {});
    },
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "下一页", exact: true }).click();
  assert.equal((await dialog.boundingBox()).height, searchHeight);
  assert.equal(
    await dialog
      .locator(".tmdb-footer")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    await dialog
      .locator(".tmdb-footer")
      .evaluate((el) => getComputedStyle(el).backdropFilter),
    "none",
  );

  await dialog.getByText("第 2 / 2 页").waitFor();
  await dialog.getByRole("button", { name: "节目", exact: true }).click();
  await dialog
    .getByRole("heading", { name: "验收海外动画", exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByRole("heading", { name: "验收日本动画", exact: true })
      .count(),
    0,
  );
  await dialog.getByRole("button", { name: "番剧", exact: true }).click();
  await dialog
    .getByRole("heading", { name: "验收日本动画", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "按季选择", exact: true });
  await page.screenshot({ path: join(dir, "desktop-seasons.png") });
  await page.route(
    "**/api/tmdb/preview",
    async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await route.fulfill({ response }).catch(() => {});
    },
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "选择特别篇", exact: true }).click();

  assert.equal((await api("/anime", null, "GET")).length, 2);

  await continueRecord(page);
  assert.equal(
    await page
      .getByRole("dialog", { name: "导入预览" })
      .locator(".tmdb-page-content")
      .getAttribute("data-direction"),
    "forward",
  );

  await continueRecord();
  dialog = page.getByRole("dialog", { name: "导入预览", exact: true });
  await dialog
    .getByRole("button", { name: "应用所选字段", exact: true })
    .waitFor();
  await dialog.getByRole("switch", { name: "导入片名", exact: true }).waitFor();
  // Returning preserves changed selections and does not create a collection.
  await dialog.getByRole("switch", { name: "导入简介", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "选择海报 2", exact: true }).click();
  const refreshedImage = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/tmdb/preview") &&
      r.request().postDataJSON().refresh_images === "poster",
  );
  await dialog.getByRole("button", { name: "重试海报", exact: true }).click();
  await refreshedImage;
  await dialog
    .getByRole("button", { name: "选择海报 2", exact: true })
    .waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "选择海报 2", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await dialog
      .getByRole("switch", { name: "导入简介", exact: true })
      .isChecked(),
    false,
  );

  await dialog.getByRole("button", { name: "返回", exact: true }).click();
  assert.equal(
    await page
      .getByRole("dialog", { name: "按季选择" })
      .locator(".tmdb-page-content")
      .getAttribute("data-direction"),
    "back",
  );

  await page
    .getByRole("dialog", { name: "按季选择" })
    .getByRole("button", { name: "选择特别篇", exact: true })
    .click();
  await continueRecord();
  assert.equal(
    await dialog
      .getByRole("switch", { name: "导入简介", exact: true })
      .isChecked(),
    false,
  );
  await dialog.getByRole("switch", { name: "导入简介", exact: true }).check();

  await page.screenshot({
    path: join(dir, "desktop-preview.png"),
    fullPage: true,
  });
  failedImage = true;
  await dialog
    .getByRole("button", { name: "应用所选字段", exact: true })
    .click();
  await finishRecord(page, true);
  await dialog
    .getByText("部分图片保存失败", { exact: false })
    .first()
    .waitFor();
  let all = await api("/anime", null, "GET");
  assert.equal(all.length, 2);
  failedImage = false;
  await page.route(
    "**/api/tmdb/import",
    async (route) => {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 1400));
      await route.fulfill({ response }).catch(() => {});
    },
    { times: 1 },
  );
  await dialog
    .getByRole("button", { name: "应用所选字段", exact: true })
    .click();
  await page.getByText("正在准备导入图片…", { exact: true }).waitFor();
  await page.getByRole("dialog", { name: "添加影视剧", exact: true }).waitFor();
  assert.equal((await api("/anime", null, "GET")).length, 2);
  await page.screenshot({ path: join(dir, "desktop-import-progress.png") });
  await finishRecord();
  console.log("Checking personal records and update previews");
  let detail = page.getByRole("dialog", { name: "作品详情", exact: true });
  await detail
    .getByRole("heading", { name: "验收日本动画 · 特别篇", exact: true })
    .waitFor();
  await detail.getByText("约 48 分钟", { exact: true }).waitFor();
  await page.screenshot({ path: join(dir, "desktop-detail.png") });
  const imported = (await api("/anime", null, "GET")).find(
    (a) => a.metadata?.tmdb_id === 101,
  );
  assert.equal(imported.category, "watching");
  assert.equal(imported.rating, 8);
  assert.equal(imported.watch_date, "2025-06");
  assert.equal(imported.note, "导入填写短评");
  assert.equal(imported.play_link, "https://example.org/watch");
  assert.equal(imported.metadata.status, "Ended");
  assert.equal(imported.metadata.genres[0], "动画");
  assert.equal(imported.metadata.translations?.length || 0, 0);
  assert(
    imported.metadata.cast[0].photo &&
      !imported.metadata.cast[0].photo.startsWith("/"),
  );
  await detail.getByText("特别篇 · 2 集 · 2026-01-01", { exact: true }).click();
  await detail
    .getByText("第 1 集 · 第 1 集标题", { exact: false })
    .first()
    .waitFor();
  await detail.getByRole("button", { name: "编辑短评", exact: true }).click();
  await page.getByPlaceholder("写点感想...").fill("新短评需要保留");
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await detail.getByText("新短评需要保留", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "更多操作" }).click();
  await detail
    .getByRole("button", { name: "从 TMDb 更新", exact: true })
    .click();
  const update = page.getByRole("dialog", { name: "导入预览", exact: true });
  await update
    .getByRole("button", { name: "应用所选字段", exact: true })
    .waitFor();
  await update
    .getByRole("button", { name: "应用所选字段", exact: true })
    .click();
  await finishRecord();
  await detail.getByText("新短评需要保留", { exact: true }).waitFor();
  await detail.getByText("8", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "更多操作" }).click();
  await detail
    .getByRole("button", { name: "编辑作品资料", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "编辑作品资料", exact: true });
  await edit.getByLabel("片名", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll(
        ".tmdb-surface:not([inert]),.tmdb-page-content",
      ),
    )
      .filter((n) => n.checkVisibility())
      .every(
        (n) =>
          getComputedStyle(n).opacity === "1" &&
          getComputedStyle(n).transform === "none",
      ),
  );
  await page.screenshot({ path: join(dir, "desktop-editor.png") });
  await edit.getByLabel("简介", { exact: true }).fill("手动改写的本地简介");
  await edit.getByRole("button", { name: "取消", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "有未保存的修改",
    exact: true,
  });
  await confirm
    .getByRole("button", { name: "继续编辑", exact: true })
    .waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector(".tmdb-compact");
    return (
      el &&
      getComputedStyle(el).opacity === "1" &&
      getComputedStyle(el).transform === "none"
    );
  });
  await page.screenshot({ path: join(dir, "desktop-unsaved.png") });
  assert((await confirm.boundingBox()).height < 500);
  await confirm.getByRole("button", { name: "继续编辑", exact: true }).click();
  await page.goBack();
  await confirm
    .getByRole("button", { name: "保存并关闭", exact: true })
    .click();
  await edit.waitFor({ state: "hidden" });
  await detail.getByText("手动改写的本地简介", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTitle("添加影视剧").click();
  dialog = page.getByRole("dialog", { name: "搜索作品", exact: true });
  await dialog
    .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "按季选择", exact: true });
  await page.screenshot({ path: join(dir, "desktop-seasons.png") });
  await dialog.getByRole("button", { name: "选择特别篇", exact: true }).click();
  await continueRecord();
  dialog = page.getByRole("dialog", { name: "导入预览", exact: true });
  await dialog.getByText("该作品已收藏。", { exact: false }).waitFor();
  assert(
    await dialog
      .getByRole("button", { name: "应用所选字段", exact: true })
      .isDisabled(),
  );
  await dialog
    .getByRole("button", { name: "打开已有收藏", exact: true })
    .click();
  await detail.getByText("手动改写的本地简介", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  // The same source can be collected as a whole series and as an ordinary season.
  for (const scope of ["整部剧集", "第 1 季"]) {
    await page.getByTitle("添加影视剧").click();
    dialog = page.getByRole("dialog", { name: "搜索作品", exact: true });
    await dialog
      .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "按季选择", exact: true });
    if (scope === "整部剧集") {
      await dialog
        .getByRole("button", { name: "整部剧集", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "选择整部剧集", exact: true })
        .click();
    } else
      await dialog
        .getByRole("button", { name: "选择第 1 季", exact: true })
        .click();
    await continueRecord();
    dialog = page.getByRole("dialog", { name: "导入预览", exact: true });
    await dialog
      .getByRole("button", { name: "应用所选字段", exact: true })
      .click();
    if (scope === "整部剧集") {
      const form = page.getByRole("dialog", {
        name: "添加影视剧",
        exact: true,
      });
      await form.getByRole("button", { name: "取消", exact: true }).click();
      await dialog.waitFor();
      await dialog
        .getByRole("button", { name: "应用所选字段", exact: true })
        .click();
    }
    await finishRecord();
    await detail
      .getByRole("button", { name: "编辑短评", exact: true })
      .waitFor();
    await detail.getByRole("button", { name: "关闭", exact: true }).click();
  }
  await page.getByTitle("添加影视剧").click();
  dialog = page.getByRole("dialog", { name: "搜索作品", exact: true });
  await dialog.getByRole("button", { name: "电影", exact: true }).click();
  await dialog
    .getByRole("heading", { name: "验收电影", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "选择作品 验收电影", exact: true })
    .click();
  await continueRecord(page);
  dialog = page.getByRole("dialog", { name: "导入预览", exact: true });
  await dialog
    .getByRole("button", { name: "应用所选字段", exact: true })
    .click();
  await finishRecord(page, "我的电影片名");
  const openingFrames = await page.evaluate(async () => {
    const frames = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(requestAnimationFrame);
      const panel = document.querySelector('.tmdb-bare');
      if (panel) frames.push(new DOMMatrix(getComputedStyle(panel).transform).m11);
    }
    return frames;
  });
  assert(openingFrames.some(scale => scale < 0.99), 'Detail entry animation missing');
  assert(Math.abs(openingFrames.at(-1) - 1) < 0.002);
  await detail.getByText("120 分钟", { exact: true }).waitFor();
  assert.equal(
    (await api("/anime", null, "GET")).find(
      (a) => a.metadata?.media_type === "movie",
    ).title,
    "我的电影片名",
  );
  console.log(
    "Checking default API and all five pages at desktop, tablet and mobile widths",
  );
  for (const [label, width, height] of [
    ["desktop", 1440, 960],
    ["tablet", 820, 1180],
    ["mobile", 390, 844],
  ]) {
    const screen = await browser.newPage({
      viewport: { width, height },
      isMobile: label === "mobile",
    });
    await screen.goto(base);
    await screen.getByTitle("添加影视剧").click();
    async function capture(stage) {
      debugPage = screen;
      await screen.waitForFunction(() =>
        Array.from(document.querySelectorAll(".tmdb-surface img"))
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return (
              i.checkVisibility() &&
              r.top < innerHeight &&
              r.bottom > 0 &&
              r.left < innerWidth &&
              r.right > 0
            );
          })
          .every((i) => i.complete && i.naturalWidth > 0),
      );
      await screen.waitForFunction(() =>
        Array.from(
          document.querySelectorAll(
            ".tmdb-surface:not([inert]),.tmdb-page-content",
          ),
        )
          .filter((n) => n.checkVisibility())
          .every(
            (n) =>
              getComputedStyle(n).opacity === "1" &&
              getComputedStyle(n).transform === "none",
          ),
      );
      if (stage === "detail") {
        const hero = await screen.locator(".tmdb-detail-hero").boundingBox();
        if (width < 640)
          for (const card of await screen.locator(".tmdb-stats > div").all()) {
            const box = await card.boundingBox();
            assert(Math.abs(box.width - box.height) < 1);
            assert(
              await card.evaluate(
                (el) => el.scrollHeight <= el.clientHeight + 1,
              ),
            );
          }
        for (const button of await screen
          .locator(".tmdb-detail-actions .tmdb-round")
          .all()) {
          const box = await button.boundingBox();
          assert(box.y >= hero.y && box.y + box.height <= hero.y + hero.height);
        }
      }
      await screen.screenshot({ path: join(dir, `${label}-${stage}.png`) });
      assert(
        await screen
          .locator(".tmdb-surface")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
      assert.equal(await screen.getByRole("dialog").count(), 1);
      const panel = screen.locator(".tmdb-surface");
      assert((await panel.boundingBox()).width <= 512);
      if (stage !== "detail")
        assert.equal(
          await panel
            .locator(".tmdb-header h2")
            .evaluate((el) => getComputedStyle(el).fontSize),
          "18px",
        );
      assert.equal(
        await panel.evaluate((el) => getComputedStyle(el).fontSize),
        "14px",
      );
    }
    await screen
      .getByRole("button", {
        name: "跳过，使用默认 API（不稳定）",
        exact: true,
      })
      .waitFor();
    await capture("guide");
    await screen
      .getByRole("button", {
        name: "跳过，使用默认 API（不稳定）",
        exact: true,
      })
      .click();
    await screen
      .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
      .waitFor();
    await capture("search");
    await screen.getByRole("button", { name: "资料语言", exact: true }).click();
    await screen.getByRole("button", { name: "日本語", exact: true }).click();
    await screen
      .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
      .waitFor();
    await screen
      .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
      .click();
    await screen
      .getByRole("button", { name: "选择特别篇", exact: true })
      .waitFor();
    await capture("seasons");
    await screen
      .getByRole("button", { name: "选择特别篇", exact: true })
      .click();
    await continueRecord(screen);
    await screen
      .getByRole("switch", { name: "导入片名", exact: true })
      .waitFor();
    await capture("preview");
    await screen
      .getByRole("button", { name: "打开已有收藏", exact: true })
      .click();
    await screen
      .getByRole("heading", { name: "验收日本动画 · 特别篇", exact: true })
      .waitFor();
    await capture("detail");
    await screen.getByRole("button", { name: "更多操作", exact: true }).click();
    await screen
      .getByRole("button", { name: "编辑作品资料", exact: true })
      .click();
    await screen
      .getByRole("dialog", { name: "编辑作品资料" })
      .getByLabel("片名", { exact: true })
      .waitFor();
    await capture("editor");

    assert.equal(
      await screen.evaluate(() => sessionStorage.getItem("tmdb-key")),
      "",
    );
    await screen.close();
  }
  console.log("Checking reduced motion and keyboard focus");
  const quiet = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  debugPage = quiet;
  await quiet.goto(base);
  await quiet.getByTitle("添加影视剧").click();
  await quiet
    .getByRole("button", { name: "跳过，使用默认 API（不稳定）", exact: true })
    .click();
  await quiet
    .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
    .waitFor();
  assert.equal(
    await quiet
      .locator(".tmdb-page-content")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  const close = quiet.getByRole("button", { name: "关闭", exact: true });
  await close.focus();
  await quiet.keyboard.press("Shift+Tab");
  assert.equal(
    await quiet
      .getByRole("button", { name: "手动添加", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await quiet.keyboard.press("Tab");
  assert.equal(
    await close.evaluate((el) => el === document.activeElement),
    true,
  );
  await quiet
    .getByRole("button", { name: "选择作品 验收日本动画", exact: true })
    .click();
  assert.equal(
    await quiet
      .locator(".tmdb-page-content")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  await quiet.screenshot({ path: join(dir, "mobile-reduced-motion.png") });
  await quiet.close();
  console.log("Checking offline local detail and mobile layout");
  // Saved images and text work even after the TMDb fixture goes offline.
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
  await page.reload();
  await page.getByRole("button", { name: "想看", exact: true }).click();
  await page
    .getByRole("heading", { name: "我的电影片名", exact: true })
    .click();
  await detail.getByText("120 分钟", { exact: true }).waitFor();
  assert.equal(
    (await api("/anime", null, "GET")).find(
      (a) => a.metadata?.media_type === "movie",
    ).title,
    "我的电影片名",
  );
  assert(
    await detail
      .locator("img")
      .evaluateAll((images) =>
        images.every((img) => img.src.includes("/api/posters/")),
      ),
  );
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "看过", exact: true }).click();
  await page.getByText("手动旧收藏", { exact: true }).click();
  await detail.getByRole("button", { name: "更多操作" }).click();
  await detail
    .getByRole("button", { name: "搜索并关联 TMDb", exact: true })
    .waitFor();
  await detail.getByRole("button", { name: "更多操作" }).click();
  await detail.getByText("我的旧短评", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "更多操作" }).click();
  await detail
    .getByRole("button", { name: "编辑作品资料", exact: true })
    .click();
  await edit.getByLabel("简介", { exact: true }).fill("离线手动作品资料");
  await edit.getByRole("button", { name: "保存作品资料", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  await detail.getByText("离线手动作品资料", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  await mobile.goto(base);
  await mobile.getByText("手动旧收藏", { exact: true }).waitFor();
  for (const width of [320, 390, 430]) {
    await mobile.setViewportSize({ width, height: 844 });
    assert.equal(
      await mobile
        .locator("main .grid")
        .first()
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
      2,
    );
    assert(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.waitForFunction(() =>
    [...document.querySelectorAll("#root [style]")]
      .filter((el) => el.style.opacity)
      .every((el) => getComputedStyle(el).opacity === "1"),
  );
  await mobile.screenshot({ path: join(dir, "mobile-home-two-columns.png") });
  await mobile.getByText("手动旧收藏", { exact: true }).click();
  await mobile.getByText("离线手动作品资料", { exact: true }).waitFor();
  await mobile.screenshot({
    path: join(dir, "mobile-local-detail.png"),
    fullPage: false,
  });
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log("Checking home sorting, leaderboard and time machine");
  await page.getByRole("button", { name: "排序", exact: false }).click();
  async function dragHandles(direction) {
    const handles = page.getByRole("button", { name: "⠿", exact: true });
    const a = await handles.nth(0).boundingBox(),
      b = await handles.nth(1).boundingBox();
    assert(a && b);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/anime/reorder") &&
        r.request().method() === "PUT",
    );
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, {
      steps: 4,
    });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await page.mouse.up();
    const saved = await response;
    assert.equal(saved.status(), 200);
    const body = saved.request().postDataJSON();
    assert.equal(body.scope, direction);
    // PointerSensor suppresses the synthetic click immediately after release.
    await page.waitForTimeout(100);
  }
  await dragHandles("home");
  await page.getByRole("button", { name: "完成", exact: false }).click();
  await page.getByTitle("评分排行榜").click();
  await page
    .getByRole("heading", { name: "手动旧收藏", exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "手动旧收藏", exact: true }).click();
  await detail.getByText("离线手动作品资料", { exact: true }).waitFor();
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "排序", exact: false }).click();
  await dragHandles("leaderboard");
  await page.getByRole("button", { name: "完成", exact: false }).click();
  await page.getByRole("button", { name: "返回", exact: false }).click();
  await page
    .getByRole("button", { name: "SakuraReel，进入时光机", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const timeMachine = page.getByRole("dialog", { name: "时光机", exact: true });
  await timeMachine
    .getByRole("button", { name: "返回首页", exact: false })
    .first()
    .click();
  await timeMachine.waitFor({ state: "hidden" });
  all = await api("/anime", null, "GET");
  assert.equal(all.length, 6);
  const preserved = all.find((a) => a.id === old.id);
  assert.equal(preserved.rating, 9);
  assert.equal(preserved.note, "我的旧短评");
  assert.equal(preserved.watch_date, "2026-05");
  assert.deepEqual(errors, []);
  await writeFile(
    join(dir, "report.json"),
    JSON.stringify(
      {
        count: all.length,
        screenshots: ["desktop", "tablet", "mobile"].flatMap((size) =>
          ["guide", "search", "seasons", "preview", "detail"].map(
            (stage) => `${size}-${stage}.png`,
          ),
        ),
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(`PASS Web TMDb browser smoke test. Artifacts: ${dir}`);
} catch (e) {
  if (debugPage && !debugPage.isClosed())
    await debugPage.screenshot({
      path: join(dir, "failure.png"),
      fullPage: true,
    });
  if (debugPage && !debugPage.isClosed())
    await writeFile(join(dir, "failure.html"), await debugPage.content());
  console.error(`Artifacts: ${dir}`);
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  service.kill("SIGTERM");
  if (fixture.listening) fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
}
