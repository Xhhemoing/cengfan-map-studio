# Material Library and Font System Implementation Plan

## Goal

完善素材库，增加按省份上传素材并选择素材的功能（可选自动抠图）；增加自定义字体上传和应用功能；素材库和字体选择实时预览于画板。

## User Requirements

1. 素材库以省份为单位上传地图图片，可选自动抠图并保存
2. 素材库板块可方便选择素材、纯色和系统默认
3. 素材库可上传自定义字体
4. 文本框可自定义选择字体颜色和字体类型
5. 数据框可统一选择字体颜色和字体类型
6. 素材库要求能方便地进行预览，修改实时运用于画板

## Architecture Decisions

### Asset Management
- Province texture upload workflow: province selection → upload image → optional background removal → save to user assets with provinceIds
- Matting (background removal) is opt-in via checkbox, processed client-side or through backend API
- User assets persist in localStorage with provinceIds metadata for filtering
- System default regional features remain available alongside user uploads

### Font Management  
- Font infrastructure (`src/lib/fonts.ts`) already exists with `UserFont`, `loadUserFonts`, `buildFontFaceCss`
- Text elements: individual `fontId` field on `CanvasText`
- Card data blocks: `fieldFonts` map (title/name/university/city → fontId) on `CardSettings`
- Font-face CSS embedded in SVG `<defs>` for export consistency

### Live Preview
- AssetPanel callbacks commit transactions immediately
- InspectorPanel patches route through scene transactions
- PosterCanvas already reactively renders from project state

## Task 1: Province texture upload workflow in AssetPanel

**Acceptance**
- AssetPanel shows province selector dropdown (all valid map provinces)
- "上传省份贴图" button opens file picker with optional "自动抠图" checkbox
- Uploaded province texture saves to user assets with `provinceIds: [selectedProvince]`
- Upload immediately applies texture to selected province via transaction
- User can toggle matting checkbox; when enabled, trigger background removal before save
  
**Implementation**
- Add `selectedProvince` state to AssetPanel (dropdown prepopulated from normalizeMapFeatures)
- Add `enableMatting` checkbox state
- Modify upload handler: when `enableMatting` is true, call `removeBackground(dataURL)` helper before creating user asset
- `removeBackground` can be client-side (canvas-based chroma key for simple cases) or fetch to backend `/api/remove-background`
- After upload, emit `onApplyProvinceTexture(province, asset)` callback that commits a province appearance transaction

**Verification**
- AssetPanel.test: upload province texture with provinceIds, verify callback
- Manual browser check: upload texture → see it on map instantly

## Task 2: Background removal integration

**Acceptance**
- When matting checkbox is enabled, uploaded image is processed to remove solid backgrounds
- Processed image remains a data URL and saves to user assets
- Failed matting gracefully falls back to original image with user notification

**Implementation**
- Create `src/lib/background-removal.ts` with `removeBackground(src: string): Promise<string>`
- Client-side approach: use canvas to detect dominant background color (corners) and replace with transparent
- Alternative: fetch to backend endpoint with multipart/form-data if server has rembg or similar
- Show loading indicator during processing; catch errors and notify user

**Verification**
- Unit test: mock canvas API, verify transparent pixels
- Integration test: upload with matting enabled, check result has transparency
- Manual check: upload photo with solid background, enable matting, verify transparency

## Task 3: Font upload and storage

**Acceptance**
- AssetPanel "上传字体" button accepts .ttf, .otf, .woff, .woff2 files
- Uploaded fonts persist to localStorage via `saveUserFonts`
- Font list displays built-in + user fonts
- Fonts embed in SVG exports via `buildFontFaceCss` in PosterCanvas `<defs>`

**Implementation**
- Add font upload button and handler to AssetPanel
- Call `createUserFont({ label, src, format })` and `saveUserFonts`
- Load `userFonts` state in App.tsx, pass to AssetPanel, InspectorPanel, PosterCanvas
- PosterCanvas: add `<defs><style>{buildFontFaceCss(userFonts)}</style></defs>` before layers
- TextLayer/card rendering: apply `fontFamily` style from `resolveFontFamily(fontId, userFonts)`

**Verification**
- Unit test: upload font, verify localStorage
- Rendering test: set text fontId, verify SVG `font-family` attribute
- Export test: SVG contains `@font-face` with data URL

## Task 4: Text element font selection in TextInspector

**Acceptance**
- TextInspector shows font dropdown (built-in + user fonts)
- Selecting a font updates `text.fontId` field
- Live preview: text renders with selected font immediately
- Existing color picker remains functional

**Implementation**
- Extend `CanvasText` interface with optional `fontId?: string` field
- Add migration in `normalizeText`: preserve existing fontId, default to undefined (inherit)
- TextInspector: add `<select>` for font, options from `listFonts(userFonts)`
- TextLayer: apply `fontFamily={resolveFontFamily(text.fontId, userFonts)}` to `<text>` element
- Pass `userFonts` prop from App → InspectorPanel → TextInspector

