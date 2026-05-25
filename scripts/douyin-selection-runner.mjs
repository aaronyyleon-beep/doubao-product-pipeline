import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jpeg = require(
  "/Users/lyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jpeg-js"
);
const { PNG } = require(
  "/Users/lyy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs"
);

const CHROME_CLIENT =
  "/Users/lyy/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-client.mjs";

const DEFAULTS = {
  workspaceDir: "/Users/lyy/influencer_marketing",
  startUrl: "https://buyin.jinritemai.com/dashboard/merch-picking-library",
  maxCandidates: 20,
  allowAddToCart: false,
  keepTabsOpen: true,
  resetSelectionPage: true,
  filters: {
    category: "服饰内衣",
    categoryPath: ["服装", "男装"],
    monthlySalesMax: 500,
    creatorCountMax: 500,
    shopScoreMin: null,
    monthlySalesTexts: ["500以下"],
    creatorCountTexts: ["500以下"],
    shopScoreTexts: [],
    serviceRightTexts: [],
    featuredGoodTexts: ["品牌"],
  },
  trend: {
    windowText: "近30天",
    excludedChannels: ["直播"],
    primaryChannel: "视频",
    requiredLatestThreeDays: "rising",
    minGreenGroups: 7,
    riseToleranceRatio: 0.05,
  },
  postFilters: {
    minCommissionPercent: 15,
    requireReadableCurve: true,
    requireRisingTrend: false,
  },
};

export async function runDouyinSelection(options = {}) {
  const config = mergeConfig(DEFAULTS, options);
  const runId = options.runId || `douyin-selection-${today()}-001`;
  const runDir = path.join(config.workspaceDir, "runs");
  const screenshotDir = path.join(runDir, "screenshots", runId);
  await fs.mkdir(screenshotDir, { recursive: true });

  const browser = await connectChrome();
  await browser.nameSession("🔎 Douyin selection runner");

  const selectionTab = await claimOrOpenSelectionTab(browser, config.startUrl);
  await ensureSelectionSquare(selectionTab, config);
  await applySelectionFilters(selectionTab, config);
  await switchToTableMode(selectionTab);

  const extractedRows = await collectProductRows(selectionTab, config.maxCandidates * 2);
  const tableText = extractedRows.length ? "" : await readVisibleText(selectionTab, 35000);
  const rows = (extractedRows.length ? extractedRows : parseProductRows(tableText))
    .filter((row) => broadFilter(row, config))
    .slice(0, config.maxCandidates);

  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const candidateId = `dy-${today()}-${String(index + 1).padStart(3, "0")}`;
    const result = await inspectCandidate({
      browser,
      selectionTab,
      row,
      candidateId,
      screenshotDir,
      config,
    });
    results.push(result);
    await writeRunFiles({ runId, runDir, config, results });
  }

  await writeRunFiles({ runId, runDir, config, results });
  if (config.keepTabsOpen) {
    await browser.tabs.finalize({ keep: [{ tab: selectionTab, status: "handoff" }] });
  } else {
    await browser.tabs.finalize({});
  }
  return { runId, results };
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  const options = parseCliArgs(process.argv.slice(2));
  if (!globalThis.nodeRepl && !globalThis.agent) {
    console.error(
      "Chrome automation must run inside the trusted Codex Chrome-plugin runtime. Use --help for options, or import runDouyinSelection from the Codex Node REPL."
    );
    process.exit(1);
  }
  runDouyinSelection(options)
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            runId: result.runId,
            count: result.results.length,
            output: {
              yaml: path.join(options.workspaceDir || DEFAULTS.workspaceDir, "runs", `${result.runId}.yaml`),
              summary: path.join(
                options.workspaceDir || DEFAULTS.workspaceDir,
                "runs",
                `${result.runId}-summary.md`
              ),
            },
            decisions: result.results.map((item) => ({
              product_name: item.product_name,
              creator_count: item.creator_count,
              sales: item.sales,
              decision: item.decision,
              trend: item.sales_tail?.classification,
              latest_heights: item.sales_tail?.latestHeights,
              screenshot: item.sales_tail?.screenshot,
            })),
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

async function connectChrome() {
  if (!globalThis.agent) {
    const { setupBrowserRuntime } = await import(CHROME_CLIENT);
    await setupBrowserRuntime({ globals: globalThis });
  }
  if (!globalThis.browser) {
    globalThis.browser = await agent.browsers.get("extension");
  }
  return globalThis.browser;
}

async function claimOrOpenSelectionTab(browser, startUrl) {
  const openTabs = await browser.user.openTabs();
  const existing = openTabs.find((tab) =>
    (tab.url || "").includes("buyin.jinritemai.com/dashboard/merch-picking-library") &&
    !(tab.url || "").includes("/merch-promoting")
  );
  if (existing) return browser.user.claimTab(existing);
  const tab = await browser.tabs.new();
  await tab.goto(startUrl);
  await waitSettled(tab);
  return tab;
}

async function ensureSelectionSquare(tab, config) {
  const url = await tab.url();
  if (
    config.resetSelectionPage ||
    !url ||
    !url.includes("/dashboard/merch-picking-library") ||
    url.includes("/merch-promoting")
  ) {
    await tab.goto(config.startUrl);
  }
  await waitSettled(tab);
  if (await isBuyinLoginBlocked(tab)) {
    await recoverBuyinLogin(tab, config);
    await tab.goto(config.startUrl);
    await waitSettled(tab);
  }
  await enterSelectionSquareIfOnDashboard(tab, config);
}

