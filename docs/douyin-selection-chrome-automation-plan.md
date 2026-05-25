# Chrome Automation Plan for Douyin Apparel Product Selection

This plan uses the Codex Chrome Extension to automate the Douyin apparel
selection workflow while preserving the user's normal Chrome login state. The
automation reads visible page content and interacts with the Douyin UI; it does
not inspect cookies, passwords, local storage, or profile data.

## Objective

Automate these product-selection paths:

1. Filter `选品广场` apparel products by the current broad pre-hot rules.
2. Open candidate product detail pages.
3. Read `带货数据 > 销量趋势` visually from screenshots.
4. Ignore blue live-stream bars and judge the short-video trend.
5. Export the full link list and a post-filtered link list.
6. Add products to the selection cart only in full mode, when the latest three
   non-live/video bars are rising.

## Browser Automation Boundaries

Use Chrome automation for:

- logged-in Douyin/e-commerce pages
- navigation, clicks, filters, search boxes, tabs, and pagination
- reading visible text, tables, cards, chart labels, and product detail fields
- screenshots when charts or UI text are not directly readable
- downloading/exporting CSV files when the UI supports it

Pause for user action when:

- login is required
- CAPTCHA, SMS verification, QR confirmation, or security prompt appears
- the page asks for payment, permission escalation, or risky account action
- Douyin changes layout enough that selectors cannot be confidently matched

Login-block recovery:

1. If the Buyin page shows `用户未登陆，请重新登陆`, redirects to
   `douyinec.com`, or loads as a blank Douyin e-commerce landing page, navigate
   to `https://www.douyinec.com/`.
2. Click the `达人`/`达人入驻` entry card.
3. Click `登录`.
4. Return to the original Buyin selection URL and continue after the user/session
   is authenticated.

Do not automate:

- bypassing CAPTCHA or SMS checks
- hidden API calls that require token/cookie extraction
- bulk actions that might violate platform rate limits
- changing account settings outside the stated selection workflow

## Data Files

Use one run file per selection session:

```text
/Users/lyy/influencer_marketing/runs/douyin-selection-YYYYMMDD-001.yaml
```

Initialize the run from:

```text
/Users/lyy/influencer_marketing/templates/douyin-hot-product-candidates.yaml
```

Suggested export folders:

```text
/Users/lyy/influencer_marketing/runs/screenshots/
/Users/lyy/influencer_marketing/runs/exports/
```

## Automation Stages

### Stage 0: Connect Chrome

1. Connect to Chrome through the Codex Chrome Extension.
2. List open tabs.
3. Claim an existing Douyin selection tab if present; otherwise open a new tab.
4. Navigate to the Douyin e-commerce product selection page supplied by the user
   or discovered from the current logged-in workflow.
5. If the page is not logged in, keep the tab open and ask the user to complete
   login.

Expected state:

```yaml
chrome:
  status: connected
  tab: douyin_selection
  login_state: confirmed
```

### Stage 1: Build Benchmark Creator Watchlist

Navigation:

```text
电商带货 / 选品广场 -> 服饰内衣/服装 -> 商品详情 -> 带货达人
```

Automation actions:

1. Open apparel category.
2. Click candidate products.
3. Open `带货达人`.
4. Read top creator cards, at least top 5.
5. For each creator, open profile/detail page when available.
6. Collect follower count, creator level, recent product sales, recent video
   dates, and hot-video like counts.
7. Accept low-follower low-level creators that match the benchmark rules.

Benchmark acceptance rules:

```text
creator_level in L0-L2
followers usually 3,000-6,000, or otherwise clearly small/new
recent hot signal date is today/yesterday/recent
recent apparel video likes >= 20, stronger at >= 50
same segment as target apparel category
```

Output:

```yaml
benchmark_accounts:
  - handle:
    douyin_id:
    followers:
    creator_level:
    source_product:
    recent_hot_date:
    recent_hot_likes:
    reason:
    status: accepted
```

### Stage 2: Add Benchmarks to `同行跟选`

Navigation:

```text
选品广场 -> 同行跟选
```

Automation actions:

1. Search each accepted creator by handle or Douyin ID.
2. Confirm the result matches the collected account.
3. Click collect/follow/save.
4. Enter management page.
5. Open `爆品设置`.
6. Set alert threshold to 50 sales if the UI supports the platform minimum.

Safety:

