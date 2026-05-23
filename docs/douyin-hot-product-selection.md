# Douyin Apparel Hot Product Selection Automation

This workflow turns the apparel product-selection teaching notes into repeatable
automation rules. It is designed to feed the existing image/video creative
pipeline after a product is shortlisted.

## Goal

Find apparel products that are early enough to follow, have visible upward sales
momentum, and are not already crowded by high-level creators.

The automation has two entry points:

1. **Follow benchmark accounts:** track small accounts that recently produced
   a hot product, then react within the same day or next day.
2. **Find pre-hot products:** scan candidate products directly and score them
   by competition, sales trend, account mix, and shop quality.

## Source Channels

Use these sources in priority order:

1. `同行跟选`: daily monitoring for saved benchmark accounts.
2. `选品广场 > 精选`: best after the account has already sold apparel products.
3. `选品广场 > 服装类目`: broad manual or automated discovery.
4. `橱窗 > 全部工具 > 创意中心 > 热度榜 > 服装`: source for finding benchmark
   accounts and trending apparel products.
5. Product detail pages: final verification for sales curve, creator count,
   creator levels, shop score, and `随心推` promotion qualification.

## Benchmark Account Rules

Build a watchlist of 20-30 small benchmark accounts.

An account is worth tracking when:

- It is in the same apparel segment, such as menswear, shirts, Polo, underwear,
  socks, or other target subcategory.
- It is small enough to copy quickly: usually a new or low-follower account,
  often around 3,000-6,000 followers, not a large mature creator.
- It recently had a product or video move, ideally yesterday or today.
- Its recent high-like videos are recent, not old historical spikes.
- For higher-ticket apparel, 20-30 likes can already count as a signal; 50+
  likes is a stronger follow signal.
- The account's own creator level and the creators who are selling the product
  are mostly level 0-2.

Daily action:

1. Add selected accounts to `同行跟选`.
2. Set product alert threshold to the platform minimum of 50 sales when
   available.
3. Check `爆品动态` daily.
4. If a product crossed the alert threshold yesterday or today, enrich it with
   the product rules below and shortlist it if it passes.

## Pre-Hot Product Rules

Use these hard filters first in `选品广场`:

- `商品类目`: `服饰内衣 > 服装 > 男装`
- `带货情况`: `月销 500以下`
- `带货情况`: `带货达人数 500以下`
- `特色货品`: `品牌`

Then open each product detail page and inspect `带货数据 > 销量趋势`.

Trend rule:

- Use `近30天` by default unless the user asks for another window.
- Ignore the blue `直播` bars when judging trend.
- Prioritize the short-video channel bars. In the current chart legend this is
  the green `视频` bar.
- Yellow `图文` and orange `橱窗` can be used as supporting signals, but they
  should not override the video trend.
- The latest three days of the video trend must be rising.
- Reject when the latest three video bars are flat, declining, or rising only
  because of blue live-stream bars.

Only after the detail-page trend passes should the product be added to the
selection cart.

## Scoring

Only score candidates after they pass hard filters.

```text
total_score = recency + sales_momentum + competition + creator_fit + shop_quality
```

| Factor | Max | Rule |
| --- | ---: | --- |
| `recency` | 20 | today/yesterday hot signal scores highest |
| `sales_momentum` | 30 | latest three non-live/video bars rising scores highest |
| `competition` | 20 | 500 or fewer creators passes the current broad filter; fewer creators score higher |
| `creator_fit` | 20 | mostly level 0-2 creators highest; high-level creator cluster loses points |
| `shop_quality` | 10 | brand-tagged goods and acceptable shop/product signals score higher |

Recommended decisions:

- `add_to_cart`: all hard filters pass and latest three non-live/video bars rise.
- `manual_review`: list filters pass but trend is hard to classify visually.
- `reject`: score < 65 or any hard filter fails.

## Candidate Statuses

Use these statuses so interrupted work can resume:

```text
discovered
metrics_pending
metrics_enriched
hard_filter_failed
scored
manual_review
shortlisted
add_to_cart
selection_cart_added
creative_pipeline_started
creative_pipeline_completed
rejected
```

## Candidate Record Schema

Use this shape for YAML, CSV, or spreadsheet rows:

```yaml
candidate_id: dy-YYYYMMDD-001
source: tonghang_genxuan
category: 服装
subcategory: 男装/Polo
product_name:
product_url:
product_id:
shop_name:
shop_score:
experience_score:
quality_score:
has_suixintui: true
has_short_video_suixintui: true
creator_count:
creator_level_mix:
  level_0_2:
  level_3_4:
  level_5_7:
sales_tail:
  window: 近30天
  excluded_channels: [直播]
  primary_channel: 视频
  latest_three_days: rising
  classification: rising
sales_recent:
  today:
  yesterday:
  seven_day:
benchmark_account:
  handle:
  douyin_id:
  followers:
  reason:
recent_video_signal:
  latest_hot_date:
  likes:
score:
decision:
risk_flags: []
next_action:
notes:
```

## Output Contract

Every run should produce:

1. A watchlist update: new benchmark accounts added, removed, or retained.
2. A candidate shortlist ranked by score.
3. The reason each product passed or failed.
4. A handoff list for creative production, with product URLs/images ready for
   the image2 and Doubao video pipeline.
5. A list of products added to the selection cart, with screenshots proving the
   non-live trend judgment.

## Chrome Automation

Use the Chrome-based automation plan when the user wants Codex to operate the
logged-in Douyin UI directly:

```text
/Users/lyy/influencer_marketing/docs/douyin-selection-chrome-automation-plan.md
```

The current runnable script is:

```text
/Users/lyy/influencer_marketing/scripts/douyin-selection-runner.mjs
```

It applies the active `选品广场` filters, opens product detail pages, captures
the `销量趋势` screenshot, ignores blue `直播` bars, and classifies the green
`视频` bars with screenshot pixel analysis when the chart data is not available
from the DOM.

The Chrome flow should run in small batches, persist after every candidate, and
pause for login, CAPTCHA, SMS verification, ambiguous account matches, or risky
account actions.

## Open Inputs Needed

The teaching record leaves these implementation inputs unspecified:

- Which exact apparel subcategory should be prioritized first.
- Whether products that pass the trend rule should be added to the selection
  cart automatically or only after confirmation.
- Whether data will come from live browser automation, manual CSV export, or
  screenshots.
- Where selected product images and links should be stored before entering the
  creative pipeline.