async function enterSelectionSquareIfOnDashboard(tab, config) {
  const url = await tab.url().catch(() => "");
  if ((url || "").includes("/dashboard/merch-picking-library")) return;
  if ((url || "").includes("/dashboard/waiter-selection")) {
    await tab.goto(config.startUrl);
    await waitSettled(tab, 3500);
    return;
  }

  const clicked = await tab.playwright.evaluate((targetUrl) => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const candidates = Array.from(document.querySelectorAll("a, button, div, span"))
      .filter((node) => {
        const text = (node.innerText || node.textContent || "").trim();
        const href = node.href || node.getAttribute("href") || "";
        return (
          visible(node) &&
          (href.includes("/dashboard/merch-picking-library") || text === "更多商品")
        );
      })
      .sort((a, b) => {
        const ah = a.href || a.getAttribute("href") || "";
        const bh = b.href || b.getAttribute("href") || "";
        if (ah.includes("/dashboard/merch-picking-library") !== bh.includes("/dashboard/merch-picking-library")) {
          return ah.includes("/dashboard/merch-picking-library") ? -1 : 1;
        }
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    const target = candidates[0];
    if (!target) return false;
    if (target.href || target.getAttribute("href")) {
      location.href = target.href || target.getAttribute("href");
      return true;
    }
    target.click();
    return true;
  }, config.startUrl, { timeoutMs: 10000 }).catch(() => false);

  if (!clicked) {
    await tab.goto(config.startUrl);
  }
  await waitSettled(tab, 3500);
}

async function isBuyinLoginBlocked(tab) {
  const url = await tab.url().catch(() => "");
  if ((url || "").includes("douyinec.com")) return true;
  const text = await readVisibleText(tab, 3000).catch(() => "");
  return /用户未登陆|用户未登录|请重新登陆|请重新登录/.test(text);
}

async function recoverBuyinLogin(tab, config) {
  await tab.goto("https://www.douyinec.com/");
  await waitSettled(tab, 3500);
  await clickCreatorEntry(tab);
  await waitSettled(tab, 2500);
  await clickText(tab, ["登录"], { exact: true, timeoutMs: 8000 });
  await waitSettled(tab, 6000);
}

async function clickCreatorEntry(tab) {
  const point = await tab.playwright.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const textOf = (node) => (node.innerText || node.textContent || "").trim();
    const candidateScopes = Array.from(document.querySelectorAll("section, div, li, a"))
      .filter((node) => visible(node) && /达人/.test(textOf(node)))
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);

    for (const scope of candidateScopes) {
      const targets = Array.from(scope.querySelectorAll("button, a, div, span"))
        .filter((node) => visible(node) && /立即入驻|达人入驻|入驻/.test(textOf(node)))
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.width * ar.height - br.width * br.height;
        });
      const target = targets[0] || (/达人入驻/.test(textOf(scope)) ? scope : null);
      if (target) {
        const rect = target.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }

    const fallback = Array.from(document.querySelectorAll("button, a, div, span"))
      .find((node) => visible(node) && /达人入驻|立即入驻/.test(textOf(node)));
    if (!fallback) return null;
    const rect = fallback.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, undefined, { timeoutMs: 12000 }).catch(() => null);

  if (point) {
    await tab.cua.click(point);
    return true;
  }
  return clickText(tab, ["达人入驻", "立即入驻", "达人"], { exact: false, timeoutMs: 8000 });
}

async function applySelectionFilters(tab, config) {
  await clickText(tab, ["清空筛选"], { exact: true, timeoutMs: 3000 }).catch(() => false);
  await sleep(800);
  await chooseCategoryPath(tab, config.filters.category, config.filters.categoryPath);
  if (config.filters.monthlySalesTexts?.length) {
    await chooseDropdown(tab, "月销", config.filters.monthlySalesTexts);
  }
  if (config.filters.creatorCountTexts?.length) {
    await chooseDropdown(tab, "带货达人数", config.filters.creatorCountTexts);
  }
  if (config.filters.shopScoreTexts?.length) {
    await chooseDropdown(tab, "商家体验分", config.filters.shopScoreTexts);
  }
  if (config.filters.serviceRightTexts?.length) {
    await chooseDropdown(tab, "服务与权益", config.filters.serviceRightTexts);
  }
  if (config.filters.featuredGoodTexts?.length) {
    for (const text of config.filters.featuredGoodTexts) {
      await clickVisibleFilterText(tab, text);
      await sleep(500);
    }
  }
  await waitSettled(tab, 2500);
}

async function chooseCategoryPath(tab, rootText, pathTexts = []) {
  await clickVisibleFilterText(tab, rootText);
  await sleep(800);
  for (const text of pathTexts) {
    await clickVisiblePopupOption(tab, text);
    await sleep(500);
  }
}

async function chooseDropdown(tab, label, optionTexts) {
  const opened = await clickVisibleFilterText(tab, label);
  if (!opened) return false;
  await sleep(800);
  for (const optionText of optionTexts) {
    if (await clickVisiblePopupOption(tab, optionText)) return true;
  }
  return false;
}

async function clickVisibleFilterText(tab, text) {
  const point = await tab.playwright.evaluate((targetText) => {
    const candidates = Array.from(document.querySelectorAll(".merch-filter *"))
      .filter((node) => {
        const text = (node.innerText || node.textContent || "").trim();
        const rect = node.getBoundingClientRect();
        return (
          text === targetText &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        );
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width };
      })
      .sort((a, b) => a.width - b.width);
    return candidates[0] || null;
  }, text, { timeoutMs: 10000 }).catch(() => null);
  if (!point) return clickText(tab, [text], { exact: true, timeoutMs: 5000 });
  await tab.cua.click(point);
  return true;
}

