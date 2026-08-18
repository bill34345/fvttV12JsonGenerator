# Design QA

## Comparison target

- source visual truth path: `design-qa-assets/source-target.png`
- implementation URL: `http://127.0.0.1:5173/`
- implementation screenshot: `design-qa-assets/implementation-linked-result.jpg`
- full-view comparison evidence: `design-qa-assets/comparison-source-implementation.jpg`

## Viewport and normalization

- source pixels: 1487 x 1058 at 96 dpi.
- implementation pixels: 1179 x 1113, CSS viewport 1179 x 1113, devicePixelRatio 1.
- comparison image: source and implementation are stacked at their native pixel sizes on a 1487 x 2219 canvas. The difference in aspect ratio is recorded and layout proportions, rather than pixel-identical placement, were compared.
- state: both images show an accepted desktop task with a staged rail, central evidence/result work area, artifact rail, and persistent action bar. The source shows a review problem; the implementation shows the accepted result because this pass validates the user-requested post-run source/result state.

## Findings

- Historical result: no actionable P0, P1, or P2 visual differences were recorded for the captured implementation state. This is not proof that later integration changes still pass visual QA.
- Fonts and typography: the compact Chinese sans-serif navigation, serif work-area headings, and monospace evidence/JSON panes preserve the selected direction. Text remains legible at the captured viewport and long source lines wrap inside their pane.
- Spacing and layout rhythm: the left stages, central working canvas, right artifact rail, and bottom command bar match the source hierarchy. The implementation intentionally gives more of the center to source/result content and removes duplicated standalone source, Markdown, and JSON views.
- Colors and visual tokens: navy header, warm neutral rails, blue provenance emphasis, green accepted state, and dark JSON surface are consistent with the source target and existing product tokens.
- Image and icon fidelity: neither state needs raster product imagery. Existing Radix icons are used consistently; no placeholder, emoji, CSS drawing, or handcrafted SVG was introduced.
- Copy and content: user-facing copy describes the unified automatic conversion entry, Foundry 14/core target, explicit AI consent, and formal artifact gates. Internal job types are no longer exposed as primary product choices.
- Accessibility and affordances: the work-area tabs are reduced to task input, source/result, review, and logs. The split divider has separator semantics and a label; source lines and pane controls are buttons with visible focus styles. Screenshot evidence cannot establish full screen-reader compliance.

## Focused evidence

- The full-view comparison was sufficient for hierarchy, typography, colors, pane proportions, and artifact state because both source and implementation controls remain readable in the combined image.
- Browser DOM checks confirmed the empty state contains only `任务输入 / 核对问题 / 运行日志`; after execution it adds one `来源 / 结果` view.
- Browser checks confirmed no page-level vertical overflow in the post-run state and independent visible scrollbars for long source and JSON content.

## Primary interactions tested

- Opened the simplified selector and confirmed one main conversion entry and a separate compatibility/tools section.
- Pasted a real standard Actor fixture; detection reported `标准 Actor Markdown / 直接转换 / 高置信度` and enabled execution.
- Executed that Actor through the formal Web conversion path with Foundry 14/core; the page transitioned from the single-column input view to the linked two-pane source/result view and exposed a downloadable accepted JSON.
- Pasted a real standard Item fixture; detection reported `标准 Item Markdown / 直接转换 / 高置信度`.
- Pasted a three-entry monster collection fixture; detection reported `怪物合集 / 3 条`.
- Pasted unstructured monster text; detection recommended AI Actor Intake but kept execution disabled because this machine has no configured AI provider and no consent could be granted.
- Pasted ambiguous text; detection returned `需要确认内容种类`, kept execution disabled, and displayed explicit Actor/Item override controls.
- Checked browser console warnings and errors: none.

## Comparison history

- Earlier implementation exposed separate `任务输入 / 来源证据 / 标准 Markdown / JSON 预览` tabs. The user identified these as duplicate views in single-file conversion. They were consolidated into a pre-run input state and one post-run source/result state.
- Earlier workflow selection exposed every backend `JobType` as a product card. It was replaced by one automatic conversion entry; Vault Sync, translation, crawling, and explicitly labelled compatibility tools remain separate because they represent different intent or side effects.
- The first automatic-routing implementation risked silently starting an AI route. It was changed so detection is read-only and AI Intake requires a visible, per-task consent checkbox; absent provider configuration keeps execution disabled.
- The historical browser comparison found no remaining P0/P1/P2 issue in navigation hierarchy, central utilization, scroll containment, typography, tokens, icons, or copy for its captured state. Re-run it after material UI changes.

## Follow-up polish

- P3: exact automatic source-range-to-JSON-field highlighting still requires a backend provenance mapping contract. The current linked line is user-selected and visual, not yet semantic field-level provenance.

## AI connection entry pass (2026-08-14)

- source visual truth path: `design-qa-assets/source-target.png` and the existing workbench direction shown in the prior comparison.
- implementation screenshot path: `design-qa-assets/ai-connections-entry.png`.
- combined comparison path: `design-qa-assets/comparison-ai-connections.png`.
- viewport: 1280 x 720 CSS pixels, devicePixelRatio 1; implementation screenshot is 1280 x 720 pixels. The source is 1487 x 1058 pixels, so the combined comparison uses native-size stacked panels and evaluates hierarchy/tokens rather than pixel-identical placement.
- state: desktop pre-run empty input with the AI connection drawer open; site provider and Codex Companion are visibly disabled by server capability, while the user API Key entry is available.
- full-view comparison evidence: the existing navy topbar, warm-neutral workbench rails, blue selected/interactive accents, compact serif work-area heading, and right-side operational panel remain consistent with the selected workbench direction.
- focused region comparison evidence: the drawer header, three connection cards, disabled capability states, refresh affordance, and security footer were inspected in the combined comparison. No raster product imagery was implied by the source; Radix icons were retained.
- primary interactions tested: opened the topbar AI connection button; verified the dialog label and close/backdrop controls; expanded and collapsed the user API Key form; verified required API Key disables submit; confirmed the three provider states and explicit “Foundry 14 / core” boundary copy; verified `/api/ai-connections` returns the current session overview.
- browser console: no warnings or errors observed during the checked state.

### Findings

- Historical result: no actionable P0, P1, or P2 visual differences were recorded for the AI connection entry screenshot. It does not cover the later remote-confirmation flow.
- P3: when site AI or Companion is enabled in deployment, the same cards will show live quota/connection diagnostics; this state was not available in the local capability configuration and is intentionally represented as disabled rather than mocked as ready.

## Acceptance boundary

This file is archived visual evidence for the screenshots named above. It is not a current “all checks passed” claim and does not replace a fresh browser acceptance run for this integration branch.
