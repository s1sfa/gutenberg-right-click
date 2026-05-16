/**
 * WordPress dependencies
 */
import { MenuGroup, MenuItem } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { create, toggleFormat, toHTMLString } from '@wordpress/rich-text';

/**
 * Internal dependencies
 */
import BlockContextMenuControls from '../block-context-menu-controls';
import { store as blockEditorStore } from '../../store';

function getEditableFromRange( range ) {
	if ( ! range ) {
		return null;
	}
	const node = range.startContainer;
	const candidate =
		node?.nodeType === window.Node.ELEMENT_NODE
			? node
			: node?.parentElement;
	return (
		candidate?.closest( '[contenteditable="true"]' ) ||
		candidate?.closest( '[contenteditable]' ) ||
		null
	);
}

/**
 * Renders Bold / Italic / Underline / Inline code / Font color into the
 * right-click menu when the targeted block is a single core/paragraph.
 *
 * Bold, Italic, and Underline are wired to rich-text's `toggleFormat` so they
 * apply through the same format registry that the block toolbar uses — meaning
 * the resulting markup round-trips through RichText cleanly. Inline code and
 * Font color are placeholders pending real implementations.
 *
 * @param {Object}   props
 * @param {string[]} props.clientIds The block(s) the right-click menu was
 *                                   opened against.
 * @return {Element|null} The fill nodes, or `null` if the targeted block is
 *                        not a single core/paragraph.
 */
export default function ParagraphContextMenuFills( { clientIds } ) {
	const isSingleParagraph = useSelect(
		( select ) => {
			if ( ! clientIds || clientIds.length !== 1 ) {
				return false;
			}
			return (
				select( blockEditorStore ).getBlockName( clientIds[ 0 ] ) ===
				'core/paragraph'
			);
		},
		[ clientIds ]
	);

	const { updateBlockAttributes } = useDispatch( blockEditorStore );

	if ( ! isSingleParagraph ) {
		return null;
	}

	return (
		<BlockContextMenuControls>
			{ ( { range, selectionText, view, openColorPicker, onClose } ) => {
				if ( view !== 'main' ) {
					return null;
				}
				const hasSelection = !! selectionText;
				const clientId = clientIds[ 0 ];

				function applyInlineFormat( formatType ) {
					const editable = getEditableFromRange( range );
					if ( ! editable || ! range ) {
						onClose();
						return;
					}
					const value = create( { element: editable, range } );
					if (
						value.start === undefined ||
						value.end === undefined ||
						value.start === value.end
					) {
						onClose();
						return;
					}
					const toggled = toggleFormat( value, { type: formatType } );
					updateBlockAttributes( clientId, {
						content: toHTMLString( { value: toggled } ),
					} );
					onClose();
				}

				function openColorPickerForSelection() {
					const editable = getEditableFromRange( range );
					if ( ! editable || ! range ) {
						onClose();
						return;
					}
					openColorPicker( { clientId, range, editable } );
				}

				return (
					<MenuGroup>
						<MenuItem
							disabled={ ! hasSelection }
							accessibleWhenDisabled
							onClick={ () => applyInlineFormat( 'core/bold' ) }
						>
							{ __( 'Bold' ) }
						</MenuItem>
						<MenuItem
							disabled={ ! hasSelection }
							accessibleWhenDisabled
							onClick={ () => applyInlineFormat( 'core/italic' ) }
						>
							{ __( 'Italic' ) }
						</MenuItem>
						<MenuItem
							disabled={ ! hasSelection }
							accessibleWhenDisabled
							onClick={ () => applyInlineFormat( 'core/code' ) }
						>
							{ __( 'Inline code' ) }
						</MenuItem>
						<MenuItem
							disabled={ ! hasSelection }
							accessibleWhenDisabled
							onClick={ openColorPickerForSelection }
						>
							{ __( 'Font color…' ) }
						</MenuItem>
					</MenuGroup>
				);
			} }
		</BlockContextMenuControls>
	);
}
