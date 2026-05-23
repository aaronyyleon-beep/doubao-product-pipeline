---
name: douyin-hot-product-selection-automation
description: Use for Douyin/TikTok China apparel hot product selection, benchmark account following, pre-hot product scoring, 选品广场, 同行跟选, 创意中心, 服装赛道, 爆品, 爆款, 跟品, 预爆品, 随心推, or deciding which apparel products should enter the creative pipeline.
---

# Douyin Apparel Hot Product Selection Automation

## When to Use

Use this skill when the user asks for automated hot product selection in Douyin
e-commerce apparel, including:

- `爆款选品`, `爆品选品`, `跟爆品`, `跟品`
- `选品广场`, `同行跟选`, `创意中心`, `服装赛道`
- `预爆品`, `随心推`, `带货达人`, `标杆账号`
- choosing which product should enter the image/video creative pipeline

This skill produces a ranked shortlist, not final creative assets. After a
product is shortlisted and product images are available, hand it off to
`doubao-image-video-automation`.

## Inputs

Ask only for missing inputs that block the run. Useful inputs are:

- apparel subcategory, such as menswear, Polo, shirts, underwear, socks
- source mode: live browser review, manual CSV/export, screenshots, or pasted
  product/account records
- account watchlist, if the user already has benchmark accounts
- preferred thresholds if different from the defaults below

Defaults:

- category: `服装`
- benchmark account target: 20-30 accounts
- alert threshold: 50 product sales
- primary selection category: `服饰内衣 > 服装 > 男装`
- monthly sales maximum: 500
- creator count maximum: 500
- featured goods: require `品牌`
- detail-page trend rule: latest three non-live/video bars must rise
- trend reading: ignore blue `直播` bars; prioritize green `视频` bars
- preferred creator levels: 0-2

## Workflow

### 1. Build Benchmark Account Watchlist

Find small same-segment accounts from `选品广场`, product detail pages, or
`创意中心 > 热度榜 > 服装`.

Accept an account when:

- follower count is small or mid-small, commonly around 3,000-6,000, and it is
  not a large mature creator
- recent product or video signal appeared today, yesterday, or very recently
- for higher-ticket apparel, 20-30 likes can already be meaningful; 50+ likes is
  stronger
- recent hot posts are actually recent, not old historical posts
- account/product selling creators are mostly level 0-2

Add accepted accounts to `同行跟选`. When the platform allows alerts, set product
sales alert to 50.

### 2. Collect Candidate Products

Use the primary source:

1. `选品广场`
2. Set `商品类目` to `服饰内衣 > 服装 > 男装`.
3. Set `带货情况 > 月销` to `500以下`.
4. Set `带货情况 > 带货达人数` to `500以下`.
5. Set `特色货品` to `品牌`.
7. Switch to table mode if available, then read candidate rows.

If the account has already sold apparel products, `精选` recommendations become
more useful and should be checked directly.

### 3. Enrich Product Metrics

For each product, capture:

- product name, URL, ID, category, subcategory
- shop, experience, and quality scores
- brand/featured-good label
- creator count
- creator level mix, especially levels 0-2 versus 5-7
- recent sales trend by channel
- daily/recent sales if visible
- source account and recent video signal when found through a benchmark account

Trend capture:

- Open the product detail page.
- Go to `带货数据`.
- Use `近30天`.
- Scroll to `销量趋势`.
- Take a screenshot.
- Ignore blue `直播` bars.
- Use green `视频` bars as the primary curve.
- Require the latest three video bars to rise.
- Mark the candidate `add_to_cart` only if this visual trend passes.

### 4. Apply Hard Filters

Reject or mark failed when:

- category is not apparel or not the target subcategory
- product is not brand-tagged when `特色货品=品牌` is required
- monthly sales are above 500
- creator count is above 500
- latest three video bars are flat or declining after excluding blue live-stream bars
- many level 5-7 creators are already selling it

Mark `manual_review` when:

- broad filters pass but the trend screenshot is unclear
- channel colors or legend cannot be confidently mapped
- latest three video bars are mixed rather than clearly rising

### 5. Score Passing Candidates

Use this scoring model:

```text
recency: 0-20
sales_momentum: 0-30
competition: 0-20
creator_fit: 0-20
shop_quality: 0-10
total: 0-100
```

Decision thresholds:

- `add_to_cart`: broad filters pass and latest three video bars rise after excluding live-stream bars
- `manual_review`: broad filters pass but trend cannot be confidently classified
- `reject`: total < 65 or hard filter failed

### 6. Handoff to Creative Pipeline

For every `add_to_cart` product:

1. Save product URL, source account, score, and reason.
2. Add it to the selection cart.
3. Save a trend screenshot proving the latest-three-day non-live/video rise.
4. Collect clean product images.
5. Create or update a selection YAML from
   `/Users/lyy/influencer_marketing/templates/douyin-hot-product-candidates.yaml`.
6. If the user wants creatives, start the product image/video pipeline using the
   selected product images.

## Output Format

Return concise ranked results:

```text
1. product_name - score - add_to_cart
   Why: menswear brand item, monthly sales <=500, creators <=500,
        latest three video bars rise after excluding blue live-stream bars
   Risk: none
   Next: already added to selection cart; collect product image and start creative pipeline
```

Also include rejected products when useful, with the exact failing reason.

## Missing Data Policy

If metrics are missing, do not invent them. Mark the candidate as
`metrics_pending` and ask for the smallest missing set needed to decide:

- creator count
- latest-three-day video trend after excluding live-stream bars
- score values
- brand/featured-good label
- creator level mix
