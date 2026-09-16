# Accessibility

Phase 10. What standard the app is held to, how that is checked, what the check
found, what was changed, and what a machine cannot tell us.

---

## Standard

**WCAG 2.1 level AA**, on the web build (React Native Web, Expo SDK 56), for
every role. The accessibility floor in `DESIGN_SYSTEM.md` and section
"Accessibility floor" of `CLINICAL_SAFETY.md` still apply on top of it: colour
is reserved for clinical signal, and every signal also carries a shape and a
word.

The gate enforces:

| Area                               | Rule                                                                                                                                                     | How it fails                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Automated audit                    | axe-core tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`                                                                                                 | any **serious** or **critical** node; moderate/minor are printed as warnings |
| Names (4.1.2)                      | every visible button, link, tab, menu item, checkbox, radio, input has an accessible name                                                                | an unnamed control                                                           |
| Headings (1.3.1, 2.4.6)            | one visible level-1 heading per screen; no skipped levels on the way down                                                                                | missing h1 or a jump                                                         |
| Landmarks (1.3.1)                  | exactly one `main`; a `navigation` landmark around the sidebar when it is drawn                                                                          | count wrong                                                                  |
| Use of colour (1.4.1)              | SignalBadge, EsiBadge, News2Score and LabFlag carry visible words; SignalBadge carries its shape                                                         | a badge with colour only                                                     |
| Keyboard (2.1.1)                   | Tab reaches the primary action on login, register patient, record observations, dispense and generate bill                                               | not reached                                                                  |
| Focus visible (2.4.7)              | every Tab stop on those journeys has a computed outline, box-shadow, or (for inputs) the 2 px focus-colour field border                                  | a stop with none                                                             |
| Dialogs (2.1.2, 2.4.3)             | Select sheet, ConfirmDialog, offline review sheet: focus stays inside, Escape closes, focus returns to the trigger                                       | any of the three                                                             |
| Errors (3.3.1, 4.1.3)              | a failed sign-in is announced; invalid fields are `aria-invalid` and `aria-describedby` their message, which sits in a live region                       | not announced / not tied                                                     |
| Reflow (1.4.10) and resize (1.4.4) | at 320 CSS px (400% of 1280) and 640 CSS px (200%): no page-level horizontal scroll, and no text pushed off-screen outside a scroll container of its own | overflow or lost text                                                        |
| Motion (2.3.3)                     | with `prefers-reduced-motion: reduce`, a sheet opens with no CSS animation and loading skeletons do not pulse                                            | animation running                                                            |

---

## Method

`tools/verifyAccessibility.mjs` (API port 5205):

1. Boots the real API on `MongoMemoryReplSet` with its own throwaway secrets —
   never the `.env` credentials — and seeds through the API: one hospital, one
   user for each of the eight roles, plus a doctor outside a restricted
   patient's team and a user still on a temporary password. Data is chosen so
   list and detail screens render real content: patients with severe, moderate,
   none and never-recorded allergies; a booked appointment; a signed
   consultation with a prescription; a dispensed and a pending prescription; a
   reported blood count and a **critical potassium (7.1)**; an admission with a
   calm and an escalating set of observations; a triaged and an untriaged ED
   arrival; a break-glass grant; stock including a low-stock line; a draft bill
   and a finalised, paid bill with its receipt.
2. Serves `dist/` (or `HMS_DIST`), proxies `**/api/v1/**` to the API and
   aborts `**/socket.io/**`.
3. For each role it signs in, **reads the sidebar the role is actually shown**
   and visits every link, then the detail screens that role reaches — patient
   detail, medical record, consultation, bedside, admit, lab order, dispense,
   bill detail (draft and paid), receipt, outstanding, generate bill, ED arrival
   and visit, stock item, low stock, receive stock, user detail, create user.
   Signed out: login, forgot password, and the forced change-password screen.
   Every screen at **1400×1000** and **390×844**.
4. On each render: axe, then the structural checks above.
5. Keyboard journeys, dialog traps, reflow and reduced motion in their own
   sections. Screenshots are written only for failures (`docs/shots/a11y-*.png`).

Useful while iterating: `A11Y_ROLES=nurse,lab`, `A11Y_VIEWPORTS=phone`,
`A11Y_ONLY=keyboard,reflow`, `A11Y_JSON=out.json` (raw results for a diff).

---

## Results

### Coverage

48 distinct screens × 9 roles (eight roles plus signed out) × 2 viewports =
**182 audited renders**. The full screen × role matrix is printed at the end of
every run.

Phase 11 added two screens to the audit — _Roles & permissions_ and a nurse's
user page, which carries the ward allocation — and the admission requests panel
on the doctor's ward board. All pass with no violations; the idle-timeout
warning is a dialog and is covered by the dialog checks below.

### axe, serious and critical, before and after

Before is the build as it stood at the start of this phase (184 renders — the
doctor's sidebar then also listed Appointments, since removed by the
permission-matrix work).

| Rule                   | Impact   | Before: nodes (renders)           | After |
| ---------------------- | -------- | --------------------------------- | ----- |
| `aria-required-parent` | critical | 218 (50)                          | 0     |
| `aria-required-attr`   | critical | 196 (14)                          | 0     |
| `aria-prohibited-attr` | serious  | 42 (6)                            | 0     |
| `color-contrast`       | serious  | 15 (13)                           | 0     |
| `aria-allowed-attr`    | critical | 0 → 4 introduced mid-phase, fixed | 0     |
| `nested-interactive`   | serious  | 2 (2)                             | 0     |
| **Total**              |          | **473 nodes**                     | **0** |

After the fixes axe reports **no violations of any impact**, moderate and
minor included.

### Structure, before and after

| Problem                                      | Before (renders) | After |
| -------------------------------------------- | ---------------- | ----- |
| No `main` landmark                           | 184              | 0     |
| No visible level-1 heading                   | 156              | 0     |
| No navigation landmark around the sidebar    | 89               | 0     |
| Signal badge without its shape (expiry date) | 4                | 0     |
| Unnamed controls                             | 0                | 0     |

Clinical badges checked for words on every render they appeared in: SignalBadge
58, EsiBadge 28, News2Score 4, LabFlag 20 (per full run).

### Keyboard, dialogs, reflow, motion

| Check                                                                     | Before                                                                                     | After                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab reaches: login, register patient, record observations                 | reached                                                                                    | reached                                                                                                                                                                           |
| Tab reaches: dispense                                                     | **no** — the allergy tick could not be set with Space, so Confirm never enabled            | reached                                                                                                                                                                           |
| Tab reaches: generate bill                                                | reached (the before-run's seed left nothing to bill; fixed in the gate)                    | reached                                                                                                                                                                           |
| Focus visible on every stop                                               | failed only on inputs, whose ring is drawn on the field box — the check now reads it there | all stops                                                                                                                                                                         |
| Failed sign-in announced                                                  | yes                                                                                        | yes                                                                                                                                                                               |
| Field errors `aria-invalid` + `aria-describedby` + live                   | **no**                                                                                     | yes                                                                                                                                                                               |
| Select sheet / ConfirmDialog / offline review: trap, Escape, focus return | trap and Escape held (react-native-web's Modal); sheet backdrop was a nameless Tab stop    | all hold                                                                                                                                                                          |
| Reflow 320 / 640 on 10 key screens                                        | 2 failures at 320 (Register patient, Dispense: long subtitle ran off-screen)               | 20/20                                                                                                                                                                             |
| Reduced motion                                                            | not honoured (sheet fades, skeleton pulses)                                                | honoured: with `reduce`, 0 CSS animations as a sheet opens and skeleton opacity holds at 0.45; without it, 1 animation and opacity cycles 0.46–0.85 (so the check is not vacuous) |

---

## Fixes

Shared components first, so every screen benefits.

| File                                                                                                                                                                                                                                                                                                                                                                                     | Change                                                                                                                                                                                                                                                                                                         | WCAG                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `src/shared/ui/a11y.ts` (new)                                                                                                                                                                                                                                                                                                                                                            | `webAria()` for ARIA attributes react-native-web renders but RN does not type (`aria-describedby`, `-invalid`, `-level`, `-current`, `-pressed`, `-selected`, `-expanded`, `-haspopup`); `checkable()` sets `aria-checked` and toggles on **Space**                                                            | 4.1.2, 2.1.1         |
| `src/shared/ui/Text.tsx`                                                                                                                                                                                                                                                                                                                                                                 | `heading={1..4}` prop: role heading with `aria-level`, independent of visual variant                                                                                                                                                                                                                           | 1.3.1                |
| `src/shared/ui/Screen.tsx`                                                                                                                                                                                                                                                                                                                                                               | root is the `main` landmark; title is heading level 1; header text column may shrink so subtitles wrap at 320 px                                                                                                                                                                                               | 1.3.1, 2.4.6, 1.4.10 |
| `src/shared/ui/SectionHeader.tsx`                                                                                                                                                                                                                                                                                                                                                        | section title is heading level 2                                                                                                                                                                                                                                                                               | 1.3.1                |
| `src/shared/ui/TextField.tsx`                                                                                                                                                                                                                                                                                                                                                            | message gets an id; input carries `aria-describedby`, `aria-invalid`, `aria-required`; errors are `role=alert` + polite live region; asterisk hidden from AT                                                                                                                                                   | 1.3.1, 3.3.1, 4.1.3  |
| `src/shared/ui/Select.tsx`                                                                                                                                                                                                                                                                                                                                                               | placeholder contrast 3.06:1 → 5.9:1 (tertiary token); `aria-haspopup`, `aria-expanded`, error wiring; "Required" spoken at the end of the name (`aria-required` is not allowed on a button); options inside a `menu`; backdrop and sheet not Tab stops; sheet title is a heading; no fade under reduced motion | 1.4.3, 4.1.2, 2.3.3  |
| `src/shared/ui/ConfirmDialog.tsx`                                                                                                                                                                                                                                                                                                                                                        | title heading; backdrop not a Tab stop; no fade under reduced motion                                                                                                                                                                                                                                           | 2.4.3, 2.3.3         |
| `src/shared/ui/ClinicalAlert.tsx`                                                                                                                                                                                                                                                                                                                                                        | title heading; no fade under reduced motion (blocking behaviour untouched)                                                                                                                                                                                                                                     | 2.3.3                |
| `src/shared/ui/SearchInput.tsx`                                                                                                                                                                                                                                                                                                                                                          | visible 2 px focus ring, same as TextField                                                                                                                                                                                                                                                                     | 2.4.7                |
| `src/shared/ui/ChipsRow.tsx`                                                                                                                                                                                                                                                                                                                                                             | the row is a `tablist`; each tab has `aria-selected`                                                                                                                                                                                                                                                           | 1.3.1, 4.1.2         |
| `src/shared/ui/Pagination.tsx`, `DataTable.tsx`                                                                                                                                                                                                                                                                                                                                          | selected page size and sorted column use `aria-pressed` (not `aria-selected`, invalid on a button); sort direction spoken                                                                                                                                                                                      | 4.1.2                |
| `src/shared/ui/Skeleton.tsx`                                                                                                                                                                                                                                                                                                                                                             | no pulse under reduced motion                                                                                                                                                                                                                                                                                  | 2.3.3                |
| `src/shared/ui/Stack.tsx`                                                                                                                                                                                                                                                                                                                                                                | optional `role` (tablist, radiogroup, group, list)                                                                                                                                                                                                                                                             | 1.3.1                |
| `src/navigation/Sidebar.tsx`                                                                                                                                                                                                                                                                                                                                                             | `navigation` landmark named "Main navigation"; current page is `aria-current="page"`                                                                                                                                                                                                                           | 1.3.1, 4.1.2         |
| `src/shared/offline/OfflineStatusBar.tsx`                                                                                                                                                                                                                                                                                                                                                | review sheet title heading; no fade under reduced motion                                                                                                                                                                                                                                                       | 2.3.3                |
| `src/modules/auth/screens/LoginScreen.tsx`, `ForgotPasswordScreen.tsx`, `ChangePasswordScreen.tsx`                                                                                                                                                                                                                                                                                       | `main` landmark and level-1 heading (these screens do not use `Screen`)                                                                                                                                                                                                                                        | 1.3.1                |
| `src/modules/reports/components/FilterChip.tsx`                                                                                                                                                                                                                                                                                                                                          | tab chips `aria-selected`; switch chips `checkable`                                                                                                                                                                                                                                                            | 4.1.2                |
| `src/modules/reports/screens/ReportsScreen.tsx`, `src/modules/audit/screens/AuditTrailScreen.tsx`                                                                                                                                                                                                                                                                                        | chip rows are named tablists; the "Emergency access only" switch moved out of the outcome tablist                                                                                                                                                                                                              | 1.3.1                |
| `src/modules/emergency/components/Choices.tsx`, `inpatient/components/ObservationForm.tsx`, `billing/screens/BillDetailScreen.tsx`, `inventory/screens/IssueStockScreen.tsx`, `laboratory/components/OrderTestsPanel.tsx`, `laboratory/components/ResultEntryForm.tsx`, `laboratory/screens/LabOrderScreen.tsx`, `pharmacy/screens/DispenseScreen.tsx`, `admin/components/ToggleRow.tsx` | every checkbox and radio: `checked` (not `selected`) state, `aria-checked` on the web, Space toggles                                                                                                                                                                                                           | 4.1.2, 2.1.1         |
| `src/modules/emergency/screens/EmergencyBoardScreen.tsx`                                                                                                                                                                                                                                                                                                                                 | ambulance icon is decorative (the words beside it say "Ambulance"); its label had landed on every SVG `<path>`                                                                                                                                                                                                 | 4.1.2                |
| `src/modules/laboratory/screens/LabResultsScreen.tsx`                                                                                                                                                                                                                                                                                                                                    | a result row with a "Reviewed" button is two controls side by side, not a button inside a button                                                                                                                                                                                                               | 4.1.2                |
| `src/modules/inventory/components/StockBadges.tsx`                                                                                                                                                                                                                                                                                                                                       | the in-date expiry badge keeps its circle shape; a green date alone said "fine" in colour only                                                                                                                                                                                                                 | 1.4.1                |

No colour token was changed, no test ID or visible wording other gates depend
on was renamed, and no business logic moved. The one visible change besides
focus rings is the Select placeholder, which now uses the tertiary text colour.

### Why so many "critical" findings came from a few causes

- **react-native-web ignores `accessibilityState`** — `checked`, `selected` and
  `expanded` never reached the DOM. Every checkbox and radio in the app was
  announced with no state (196 nodes), including the pharmacist's allergy
  acknowledgement. `checkable()` and `webAria()` exist for this.
- **Tabs without a tablist** (218 nodes) came from one component, ChipsRow,
  plus FilterChip's rows.
- **react-native-web activates Space only on `role="button"`**, so checkboxes
  could be ticked with Enter but not Space, the key every web checkbox uses.

---

## Known remaining issues

| Issue                                                                                         | Why it stays for now                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus trapping, Escape and focus return rely on react-native-web's `Modal`.                   | Verified by the gate on all three dialog types; re-implementing it would add risk for no measured gain. `ClinicalAlert` at the critical tier deliberately ignores Escape (no escape hatch, `CLINICAL_SAFETY.md` §4) — correct behaviour, not a trap bug. |
| Desktop control heights are 32–40 px, below 44 px.                                            | WCAG 2.1 AA does not require 2.5.5 (that is AAA). Phone sizes are never below 44 px (`Button` PHONE table), which is where gloved use happens.                                                                                                           |
| Horizontally scrolling chip rows and wide tables on phones scroll inside their own container. | Permitted by 1.4.10 for content that needs two-dimensional layout; the page itself does not scroll sideways.                                                                                                                                             |
| Radio chip groups are not wrapped in a named `radiogroup`.                                    | Each radio is named and states its checked state; `Stack role="radiogroup"` is available for screens to adopt.                                                                                                                                           |
| The native (iOS/Android) builds are not covered by the gate.                                  | The props used (`accessibilityRole`, `accessibilityState`, `accessibilityLabel`, `accessibilityHint`, `accessibilityLiveRegion`) are the native ones; `webAria`/`checkable` return nothing on native. Needs a device pass (below).                       |
| Colour contrast is checked on the light theme only.                                           | `darkPalette`/`darkSignal` are not yet switchable in the app. Run the gate against them when they are.                                                                                                                                                   |
| Printed documents (wristband, labels, prescription) are outside this audit.                   | They are print artefacts with their own gate (`verifyPrinting.mjs`); the allergy strip is never blank (§26).                                                                                                                                             |

---

## Manual checks still recommended

Automated tools find roughly a third to a half of real accessibility problems.
Before release, a person should do:

1. **NVDA + Chrome and JAWS + Edge (Windows)** — sign in; register a patient
   with a deliberate error; open the patient banner and confirm it reads name,
   ID, age, sex, allergies in that order; the pharmacy dispense flow, confirming
   the allergy tick announces "checked"; a critical `ClinicalAlert` override
   with its reason field.
2. **VoiceOver + Safari (macOS and iPad)** — the ward board and bedside chart
   by rotor headings; record observations; the NEWS2 score and escalation
   banner announced as they appear.
3. **TalkBack (Android tablet, native build)** — the drug round and nursing
   note with a gloved hand at 200% system font; confirm no clipped metric tile.
4. **Keyboard only, no mouse** — a full shift: login → My ward → bedside →
   observations → handover → sign out. Watch for focus lost after a screen
   change (the gate checks journeys, not every navigation).
5. **Windows High Contrast / forced colours** — signal badges keep their
   shape and words; focus rings remain visible.
6. **Browser zoom 200% and 400% on a 1280 px laptop** across screens beyond the
   ten in the reflow list, especially Reports charts and the bed board.
7. **Cognitive load review** with a nurse and a pharmacist — alert wording,
   error messages and the order of the patient banner.
