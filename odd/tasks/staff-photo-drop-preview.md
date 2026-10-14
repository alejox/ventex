# Staff photo drag and drop preview

## Outcome
New and edit staff forms accept dropped or selected PNG/JPEG/WebP photos and preview immediately during upload.

## Scope
- User authorizes local implementation; no remote publication, DB change or hardware operation.
- Reuse staff upload compression and post-conversion size limit; preserve existing photo on failure.
- Components delegate upload through staff store; no direct service I/O.
- Prevent duplicate uploads, stale callbacks and saving/closing while upload is pending; revoke object URLs.
- Route delegated direct: multi-file behavior and preparation trigger.
- Forecast 200–350 authored lines, advisory only. Delivery ask-on-risk; local feature branch only.
- RDD globally off; native assessment and independent verification apply.

## Tasks
- [x] T1 — Implement accessible drop/picker preview and safe upload lifecycle in shared staff photo field, staff store and parent modal; deterministic test-first and browser checks.
  - Allowed surfaces: components/StaffPhotoField.tsx; stores/staff.store.ts; app/dashboard/staff/page.tsx; lib/staff-photo.ts; tests/staff-photo.test.tsx.
  - Checks: focused RED/GREEN, existing logo/staff regressions, changed-source lint, typecheck, full unit suite, build, browser pending/success/failure/duplicates/unmount/modal guards, diff-check.
  - Commit: recorded in follow-up completion evidence commit.
  - Evidence: observed missing-helper RED; focused/regressions 20/20 GREEN, full 1002/1002, changed-source ESLint, standalone TypeScript, production build and diff-check passed. Independent focused 20/20, typecheck, diff-check and browser replay passed. Parent repeated focused photo tests.
  - Browser: real field/store/page/modal with deferred service, ancillary-store and Next Image mocks; picker/drop/keyboard, pending preview, success/failure, invalid/empty/large files, duplicate/disabled/remove, object URL cleanup/unmount, new/edit save/close/cancel/Escape/backdrop/delete guards, 390px no overflow. Independent verifier corrected backdrop event to actual mousedown handler; passed.
  - Limitations: no real Supabase persistence, compression integration, full Next/auth runtime or native mobile picker testing. Full lint known failing only ignored public/webs vendor assets; unchanged. Sandbox build stalled; approved outside-sandbox build passed.
  - Risk: native assessment high/unassessable untracked inventory; independent verification passed; RDD disabled/unmanaged.
  - Size: 282 authored source/test lines; no chain needed.
  - Rollback: revert this task commit to restore prior staff photo field and modal behavior without affecting printing.

## Next step
Local implementation and independent verification complete. Optional authenticated upload/native picker validation remains. No migration needed; storage API/schema unchanged. No publication authorized for this task.