async function clickVisiblePopupOption(tab, text) {
  const point = await tab.playwright.evaluate((targetText) => {
    const popupSelector = [
      ".auxo-select-dropdown",
      ".auxo-cascader-menus",
      ".auxo-dropdown",
      "[class*='dropdown']",
      "[class*='cascader']",
    ].join(",");
    const popups = Array.from(document.querySelectorAll(popupSelector)).filter((popup) => {
      const rect = popup.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const scope = popups.length ? popups : [document.body];
    const candidates = scope.flatMap((root) =>
      Array.from(root.querySelectorAll("*"))
        .filter((node) => {
          const nodeText = (node.innerText || node.textContent || "").trim();
          const rect = node.getBoundingClientRect();
          return (
            nodeText === targetText &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          );
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            x: rect.left + Math.min(rect.width / 2, 80),
            y: rect.top + rect.height / 2,
            area: rect.width * rect.height,
          };
        })
    );
    candidates.sort((a, b) => a.area - b.area);
    return candidates[0] || null;
  }, text, { timeoutMs: 10000 }).catch(() => null);
  if (!point) return false;
  await tab.cua.click(point);
  return true;
}

async function switchToTableMode(tab) {
  const info = await tab.playwright.evaluate(() => {
    const uses = Array.from(document.querySelectorAll("use"));
    const tableIcon = uses.find((node) =>
      String(node.getAttribute("href") || "").includes("table")
    );
    if (!tableIcon) return null;
    const rect = tableIcon.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, undefined, { timeoutMs: 10000 }).catch(() => null);

  if (info) {
    await tab.cua.click({ x: info.x, y: info.y });
  } else {
    await tab.cua.click({ x: 1394, y: 121 });
  }
  await waitSettled(tab, 2500);
}

async function inspectCandidate({ browser, selectionTab, row, candidateId, screenshotDir, config }) {
  const result = {
    candidate_id: candidateId,
    status: "metrics_pending",
    decision: "manual_review",
    ...row,
    sales_tail: {
      window: config.trend.windowText,
      excluded_channels: config.trend.excludedChannels,
      primary_channel: config.trend.primaryChannel,
      latest_three_days: "unknown",
      classification: "unknown",
      screenshot: null,
    },
    risk_flags: [],
  };

  const detailTab = await openProductDetail(browser, selectionTab, row, config);
  if (!detailTab) {
    result.status = "manual_review";
    result.risk_flags.push("Could not open product detail page.");
    return result;
  }

  await clickText(detailTab, ["带货数据"], { exact: false, timeoutMs: 10000 });
  await clickText(detailTab, [config.trend.windowText], { exact: false, timeoutMs: 8000 });
  await scrollToTrend(detailTab);

  const screenshotPath = path.join(
    screenshotDir,
    `${candidateId}-${slug(row.product_name)}-trend.jpg`
  );
  const screenshotBuffer = await detailTab.screenshot({ fullPage: false });
  const trend = await classifyVideoTrend(detailTab, config, screenshotBuffer);
  await fs.writeFile(screenshotPath, screenshotBuffer);

  result.sales_tail = {
    ...result.sales_tail,
    ...trend,
    screenshot: screenshotPath,
  };

  if (trend.classification === "rising") {
    if (config.allowAddToCart) {
      const added = await addToSelectionCart(detailTab);
      result.status = added ? "selection_cart_added" : "manual_review";
      result.decision = added ? "add_to_cart" : "manual_review";
      if (!added) result.risk_flags.push("Trend passed but add-to-cart click failed.");
    } else {
      result.status = "add_to_cart";
      result.decision = "add_to_cart_pending_confirmation";
      result.risk_flags.push("Trend passed; allowAddToCart=false, so product was not added.");
    }
  } else {
    result.status = trend.classification === "unknown" ? "manual_review" : "rejected";
    result.decision = trend.classification === "unknown" ? "manual_review" : "reject";
    result.risk_flags.push(
      `Latest three ${config.trend.primaryChannel} bars classified as ${trend.classification}.`
    );
  }

  if (detailTab === selectionTab) {
    await selectionTab.goBack().catch(() => {});
    await waitSettled(selectionTab, 2500);
  } else {
    await detailTab.close().catch(() => {});
  }
  return result;
}

async function openProductDetail(browser, selectionTab, row, config) {
  if (row.commodity_id) {
    const detailTab = await browser.tabs.new();
    const url = productDetailUrl(row.commodity_id);
    row.product_url = url;
    await detailTab.goto(url);
    await waitSettled(detailTab, 4500);
    const detailText = await readVisibleText(detailTab, 4000).catch(() => "");
    if ((await detailTab.url()).includes("/merch-promoting") && detailText.includes("带货数据")) {
      return detailTab;
    }
    if (await isBuyinLoginBlocked(detailTab)) {
      await recoverBuyinLogin(detailTab, config);
    }
    await detailTab.close().catch(() => {});
  }

  const productName = row.product_name;
  const before = await browser.user.openTabs();
  const needle = shortNeedle(productName);
  const clicked = await clickProductTitle(selectionTab, productName, needle);
  if (!clicked) return null;
  await waitSettled(selectionTab, 3500);

  const currentUrl = await selectionTab.url();
  if ((currentUrl || "").includes("/merch-promoting")) return selectionTab;

  const after = await browser.user.openTabs();
  const beforeUrls = new Set(before.map((tab) => tab.url));
  const detailInfo =
    after.find((tab) => !beforeUrls.has(tab.url) && (tab.url || "").includes("/merch-promoting")) ||
    after.find((tab) => tab.title === "商品决策页" && (tab.url || "").includes("/merch-promoting"));

  if (!detailInfo) return null;
  const detailTab = await browser.user.claimTab(detailInfo);
  await waitSettled(detailTab, 3000);
  return detailTab;
}

async function clickProductTitle(tab, productName, needle) {
  const clickedByDom = await tab.playwright.evaluate(
    ({ fullName, shortName }) => {
      const candidates = Array.from(document.querySelectorAll("button, [role='button'], a, div, span"))
        .filter((node) => {
          const text = (node.innerText || node.textContent || "").trim();
          if (!text) return false;
          return text.includes(fullName) || text.includes(shortName);
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { node, rect, text: (node.innerText || node.textContent || "").trim() };
        })
        .filter(({ rect }) => rect.width > 80 && rect.height > 8)
        .sort((a, b) => {
          const aTitle = a.node.matches("button, [role='button'], a") ? 0 : 1;
          const bTitle = b.node.matches("button, [role='button'], a") ? 0 : 1;
          const aDistance = Math.abs(a.rect.top - window.innerHeight / 2);
          const bDistance = Math.abs(b.rect.top - window.innerHeight / 2);
          return aTitle - bTitle || aDistance - bDistance;
        });

      const target = candidates[0]?.node;
      if (!target) return false;
      target.scrollIntoView({ block: "center", inline: "center" });
      return true;
    },
    { fullName: productName, shortName: needle },
    { timeoutMs: 10000 }
  ).catch(() => false);
  if (!clickedByDom) return false;
  await sleep(500);

  const point = await tab.playwright.evaluate(
    ({ fullName, shortName }) => {
      const candidates = Array.from(document.querySelectorAll("button, [role='button'], a, div, span"))
        .filter((node) => {
          const text = (node.innerText || node.textContent || "").trim();
          return text && (text.includes(fullName) || text.includes(shortName));
        })
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 80 && rect.height > 8 && rect.top >= 70 && rect.bottom <= window.innerHeight - 20)
        .sort((a, b) => {
          const aTitle = a.node.matches("button, [role='button'], a") ? 0 : 1;
          const bTitle = b.node.matches("button, [role='button'], a") ? 0 : 1;
          return aTitle - bTitle || a.rect.top - b.rect.top;
        });
      const rect = candidates[0]?.rect;
      if (!rect) return null;
      return { x: rect.left + Math.min(rect.width / 2, 180), y: rect.top + rect.height / 2 };
    },
    { fullName: productName, shortName: needle },
    { timeoutMs: 10000 }
  ).catch(() => null);

  if (!point) return false;
  await tab.cua.click(point);
  return true;
}

async function scrollToTrend(tab) {
  for (let i = 0; i < 10; i += 1) {
    const hasVisibleChart = await tab.playwright.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      return canvases.some((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 300 && rect.height > 120 && rect.top > 120 && rect.top < window.innerHeight - 80;
      });
    }, undefined, { timeoutMs: 8000 }).catch(() => false);
    if (hasVisibleChart) return;
    await tab.cua.scroll({ x: 900, y: 720, scrollY: 650, scrollX: 0 });
    await sleep(900);
  }
}

