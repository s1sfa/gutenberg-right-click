# BlockContextMenuControls

Right-click (context) menu extension point for the in-canvas block context menu. Fills registered against this slot appear only in the right-click menu — not in the block kebab/settings menu. Use [`BlockSettingsMenuControls`](../block-settings-menu-controls/README.md) for items that belong in both menus.

This slot is the recommended surface for items that need the captured cursor / selection range to act on (for example, inline formatting choices that should apply to the highlighted text under the right-click).

## Usage

```jsx
import { BlockContextMenuControls } from '@wordpress/block-editor';
import { MenuItem } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

function MyContextMenuFill() {
	return (
		<BlockContextMenuControls>
			{ ( { clientIds, selectionText, onClose } ) => (
				<MenuItem
					disabled={ ! selectionText }
					onClick={ () => {
						// …act on the highlighted text…
						onClose();
					} }
				>
					{ __( 'Do something with selection' ) }
				</MenuItem>
			) }
		</BlockContextMenuControls>
	);
}
```

## Fill props

| Prop              | Type                  | Description                                                                                                                                                        |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clientIds`       | string[]              | The block(s) the menu was opened against. Multi-selection if more than one entry.                                                                                  |
| `range`           | Range                 | The captured DOM Range at right-click time. `null` if no selection at the click point.                                                                             |
| `ownerDocument`   | Document              | The canvas document (iframe doc when the canvas is iframed; main document otherwise).                                                                              |
| `selectionText`   | string                | The text currently highlighted in the canvas at right-click time. Empty string if none.                                                                            |
| `view`            | string                | The menu's current view: `'main'` for the top-level menu, or a fill-namespaced name for a submenu the fill itself owns (e.g. `'table-row-edit'`).                  |
| `setView`         | (view: string) ⇒ void | Push a submenu by setting `view` to a fill-namespaced name. The parent hides its own items while a non-`'main'` view is active. Use `'main'` to return.            |
| `openColorPicker` | (payload) ⇒ void      | Open the shared tabbed text-color popover. Pass `{ clientId, range, editable }`. The menu closes automatically; the popover is anchored at the right-click cursor. |
| `onClose`         | Function              | Call this to close the right-click menu after the fill's action runs.                                                                                              |

## Grouping contract

The slot does **not** wrap fills in a `MenuGroup`. Each fill supplies its own `MenuGroup` (or multiple) — this lets block-specific fills sub-group their items (e.g. the table fill renders separate Row / Column / Alignment groups in a single submenu view).

## Fill-driven submenus

A fill can take over the menu by calling `setView( '<your-fill-name>' )`. While `view` is anything other than `'main'` or `'paste-new-block'`, the parent skips its own items and renders the slot alone, so the matching fill renders its submenu exclusively. The submenu typically pairs a Back button (which calls `setView( 'main' )`) with a single labelled `MenuGroup` of the submenu's items. Fills that aren't responsible for the current view should return `null`.

Naming convention: prefix views with the block name (e.g. `'table-row-edit'`, `'paragraph-font-color'`) so fills from different blocks don't collide.
