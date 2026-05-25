# Douyin Selection Two-Layer Rules

## Layer 1: Browser Automation

Keep this layer fast and mostly mechanical.

- Set `选品广场` filters: `服饰内衣 > 服装 > 男装`, `月销 500以下`,
  `带货达人数 500以下`, `特色货品=品牌`.
- Switch to table/list mode and collect product rows.
- Capture stable fields: product name, product URL, commodity ID, commission,
  shop name, shop score, good rate, creator count, sales value, visible labels.
- Open product detail pages and capture the `带货数据 > 销量趋势` screenshot.
- Read the green `视频` bars after excluding blue `直播` bars, then store
  `rising`, `mixed`, `flat`, `declining`, or `unknown`.
- Write full artifacts: YAML, summary, all links, and filtered links.

## Layer 2: Post-Automation Rules

Use this layer to delete weak links from the captured candidate pool.

- Remove candidates with commission below 15%.
- Remove candidates with no readable sales-curve data.
- Keep readable `mixed` or `declining` curves in the filtered review file by
  default when the goal is fast discovery.
- Require `rising` only for strict final pass or automatic `加选品车`.

## Current Field Placement

Browser automation fields:

- `product_name`
- `product_url`
- `commodity_id`
- `commission_percent`
- `shop_name`
- `shop_score`
- `good_rate`
- `creator_count`
- `sales`
- `raw_lines`
- `sales_tail.classification`
- `sales_tail.latestHeights`
- `sales_tail.screenshot`

Post-filter fields:

- `post_filter.status`
- `post_filter.reasons`
- `minCommissionPercent`
- `requireReadableCurve`
- `requireRisingTrend`