async function classifyVideoTrend(tab, config, screenshotBuffer = null) {
  const analysis = await tab.playwright.evaluate((arg) => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const candidates = canvases
      .map((canvas) => analyzeCanvas(canvas, arg))
      .filter(Boolean)
      .sort((a, b) => b.greenGroups.length - a.greenGroups.length);
    return candidates[0] || { classification: "unknown", reason: "No readable chart canvas." };

    function analyzeCanvas(canvas, cfg) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 280 || rect.height < 140) return null;
      let data;
      try {
        const ctx = canvas.getContext("2d");
        data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (error) {
        return null;
      }

      const greenCounts = [];
      for (let x = 0; x < data.width; x += 1) {
        let count = 0;
        let minY = data.height;
        let maxY = 0;
        for (let y = 0; y < data.height; y += 1) {
          const idx = (y * data.width + x) * 4;
          const r = data.data[idx];
          const g = data.data[idx + 1];
          const b = data.data[idx + 2];
          const a = data.data[idx + 3];
          if (a > 120 && isVideoGreen(r, g, b)) {
            count += 1;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        greenCounts.push({ x, count, minY, maxY });
      }

      const groups = [];
      let active = null;
      for (const col of greenCounts) {
        if (col.count >= 6) {
          if (!active) active = { startX: col.x, endX: col.x, minY: col.minY, maxY: col.maxY, maxCount: col.count };
          active.endX = col.x;
          active.minY = Math.min(active.minY, col.minY);
          active.maxY = Math.max(active.maxY, col.maxY);
          active.maxCount = Math.max(active.maxCount, col.count);
        } else if (active) {
          if (active.endX - active.startX >= 2) groups.push(active);
          active = null;
        }
      }
      if (active && active.endX - active.startX >= 2) groups.push(active);

      const greenGroups = mergeCloseGroups(groups)
        .map((group) => ({
          ...group,
          height: group.maxY - group.minY + 1,
          centerX: (group.startX + group.endX) / 2,
        }))
        .filter((group) => group.height > 12);

      if (greenGroups.length < cfg.minGreenGroups) {
        return { classification: "unknown", reason: "Not enough green video bars.", greenGroups, rect };
      }

      const latest = greenGroups.slice(-3);
      const [a, b, c] = latest.map((group) => group.height);
      const tolerance = Math.max(3, Math.max(a, b, c) * cfg.riseToleranceRatio);
      let classification = "unknown";
      if (b > a + tolerance && c > b + tolerance) classification = "rising";
      else if (b < a - tolerance && c < b - tolerance) classification = "declining";
      else if (Math.abs(b - a) <= tolerance && Math.abs(c - b) <= tolerance) classification = "flat";
      else classification = "mixed";

      return {
        classification,
        latest_three_days: classification,
        greenGroups,
        latestHeights: latest.map((group) => group.height),
        rect,
      };
    }

    function isVideoGreen(r, g, b) {
      return g > 120 && b > 80 && r < 150 && g - r > 25 && Math.abs(g - b) < 90;
    }

    function mergeCloseGroups(groups) {
      const merged = [];
      for (const group of groups) {
        const prev = merged[merged.length - 1];
        if (prev && group.startX - prev.endX <= 3) {
          prev.endX = group.endX;
          prev.minY = Math.min(prev.minY, group.minY);
          prev.maxY = Math.max(prev.maxY, group.maxY);
          prev.maxCount = Math.max(prev.maxCount, group.maxCount);
        } else {
          merged.push({ ...group });
        }
      }
      return merged;
    }
  }, config.trend, { timeoutMs: 30000 }).catch((error) => ({
    classification: "unknown",
    reason: error.message,
  }));

  if (analysis.classification !== "unknown" || !screenshotBuffer) return analysis;

  const screenshotAnalysis = await classifyVideoTrendFromScreenshot(
    tab,
    screenshotBuffer,
    config.trend
  ).catch((error) => ({
    classification: "unknown",
    latest_three_days: "unknown",
    reason: `Screenshot classifier failed: ${error.message}`,
  }));

  return {
    ...analysis,
    ...screenshotAnalysis,
    source: screenshotAnalysis.chart ? "screenshot_pixels" : "unknown",
    reason: screenshotAnalysis.reason,
    fallback_reason: analysis.reason,
  };
}

