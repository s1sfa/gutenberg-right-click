/**
 * WordPress dependencies
 */
import {
	Button,
	MenuGroup,
	MenuItem,
	NavigableMenu,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { chevronLeft } from '@wordpress/icons';

/**
 * Internal dependencies
 */
import {
	usePasteAsBlockType,
	usePasteFromClipboard,
} from './use-clipboard-helpers';

export default function PasteNewBlockSubmenu( {
	targetClientId,
	onBack,
	onClose,
} ) {
	const pasteAuto = usePasteFromClipboard( { mode: 'BLOCKS' } );
	const pasteAsPreformatted = usePasteAsBlockType( 'core/preformatted' );
	const pasteAsParagraph = usePasteAsBlockType( 'core/paragraph' );
	const pasteAsTable = usePasteAsBlockType( 'core/table' );
	const pasteAsList = usePasteAsBlockType( 'core/list' );
	const pasteAsHTML = usePasteAsBlockType( 'core/html' );

	function runAndClose( fn ) {
		return () => {
			fn( targetClientId );
			onClose();
		};
	}

	return (
		<NavigableMenu className="block-editor-block-context-menu__submenu">
			<MenuGroup>
				<Button
					__next40pxDefaultSize
					className="block-editor-block-context-menu__back"
					icon={ chevronLeft }
					onClick={ onBack }
				>
					{ __( 'Back' ) }
				</Button>
			</MenuGroup>
			<MenuGroup label={ __( 'Paste as new block' ) }>
				<MenuItem onClick={ runAndClose( pasteAuto ) }>
					{ __( 'Auto' ) }
				</MenuItem>
				<MenuItem onClick={ runAndClose( pasteAsPreformatted ) }>
					{ __( 'Preformatted' ) }
				</MenuItem>
				<MenuItem onClick={ runAndClose( pasteAsParagraph ) }>
					{ __( 'Paragraph' ) }
				</MenuItem>
				<MenuItem onClick={ runAndClose( pasteAsTable ) }>
					{ __( 'Table' ) }
				</MenuItem>
				<MenuItem onClick={ runAndClose( pasteAsList ) }>
					{ __( 'List' ) }
				</MenuItem>
				<MenuItem onClick={ runAndClose( pasteAsHTML ) }>
					{ __( 'HTML' ) }
				</MenuItem>
			</MenuGroup>
		</NavigableMenu>
	);
}
