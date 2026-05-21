---
name: doubao-image-video-automation
description: Default automation for product creative requests with style keywords such as 木质板风, 快闪风格, 木质板, 快闪店, 黑胶唱片屏, 发光展台, 咖啡棕木墙, VOGUE, 图生图, 图生视频, 跑一次, 完整pipeline, or attached product images. Generate still product images with image2, save them into Chinese style/pipeline desktop folders with aligned per-product artifact directories, then use Doubao web image-to-video through Chrome/Computer Use when video is requested.
---

# Image2 and Doubao Video Automation

## Overview

Use this skill by default for product creative work whenever the user provides
product images and asks for a style, image generation, video generation, or a
pipeline run. Style keywords should trigger the full workflow setup:

- `木质板风`, `木质板`, `木格栅`, `咖啡棕木墙`, `经典Polo单品风格`
- `快闪风格`, `快闪`, `快闪店`, `黑胶唱片屏`, `数字音乐屏`, `发光展台`
- `图生图`, `image2`, `图生视频`, `豆包生视频`, `跑一次`, `完整pipeline`

Do not wait for the user to explicitly name this skill. If a matching style
keyword appears, load the corresponding style document and execute the needed
pipeline stage.

Use this revised product-creative chain:

1. Generate the still commercial product image with image2 from the original product reference.
2. Save the generated still image directly into the desktop batch folder.
3. Use Doubao only for image-to-video: upload the generated still image, submit the video prompt, then download the video into the same batch folder.

If the user asks only for `图生图`, `做一张`, or `生成图片`, stop after the image2
image is saved. If the user asks for `图生视频`, `视频`, or `完整pipeline`, continue
through Doubao video generation after the still image is available.

The Doubao video stage is UI-fragile. Prefer verified clicks, clipboard paste for Chinese prompts, frequent status checks, and explicit handling of login, SMS verification, service overload, and download confirmation.

## Prerequisites

- Use the `imagegen` skill/tool for image2 still-image generation when the user asks to generate the commercial images outside Doubao.
- Use the `computer-use:computer-use` skill when available, and call `mcp__computer_use__.get_app_state` once before interacting with Chrome or any browser app in each assistant turn.
- If the Chrome automation plugin is available, prefer it for normal Doubao tab operations and multi-session work. Use Computer Use mainly for login, CAPTCHA/SMS verification, native file picker fallback, and visual inspection.
- Use `Google Chrome` or the exact app name returned by `mcp__computer_use__.list_apps`; `Chrome` may not resolve.
- Use `pbcopy` plus `super+v` for Chinese prompts. Do not rely on `type_text` for long Chinese prompts; it can corrupt or drop characters.
- Keep the source image path, batch manifest, and output directory explicit. Default downloads usually land in `/Users/<user>/Downloads`, but final assets should be copied or moved into the batch folder.
- If Doubao asks for login, CAPTCHA, or a 6-digit SMS code, stop and ask the user to complete it or provide the code. Do not guess or bypass.

## Batch Asset Layout

For repeated product work, group assets by style first, then pipeline. The
pipeline folder name must include the date and a stable sequence number:

```text
/Users/<user>/Desktop/doubao-product-pipeline/风格名/pipeline-YYYYMMDD-00N-中文批次名/
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

Use stable names across stages inside each product folder:

```text
商品001/原商品图/product-001.jpg
商品001/生成图片/product-001-generated.png
商品001/生成视频/product-001-video.mp4
```

The style folder should use names such as `木质板风` or `快闪风格`. The pipeline
number (`00N`) identifies the run within that style. The product number
(`商品001` and `product-001`) must match across the original image, image2
generated still, and Doubao video. Record status in
`/Users/<user>/doubao/batches/<batch-id>.yaml` when available. Update the
manifest after each saved image and each video download so the run can resume
after interruption.

When creating a new run, scan
`/Users/<user>/Desktop/doubao-product-pipeline/<风格名>/` for existing
`pipeline-YYYYMMDD-00N-*` folders and choose the next unused three-digit
number for that style. Do not reuse a pipeline number for a different run in
the same style folder.

## Workflow

### 1. Generate the Still Image With image2

1. Match the user's wording against the style document trigger keywords in `/Users/<user>/doubao/prompts/`, then read the matching style document. For example, use `木质板风-20260521.md` for wood-board, coffee-wall, VOGUE coffee-cup wording, and `快闪风格-20260521.md` for pop-up, vinyl-screen, neon-platform wording.
2. For each source image, call image2 with the source image as the precise reference.
3. Keep the prompt's non-negotiable constraints:
   - preserve product category, color, silhouette, collar, placket, buttons, cuffs, chest logo, fabric texture, drape, and wrinkles
   - strict front-facing crop
   - no face, no head, no neck, no chin
   - sealed collar interior
   - required props, background, and VOGUE text
   - no UI, watermark, tags, phone, or source ecommerce text
4. Save or copy the generated result to:

```text
/Users/<user>/Desktop/doubao-product-pipeline/<风格名>/<batch-id>/商品00N/生成图片/product-00N-generated.png
```

5. Keep the original generated image in its default image2 output location unless the user explicitly asks to delete it.
6. Update the batch manifest status to `image_generated`.

### 2. Review Generated Images

Before spending video quota, inspect the generated image. Reject or ask to retry if it has:

- visible face, head, neck, chin, or neck skin
- transparent, hollow, or black collar interior
- changed garment type, color, collar, buttons, cuffs, chest logo, or fit
- misspelled or drifting VOGUE text
- missing coffee cup, watch, pants, hands, or arms
- visible UI, watermark, source brand text, random text, tags, or phone

If acceptable, update the manifest status to `image_approved` or proceed directly to video when the user has already approved the batch.

### 3. Open Doubao

1. Open or focus Google Chrome.
2. Navigate to `https://www.doubao.com/chat/create-image`.
3. If the page is on a prior chat, click `AI 创作` or start a new creation page.
4. Confirm the AI creation panel is visible, with tabs such as `图像` and `视频`.

