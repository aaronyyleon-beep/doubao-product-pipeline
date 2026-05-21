# Style Extraction Template

Use this when the user provides a new AI-generated style reference image.

## Style Facts To Extract

```text
Reference style summary:
- Background:
- Lighting:
- Camera/crop:
- Logo/text treatment:
- Props:
- Hand accessories:
- Mood:
- Keep from product image:
- Do not transfer from style image:
```

## Prompt Patch Format

```text
Replace only the style/background/props layer with:
[precise style description]

Keep unchanged:
1:1 preserve the input garment category, color, fit, collar, placket, buttons, cuffs, pocket/chest logo position, fabric texture, natural wrinkles, no-head crop, front-facing pose, VOGUE placement, and product identity.

Negative additions:
[style-specific risks such as random text, watermark, face/head/neck, wrong props, wrong background, wrong logo spelling]
```
