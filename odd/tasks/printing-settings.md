# Printing settings and configurable tickets

## Outcome
A dedicated Configuración → Impresión tab groups ticket customization, live preview, sample printing and device/drawer configuration. Preview and every sale print/reprint use the same renderer.

## Scope and decisions
- User explicitly authorizes implementation and delegates delivery choice; choose integrated feature-branch-chain, not independent main deliveries.
- Local feature branch starts at `5b45d58`, retaining earlier unpushed catalog/navigation/settings changes as prerequisites. No push/PR/merge authorized.
- Delivery: auto-chain with feature-branch-chain; slices T1 then T2, retaining integration until finished. Future PR creation needs separate authorization; keep each cohesive slice focused and record actual counts. Forecast 550–850 authored lines, advisory only; no code-golf.
- Ticket appearance tenant-wide in existing `business_profile.receiptSettings` JSON, no migration. Narrow save preserves unrelated settings and stale business-profile saves cannot overwrite newer ticket preferences.
- Paper width 58/80mm is per device, persisted through service/store; device IDs and permissions stay local in the existing drawer store.
- MVP: optional logo/business/contact/customer/cashier/seller fields, optional plain-text header/footer, live preview, visibly marked sample print. Defaults reproduce current receipt.
- Mandatory fiscal disclaimer, sale identity/date/offline state, items, discounts/totals/taxes/payment information remain; never edit monetary data or change frozen sale calculations.
- Browser/OS print dialog selects the physical printer. No silent permission bypass, hardware probing, sale creation for sample, or direct network I/O from components.
- Existing CashDrawerCard is reused only in Impresión, not General.
- RDD globally off; independent checks apply under native risk assessment.

## Tasks
- [x] T1 — Shared configurable receipt renderer and narrow tenant preference persistence.
  - Route: delegated direct (multi-file behavior and tests).
  - Source surfaces: components/PosReceipt.tsx; components/ReceiptContent.tsx; lib/receipt-settings.ts; services/settings.service.ts; stores/settings.store.ts; app/dashboard/settings/business/page.tsx; tests/receipt-settings.test.tsx; tests/receipt.test.tsx.
  - Acceptance: default receipt backwards-compatible; display preferences normalized safely; optional text escaped; required financial content unchanged; no profile key loss or stale-form preference reset; settings absent-row path supported.
  - Checks: deterministic normalization/render/persistence RED → GREEN, receipt/breakdown suites, lint/typecheck/full unit suite; independent verification; local commit.
  - Commit: follows completed T1 proof; identity added after commit. Slice T1 starts at 5b45d58.
  - Risk: high/unassessable inventory; independent verification passed. RDD disabled/unmanaged.
  - Evidence: meaningful missing-renderer RED → focused GREEN 22/22, full suite 993/993; lint/typecheck/diff-check passed. Independent receipt/settings 20/20 plus breakdown 8/8; parent repeated settings/render tests. 292 authored source/test lines.
  - API: ReceiptContent exported from PosReceipt (no separate file needed); settings/optional paperWidth props default to current display/80mm. Dedicated saveReceiptSettings service/store preserves profile data, lazy rows and ignores receiptSettings in stale ordinary business saves.
  - Limitations: existing simultaneous JSON read/merge/write races remain; authenticated persistence not tested. Browser preview/print isolation belongs to T2.
- [ ] T2 — Impresión tab, device paper width, shared preview/sample print and all sale print paths wired.
  - Route: delegated direct (multi-file UI/storage integration).
  - Source surfaces: services/print-settings.service.ts; stores/print-settings.store.ts; app/dashboard/settings/impresion/page.tsx; app/dashboard/settings/SettingsTabs.tsx; app/dashboard/settings/layout.tsx; app/dashboard/pos/page.tsx; app/dashboard/sales/page.tsx; components/PosReceipt.tsx; lib/receipt-settings.ts; tests/print-settings.test.ts; tests/receipt-settings.test.tsx; docs/guia-de-uso.md.
  - Acceptance: editor save/cancel preserves prefs; shared renderer previews sample; sample label and print-only isolation; paper width follows current device for preview/POS/reprints/history; drawer card reachable here; no receipt data mutations; permission guard inherited.
  - Checks: storage RED → GREEN; real-component browser interaction/print media 58/80mm/mobile, escaping/logo dimensions, fake print called without sale I/O; lint/typecheck/full suite/build; independent verification; local commit.
  - Commit/risk: pending.

## Progress
T1 complete and verified. Shared ReceiptContent renderer exported in existing file avoids unnecessary whole-file relocation. Financial/fiscal content remains unconditional; custom text React-escaped/capped; appearance persistence isolated from stale business forms.

## Next step
Commit T1, then implement T2 against its tested API. No remote operation authorized.