async function classifyVideoTrendFromScreenshot(tab, screenshotBuffer, trendConfig) {
  const data = await decodeImagePixels(screenshotBuffer);
  const chart = locateScreenshotChartArea(data);
  if (!chart) {
    return {
      classification: "unknown",
      latest_three_days: "unknown",
      reason: "No screenshot chart area with video bars was found.",
    };
  }

  const groups = detectScreenshotColorBarGroups(data, chart, isScreenshotVideoGreen)
    .filter((group) => group.height >= 6 && group.width >= 2)
    .sort((a, b) => a.centerX - b.centerX);

  if (groups.length < trendConfig.minGreenGroups) {
    return {
      classification: "unknown",
      latest_three_days: "unknown",
      reason: "Not enough screenshot video bars.",
      chart,
      greenGroups: groups,
    };
  }

  const latest = groups.slice(-3);
  const heights = latest.map((group) => group.height);
  const [a, b, c] = heights;
  const tolerance = Math.max(3, Math.max(a, b, c) * trendConfig.riseToleranceRatio);
  let classification = "mixed";
  if (b > a + tolerance && c > b + tolerance) classification = "rising";
  else if (b < a - tolerance && c < b - tolerance) classification = "declining";
  else if (Math.abs(b - a) <= tolerance && Math.abs(c - b) <= tolerance) classification = "flat";

  return {
    classification,
    latest_three_days: classification,
    latestHeights: heights,
    chart,
    greenGroups: groups,
  };
}

async function decodeImagePixels(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpeg.decode(bytes, { useTArray: true });
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return PNG.sync.read(bytes);
  }
  throw new Error("Unsupported screenshot image format.");
}

function locateScreenshotChartArea(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const scan = {
    x1: Math.floor(width * 0.40),
    x2: Math.floor(width * 0.97),
    y1: Math.floor(height * 0.18),
    y2: Math.floor(height * 0.66),
  };
  const groups = detectScreenshotColorBarGroups(imageData, scan, isAnyScreenshotTrendBarColor);
  if (groups.length < 6) return null;
  const xs = groups.map((group) => [group.startX, group.endX]).flat();
  const ys = groups.map((group) => [group.topY, group.bottomY]).flat();
  return {
    x1: Math.max(scan.x1, Math.min(...xs) - 30),
    x2: Math.min(scan.x2, Math.max(...xs) + 30),
    y1: Math.max(scan.y1, Math.min(...ys) - 30),
    y2: Math.min(scan.y2, Math.max(...ys) + 30),
  };
}

function detectScreenshotColorBarGroups(imageData, area, predicate) {
  const columns = [];
  for (let x = area.x1; x <= area.x2; x += 1) {
    let count = 0;
    let topY = area.y2;
    let bottomY = area.y1;
    for (let y = area.y1; y <= area.y2; y += 1) {
      const idx = (y * imageData.width + x) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      const a = imageData.data[idx + 3];
      if (a > 100 && predicate(r, g, b)) {
        count += 1;
        topY = Math.min(topY, y);
        bottomY = Math.max(bottomY, y);
      }
    }
    columns.push({ x, count, topY, bottomY });
  }

  const rawGroups = [];
  let active = null;
  for (const col of columns) {
    if (col.count >= 4) {
      if (!active) {
        active = {
          startX: col.x,
          endX: col.x,
          topY: col.topY,
          bottomY: col.bottomY,
          maxCount: col.count,
        };
      }
      active.endX = col.x;
      active.topY = Math.min(active.topY, col.topY);
      active.bottomY = Math.max(active.bottomY, col.bottomY);
      active.maxCount = Math.max(active.maxCount, col.count);
    } else if (active) {
      rawGroups.push(active);
      active = null;
    }
  }
  if (active) rawGroups.push(active);

  return mergeCloseGroups(rawGroups, 4)
    .map((group) => ({
      ...group,
      width: group.endX - group.startX + 1,
      height: group.bottomY - group.topY + 1,
      centerX: (group.startX + group.endX) / 2,
    }))
    .filter((group) => group.maxCount >= 4);
}

function isAnyScreenshotTrendBarColor(r, g, b) {
  return (
    isScreenshotVideoGreen(r, g, b) ||
    isScreenshotLiveBlue(r, g, b) ||
    isScreenshotYellow(r, g, b) ||
    isScreenshotOrange(r, g, b)
  );
}