**Verification**
- TextInspector.test: render with fonts list, select font, verify patch callback
- TextLayer.test: render text with fontId, verify font-family attribute
- Browser check: change text font, see font change on canvas

## Task 5: Card field fonts in CardsInspector

**Acceptance**
- CardsInspector shows "字段字体" section with dropdowns for title, name, university, city
- Each field can select a different font or inherit default
- Card title and student rows render with their configured fonts
- Existing unified `fontSize` and `textColor` remain functional

**Implementation**
- `CardSettings.fieldFonts` already declared as `Partial<Record<CardFontField, string>>`
- CardsInspector: add font dropdowns for each `CardFontField`
- PosterCanvas card rendering (lines 312-318): wrap title/count/student text in `<tspan>` with `fontFamily={resolveFontFamily(fieldFonts?.title, userFonts)}`
- Pass `userFonts` from App → PosterCanvas

**Verification**
- CardsInspector.test: patch fieldFonts, verify transaction
- PosterCanvas.test: render cards with fieldFonts, verify font-family on SVG text/tspan
- Browser check: set different fonts for title vs student rows, see difference

## Task 6: Reorganize AssetPanel UI for province-first workflow

**Acceptance**
- AssetPanel layout: fixed header + province selector, then scrolling sections
- Sections: 省份素材 (province texture upload + default features), 画布背景, 地标和装饰, 自定义字体, 已应用元素
- Province texture section shows system default features for selected province + upload button
- Clicking default feature applies it to selected province and switches inspector to that province
- No duplicate province controls in both AssetPanel and ProvinceInspector

**Implementation**
- Refactor AssetPanel: add province dropdown at top (nullable, label "选择省份")
- When province selected: show province texture section with filtered `listSystemAssets().filter(asset => asset.provinceIds.includes(selectedProvince))`
- Add "上传省份贴图" button in province section
- Move global background/landmark/decoration sections below
- Add "自定义字体" section with upload button + font list preview

**Verification**
- AssetPanel.appearance.test: verify no duplicate province controls
- AssetPanel.test: select province, upload texture, verify callback
- Browser check: layout scrolls correctly, province section visible when province selected

## Task 7: Live preview and persistence

**Acceptance**
- All asset/font changes commit transactions immediately
- Undo/redo works for asset and font changes
- Save/restore preserves user fonts and province textures
- Template export includes font references

**Implementation**
- Ensure all AssetPanel callbacks use `commitProject(applyTransaction(...))`
- Font upload triggers transaction to update userFonts state in App
- Project persistence already handles `textElements[].fontId` and `cards.fieldFonts`
- User fonts saved separately in localStorage (already implemented in `fonts.ts`)

**Verification**
- Integration test: upload font → set text font → save → restore → verify font applied
- Integration test: upload province texture → undo → verify texture removed
- Browser check: make changes, refresh page, verify persistence

## Task 8: Background removal helper

**Implementation Details**

### Client-side (simple chroma key)
```typescript
// src/lib/background-removal.ts
export async function removeBackground(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Sample corner pixels to detect background color
  const samples = [
    [0, 0], [canvas.width - 1, 0], 
    [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]
  ];
  const bgColor = detectDominantColor(imageData, samples);
  
  // Replace similar pixels with transparent
  for (let i = 0; i < data.length; i += 4) {
    if (colorDistance(data[i], data[i+1], data[i+2], bgColor) < 40) {
      data[i + 3] = 0; // Make transparent
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
```

### Server-side (if backend available)
```typescript
export async function removeBackgroundServer(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  
  const response = await fetch('/api/remove-background', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) throw new Error('Matting failed');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

## Dependencies

- Task 1 → Task 6 (province workflow first, then UI reorganization)
- Task 3 → Task 4, Task 5 (font storage before use)
- Task 2 is parallel to Task 1 (can implement stub initially)
- Task 7 integrates all previous tasks
- Task 8 is a helper for Task 2

## Implementation Order

1. Task 3 (font upload + storage) — foundational
2. Task 4 (text font selection) — validate font system works
3. Task 5 (card field fonts) — complete font feature
4. Task 1 (province texture upload workflow) — core asset workflow
5. Task 2 (background removal) — enhancement to Task 1
6. Task 6 (AssetPanel UI reorganization) — polish UX
7. Task 7 (persistence and live preview) — integration
8. Task 8 (background removal helper) — implementation detail for Task 2

## Success Criteria

- Upload custom font → set text font → see font change on canvas → export SVG contains @font-face
- Select province → upload texture (optional matting) → texture appears on map instantly
- Set different fonts for card title vs student rows → visible on canvas
- All changes persist across page refresh
- Undo/redo works for all asset and font operations
