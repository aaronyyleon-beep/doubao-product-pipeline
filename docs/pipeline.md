# Product Image2 and Doubao Video Pipeline

This pipeline now uses image2 for the still commercial image stage, then uses
Doubao only for image-to-video.

## Folder layout

Desktop delivery folders hold the actual batch assets. The first level is
the style name, and the second level is the pipeline folder with date and
sequence number:

```text
/Users/muqin/Desktop/doubao-product-pipeline/风格名/pipeline-YYYYMMDD-00N-中文批次名/
  商品001/
    原商品图/
    生成图片/
    生成视频/
  商品002/
    原商品图/
    生成图片/
    生成视频/
  商品003/
    原商品图/
    生成图片/
    生成视频/
  风格参考/
```

This project holds reusable workflow assets:

```text
/Users/muqin/doubao/
  prompts/
  skills/
  batches/
  docs/
  风格参考/
```

## Naming

Use stable batch and product IDs across the whole run:

```text
木质板风/pipeline-20260521-001-经典Polo单品/
  商品001/原商品图/product-001.jpg
  商品001/生成图片/product-001-generated.png
  商品001/生成视频/product-001-video.mp4

快闪风格/pipeline-20260521-002-三色Polo批量/
  商品001/原商品图/product-001.jpg
  商品001/生成图片/product-001-generated.png
  商品001/生成视频/product-001-video.mp4
  商品002/原商品图/product-002.jpg
  商品002/生成图片/product-002-generated.png
  商品002/生成视频/product-002-video.mp4
```

Record each batch in `batches/<batch-id>.yaml`. The batch number (`001`,
`002`, etc.) identifies the pipeline run; the product number (`商品001`,
`product-001`) aligns the original image, generated image, and video inside
that run.

When starting a new run, choose the style first. Then scan existing folders
under `/Users/muqin/Desktop/doubao-product-pipeline/<风格名>/` and choose the
next three-digit pipeline number for that style. For example, if
`木质板风/pipeline-20260521-001-经典Polo单品` already exists, the next wood-board
run on May 21, 2026 should start with
`木质板风/pipeline-20260521-002-中文批次名`.

## Efficient three-product workflow

1. Choose or create the style folder, such as `木质板风` or `快闪风格`.
2. Create one pipeline folder named `pipeline-YYYYMMDD-00N-中文批次名` directly under the style folder.
3. Create one independent artifact folder per source image: `商品001`,
   `商品002`, `商品003`.
4. Put each source image in its matching `商品00N/原商品图/`.
5. Generate all three commercial still images with image2, using the original
   product image as the reference.
6. Save each generated image directly to the matching product path:
   `商品00N/生成图片/product-00N-generated.png`.
7. Review the three images as a set before starting video. Reject any image that changes the garment, adds head/neck, corrupts VOGUE, or loses required props.
8. Generate Doubao videos only from approved generated images.
9. Download each video immediately and rename it to `商品00N/生成视频/product-00N-video.mp4`.
10. Update the batch YAML after each product so an interrupted run can resume from the next missing artifact.

This is faster than doing image and video one product at a time because image2
can create still images without Doubao UI queueing, and style consistency
problems are caught before spending video quota.

## Multi-session automation

Computer Use should not drive multiple Doubao sessions at the same time. It controls the visible desktop, so parallel jobs can steal focus, type into the wrong prompt box, click the wrong tab, or interrupt file upload dialogs.

Preferred split:

```text
Chrome plugin:
  - open and track multiple Doubao tabs
  - paste prompts
  - submit image/video jobs
  - poll each tab for completion
  - download completed assets

Computer Use:
  - login, CAPTCHA, SMS verification
  - file picker fallback if browser upload automation fails
  - visual inspection when the DOM/Chrome plugin cannot expose enough state
```

For three products, generate still images first outside Doubao:

```text
image2(商品001/原商品图/product-001.jpg) -> 商品001/生成图片/product-001-generated.png
image2(商品002/原商品图/product-002.jpg) -> 商品002/生成图片/product-002-generated.png
image2(商品003/原商品图/product-003.jpg) -> 商品003/生成图片/product-003-generated.png
```

After generated images pass review, use Doubao video tabs:

```text
商品001 video tab -> 商品001/生成视频/product-001-video.mp4
商品002 video tab -> 商品002/生成视频/product-002-video.mp4
商品003 video tab -> 商品003/生成视频/product-003-video.mp4
```

Do not submit too many video jobs at once until Doubao quota and rate limits are understood. Start with two or three concurrent tabs, then adjust.

Each tab should have a tracked state:

```text
queued
image2_submitted
image_generated
image_approved
video_reference_uploaded
video_prompt_pasted
video_submitted
video_generating
video_completed
video_downloaded
failed_retryable
failed_blocked
```

If one tab asks for verification or login, pause all automated submissions and let the user handle it in Chrome. Resume from the batch YAML instead of starting over.

## New style reference workflow

When a new AI style image is provided, extract only the transferable commercial style:

- Background material and color
- Lighting direction, color temperature, and contrast
- Logo text, font style, position, scale, and spacing
- Props and hand accessories
- Crop rules and body pose
- Details that must not transfer, such as the reference garment itself, face, body identity, random text, or watermark

Then update only the style layer of the prompt. Keep the product preservation layer unchanged:

- Product category
- Color
- Fit and silhouette
- Collar, placket, buttons, cuffs
- Pocket or chest logo position
- Fabric texture
- Natural wrinkles

## Current batch

Existing batches are archived at:

```text
/Users/muqin/Desktop/doubao-product-pipeline/木质板风/pipeline-20260521-001-经典Polo单品
/Users/muqin/Desktop/doubao-product-pipeline/快闪风格/pipeline-20260521-002-三色Polo批量
```
