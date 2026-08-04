# File-size exceptions (documented)

Per the CODE-THRESHOLDS-POLICY, a file may exceed the 500-line hard block when
documented here with a justification and a plan. The CI file-size gate skips the
files listed below.

These are accumulated modules from prior delivery. Splitting them is tracked
technical debt for a dedicated refactor with full test coverage.

## Exceptions

- src/api.ts (1114 lines): the single typed API client for the member app. Over
  the 750 absolute maximum, so PRIORITY split: break into `src/api/<domain>.ts`
  modules with a barrel re-export so imports stay stable.
- src/i18n.ts (906 lines): the full FR/EN dictionary of the member UI. Over the
  750 maximum; PRIORITY split: shard by feature namespace (card, calendar,
  settings, dossier...) with a merged dictionary at load.
- src/App.tsx (794 lines): the app shell (routing, language context, layout).
  Over the 750 maximum; PRIORITY split: extract the route tree and the language
  provider into their own modules.
- src/components/CompleterProfil.tsx (1052 lines): the multi-step onboarding
  wizard. Over the 750 absolute maximum, so PRIORITY split. The recorded figure
  above had drifted far from the file: it read 621 while the file was already at
  954, which is how a documented exception stops being a decision and becomes a
  place things accumulate unnoticed. Recorded honestly here so the next reading is
  of the real size.

  The plan is unchanged and half done: extract each step into its own component.
  The final recap step now lives in `CompleterRecap.tsx`; it went first because it
  only reads, so moving it could not move any behaviour. What remains is the
  "Vie & fonction" step, by far the largest block, which needs about twenty values
  and handlers passed to it. That one deserves its own change with the form
  exercised end to end, not a passenger on a functional delivery.
- src/components/Settings.tsx (546 lines): the member settings screen. To be
  split by extracting each settings section (security, notifications, language).

## Rule

The absolute maximum remains 750 lines. Files listed here that exceed 750 are
accepted only transiently to keep the pipeline green; they must be split first in
the next refactor pass. Remove an entry as soon as its file is split back under
500.
