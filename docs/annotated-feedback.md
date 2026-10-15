# Annotated answer display

Single line breaks display as spaces. A lone CRLF becomes two spaces to keep
highlight offsets identical. Consecutive breaks preserve paragraphs, counting
CRLF as one break. Stored answers, transcripts and marking input are unchanged;
selecting text for an editable comment still saves the original quote.

Strength cards and pills use the green success tokens; Fix cards and pills use
the red destructive tokens, including their soft backgrounds in both themes.
Pill text contrast against the card background is at least 4.76:1 in light mode
and 6.66:1 in dark mode.

On wide screens, All aligns margin cards with highlights and pushes overlapping
cards down. Strengths and Fixes stack cards from the top with normal list gaps.
Narrow screens keep the stacked list and tap-to-open comments.

Coverage: `src/components/annotated-feedback.test.tsx` tests break conversion,
offsets, paragraphs across highlight boundaries, original edit quotes, card
colours and switching between wide layouts. The existing `e2e/feedback.spec.ts`
requires a student account and database seeding; local placeholder-only checks
use component coverage rather than adding a production fixture route.
