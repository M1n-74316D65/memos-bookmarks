# Memos Design System

## 1. Atmosphere & Identity

Memos is a quiet working notebook: warm, direct, and dense enough for daily use without feeling administrative. Its signature is editorial restraint—content leads, controls recede, and structure comes from rhythm and thin rules rather than decorative containers.

Primary users are people capturing and revisiting short notes and saved links, including keyboard users, touch users, low-vision users at 200% zoom, and people working under distraction or time pressure.

## 2. Color

| Role | Token | Usage |
| --- | --- | --- |
| Canvas | `--background` | Page background |
| Primary text | `--foreground` | Titles and high-priority content |
| Card | `--card` / `--card-foreground` | Memo surfaces and card text |
| Quiet surface | `--muted` | Low-emphasis regions |
| Quiet text | `--muted-foreground` | Metadata and secondary labels |
| Interaction | `--primary` / `--primary-foreground` | Primary actions and focus emphasis |
| Hover | `--accent` / `--accent-foreground` | Hover and selected states |
| Rule | `--border` | Dividers and card boundaries |
| Focus | `--ring` | Keyboard focus |
| Feedback | `--success`, `--warning`, `--destructive` | Status feedback only |

Theme files under `web/src/themes/` own actual values. Components use semantic tokens; no theme-specific raw colors are introduced in component code.

## 3. Typography

- Sans: `--font-sans` for interface and content.
- Mono: `--font-mono` for compact operational status and source metadata.
- Page title: `text-xl`, semibold, tight tracking.
- Card title: `text-sm`, semibold, compact leading.
- Supporting text: `text-xs` or `text-2xs`, regular, relaxed only for excerpts.
- Metadata stays sentence case unless the content itself is a hostname.

## 4. Spacing & Layout

- Use the Tailwind spacing scale already present in the frontend.
- `GRID_GAP` owns feed seams; cards must not add an extra outer margin inside grid cells.
- Bento uses `react-photo-album` with bounded display aspect ratios (3:2 through 3:1), a 3:1 coverless-card ratio, and at most one tile per 260px of available width. Full memo length must not determine summary width.
- At narrow widths, shared feeds return to single-column flow. Bookmarks retain compact summary cards in every layout, with a 160px minimum height outside the album.

## 5. Components

### Bookmark Masthead

- Title and bookmark icon establish the page.
- The masthead spans the entire collection in every layout. Search and view options are available in a wrapping secondary toolbar; active filters remain visible below it.
- All, Favorites, and Archive are first-class library views. Favorite state is independent of memo pinning.
- An inline composer accepts links, text, or attachments. Empty collections explain these options; filtered empty collections invite the user to adjust filters.
- Bookmarklet setup is secondary; Import and Refresh remain quiet utilities.
- Mobile uses icon-only controls with accessible names and 40px touch targets; labels appear from `sm` upward.
- Refresh exposes idle, running, success, partial-failure, error, and disabled states without changing the underlying RPC behavior.
- Running refresh offers a text Cancel action. Cancellation keeps completed work and announces its outcome in the same live region.

### Link Capture and Import

- Capture provides a labeled native URL field and one primary Continue action before the existing memo editor. Bookmarklet setup remains secondary.
- Invalid URLs and failed saves preserve the draft and show explicit error text. Only HTTP and HTTPS links enter capture.
- Link capture and import use the bookmark save endpoint, which canonicalizes URLs and resurfaces an existing archived bookmark instead of creating another one.
- Capture opened from Bookmarks returns to the originating bookmark collection, including its query. Detail navigation names that destination correctly.
- Import reuses the shared dialog, buttons and semantic color tokens. The file picker supports keyboard, click and drag-and-drop.
- Dialogs move keyboard focus inside on open and restore it on close. Tab navigation stays within a modal.
- File preview is cleared when a replacement cannot be read. During import, the selected file is fixed and cancellation stops further creation while keeping completed bookmarks.
- Import progress uses a named progressbar and a polite live region; error, cancellation, completion and active states are distinct.

### Bento Tile

- A native detail link names each tile by its title; source links open the external HTTP(S) page separately. Links must not nest.
- Cover variant: image above a semantic card surface containing title, optional creator, and metadata. Text readability must not depend on image contrast.
- Text variant: source/creator rail, title, excerpt, and bookmark actions.
- Failed covers fall back to the text variant.
- Pin, Space, and non-private visibility remain available across layouts. Metadata uses a readable semantic surface when necessary over covers.
- Sensitive-tag tiles display only a reveal control until revealed; their image, title, excerpt, and source are also concealed from assistive technology.
- Default, hover, keyboard-focus, pinned, long-content, missing-metadata, and failed-media states are required.

## 6. Motion

- Motion is functional and restrained: color, border, and opacity transitions only.
- Do not scale tiles or covers on hover.
- The existing refresh spinner communicates work; no additional looping animation is added.
- Interfaces remain understandable when reduced motion is requested.

## 7. Depth & Surfaces

- Cards use the existing card surface, radius, and border tokens.
- No shadow at rest. Hover may strengthen the border or surface tone without lifting the card.
- Cover images use no decorative overlay; title and metadata use the card surface.

## 8. Accessibility & Debt

- Tile links and reveal controls must have visible `focus-visible` treatment using `--ring` and concise accessible names.
- Icon-only actions retain accessible names; status updates use polite live-region announcements.
- Decorative cover images use empty alt text because the adjacent title names the destination.
- Long and unbroken content must clamp without causing horizontal overflow at 375px or 200% zoom.
- Color never carries refresh or pinned state alone.
- Accepted tooling gap: React inspection packages are not added in this scoped refinement because the approved plan prohibits dependency changes; existing lint, Vitest, build, and real-browser QA remain mandatory.
- Accessibility debt: none accepted.
