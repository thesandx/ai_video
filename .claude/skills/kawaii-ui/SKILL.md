---
name: kawaii-ui
description: 'The design system for this repository: Airtable Marketing DS, "Playroom Kawaii" variant, ported from the Playroom games application. Colour, type, shape, motion, copy voice and accessibility rules, plus the component inventory to reuse before building anything new. USE WHEN writing or changing ANY user-facing UI here: a new page or route, a new component, restyling an existing one, adding a form, a card, a result panel, or reviewing a diff that touches app/, components/ or styles/. DO NOT USE FOR non-visual work, resolvers in services/, pure helpers in lib/, docs, or CI config.'
---

# Kawaii UI

The design system this application is built to. It is the **Airtable Marketing Design System**, in a
variant the source design calls **Playroom Kawaii**. It was ported from the Playroom games
repository so both products read as one family. Source of truth for the tokens is
[`styles/globals.css`](../../../styles/globals.css).

Read [`references/tokens.md`](references/tokens.md) for the full token table and component inventory.

## How to make UI in this style, in one paragraph

Start from a white canvas. Put the thing that matters inside a card with a **2px near-black border**
and a **20px radius**, and give that card a flat pastel fill when it needs to stand apart. Set every
heading in the display face at **weight 400**, and keep body copy at **14px**. Make the primary
button a **near-black pill**. Then stop: no shadow, no gradient, no blur, no hover effect, no emoji.
The character comes from the thick outline, the round corner and the flat pastel, not from depth.

## Before you write anything

1. **Reuse before you build.** Check `components/ui/` first. There is already a Button, ButtonLink,
   TextInput, Card, Chip and Callout. A second button is a bug, not a component.
2. **Never write a raw hex value.** Every colour comes from a token, so the palette stays swappable
   from one file. `bg-ink-1`, not `bg-[#181d26]`.
3. **Mobile-first.** Unprefixed utilities are the phone layout; `sm:`/`md:`/`lg:` enhance upward,
   never the reverse. Verify at 320px. Touch targets 44px and above.

## Colour

Six rules, and the first two are the ones people get wrong.

- **The CTA fill is near-black `ink-1`. It is never the link blue.** `link` (`#1b61c9`) is a _text_
  colour only. Treating it as a button colour is the single most common misreading of this system.
- **The signature palette and pastels are whole-card surfaces.** `coral`, `forest`, `cream`, `peach`,
  `mint`, `yellow`, `mustard` fill an entire card or band. They are not small accents, not borders,
  not icon tints.
  (This product has one deliberate exception, and it mirrors how Playroom treats game pieces: a
  **shot chip** in the shot list carries a pastel fill to separate one shot from the next. Shots are
  countable objects in a sequence, not accents on a page. They are the only exception.)
- **At most two non-white surface colours per band sequence.** Bands alternate: white, signature,
  white, cream. Two consecutive white bands read as a typography blog. Two consecutive coloured
  bands break the pacing.
- **Backgrounds are flat colour, always.** No gradients, no mesh, no aurora, no spotlight, no noise,
  no texture, no photographic backgrounds.
- **No transparency or blur.** No glassmorphism, no translucent overlays, no backdrop blur. Type on a
  coloured surface uses full-opacity white; the only alpha in the system is `opacity-85` on
  signature-card eyebrow labels.
- **Semantic colour is separate from the palette.** `success` for a completed analysis, `coral` for
  errors.

### Which surface for which panel

This product has a fixed vocabulary. Follow it rather than picking a colour per screen.

| Surface  | Carries                                                  |
| -------- | -------------------------------------------------------- |
| `white`  | The default card: forms, inputs, neutral result panels   |
| `cream`  | Explanatory callouts, the "how this works" band, notices |
| `mint`   | The hook analysis, and any state that reads as ready     |
| `peach`  | The shot list card                                       |
| `yellow` | The creative brief, the part the reader acts on          |
| `forest` | The finished script panel, the payoff of the whole page  |
| `coral`  | Errors, and the closing call to action band              |

## Type

- **Display type runs at weight 400, 500 at the largest sizes only.** A 40px heading is not bold.
  Pushing display type to 600/700 is the fastest way to make this look like a generic SaaS template.
  Emphasis comes from size, colour contrast and signature surfaces.
- **Body copy holds at 14px/400 everywhere**: heroes, cards, nav, footer. There is no second body
  size. Weight 500 marks sub-titles, labels and buttons.
- `font-display` for headings and for numerals that label a shot or a timecode; `font-text` for
  everything else.
- **Huninn ships a single weight (400).** Every 500 you see is browser-synthesised. That is the source
  system's documented behaviour, not a defect to fix.
- Headings get `text-wrap: balance`. Running text stays near 65 characters.
- **Sentence case everywhere**: headings, buttons, nav, card titles. The only uppercase is the small
  tracked eyebrow label on signature cards.
- Use `tabular-nums` on timecodes so the columns line up.

## Shape: where the Kawaii variant departs

The base Airtable system specifies 1px hairlines, 10/12/6px radii, and explicitly no 2px borders.
**This variant overrides that**, and the override is the whole character of the app:

|               | Base DS      | Playroom Kawaii (use this)                       |
| ------------- | ------------ | ------------------------------------------------ |
| Card radius   | 10-12px      | **20px** (`rounded-card`)                        |
| Button radius | 12px         | **999px** (`rounded-pill`)                       |
| Input radius  | 6px          | **14px** (`rounded-input`)                       |
| Borders       | 1px hairline | **2px `ink-1`** on cards, buttons, inputs, chips |

Keep 1px `hairline` for dividers, table rules and section separators only. Everything that reads as an
object gets the 2px ink outline.

**Not everything is a card.** Border, fill, radius and shadow each say "separate object". Spend them
by role, lifting the one thing that needs it, rather than stamping one treatment on every block.

## Elevation, state and motion

- **No shadows on cards. Ever.** There is no elevation ladder. Contrast against the white canvas _is_
  the elevation.
- **No hover styling.** The source's no-hover policy is deliberate and components honour it. There is
  default, and there is active/pressed. Press darkens: `ink-1` to `ink-press`, `link` to
  `link-active`. No lift, no scale, no shadow change.
- **Focus is a 2px `blue-400` ring**, offset 2px. It is already set globally on `:focus-visible`.
- **Motion: 120-180ms colour and border transitions on `--ease-standard`, and nothing else.** No
  entrance animations, no scroll reveals, no parallax, no spring easing. Adding any is a decision to
  confirm with the user, not a gap to fill.
- A long analysis run shows its state in **words**, not a spinner animation. Say what is happening:
  "Reading the video", "Writing the script".

## Copy

Words are design material here, and the voice is specific.

- Declarative and matter-of-fact. Concrete, bounded claims. No hype adjectives, no exclamation marks.
- Second person for the reader ("your brief"), third for the product.
- **Buttons are verb-first and short**: "Analyse the reel", "Copy the script", "Start again". Never
  "Learn more" as a primary action. Never "Submit".
- Errors say what went wrong and how to fix it. No apologies, no vagueness. Write them as
  reader-facing English: _"Instagram refused the download. Add a session cookie, or upload the file."_
- **No emoji. Anywhere.** Not in copy, not as icons, not in headings.
- **No em dashes or en dashes, ever** (U+2014, U+2013). A comma for an aside, a colon for an
  explanation, a full stop for two statements that stand alone, a hyphen for a range. See
  [`CLAUDE.md`](../../../CLAUDE.md).
- Numerals for all figures. Oxford comma.

## Accessibility: patterns to follow

- **State is never carried by colour alone.** A shot chip prints its number; a failed step prints the
  word "failed" beside any colour change.
- **Right ARIA for the role.** A toggle uses `aria-pressed`; a tab uses `aria-selected`. Never both.
- **Use the platform.** Reach for a native `<dialog>`, `<details>` or `<table>` before a library.
- **Real labels, always.** A placeholder is not a label. It vanishes on typing and leaves an unnamed
  input.
- **Navigation is an anchor, actions are buttons.** Never nest one in the other. `ButtonLink` exists
  so a link can look like a button without becoming one.
- **Tabular data is a table.** The shot list is a `<table>` because rows and columns carry meaning.
- **Announce what changes.** Analysis progress and errors sit in `aria-live` regions.
- Respect `prefers-reduced-motion`: already handled globally.

## Layout

- Content sits in a `max-w-[1120px]` container with `px-5` inset.
- Nothing is fixed or sticky. The header scrolls with the page.
- Lay out sibling groups with flex/grid and `gap`, not per-element margins.
- Wide content, tables, code and long rows scroll inside their own `overflow-x-auto` container. The
  page body never scrolls sideways.
- Use `tabular-nums` wherever digits line up in columns.

## Theme

**This design commits to a single light look**: white canvas, dark ink type. The source system
documents no dark palette, so the template's automatic dark mode was removed rather than invented.
Do not add one without being asked; if asked, add tokens for every colour rather than inverting.

## Traps

Real failures from building this, not speculation.

- **A `*` followed by `/` inside a CSS comment ends it early.** Writing a glob path in a comment in
  `globals.css` terminates the comment and leaks the rest as broken CSS. The build error points at
  `@theme`, twenty lines away.
- **`next/font` has no metrics for Huninn.** Every build logs `Failed to find font override values`.
  It is expected and documented in `app/layout.tsx`.
- **Tailwind v4 generates utilities from `@theme` token names.** `--color-x` gives `bg-x`/`text-x`/
  `border-x`; `--radius-x` gives `rounded-x`. A colour token alone does not set a border _width_.
  `border-hairline` needs `border` or `border-b` beside it.
- **Client components are server-rendered first.** Reading `window` at render time crashes the build.
  Put it in an event handler or an effect.

## Checklist before you call UI work done

- [ ] Every colour is a token; no raw hex
- [ ] CTA fill is `ink-1`, not link blue
- [ ] Signature colours used as whole surfaces only
- [ ] Display type at 400/500; body at 14px
- [ ] 2px ink borders on objects; 1px hairline on dividers
- [ ] No shadows, no gradients, no blur, no hover styling
- [ ] Sentence case; no emoji; verb-first buttons
- [ ] Touch targets 44px and above; works at 320px
- [ ] State readable without colour; correct ARIA for the role
- [ ] `pnpm validate` green