- If search returns multiple ambiguous accounts, mark `manual_review`.
- If adding a creator changes a paid quota or permission setting, pause.

Output:

```yaml
benchmark_accounts:
  - handle:
    douyin_id:
    follow_status: saved_to_tonghang_genxuan
    alert_sales_threshold: 50
```

### Stage 3: Scan Daily Hot Product Signals

Primary source:

```text
选品广场
```

Automation actions:

1. Set `商品类目` to `服饰内衣 > 服装 > 男装`.
2. Set `带货情况 > 月销` to `500以下`.
3. Set `带货情况 > 带货达人数` to `500以下`.
4. Set `特色货品` to `品牌`.
6. Switch to table mode if available.
7. Read product rows and capture product name, URL, image, price, commission,
   shop score, good-rate, creator count, sales, and labels.
8. Open product detail page for each row.
9. De-duplicate by product URL or product ID.
10. Mark candidates as `metrics_pending`.

Card-level quick pass:

```text
same apparel segment
monthly sales <= 500
creator count <= 500
featured good == 品牌
```

### Stage 4: Enrich Product Metrics

Product detail fields to collect:

```yaml
product_name:
product_url:
product_id:
category:
subcategory:
price:
shop_name:
shop_score:
experience_score:
quality_score:
has_suixintui:
has_short_video_suixintui:
creator_count:
creator_level_mix:
  level_0_2:
  level_3_4:
  level_5_7:
sales_tail:
  window:
  excluded_channels:
  primary_channel:
  latest_three_days:
  classification:
sales_recent:
  today:
  yesterday:
  seven_day:
source:
benchmark_account:
```

Chart handling:

- In `带货数据`, choose `近30天`.
- Scroll to `销量趋势` and take a screenshot.
- Ignore blue `直播` bars.
- Use green `视频` bars as the primary trend when the legend is
  `直播 / 视频 / 图文 / 橱窗`.
- Yellow `图文` and orange `橱窗` are supporting signals only.
- Classify latest three video bars as `rising`, `flat`, `declining`, `mixed`, or
  `unknown`.
- In read-only discovery, do not add products to the selection cart; write the
  captured fields and let post-filters remove low-quality links.
- In full selection mode, if the latest three video bars are rising, scroll back
  up and add the product to the selection cart.
- If the curve cannot be confidently read, mark `manual_review` and remove it
  from the post-filtered link file by default.

### Stage 5: Apply Filters and Score

Browser-layer hard filters:

```text
not apparel or wrong subcategory
monthly sales > 500
creator_count > 500
not brand-tagged when `特色货品=品牌` is required
```

Post-automation link filters:

```text
commission < 15%
no readable sales-curve data
```

Strict auto-add filters:

```text
latest three non-live/video bars are flat, mixed, or declining
apparent rise comes only from blue live-stream bars
```

Manual review:

```text
list filters pass
commission >= 15%
trend screenshot is readable
latest three video bars are mixed rather than clearly rising
```

Auto-follow candidate:

```text
category == 服饰内衣 > 服装 > 男装
monthly sales <= 500
creator_count <= 500
featured good == 品牌
commission >= 15%
readable sales-curve data
latest three non-live/video bars rising
```

Action:

```text
If all auto-follow rules pass, scroll back to the product header and click
加选品车.
```

Scoring:

```text
recency: 0-20
sales_momentum: 0-30
competition: 0-20
creator_fit: 0-20
shop_quality: 0-10
```

### Stage 6: Export Shortlist

Write the run YAML and a concise Markdown summary:

```text
/Users/lyy/influencer_marketing/runs/douyin-selection-YYYYMMDD-001.yaml
/Users/lyy/influencer_marketing/runs/douyin-selection-YYYYMMDD-001-summary.md
/Users/lyy/influencer_marketing/runs/douyin-selection-YYYYMMDD-001-links.md
/Users/lyy/influencer_marketing/runs/douyin-selection-YYYYMMDD-001-links-filtered.md
```

Summary format:

```text
1. 商品名 - 86 - add_to_cart
   Why: menswear brand item, monthly sales <=500, creators <=500,
        latest three video bars rising after excluding live-stream bars
   Risk: none
   Next: added to selection cart; collect product images and start creative pipeline
```

For rejected products, include the exact reason:

```text
Rejected: 商品名
Reason: 127 creators and sales tail declining
```

## Implementation Shape

