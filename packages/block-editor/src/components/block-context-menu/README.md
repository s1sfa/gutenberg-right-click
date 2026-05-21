# BlockContextMenu

Renders a custom context (right-click) menu over the block editor canvas. The menu only appears when the user right-clicks **inside** a block; right-clicks on canvas chrome, in gaps between blocks, or outside the canvas entirely fall through to the browser's native menu. Holding Shift while right-clicking always falls through to the native menu — useful for reaching spell-check inside a `RichText` field. A second right-click while the custom menu is open also falls through: the first right-click opens the custom menu, the second one closes it and shows the browser's native menu in place.

The component is mounted internally by `BlockTools` and is not exported from `@wordpress/block-editor`. Plugins extend it through the [`BlockContextMenuControls`](../block-context-menu-controls/README.md) slot.

## Items

| Group          | Items                                                        | Notes                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocks ▸       | Add block above…, Add block below…, Duplicate, Split block ▸ | View-swap submenu. Add above/below open the [`QuickInserter`](../inserter/quick-inserter.js) popover so the user picks the block type before insertion. `Split block ▸` opens a block-type picker — see below.                                                                                       |
| Clipboard      | Copy Text / Copy Blocks (dynamic), Paste                     | Label switches with target: a single-block menu reads "Copy Text" (disabled with no highlight); a multi-selection menu reads "Copy Blocks". Paste = inline at the cursor.                                                                                                                            |
| Paste special  | Paste as plain text, Paste as new block ▸                    | Plain text inserts inline; `Paste as new block` opens a submenu with typed block variants (see below).                                                                                                                                                                                               |
| Tools          | Edit as HTML / Edit visually                                 | Reuses [`BlockModeToggle`](../block-settings-menu/block-mode-toggle.js); the label flips to "Edit visually" in HTML mode. Spell-check is intentionally **not** exposed here — use Shift+right-click (or right-click a second time) to reach the browser's native spell-check menu inside `RichText`. |
| Block-specific | Per-block items via the slot                                 | Paragraph: **Bold / Italic / Inline code** (toggle via `toggleFormat`) and **Font color…** (opens the tabbed text/background color popover — see below). Table: **Row edit ▸ / Column edit ▸ / Alignment ▸ / Show Header Row / Show Footer Row** (see below).                                        |
| Destructive    | Delete Block / Delete Blocks (dynamic)                       | `BlockActions.onRemove`. Label switches with target count.                                                                                                                                                                                                                                           |

The capability flags (`canInsertBlock`, `canDuplicate`, `canRemove`) come from `BlockActions`, so respect for locked blocks, content-only blocks, and `templateLock` settings is automatic.

### Removed from this menu

The following items moved out of the right-click menu in favor of leaving space for block-specific options. They remain in the block kebab/settings menu via `BlockSettingsMenuControls`:

-   Group
-   Lock
-   Rename
-   Visibility (Hide)
-   Create pattern
-   Paste styles

## Paste as new block (submenu)

| Item         | Behavior                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Auto         | `pasteHandler({ mode: 'BLOCKS' })` — the system chooses the best block type for the clipboard payload.                         |
| Preformatted | Wraps the clipboard text in a `core/preformatted` block.                                                                       |
| Paragraph    | Wraps the clipboard text in a `core/paragraph` block.                                                                          |
| Quote        | Wraps the clipboard text in a `core/quote` block whose single inner `core/paragraph` carries the text.                         |
| Table        | Splits on newlines for rows, tabs for cells, into a `core/table` block. Falls back to the table block's own empty placeholder. |
| List         | Splits on newlines into `core/list-item` children of a `core/list` block.                                                      |
| HTML         | Wraps the clipboard HTML (or plain text) in a `core/html` block.                                                               |

## Blocks submenu