function isScreenshotVideoGreen(r, g, b) {
  return g >= 150 && b >= 135 && r <= 150 && g - r >= 35 && Math.abs(g - b) <= 80;
}

function isScreenshotLiveBlue(r, g, b) {
  return b >= 180 && g >= 70 && g <= 150 && r <= 80 && b - r >= 120;
}

function isScreenshotYellow(r, g, b) {
  return r >= 210 && g >= 170 && b <= 95;
}

function isScreenshotOrange(r, g, b) {
  return r >= 220 && g >= 120 && g <= 190 && b <= 110;
}

function mergeCloseGroups(groups, gap) {
  const merged = [];
  for (const group of groups) {
    const prev = merged[merged.length - 1];
    if (prev && group.startX - prev.endX <= gap) {
      prev.endX = group.endX;
      prev.topY = Math.min(prev.topY, group.topY);
      prev.bottomY = Math.max(prev.bottomY, group.bottomY);
      prev.maxCount = Math.max(prev.maxCount, group.maxCount);
    } else {
      merged.push({ ...group });
    }
  }
  return merged;
}

async function addToSelectionCart(tab) {
  await tab.cua.scroll({ x: 900, y: 300, scrollY: -1600, scrollX: 0 }).catch(() => {});
  await sleep(1000);
  return clickText(tab, ["加选品车"], { exact: true, timeoutMs: 10000 });
}

function parseProductRows(text) {
  const rows = [];
  const section = text.split("商品信息").slice(1).join("商品信息");
  const chunks = section.split(/\n\s*加选品车\s*\n/g);
  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 8) continue;
    const row = parseProductRowLines(lines);
    if (row) rows.push(row);
  }
  return deDupeRows(rows);
}

async function extractProductRows(tab) {
  const rows = await tab.playwright.evaluate(() => {
    return Array.from(document.querySelectorAll("tr[data-row-key]"))
      .map((tr) => {
        const title = tr.querySelector("button.index_module__title___c3657")?.innerText?.trim();
        const lines = (tr.innerText || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        return {
          commodity_id: tr.getAttribute("data-row-key"),
          product_name: title,
          raw_lines: lines,
        };
      })
      .filter((row) => row.commodity_id && row.product_name && row.raw_lines.length >= 8);
  }, undefined, { timeoutMs: 30000 }).catch(() => []);

  return deDupeRows(
    rows
      .map((row) => parseProductRowLines(row.raw_lines, row))
      .filter(Boolean)
  );
}

async function collectProductRows(tab, targetCount) {
  const rows = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 10 && rows.length < targetCount; attempt += 1) {
    const extracted = await extractProductRows(tab);
    for (const row of extracted) {
      const key = row.commodity_id || row.product_name;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
    if (rows.length >= targetCount) break;
    await tab.cua.scroll({ x: 900, y: 720, scrollY: 850, scrollX: 0 }).catch(() => {});
    await sleep(700);
  }
  return rows;
}

function parseProductRowLines(lines, base = {}) {
  const productName =
    base.product_name || lines.find((line) => line.length > 12 && !isMetaLine(line));
  if (!productName) return null;
  const shopLine = lines.find((line) => /分$/.test(line) && !/%/.test(line));
  const shopScore = parseNumber((shopLine || "").match(/(\d+(?:\.\d+)?)分/)?.[1]);
  const goodRateLine = [...lines].reverse().find((line) => /^\d+(?:\.\d+)?%$/.test(line));
  const goodRateIndex = lines.findIndex((line) => line === goodRateLine);
  const afterGoodRate = goodRateIndex >= 0 ? lines.slice(goodRateIndex + 1) : [];
  const creatorCount = parseNumber(afterGoodRate[0]);
  const sales = combineSplitNumber(afterGoodRate.slice(1, 4)) || parseSales(lines);

  return {
    ...base,
    product_url: base.product_url || (base.commodity_id ? productDetailUrl(base.commodity_id) : null),
    product_name: productName,
    shop_name: shopLine ? shopLine.replace(/\s*\d+(?:\.\d+)?分$/, "") : null,
    shop_score: shopScore,
    good_rate: goodRateLine || null,
    creator_count: creatorCount,
    commission_percent: parseCommissionPercent(lines),
    sales,
    raw_lines: lines.slice(0, 80),
  };
}

function productDetailUrl(commodityId) {
  const id = encodeURIComponent(commodityId);
  return `https://buyin.jinritemai.com/dashboard/merch-picking-library/merch-promoting?commodity_id=${id}&id=${id}&only_query_params=1`;
}

function broadFilter(row, config) {
  const salesNumber = valueToNumber(row.sales);
  const creatorOk =
    row.creator_count == null || row.creator_count <= config.filters.creatorCountMax;
  const shopOk =
    config.filters.shopScoreMin == null ||
    row.shop_score == null ||
    row.shop_score >= config.filters.shopScoreMin;
  const minOk =
    config.filters.monthlySalesMin == null ||
    salesNumber === 0 ||
    salesNumber >= config.filters.monthlySalesMin;
  const maxOk =
    config.filters.monthlySalesMax == null ||
    salesNumber === 0 ||
    salesNumber <= config.filters.monthlySalesMax;
  const salesOk = minOk && maxOk;
  const menswearOk =
    !config.filters.categoryPath?.includes("男装") ||
    isMenswearProduct(row.product_name) ||
    isMenswearProduct(row.shop_name) ||
    (row.raw_lines || []).some(isMenswearProduct);
  return creatorOk && shopOk && salesOk && menswearOk;
}

function parseCommissionPercent(lines = []) {
  const blocked = /好评|投放期|最高|到手|月销|已售/;
  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || "");
    if (blocked.test(line)) continue;
    const nextLine = String(lines[index + 1] || "").trim();
    const nextNextLine = String(lines[index + 2] || "").trim();
    const inline = line.match(/(?:佣金\s*)?(\d+(?:\.\d+)?)%/);
    if (inline && (/赚/.test(nextLine) || /佣金/.test(line))) return Number(inline[1]);
    if (/^\d+(?:\.\d+)?$/.test(line) && nextLine === "%" && /赚/.test(nextNextLine)) {
      return Number(line);
    }
  }
  return null;
}