The reusable runner lives at:

```text
/Users/lyy/influencer_marketing/scripts/douyin-selection-runner.mjs
```

Run it from the Codex Node REPL/Chrome plugin runtime:

```js
const runner = await import("/Users/lyy/influencer_marketing/scripts/douyin-selection-runner.mjs");
await runner.runDouyinSelection({
  maxCandidates: 20,
  allowAddToCart: false,
  postFilters: {
    minCommissionPercent: 15,
    requireReadableCurve: true,
    requireRisingTrend: false
  }
});
```

It also has a CLI wrapper for help text and argument parsing. Chrome operations
still need the trusted Codex Chrome-plugin runtime; ordinary terminal Node runs
cannot access the native Chrome bridge.

```bash
node /Users/lyy/influencer_marketing/scripts/douyin-selection-runner.mjs --help
```

Use `allowAddToCart: false` for the first scripted run. After the filters,
detail-page navigation, and visual trend classification are verified, set
`allowAddToCart: true`.

The script is organized around these functions:

```text
connectChrome()
claimOrOpenSelectionTab()
ensureSelectionSquare()
applySelectionFilters()
switchToTableMode()
parseProductRows()
inspectCandidate()
openProductDetail()
scrollToTrend()
classifyVideoTrend()
classifyVideoTrendFromScreenshot()
addToSelectionCart()
writeRunFiles()
```

Each function should be idempotent. Persist after every candidate so the run can
resume after login prompts, layout changes, or page failures.

## Selector Strategy

Use selectors in this order:

1. Accessible text and roles, such as buttons named `选品`, `同行跟选`, `爆品设置`.
2. Stable labels, placeholders, and visible text.
3. DOM snapshots for nearby text relationships.
4. Coordinate clicks only after screenshots confirm the UI.

Avoid relying on fragile absolute CSS paths unless no readable UI text exists.

## Rate and Reliability Controls

- Keep one active tab for navigation and one optional detail tab.
- Wait for page idle or visible section title after each navigation.
- Use random short pauses between product detail visits.
- Limit one run to a configurable number of candidates, for example 30-50.
- Save a screenshot when a product is shortlisted or when a metric is ambiguous.
- Save a screenshot of the trend chart before adding any product to the
  selection cart.
- Never add to the selection cart when the latest-three-day rise comes only from
  blue live-stream bars.
- Stop after repeated selector failures and ask for a new screenshot or page
  confirmation.

## Minimum User Inputs Before First Run

Required:

- target apparel subcategory
- starting Douyin/e-commerce URL, or confirmation that an existing Chrome tab is
  already on the right page
- whether to allow the automation to save benchmark accounts into `同行跟选`

Optional:

- existing benchmark account list
- max products to inspect per run
- whether to add passing products to the selection cart automatically

## Recommended First Run

Start small:

```yaml
subcategory: 男装/Polo
filters:
  category: 服饰内衣
  category_path: [服装, 男装]
  monthly_sales_max: 500
  creator_count_max: 500
  featured_good: 品牌
post_filters:
  min_commission_percent: 15
  require_readable_curve: true
  require_rising_trend: false
trend:
  window: 近30天
  excluded_channels: [直播]
  primary_channel: 视频
  required_latest_three_days: rising
max_candidates_to_enrich: 20
allow_add_to_selection_cart: false
```

After the selectors and visual trend classification are verified, enable
`allow_add_to_selection_cart`.

## Permission Modes

Use these modes to control risk.

### Read-Only Discovery

Default first run.

Allowed:

- navigate pages
- open product and creator detail pages
- read visible metrics
- take screenshots
- write local run files

Not allowed:

- save creators to `同行跟选`
- change `爆品设置`
- export files from the platform
- add products to the selection cart
- start creative pipeline automatically

### Assisted Save

Use after read-only discovery works.

Allowed:

- all read-only actions
- stop before each `加选品车` action and ask for confirmation

### Full Selection Run

Use only after selectors are stable.

Allowed:

- all assisted-save actions
- add products to the selection cart automatically when all filters pass and
  the latest three non-live/video bars are rising
- enrich and score candidates up to the configured run limit

Still pause for:

- login/security prompts
- payment/quota prompts
- ambiguous creator matches
- platform layout changes
- any candidate where required metrics are not visible
- any trend chart where live-stream bars are the only reason the total appears
  to rise