`Blocks ▸` consolidates block-level operations into a single submenu so the main menu stays short. It contains **Add block above…**, **Add block below…**, **Duplicate**, and **Split block ▸**. Add above/below use the `QuickInserter` popover described under [`Add block above / Add block below`](#add-block-above--add-block-below). Duplicate uses `BlockActions.onDuplicate`. **Split block ▸** is disabled when the target block cannot be removed (`canRemove`), since split semantically replaces the original.

## Split block

`Blocks ▸ Split block ▸` opens a picker submenu listing every block type the selected text can become. Picking one replaces the current block with up to three new blocks:

-   the **before** piece (same type as the original), if non-empty;
-   the **selected** piece, transformed to the chosen type;
-   the **after** piece (same type as the original), if non-empty.

Mechanics:

-   Enabled only for single-block targets with a non-empty text selection where the block has a `content` attribute and no `innerBlocks` (paragraph, heading, quote, preformatted, code, verse, etc.).
-   The captured DOM Range is converted to a `RichText` Value via `create({ element: editable, range })`, then sliced into before / selected / after with `@wordpress/rich-text`'s `slice()`. Each slice is trimmed of leading and trailing whitespace so split pieces don't keep a dangling space at the join — internal whitespace is preserved.
-   The middle piece is built as a block of the original type, then run through `switchToBlockType( [middleBlock], chosenName )` so the transform's registered `from` rules handle complex targets (e.g. Quote with a nested paragraph). When the user picks the same type, the transform is skipped.
-   The picker list is `getPossibleBlockTransformations()` for the original-typed middle piece, with the original type prepended so "split as same type" is always available.
-   Empty pieces are skipped, so an at-start / at-end selection produces 2 blocks instead of 3, and a whole-block selection produces 1 (effectively a type change).

## Font color (text-color popover)

Paragraph's **Font color…** item opens [`text-color-popover.js`](./text-color-popover.js), a tabbed Text / Background color picker that mirrors the format library's `InlineColorUI`:

-   Two tabs (Text / Background) each backed by a `ColorPalette` with custom-color support (`enableAlpha`).
-   The captured DOM Range is converted to a `RichText` Value once when the picker opens; each color pick produces a new Value via the same `setColors` logic the format library uses (palette colors emit `class="has-{slug}-color"`, custom colors emit inline `style:color`; the format always emits `background-color:rgba(0, 0, 0, 0)` when no background is set, to suppress `<mark>`'s default yellow).
-   Each change writes the new HTML to the block's `content` attribute and updates the popover's local `value` so subsequent picks see the active color.

The popover is rendered by `BlockContextMenu`, anchored at the right-click cursor; the menu closes when the picker opens. The picker is dismissed by Escape, focus-outside, or by another right-click in the canvas.

This UI is **reimplemented** in `block-editor` rather than imported from `@wordpress/format-library` — `block-editor` is a lower layer in the package graph and must not depend on the format library. The two implementations share the format type (`core/text-color`), the format attributes shape, and the visual UX, but the code is local to this directory.

## Edit as HTML

The Tools group includes Gutenberg's existing `<BlockModeToggle>` (`packages/block-editor/src/components/block-settings-menu/block-mode-toggle.js`). Shown only for single-block targets; the component itself hides further if the block doesn't support HTML, if `codeEditingEnabled` is `false`, or if the block is invalid. Clicking it flips between `'visual'` and `'html'` modes via `toggleBlockMode( clientId )` and closes the menu.

## Closing the menu on canvas interaction

While the menu is open, a `useEffect` installs `mousedown` and `keydown` listeners on the canvas document (the iframe doc when iframed). Either event closes the menu — so left-clicking another block or starting to type after a right-click dismisses the menu cleanly. The listeners are scoped to the canvas document, so the menu's own keyboard navigation (arrow keys, Enter) — which lives in the parent document — is unaffected. Cleanup runs when the menu closes, so the listeners don't linger.

Popover-level dismissal (Escape, focus-outside) still works for the cases where the user interacts with editor chrome outside the canvas.

## Extending the menu

See [`BlockContextMenuControls`](../block-context-menu-controls/README.md). Fills against that slot appear **only** in the right-click menu, not in the block kebab/settings menu. The fill receives `clientIds`, `range`, `ownerDocument`, `selectionText`, `view`, `setView`, `openColorPicker`, and `onClose` as `fillProps` — enough to act on either the block(s) the menu was opened against or the text under the cursor, and to drive its own submenu views.

Items that belong in both menus continue to register against `BlockSettingsMenuControls` (they appear only in the kebab menu now).

### Fill-driven submenus

A fill can push its own submenu by calling `setView( '<fill-namespaced-name>' )`. When `view` is anything other than `'main'` or `'paste-new-block'`, the parent skips its own menu items and renders the slot alone, so the fill owning that view can render the submenu exclusively (typically a Back button plus the submenu items). Naming convention: prefix views with the block name (e.g. `'table-row-edit'`, `'table-column-edit'`, `'table-alignment'`) so different fills don't collide. Fills that aren't responsible for the current view should return `null`.

### Slot grouping contract

The `BlockContextMenuControls` slot does **not** wrap fills in a `MenuGroup`. Each fill is responsible for supplying its own grouping (one or more `MenuGroup`s), which means block-specific fills can sub-group their items — for example, the table fill renders separate Row edit / Column edit / Alignment groups inside a single submenu view.

### Table block fill

The table block (`packages/block-library/src/table/edit.js`) renders a `BlockContextMenuControls` fill inline within `TableEdit`, gated on the right-clicked block being this table (`clientIds[ 0 ] === clientId`). The fill operates against the block's local `selectedCell` state, which is set on cell focus and is already populated by the time the right-click menu opens (focus precedes contextmenu). Main-view items:

-   **Row edit ▸** — Insert row above, Insert row below, Delete row (destructive). View key: `table-row-edit`.
-   **Column edit ▸** — Insert column before, Insert column after, Delete column (destructive). View key: `table-column-edit`.
-   **Alignment ▸** — Align left / center / right as `menuitemradio` with an explicit `check` icon on the active alignment (note: `MenuItem` does not auto-render a check from `isSelected` — pass `icon={ active ? check : null }`). Applies to the whole column, mirroring the table toolbar's `onChangeColumnAlignment`. View key: `table-alignment`.
-   **Show Header Row** / **Show Footer Row** — `menuitemcheckbox` with the same explicit `check` icon, calling the existing `onToggleHeaderSection` / `onToggleFooterSection` handlers.

Group labels are deliberately omitted in the main view — the items are self-describing. Inside each submenu the `MenuGroup` keeps a label (`Row edit`, `Column edit`, `Alignment`) for context, alongside a Back button (`chevronLeft`) that returns to `'main'`.

## Architecture and design decisions

### Mount point: `BlockTools`

The component is mounted as a sibling of `BlockToolbarPopover` inside `BlockTools` (`packages/block-editor/src/components/block-tools/index.js`). `BlockTools` already wraps the canvas, has access to the block-editor store, and is the analogous mount point for canvas-level overlays (block toolbar popover, insertion point).

### Listening across the iframe boundary

The block editor canvas is rendered inside an iframe (see `packages/block-editor/src/components/iframe/index.js`). Rather than extending `useBubbleEvents` to bubble `contextmenu` to the parent document — which would lose the original `event.target` (it would point at the iframe element in the parent doc) — the component installs its `contextmenu` listener directly on `__unstableContentRef.current.ownerDocument`. This is the iframe's document when iframed and the main document otherwise.

Coordinate translation for the popover anchor is done via `defaultView.frameElement.getBoundingClientRect()`, mirroring the rewrite that `iframe/index.js`'s `bubbleEvent` does for `MouseEvent`s.

The popover renders in the parent document so it overlays everything in the canvas, including any nested iframes.

### Right-click selects the block first

To match the existing list-view behavior (`packages/block-editor/src/components/list-view/block.js:449-496`), the handler resolves the right-clicked block via `getBlockClientId(event.target)` and, on a hit, dispatches `selectBlock(clientId)` before opening the menu. If the right-clicked block is already part of a multi-selection, the multi-selection is preserved; otherwise the menu single-selects.

If `getBlockClientId` returns `undefined` (canvas chrome, gaps between blocks, etc.), the handler returns without `preventDefault()`, so the browser's native menu shows.

### Capturing the selection at right-click time

When the `contextmenu` event fires the menu reads `ownerDocument.getSelection()` and **clones** its first Range (`getRangeAt(0).cloneRange()`). The clone is what survives the popover stealing focus — the live `Selection` will move when the menu's `NavigableMenu` mounts, but the cloned `Range` keeps pointing at the original DOM nodes. `selection.toString()` is captured alongside so per-text actions (`Copy`, paragraph format fills) can disable themselves when nothing is highlighted.

### Inline paste

`Paste` and `Paste as plain text` insert at the captured caret rather than after the block. The implementation focuses the closest `[contenteditable="true"]`, restores the cloned range as the document selection, and then dispatches `execCommand('insertHTML' | 'insertText', …)`. `execCommand` is "deprecated" but it is the only insertion path that fires the `input` events `RichText` listens for — anything else would leave the DOM and the block's stored value out of sync until the next render.

For rich paste the clipboard payload is first run through `pasteHandler({ HTML, plainText, mode: 'INLINE' })` to normalise Word / Google Docs / WP-block-marker HTML to clean inline markup. If `pasteHandler` returns a block-shaped value (clipboard is not inline-compatible) the inline paste degrades to inserting the plain-text view.

### Copy

When the menu targets a single block, `Copy` writes the highlighted text only (and is disabled when nothing is highlighted). When the menu targets a multi-selection, `Copy` falls back to copying the selected blocks via `serialize()`, with both the `text/html` (block-marker preserving) and `text/plain` payloads written.

### Paste as new block

Implemented as a **view swap** inside the same popover: clicking `Paste as new block` flips the menu's `view` state from `'main'` to `'paste-new-block'` and re-renders the popover's contents with the submenu and a Back button. This avoids the complexity of nested popovers while keeping focus inside a single `NavigableMenu`.

### Add block above / Add block below

Both items open the [`QuickInserter`](../inserter/quick-inserter.js) in a dedicated `Popover` anchored at the right-click cursor. The right-click menu closes first, then the inserter takes over so the user can pick the block type before insertion — matching the UX of the `+` button shown next to a newly inserted empty block.

The inserter's destination index is computed from the right-clicked block:

-   **Above** passes `clientId={firstTarget}`. `useInsertionPoint` reads `getBlockIndex(clientId)` for its destination index, so the new block lands at that index and pushes the existing block down — i.e. **before** the right-clicked block.
-   **Below** passes `clientId={nextSibling(lastTarget)}` so the new block lands at `getBlockIndex(nextSibling) === getBlockIndex(lastTarget) + 1` — i.e. **after** the right-clicked block. When the right-clicked block is last in its parent and has no next sibling, the inserter falls back to `isAppender` with the parent's `rootClientId`, which appends to the end of the parent.

**Selection is cleared before the inserter opens.** `useInsertionPoint`'s `onInsertBlocks` branches to `replaceBlocks` whenever the currently-selected block is an unmodified default paragraph. Right-clicking selects the target, so an empty paragraph target would otherwise be **replaced** by the picked block instead of having a new sibling inserted. Dispatching `clearSelectedBlock()` immediately before `setInserterState` makes `getSelectedBlock()` return `null`, so the inserter takes the plain insert branch.

The inserter `Popover` uses the same `getCursorAnchor` helper as the right-click menu, so coordinates translate correctly across the iframe boundary.

### Reaching the browser's spell-check

The custom menu doesn't expose a spell-check item. To reach the browser's native spell-check / "Search …" entries inside `RichText`:

-   **Shift + right-click** to skip the custom menu entirely on the first click, or
-   right-click once to open the custom menu, then **right-click a second time** anywhere — the custom menu closes and the browser's native menu shows in its place.

A prior iteration shipped a `Check spelling` item backed by the public LanguageTool API. It was removed to avoid sending unpublished editor content (drafts, internal notes, embargoed posts, anything pasted into a paragraph) to a hard-coded third-party service with no opt-in or site-admin control.

### Paragraph-specific items

Mounted by `paragraph-fills.js`, which is a fill component rendered once inside `BlockContextMenu`. The fill checks the targeted block's name (single `useSelect` per open) and renders only when the menu targets a single `core/paragraph`. **Bold**, **Italic**, and **Inline code** call `toggleFormat` from `@wordpress/rich-text` against the format types `core/bold`, `core/italic`, and `core/code` respectively, using `create({ element, range })` to map the captured DOM range to a `RichText` value with the right `start` / `end` offsets — the same shape the block toolbar uses, so the resulting markup round-trips cleanly. **Font color…** calls the `openColorPicker` fillProp, which closes the menu and opens the [text-color popover](#font-color-text-color-popover). Underline is not exposed here because the `core/underline` format has no visible UI elsewhere in the paragraph block (only the `mod+u` shortcut wired by `format-library`); we don't want the right-click menu to be the only surfaced control for it.

### What was deliberately not built

| Deferred                                                        | Reason                                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right-click outside any block opens a menu                      | Confirmed with the user: falls through to the browser's native menu in canvas chrome / gaps. An "Insert block here" affordance is a candidate for a follow-up. |
| Declarative `contextMenuItems` in `block.json`                  | Items need callbacks; `block.json` is JSON. The existing imperative `BlockContextMenuControls` slot is the right surface today.                                |
| Commands-palette (`@wordpress/commands`) integration            | A separate source of items would split the extension story. Plugin authors have the `BlockContextMenuControls` slot.                                           |
| `iframe/index.js` modification (bubble `contextmenu` to parent) | Considered, but listening on `contentRef.current.ownerDocument` is cleaner and avoids changing shared event-bubbling code that could affect other listeners.   |
| Sharing `InlineColorUI` with `format-library`                   | Would require breaking the layering rule (block-editor depending on format-library). The picker is reimplemented locally using shared format types / settings. |
| Per-cell (vs per-column) alignment in the table fill            | The table block's data model applies alignment per column; the existing toolbar behaves the same way. Splitting alignment to per-cell would be a block change. |

## Developer notes

### Listener lifecycle

`__unstableContentRef.current` does **not** point at a parent DOM node — it points at the iframe's `<body>`, which is mounted via `createPortal` only after the iframe's `onLoad` fires. That happens several render cycles after `BlockTools` mounts, so reading the ref's `current` from a child `useEffect` on initial mount typically returns `null`. Worse, the effect's deps (the ref object reference, action/selector identities) don't change when `.current` later populates, so the effect won't re-run on its own.

The fix is a `requestAnimationFrame` retry loop inside the effect — the polling cost is essentially free (one rAF per frame until the iframe body mounts, typically <10 frames in practice) and stops as soon as the listener is attached. The `cancelled` flag guards both the poll and the install path against late callbacks after unmount.

If the canvas later remounts (e.g., on an editor mode switch), `BlockTools` itself remounts, which tears down and re-creates this effect — which then re-polls and re-attaches to the new iframe body. The ref's `.current` is read inside the effect body (not at render scope) so the `react-hooks/refs` lint rule is satisfied.

Note: `BlockToolbarPopover` and other canvas overlays don't hit this gotcha because they pass `__unstableContentRef?.current` as a hook argument and re-read it on every render of `BlockTools` (which re-renders frequently due to selection/typing state). For an event-listener that needs to install **once** on the iframe doc, the rAF pattern above is the right shape.

### State shape

`BlockContextMenu` holds five independent state slots, each `null` when inactive:

| Slot               | Drives                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`            | The main right-click menu (open / closed + capture data).                                                                                                                                |
| `view`             | Which view the menu renders: `'main'`, `'paste-new-block'`, `'blocks-submenu'`, `'split-block-picker'`, or any fill-namespaced name (e.g. `'table-row-edit'`, `'paragraph-font-color'`). |
| `inserterState`    | The QuickInserter popover for Add block above / below.                                                                                                                                   |
| `colorPickerState` | The tabbed text-color popover.                                                                                                                                                           |

The main `state` shape:

```js
{
    clientIds: string[],     // single or multi-selection at right-click time
    ownerDocument: Document, // canvas owner doc (iframe doc when iframed)
    clientX: number,         // iframe-local cursor X
    clientY: number,         // iframe-local cursor Y
    range: Range | null,     // cloned DOM Range under the cursor (or null)
    selectionText: string,   // text highlighted at right-click time
}
```

`close()` resets `state` to `null` and `view` to `'main'`. The auxiliary popovers (`inserterState`, `colorPickerState`) are independent — they outlive the menu so the user can interact with them after the menu closes. Each opens by setting its own state and calling `close()` to dismiss the menu. Each is dismissed by Escape, focus-outside, or the next right-click (which resets all auxiliary states inside `handleContextMenu`).

### Popover anchor

The anchor object passed to `<Popover anchor={…} />` is rebuilt via `getCursorAnchor` whenever state changes. When the canvas is iframed, the iframe-local `clientX/clientY` are translated to parent-document coordinates by adding `defaultView.frameElement.getBoundingClientRect()` offsets — the same rewrite that `iframe/index.js`'s `bubbleEvent` does for bubbled `MouseEvent`s.

### Files

-   `index.js` — main component (handler, state machines, popover, menu items, paragraph fill mount, split-block picker view).
-   `paste-new-block-submenu.js` — the `Paste as new block` submenu view (Auto / Preformatted / Paragraph / Quote / Table / List / HTML).
-   `paragraph-fills.js` — fills registered against `BlockContextMenuControls` that surface paragraph-specific formatting items (Bold, Italic, Inline code, Font color…).
-   `text-color-popover.js` — the tabbed Text / Background color picker opened from paragraph's `Font color…` item; replicates the format library's `InlineColorUI` using only `block-editor` primitives.
-   `use-clipboard-helpers.js` — `useCopyBlocksToClipboard`, `useCopyTextToClipboard`, `usePasteFromClipboard`, `useInlinePasteAtRange`, `usePasteAsBlockType`, plus private `readSystemClipboard` / `writeSystemClipboard` / `insertAtRange` helpers.
-   `style.scss` — minimal styling (popover width, group spacing).

### Known UX trade-offs

-   The custom menu replaces the browser's native context menu **inside `RichText` fields**, removing the spell-check / "Search Google for…" entries from the default context. **Shift + right-click** is the documented escape hatch (matching Firefox's own convention for bypassing custom context menus). A **second right-click while the custom menu is open** is also recognized as a fall-through: the menu closes and the next right-click event reaches the browser unchanged.
-   Async `navigator.clipboard.read` may prompt for permission in some Firefox configurations on first use; the `Paste` items are best-effort and show an error notice on failure.
-   Inline paste relies on `execCommand`, which is marked deprecated. No browser has announced removal, and it remains the only insertion path that triggers the `input` events `RichText` listens for. If the API is eventually removed, the inline paste path will need to move to a `paste` event the iframe doc dispatches itself.

## Verifying the feature manually

```bash
npm run wp-env status   # confirm running; if not: npm run wp-env start
npm start               # dev build with watch
```

Open `http://localhost:8888/wp-admin/post-new.php`, then repeat in the site editor (`/wp-admin/site-editor.php`, edit a template):

1. Right-click inside a paragraph block → custom menu appears at the cursor; native menu does **not**. Cursor coordinates are correct (no iframe-origin offset).
2. **Blocks ▸ Add block above…** / **Add block below…** open the QuickInserter so the user can pick a block type before insertion. Right-clicking an empty default paragraph and choosing "Add block above…" must leave the empty paragraph in place — selection is cleared before the inserter opens precisely so the inserter doesn't replace it.
3. **Blocks ▸ Duplicate** clones the right-clicked block as the kebab menu does.
4. Highlight a word inside a paragraph, right-click on the highlight → **Copy Text** is enabled and copies just the highlighted text (paste elsewhere shows only that word). Without a highlight, **Copy Text** is disabled. Multi-select two blocks, right-click → label reads **Copy Blocks**.
5. Right-click after a Cmd+C → **Paste** inserts the clipboard content **at the caret** in the current block, not as a new block. With rich content, formatting is preserved. With **Paste as plain text**, formatting is dropped.
6. **Paste special ▸ Paste as new block ▸ Auto** falls back to the system's default block; **Preformatted / Paragraph / Table / List / HTML** force the typed block type with the clipboard content. **Back** returns to the main menu.
7. On a paragraph, highlight a word, then right-click → **Bold / Italic / Inline code** are enabled and toggle the format on the highlight (same markup as the toolbar). **Font color…** opens the tabbed color picker; picking a Text or Background color writes the format inline. Closing the picker (Esc, outside click, next right-click) leaves the format applied.
8. Highlight a word in a paragraph → **Blocks ▸ Split block ▸** lists the original type + every type the selection can transform into. Picking one splits the paragraph into up to three blocks; whitespace at the joins is trimmed.
9. Right-click in a table cell → fill items show: **Row edit ▸**, **Column edit ▸**, **Alignment ▸** (with a check on the active alignment), **Show Header Row** / **Show Footer Row** (with a check when on). Each submenu has a Back button.
10. **Tools ▸ Edit as HTML** flips the block to HTML mode (label becomes "Edit visually" until flipped back). The menu has no spell-check item; reach the browser's native spell-check via Shift + right-click or a second right-click after the custom menu opens.
11. **Duplicate**, **Delete Block**, **Paste styles** behave identically to their kebab-menu counterparts; label becomes **Delete Blocks** when targeting multiple blocks.
12. Group / Lock / Rename / Visibility / Create pattern do **not** appear in the right-click menu (still in the block kebab menu).
13. Right-click on a locked block (`canRemove === false`) → **Delete Block** is hidden / disabled per `BlockActions` capability flags.
14. Multi-select two blocks, right-click on one of them → menu treats both as the target (Copy Blocks copies both; Delete Blocks removes both); right-click on a different block → multi-selection collapses to that single block.
15. **Shift + right-click** anywhere in the canvas → browser's native menu shows (escape hatch for spell-check inside RichText). **Right-click a second time while the menu is open** → custom menu closes and the browser's native menu shows in its place.
16. **Escape** with the menu open → menu closes; click outside → menu closes; **left-click on a block** while the menu is open → menu closes; **type into a block** while the menu is open → menu closes.

Automated:

```bash
npm run lint:js packages/block-editor/src/components/block-context-menu packages/block-editor/src/components/block-context-menu-controls
npm run format -- 'packages/block-editor/src/components/block-context-menu/**/*' 'packages/block-editor/src/components/block-context-menu-controls/**/*'
```

No JS unit tests yet. A Playwright e2e test covering right-click → inline Paste and right-click → paragraph Bold is a reasonable follow-up.
