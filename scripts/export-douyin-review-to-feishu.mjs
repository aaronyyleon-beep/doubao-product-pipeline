import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseFilteredLinks(markdown) {
  const runTitle = (markdown.match(/^#\s+(.+?)\s+Filtered Links/m) || [])[1] || "douyin-selection-review";
  const keptSection = markdown.split("## Kept Links")[1]?.split("## Removed")[0] || "";
  const itemRegex =
    /^\d+\.\s+\[(.*?)\]\((.*?)\)\n\s+- commission:\s*(.*?)\n\s+- trend:\s*(.*?)\n\s+- latest video-bar heights:\s*(.*?)$/gm;
  const candidates = [];
  for (const match of keptSection.matchAll(itemRegex)) {
    candidates.push({
      productName: match[1].trim(),
      productUrl: match[2].trim(),
      commission: match[3].trim(),
      trend: match[4].trim(),
      heights: match[5].trim(),
    });
  }
  return { runTitle, candidates };
}

function renderReviewXml({ runTitle, candidates, sourcePath }) {
  const rows = candidates
    .map(
      (item, index) => `<tr>
  <td>${index + 1}</td>
  <td>${escapeXml(item.productName)}</td>
  <td><a href="${escapeXml(item.productUrl)}">商品链接</a></td>
  <td>${escapeXml(item.commission)}</td>
  <td>${escapeXml(item.trend)}</td>
  <td><code>${escapeXml(item.heights)}</code></td>
  <td>pending</td>
  <td>approve / reject / watch</td>
  <td></td>
</tr>`
    )
    .join("\n");

  return `<title>抖音带货选品 Review - ${escapeXml(runTitle)}</title>

<callout emoji="📌" background-color="light-blue" border-color="blue">
  <p>用途：人工审核自动化筛出的抖音带货商品。只有 product_review=approve 的商品才进入 Image2 生图和 Doubao 生视频。</p>
  <p>来源文件：<code>${escapeXml(sourcePath)}</code></p>
</callout>

<h1>Review Instructions</h1>
<ul>
  <li>检查商品链接、佣金、趋势截图与商品适配度。</li>
  <li>将 review_decision 填为 approve、reject 或 watch。</li>
  <li>approve 后才允许进入 Image2 生图。</li>
  <li>二次素材审核失败的样本要写入 benchmark，用于下次 review。</li>
</ul>

<h1>Candidate Products</h1>
<table>
  <thead>
    <tr>
      <th background-color="light-gray">#</th>
      <th background-color="light-gray">商品</th>
      <th background-color="light-gray">链接</th>
      <th background-color="light-gray">佣金</th>
      <th background-color="light-gray">趋势</th>
      <th background-color="light-gray">近三天视频柱</th>
      <th background-color="light-gray">pipeline_status</th>
      <th background-color="light-gray">review_decision</th>
      <th background-color="light-gray">review_notes</th>
    </tr>
  </thead>
  <tbody>
${rows || `<tr><td colspan="9">No candidates found.</td></tr>`}
  </tbody>
</table>

<h1>Next Step</h1>
<checkbox done="false">审核候选商品，填入 approve / reject / watch</checkbox>
<checkbox done="false">将 approve 商品写入 creative batch manifest</checkbox>
<checkbox done="false">执行 Image2 生图并推回飞书二次审核</checkbox>
<checkbox done="false">二审失败样本写入 benchmark</checkbox>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const dryRun = args.includes("--dry-run");
  const asIndex = args.indexOf("--as");
  const input =
    inputIndex >= 0
      ? args[inputIndex + 1]
      : "/Users/lyy/influencer_marketing/runs/douyin-selection-20260526-brand-menswear-002-links-filtered.md";
  const asIdentity = asIndex >= 0 ? args[asIndex + 1] : "user";

  if (!input) throw new Error("Missing --input <filtered-links.md>");

  const markdown = await fs.readFile(input, "utf8");
  const parsed = parseFilteredLinks(markdown);
  const xml = renderReviewXml({ ...parsed, sourcePath: input });
  const workspaceDir = "/Users/lyy/influencer_marketing";
  const tmpDir = path.join(workspaceDir, ".tmp", "lark");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `douyin-review-${Date.now()}.xml`);
  const tmpRelative = path.relative(workspaceDir, tmpFile);
  await fs.writeFile(tmpFile, xml, "utf8");

  const cliArgs = [
    "docs",
    "+create",
    "--api-version",
    "v2",
    "--as",
    asIdentity,
    "--doc-format",
    "xml",
    "--content",
    `@${tmpRelative}`,
  ];
  if (dryRun) cliArgs.push("--dry-run");

  const { stdout, stderr } = await execFileAsync("lark-cli", cliArgs, {
    cwd: workspaceDir,
    maxBuffer: 1024 * 1024 * 10,
  });
  if (stderr) process.stderr.write(stderr);
  process.stdout.write(stdout);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
