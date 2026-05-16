/**
 * WordPress dependencies
 */
import {
	createSlotFill,
	__experimentalStyleProvider as StyleProvider,
} from '@wordpress/components';

const { Fill, Slot } = createSlotFill( 'BlockContextMenuControls' );

// Fills supply their own `<MenuGroup>` (or multiple) so that block-specific
// items can be visually sub-grouped — e.g. a table fill renders separate
// Row / Column / Alignment groups. The slot therefore renders fills as
// siblings without wrapping them in a single group.
const BlockContextMenuControlsSlot = ( { fillProps } ) => (
	<Slot fillProps={ fillProps }>
		{ ( fills ) => ( fills?.length ? <>{ fills }</> : null ) }
	</Slot>
);

/**
 * Right-click (context) menu extension point. Fills are surfaced **only** in
 * the in-canvas right-click menu, not in the kebab menu — the two menus share
 * many items but diverge on block-specific surfaces (e.g. inline formatting
 * choices that need the captured selection range to act on).
 *
 * Fills receive these `fillProps`:
 *
 * - `clientIds`       — the block(s) the menu is opened against.
 * - `range`           — the captured DOM Range at right-click time (or `null`).
 * - `ownerDocument`   — the canvas document (iframe doc when iframed).
 * - `selectionText`   — the text currently highlighted inside the canvas.
 * - `view`            — the menu's current view (`'main'`, or a fill-namespaced submenu name).
 * - `setView`         — push a submenu by setting `view`; use `'main'` to return.
 * - `openColorPicker` — open the shared tabbed text-color popover ( `{ clientId, range, editable }` ).
 * - `onClose`         — call to close the menu after acting.
 *
 * Each fill supplies its own `<MenuGroup>`(s) — the slot does not wrap fills.
 *
 * @param {Object} props Fill props.
 * @return {Element} Element.
 */
function BlockContextMenuControls( { ...props } ) {
	return (
		<StyleProvider document={ document }>
			<Fill { ...props } />
		</StyleProvider>
	);
}

BlockContextMenuControls.Slot = BlockContextMenuControlsSlot;

export default BlockContextMenuControls;