function applyPostFilters(results, config) {
  return results.map((item) => {
    const reasons = [];
    const commission = item.commission_percent;
    const trend = item.sales_tail || {};
    const hasCurve =
      Array.isArray(trend.latestHeights) ||
      (Array.isArray(trend.greenGroups) && trend.greenGroups.length >= config.trend.minGreenGroups);

    if (
      config.postFilters.minCommissionPercent != null &&
      (commission == null || commission < config.postFilters.minCommissionPercent)
    ) {
      reasons.push(`佣金 ${commission ?? "unknown"}% < ${config.postFilters.minCommissionPercent}%`);
    }
    if (config.postFilters.requireReadableCurve && !hasCurve) {
      reasons.push("无可读销量曲线数据");
    }
    if (config.postFilters.requireRisingTrend && trend.classification !== "rising") {
      reasons.push(`趋势 ${trend.classification || "unknown"} 不是 rising`);
    }

    return {
      ...item,
      post_filter: {
        status: reasons.length ? "removed" : "kept",
        reasons,
      },
    };
  });
}

function isMenswearProduct(value) {
  const text = String(value || "");
  if (!text) return false;
  if (/女|童|裙|半身|连衣|文胸|内衣女|女士/.test(text)) return false;
  return /男|男士|男款|男装|中年|爸爸|商务|POLO|polo|T恤|短袖|衬衫|裤/.test(text);
}

function parseSales(lines) {
  const monthIndex = lines.findIndex((line) => line.includes("月销") || line.includes("销量"));
  if (monthIndex >= 0) return lines.slice(monthIndex, monthIndex + 3).join(" ");
  const possible = lines.filter((line) => /\d/.test(line)).slice(-5);
  return possible.join(" ");
}

function combineSplitNumber(parts) {
  const tokens = parts.filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length >= 2 && /^\d+$/.test(tokens[0]) && /^\.\d+万$/.test(tokens[1])) {
    return `${tokens[0]}${tokens[1]}`;
  }
  return tokens[0] || null;
}

function deDupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.product_name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function clickText(tab, texts, { exact = false, timeoutMs = 10000 } = {}) {
  for (const text of texts) {
    try {
      await tab.playwright.getByText(text, { exact }).first().click({ timeoutMs });
      return true;
    } catch {
      // Try the next label.
    }
  }
  return false;
}

async function readVisibleText(tab, limit = 20000) {
  return tab.playwright.evaluate(
    (max) => (document.body?.innerText || "").slice(0, max),
    limit,
    { timeoutMs: 30000 }
  );
}

async function waitSettled(tab, timeout = 4000) {
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 }).catch(() => {});
  await tab.playwright.waitForTimeout(timeout).catch(() => sleep(timeout));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortNeedle(name) {
  return String(name || "").replace(/[【】「」\[\]]/g, "").slice(0, 18);
}

function isMetaLine(line) {
  return /^(流量扶持|运费险|现货|高结算率|低价好卖|商家投千川|券|到手价|佣金|赚|¥|%|包邮|商品信息|操作)$/.test(line);
}

function parseNumber(value) {
  if (value == null) return null;
  const text = String(value).replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)(万)?/);
  if (!match) return null;
  const number = Number(match[1]);
  return match[2] ? number * 10000 : number;
}

function valueToNumber(value) {
  return parseNumber(value) || 0;
}

function today() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function slug(input) {
  return String(input || "product")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    filters: { ...base.filters, ...(override.filters || {}) },
    trend: { ...base.trend, ...(override.trend || {}) },
    postFilters: { ...base.postFilters, ...(override.postFilters || {}) },
  };
}

async function writeRunFiles({ runId, runDir, config, results }) {
  await fs.mkdir(runDir, { recursive: true });
  const yamlPath = path.join(runDir, `${runId}.yaml`);
  const mdPath = path.join(runDir, `${runId}-summary.md`);
  const payload = {
    run_id: runId,
    mode: config.allowAddToCart ? "full_selection_run" : "assisted_read_only",
    strategy: {
      category: config.filters.category,
      category_path: config.filters.categoryPath,
      monthly_sales_min: config.filters.monthlySalesMin ?? null,
      monthly_sales_max: config.filters.monthlySalesMax ?? null,
      creator_count_max: config.filters.creatorCountMax,
      shop_score_min: config.filters.shopScoreMin ?? null,
      service_right: config.filters.serviceRightTexts?.join(", ") || null,
      featured_good: config.filters.featuredGoodTexts?.join(", ") || null,
      trend_window: config.trend.windowText,
      excluded_trend_channels: config.trend.excludedChannels,
      primary_trend_channel: config.trend.primaryChannel,
      required_latest_three_days: config.trend.requiredLatestThreeDays,
    },
    post_filters: config.postFilters,
    candidates: applyPostFilters(results, config),
  };
  await fs.writeFile(yamlPath, toYaml(payload), "utf8");
  await fs.writeFile(mdPath, renderSummary(payload), "utf8");
  await fs.writeFile(path.join(runDir, `${runId}-links.md`), renderLinks(payload), "utf8");
  await fs.writeFile(
    path.join(runDir, `${runId}-links-filtered.md`),
    renderFilteredLinks(payload),
    "utf8"
  );
}

