# Slice A — Home and Activity

## Files changed

- `src/app/(app)/student/page.tsx`
- `src/app/(app)/student/quick-start.test.tsx`
- `src/app/(app)/student/loading.tsx`
- `src/app/(app)/student/activity/page.tsx`
- `src/app/(app)/student/activity/loading.tsx`
- `src/app/(app)/student/activity/error.tsx`
- `src/app/(app)/student/activity/[id]/page.tsx`
- `src/app/(app)/student/activity/[id]/loading.tsx`
- `src/components/activity-browser.tsx`
- `src/components/activity-browser.test.tsx`
- `src/components/session-list.tsx`
- `src/components/student/activity/filter-controls.tsx` (private)
- `src/components/student/activity/session-icon.tsx` (private)
- `src/components/student/activity/session-table.tsx` (private)
- `SLICE-REPORT-A.md`

## Template alignment

Read the STEP 1 report, the prototype Home/Activity rendering functions, foundation components, and installed Next.js guides for server/client components, streaming loading states, and error boundaries before implementation.

Home now uses the foundation page header and compact term indicator, pill actions, four small launch cards with muted icon tiles, and the template's wide Topics / narrow Study days arrangement. Cards stack at mobile sizes, use two columns at small tablet sizes, and four launch columns plus the asymmetric content grid at desktop sizes. The due count receives the template's prominent numerical typography. Topics use numbered circles, separated rows and pill-shaped practice affordances. Existing welcome checks, keyboard shortcut, due-card loader, heatmap, streak loaders, topic loader and all existing launch URLs are preserved. The existing accessible Study hub region name is retained with a visible Topics heading.

Activity now has the template header, a single bordered history panel, horizontally scrollable kind segments, search beside the segments when space permits, and a muted filter row. Private controls retain the GET form's field names, values, auto-submit behavior, Apply action, labels, query preservation, clear action, and custom/exact-date handling. No shared filter component was edited.

The private session table separates session, topic, result, duration, date and open indication. Results use foundation meters; icon tiles and solid row separators follow the template. Mobile shows session and result; date appears from `sm`, topic from `lg`, and duration from `xl`. Newest-first history is grouped by Sydney calendar date, with grouping disabled for other sorts. Topic subtitles are extracted only from the existing generated session title. Scores use the existing score formatter and keep study/pending/provisional semantics. Duration is derived from existing elapsed seconds and rounded up to minutes. Row and title navigation, accessible full session names, Date sort control and existing server pagination remain intact.

SessionList keeps its exported API and canonical URLs while adopting muted icon tiles, compact text, solid dividers and plain numerical results. Activity detail keeps every loader, auth check, redirect, child component contract and action, using the foundation header and consistent spacing around existing results/marking components. Loading layouts reflect the revised content instead of showing unsupported summary cards. Error retry behavior is unchanged.

## Data omissions and deliberate differences

The Home loader supplies due cards, topics, study days and streaks. It does not supply marked-answer totals, study duration, weekly averages, previous-period comparisons, targets, per-type results, topic mastery/answer counts/last-practised dates, marks dropped, recent sessions, exam countdown or an individualized plan. Those prototype-only sections and values are omitted; existing launch cards provide real actions in the small-card grid. No additional data queries, sample statistics or fabricated charts were introduced.

The template's inline Ask Claro panel is omitted; the foundation shell already supplies Ask Claro. The existing shared heatmap is reused unchanged, including its real activity links, keyboard navigation, wording and paging.

Activity does not load a separate unfiltered set of unfinished sessions or expose discard/finish actions in this list. Prototype resume banners are therefore omitted; unfinished rows retain their existing canonical runner links. The RPC supplies percentage and answered/item counts, not raw earned/available marks, so percentage results are shown without invented mark fractions. Study sessions retain their existing no-score representation. Topic is derived from the title only when a known session label prefixes it; otherwise no topic is inferred. Existing Previous/Next pagination is retained instead of introducing prototype Load more behavior. Existing filter option wording and accessibility labels remain available.

## Wanted shared-component changes

Optional follow-up, outside this slice's ownership:

- `src/components/activity-heatmap.tsx`: add opt-in home heading/description props so callers can request “Study days” and “Consistency is the cheat code.” while keeping current defaults for other consumers. The shared component currently hardcodes different copy.
- `src/components/activity-heatmap.tsx`: add an opt-in template home statistics layout with evenly spaced columns, 22px figures, labels below, and a flame beside the current streak. Preserve existing keyboard navigation, tooltips, day links, resize logic, error handling and default API. This would close the remaining heatmap presentation differences without CSS overrides in callers.

No shared file, data-layer file, dependency, stylesheet, environment file or other slice's file was edited.

## Validation

All heavy checks ran through `Q_MIN_GB=3 q-run`. Vitest used only synthetic public CI environment values from the existing CI configuration; database access in the selected suites is mocked.

- Whole-project `npx tsc --noEmit`: PASS.
- ESLint on all changed TypeScript files and private components: PASS.
- Prettier write and check on all changed files: PASS.
- Targeted Vitest: PASS, 5 files / 32 tests:
  - Home page and quick-start suites.
  - Activity detail page suite.
  - ActivityBrowser suite (including new GET field preservation, relative-range clearing, result layout, sort grouping and Sydney midnight coverage).
  - SessionList suite.
- Searched repository test imports of changed components; ActivityBrowser and SessionList direct consumer suites are included above, including Activity loading/error checks.
- `git diff --check`: PASS.

No dev server, Next build, Playwright, production service calls, push, PR or merge was run. Responsive behavior is implemented using the template breakpoints and checked in code; screenshots/browser rendering were not run under this slice's explicit command restrictions.