### 4. Generate the Video From the New Image

1. Return to `https://www.doubao.com/chat/create-image` or click `AI 创作`.
2. Select the `视频` tab.
3. Click `参考图` and upload the image2 generated still image from `商品00N/生成图片/product-00N-generated.png`, not the original source image, unless the user explicitly asks otherwise.
4. Choose the requested model if available. `Seedance 2.0 Fast` is the common default; use another model only if the user asks or the default fails repeatedly.
5. Set the video ratio to `9:16` for vertical short video.
6. Put the video prompt on the clipboard and paste it into the video prompt area with `super+v`.
7. Verify the reference thumbnail and Chinese prompt both appear in the submission card.
8. Submit and wait. Video generation often takes 1-3 minutes. Poll periodically and keep the user updated.

### 5. Download the Video

1. When the video appears, open the video preview or hover/click around it to reveal controls.
2. Click `保存`, `下载`, or the download icon/menu.
3. Confirm a video file landed in Downloads:

```bash
find /Users/<user>/Downloads -maxdepth 1 \( -name '*.mp4' -o -name '*.mov' -o -name '*.webm' \) -mmin -20 -print0 | xargs -0 ls -lt
file "/Users/<user>/Downloads/<generated-video>"
```

4. If working in a batch, copy or move the newly downloaded file to `商品00N/生成视频/product-00N-video.mp4`. If not in a batch, rename only the newly downloaded video if a clearer filename is useful, such as `男装商业短视频.mp4`.
5. Update the batch manifest status to `video_downloaded`.
6. Provide the absolute path and mention any visible generation caveats.

## Three Product Workflow

When the user provides three product images, prefer a staged batch:

1. Create `商品001`, `商品002`, and `商品003` under the dated Chinese batch folder. Each product gets its own artifact folder.
2. Put each original in its matching `商品00N/原商品图/`.
3. Generate and save all three images with image2 first.
4. Review all generated images together for product fidelity, no-head crop, logo text, props, and background consistency.
5. Only after image approval, generate the three videos from the approved generated images.
6. Download and archive each video before starting the next one.

This avoids spending video quota on a flawed generated image and makes style consistency easier to compare.

For concurrent work, do not use Computer Use as the primary multi-tab driver. Use the Chrome automation plugin to keep separate tab handles and states. Computer Use is single-focus and can type or click in the wrong place if several Doubao tabs are active.

## New Style Reference Handling

When the user provides a new AI style reference image, extract only transferable style facts:

- background material/color
- lighting direction and warmth
- logo text/font/position
- props and hand accessories
- crop and pose constraints

Do not transfer the reference image's garment identity, face/body identity, random text, watermark, or unintended UI. Keep the product-preservation prompt layer unchanged.

## Prompt Handling

- Preserve the user's prompt unless it is too long for Doubao or repeated failures suggest overload. If shortening, retain product identity, image ratio, front-facing constraints, motion constraints, negative terms, and no-watermark/no-UI requirements.
- For image-to-video, reference the generated image explicitly: `基于参考图生成竖版9:16...`.
- If Doubao corrupts text in the chat history, resubmit with clipboard paste. Do not proceed after a visibly corrupted prompt.
- If the model rejects or fails after a very long negative prompt, make a compact prompt that keeps the highest-risk constraints: no head/neck/face, strict front view, no product detail changes, no VOGUE drift, no UI/watermark, stable background.

## Failure Handling

- **Login or SMS verification:** pause and ask the user to complete or provide the code.
- **Service overload:** retry once, then start a fresh AI creation task with a shorter prompt. Tell the user if repeated failures occur and whether quota was deducted.
- **Prompt entered incorrectly:** clear the prompt area, repaste from clipboard, and visually verify before sending.
- **Download not found:** inspect Chrome downloads, check `/Users/<user>/Downloads`, and try the page save/download button again.
- **Wrong input image uploaded:** remove the thumbnail if possible and re-upload the correct file before submitting.
- **Generated quality is visibly wrong:** save the result only if the user asked for any output; otherwise, state the issue and offer to retry with stricter or shorter constraints.