function renderSummary(payload) {
  const lines = [
    `# ${payload.run_id}`,
    "",
    `Mode: ${payload.mode}`,
    "",
    "Strategy:",
    "",
    "- 选品广场 > 服饰内衣 > 服装 > 男装",
    "- 月销 <= 500",
    "- 带货达人数 <= 500",
    "- 特色货品 = 品牌",
    "- 近30天销量趋势: 剔除直播蓝柱, 看视频绿柱近三天上升",
    "",
    "## Candidates",
    "",
  ];
  for (const item of payload.candidates) {
    lines.push(
      `- ${item.product_name}`,
      `  - decision: ${item.decision}`,
      `  - status: ${item.status}`,
      `  - commission: ${item.commission_percent ?? "unknown"}%`,
      `  - trend: ${item.sales_tail?.classification || "unknown"}`,
      `  - post_filter: ${item.post_filter?.status || "unknown"}`,
      `  - screenshot: ${item.sales_tail?.screenshot || ""}`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderLinks(payload) {
  const lines = [
    `# ${payload.run_id} Links`,
    "",
    "All candidate product links from this run.",
    "",
  ];
  payload.candidates.forEach((item, index) => {
    lines.push(`${index + 1}. [${item.product_name}](${item.product_url || ""})`, "");
  });
  return `${lines.join("\n")}\n`;
}

function renderFilteredLinks(payload) {
  const kept = payload.candidates.filter((item) => item.post_filter?.status === "kept");
  const removed = payload.candidates.length - kept.length;
  const lines = [
    `# ${payload.run_id} Filtered Links`,
    "",
    "Rules applied after automation:",
    "",
    `- Remove candidates with commission below ${payload.post_filters.minCommissionPercent}%.`,
    payload.post_filters.requireReadableCurve
      ? "- Remove candidates with no readable sales-curve data."
      : "- Keep candidates even when sales-curve data is unreadable.",
    payload.post_filters.requireRisingTrend
      ? "- Keep only candidates whose video trend is rising."
      : "- Keep mixed/declining trends for review if they pass other post filters.",
    "",
    `Result: ${kept.length} kept, ${removed} removed from ${payload.candidates.length} candidates.`,
    "",
    "## Kept Links",
    "",
  ];

  if (!kept.length) {
    lines.push("None.", "");
  }
  kept.forEach((item, index) => {
    lines.push(
      `${index + 1}. [${item.product_name}](${item.product_url || ""})`,
      `   - commission: ${item.commission_percent ?? "unknown"}%`,
      `   - trend: ${item.sales_tail?.classification || "unknown"}`,
      `   - latest video-bar heights: ${JSON.stringify(item.sales_tail?.latestHeights || [])}`,
      ""
    );
  });

  lines.push("## Removed", "");
  payload.candidates
    .filter((item) => item.post_filter?.status === "removed")
    .forEach((item) => {
      lines.push(
        `- ${item.product_name}`,
        `  - reasons: ${item.post_filter.reasons.join("; ")}`,
        ""
      );
    });

  return `${lines.join("\n")}\n`;
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (isScalar(item)) return `${pad}- ${formatScalar(item)}`;
        return `${pad}-\n${toYaml(item, indent + 2)}`;
      })
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        if (isScalar(item)) return `${pad}${key}: ${formatScalar(item)}`;
        return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      })
      .join("\n");
  }
  return `${pad}${formatScalar(value)}`;
}

function isScalar(value) {
  return value == null || ["string", "number", "boolean"].includes(typeof value);
}

function formatScalar(value) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  if (!text || /[:#%\n\r]|^\s|\s$|^-|^\[|^\{|,/.test(text)) return JSON.stringify(text);
  return text;
}

function parseCliArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--run-id") {
      options.runId = next;
      index += 1;
    } else if (arg === "--max") {
      options.maxCandidates = Number(next);
      index += 1;
    } else if (arg === "--start-url") {
      options.startUrl = next;
      index += 1;
    } else if (arg === "--workspace") {
      options.workspaceDir = next;
      index += 1;
    } else if (arg === "--add-to-cart") {
      options.allowAddToCart = true;
    } else if (arg === "--min-commission") {
      options.postFilters = {
        ...(options.postFilters || {}),
        minCommissionPercent: Number(next),
      };
      index += 1;
    } else if (arg === "--allow-no-curve") {
      options.postFilters = {
        ...(options.postFilters || {}),
        requireReadableCurve: false,
      };
    } else if (arg === "--require-rising") {
      options.postFilters = {
        ...(options.postFilters || {}),
        requireRisingTrend: true,
      };
    } else if (arg === "--close-tabs") {
      options.keepTabsOpen = false;
    } else if (arg === "--help" || arg === "-h") {
      printCliHelp();
      process.exit(0);
    }
  }
  return options;
}

function printCliHelp() {
  console.log(`Usage:
  node scripts/douyin-selection-runner.mjs [options]

Options:
  --run-id <id>       Run id used for YAML, summary, and screenshot folder.
  --max <number>      Max candidates to inspect. Default: ${DEFAULTS.maxCandidates}.
  --start-url <url>   Douyin Buyin selection square URL.
  --workspace <path>  Workspace root. Default: ${DEFAULTS.workspaceDir}.
  --add-to-cart       Add passing products to the selection cart.
  --min-commission n  Post-filter links below this commission percent. Default: 15.
  --allow-no-curve    Keep links even when sales-curve data is unreadable.
  --require-rising    Post-filter to rising video trend only.
  --close-tabs        Close Chrome tabs after the run.
`);
}

export default runDouyinSelection;
