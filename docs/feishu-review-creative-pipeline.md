# Feishu Review Creative Pipeline

This workflow connects Douyin product selection, Feishu review, Image2 still
generation, Doubao image-to-video, and benchmark feedback.

## Flow

```text
Douyin selection run
  -> lark-cli exports filtered candidates to a Feishu review doc
  -> human product review
  -> approved products enter Image2 still generation
  -> generated images/videos are pushed back to Feishu
  -> second review decides publish/retry/reject
  -> rejected creative cases become benchmark input for the next review
```

## Product Review Gate

The first Feishu document is created from the filtered selection output, such
as `runs/<run_id>-links-filtered.md`.

Each candidate should show:

- product name
- product link
- commission
- sales trend classification
- latest video-bar heights
- selection run id
- review decision: `approve`, `reject`, or `watch`
- reviewer notes

Only candidates marked `approve` may enter the Image2 and Doubao creative
pipeline.

## Creative Generation Gate

Approved products become creative batch items under the existing product
creative layout:

```text
/Users/lyy/Desktop/doubao-product-pipeline/<style>/<batch-id>/
  商品001/
    原商品图/
    生成图片/
    生成视频/
```

Status moves forward in this order:

```text
product_review_approved
image2_queued
image2_generated
creative_review_pending
image_approved
video_queued
video_generated
video_review_pending
video_approved
publish_ready
```

If a still image fails review, do not spend video quota. Update the product
status to `creative_rejected` or `image_retry_requested`.

If a video fails review, keep the generated asset and reason, then retry only
after the prompt or source constraints are changed.

## Feishu Return Package

After Image2 or video generation, push back to Feishu with:

- product id and product link
- original product image
- generated still image
- generated video
- prompt used for still image
- prompt used for video
- status and reviewer notes

Use `lark-cli docs +media-insert --api-version v2` to append generated assets
to the review document, or create a second document that links back to the
product-review document.

## Benchmark Feedback

Rejected creative outputs are not discarded. They become a benchmark dataset
for the next review pass.

Record:

- product id
- product name
- source product link
- rejected asset path
- failed stage: `image_review` or `video_review`
- reject reason
- visual failure tags
- prompt that produced the failure
- corrected reviewer instruction

Example tags:

```text
changed_garment
wrong_color
wrong_collar
visible_head_or_neck
bad_text
missing_prop
low_commercial_quality
video_motion_bad
video_product_deformed
```

The next Feishu product review should include a benchmark summary so reviewers
can compare new candidates and prompts against known bad outcomes.

