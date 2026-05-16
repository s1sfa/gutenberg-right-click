/**
 * WordPress dependencies
 */
import { useCallback } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { createBlock, pasteHandler, serialize } from '@wordpress/blocks';
import { __unstableStripHTML as stripHTML } from '@wordpress/dom';
import { __ } from '@wordpress/i18n';
import { store as noticesStore } from '@wordpress/notices';

/**
 * Internal dependencies
 */
import { store as blockEditorStore } from '../../store';

async function readSystemClipboard() {
	if (
		typeof navigator === 'undefined' ||
		! navigator.clipboard ||
		typeof navigator.clipboard.read !== 'function'
	) {
		return null;
	}

	try {
		const items = await navigator.clipboard.read();
		let html = '';
		let plainText = '';
		for ( const item of items ) {
			if ( ! html && item.types.includes( 'text/html' ) ) {
				html = await ( await item.getType( 'text/html' ) ).text();
			}
			if ( ! plainText && item.types.includes( 'text/plain' ) ) {
				plainText = await ( await item.getType( 'text/plain' ) ).text();
			}
		}
		return { html, plainText };
	} catch {
		// Permission denied, or read of HTML not allowed (e.g. some Firefox
		// configurations). Fall back to plain text only.
		try {
			const plainText = await navigator.clipboard.readText();
			return { html: '', plainText };
		} catch {
			return null;
		}
	}
}

async function writeSystemClipboard( html, plainText ) {
	if ( typeof navigator === 'undefined' || ! navigator.clipboard ) {
		return false;
	}

	if (
		typeof navigator.clipboard.write === 'function' &&
		typeof window.ClipboardItem === 'function'
	) {
		try {
			await navigator.clipboard.write( [
				new window.ClipboardItem( {
					'text/html': new Blob( [ html ], { type: 'text/html' } ),
					'text/plain': new Blob( [ plainText ], {
						type: 'text/plain',
					} ),
				} ),
			] );
			return true;
		} catch {
			// Fall through to writeText.
		}
	}

	try {
		await navigator.clipboard.writeText( plainText );
		return true;
	} catch {
		return false;
	}
}

// Mirrors the native copy handler's `text/plain` payload (writing-flow/utils.js
// `toPlainText`): convert <br> to newlines, strip remaining HTML, collapse
// blank lines. Round-tripping back into the editor still works because the
// `text/html` payload retains the `<!-- wp: -->` block markers.
function toPlainText( html ) {
	const withBrAsNewlines = html.replace( /<br>/g, '\n' );
	return stripHTML( withBrAsNewlines ).trim().replace( /\n\n+/g, '\n\n' );
}

// Restores the captured selection into the canvas document and inserts at the
// caret using execCommand. execCommand is "deprecated" but it's still the only
// way to insert content that fires the `input` event the RichText listens for
// — going through React state alone would leave the DOM and the value out of
// sync until the next render.
function insertAtRange( ownerDocument, range, { html, text } ) {
	const node = range.startContainer;
	const candidate =
		node.nodeType === window.Node.ELEMENT_NODE ? node : node.parentElement;
	const editable = candidate?.closest( '[contenteditable="true"]' );
	if ( editable ) {
		editable.focus();
	}

	const selection = ownerDocument.getSelection();
	if ( selection ) {
		selection.removeAllRanges();
		try {
			selection.addRange( range );
		} catch {
			// Range has detached if the DOM mutated under us. Nothing safe to
			// do here.
			return;
		}
	}

	if ( html !== undefined && html !== null ) {
		ownerDocument.execCommand( 'insertHTML', false, html );
	} else {
		ownerDocument.execCommand( 'insertText', false, text || '' );
	}
}

/**
 * Returns a callback that copies the given clientIds to the system clipboard
 * using the same serialization the native copy handler uses, so the round
 * trip through paste reproduces the original blocks.
 *
 * @return {(clientIds: string[]) => Promise<boolean>} Copy callback.
 */
export function useCopyBlocksToClipboard() {
	const { getBlocksByClientId } = useSelect( blockEditorStore );
	const { createErrorNotice } = useDispatch( noticesStore );

	return useCallback(
		async ( clientIds ) => {
			const blocks = getBlocksByClientId( clientIds );
			if ( ! blocks?.length ) {
				return false;
			}
			const html = serialize( blocks );
			const ok = await writeSystemClipboard( html, toPlainText( html ) );
			if ( ! ok ) {
				createErrorNotice(
					__( 'Unable to copy. Try the keyboard shortcut instead.' ),
					{ type: 'snackbar' }
				);
			}
			return ok;
		},
		[ getBlocksByClientId, createErrorNotice ]
	);
}

/**
 * Returns a callback that copies a plain-text string to the system clipboard.
 * Used by the right-click `Copy` when the user has text highlighted inside a
 * single block.
 *
 * @return {(text: string) => Promise<boolean>} Copy callback.
 */
export function useCopyTextToClipboard() {
	const { createErrorNotice } = useDispatch( noticesStore );

	return useCallback(
		async ( text ) => {
			if ( ! text ) {
				return false;
			}
			const ok = await writeSystemClipboard( text, text );
			if ( ! ok ) {
				createErrorNotice(
					__( 'Unable to copy. Try the keyboard shortcut instead.' ),
					{ type: 'snackbar' }
				);
			}
			return ok;
		},
		[ createErrorNotice ]
	);
}

/**
 * Returns a callback that reads the system clipboard, runs it through
 * pasteHandler with the given mode, and inserts the resulting blocks after
 * the target block. Used by `Paste as new block ▸ Auto`.
 *
 * @param {Object}                   options
 * @param {'AUTO'|'BLOCKS'|'INLINE'} [options.mode='AUTO']
 * @return {(targetClientId: string) => Promise<void>} Paste callback.
 */
export function usePasteFromClipboard( { mode = 'AUTO' } = {} ) {
	const { getBlockIndex, getBlockRootClientId, getSettings } =
		useSelect( blockEditorStore );
	const { insertBlocks } = useDispatch( blockEditorStore );
	const { createErrorNotice } = useDispatch( noticesStore );

	return useCallback(
		async ( targetClientId ) => {
			const data = await readSystemClipboard();
			if ( ! data ) {
				createErrorNotice(
					__(
						'Unable to read the clipboard. Try the keyboard shortcut instead.'
					),
					{ type: 'snackbar' }
				);
				return;
			}

			const { html, plainText } = data;
			if ( ! html && ! plainText ) {
				return;
			}

			const content = pasteHandler( {
				HTML: html,
				plainText,
				mode,
				canUserUseUnfilteredHTML:
					getSettings().__experimentalCanUserUseUnfilteredHTML,
			} );

			// pasteHandler may return a string (inline) or a list of blocks.
			if ( typeof content === 'string' || ! content?.length ) {
				createErrorNotice(
					__(
						'Pasted content cannot be inserted as a new block. Try pasting inside a text block instead.'
					),
					{ type: 'snackbar' }
				);
				return;
			}

			const rootClientId = getBlockRootClientId( targetClientId );
			const index = getBlockIndex( targetClientId );
			insertBlocks( content, index + 1, rootClientId );
		},
		[
			createErrorNotice,
			getBlockIndex,
			getBlockRootClientId,
			getSettings,
			insertBlocks,
			mode,
		]
	);
}

/**
 * Returns a callback that pastes clipboard content inline at the captured
 * cursor position, rather than creating a new block.
 *
 * @param {Object}  options
 * @param {boolean} [options.plainTextOnly=false] If true, always insert as plain text (no formatting).
 * @return {(args: { range: Range, ownerDocument: Document }) => Promise<void>} Paste callback.
 */
export function useInlinePasteAtRange( { plainTextOnly = false } = {} ) {
	const { getSettings } = useSelect( blockEditorStore );
	const { createErrorNotice } = useDispatch( noticesStore );

	return useCallback(
		async ( { range, ownerDocument } ) => {
			if ( ! range || ! ownerDocument ) {
				return;
			}

			const data = await readSystemClipboard();
			if ( ! data ) {
				createErrorNotice(
					__(
						'Unable to read the clipboard. Try the keyboard shortcut instead.'
					),
					{ type: 'snackbar' }
				);
				return;
			}

			const { html, plainText } = data;
			if ( ! html && ! plainText ) {
				return;
			}

			// Plain-text branch: ignore HTML, always insertText.
			if ( plainTextOnly || ! html ) {
				insertAtRange( ownerDocument, range, {
					text: plainText || '',
				} );
				return;
			}

			// Rich branch: pasteHandler in INLINE mode normalises Word /
			// Google Docs / WP-block-marker HTML to clean inline markup that
			// is safe to drop into the cursor position.
			const inline = pasteHandler( {
				HTML: html,
				plainText,
				mode: 'INLINE',
				canUserUseUnfilteredHTML:
					getSettings().__experimentalCanUserUseUnfilteredHTML,
			} );

			if ( typeof inline === 'string' && inline ) {
				insertAtRange( ownerDocument, range, { html: inline } );
				return;
			}

			// pasteHandler decided the content is block-shaped. Best-effort
			// fallback: insert the plain-text view at the cursor.
			insertAtRange( ownerDocument, range, {
				text: plainText || '',
			} );
		},
		[ getSettings, createErrorNotice, plainTextOnly ]
	);
}

/**
 * Returns a callback that wraps the system clipboard's plain-text content in a
 * new block of the requested type and inserts it after the target block.
 * Used by `Paste as new block ▸ Paragraph / Preformatted / Table / List /
 * HTML`.
 *
 * @param {string} blockName The block type to wrap the clipboard content in.
 * @return {(targetClientId: string) => Promise<void>} Paste callback.
 */
export function usePasteAsBlockType( blockName ) {
	const { getBlockIndex, getBlockRootClientId } =
		useSelect( blockEditorStore );
	const { insertBlocks } = useDispatch( blockEditorStore );
	const { createErrorNotice } = useDispatch( noticesStore );

	return useCallback(
		async ( targetClientId ) => {
			const data = await readSystemClipboard();
			if ( ! data ) {
				createErrorNotice(
					__(
						'Unable to read the clipboard. Try the keyboard shortcut instead.'
					),
					{ type: 'snackbar' }
				);
				return;
			}

			const { html, plainText } = data;
			const text = plainText || ( html ? toPlainText( html ) : '' );
			if ( ! text && ! html ) {
				return;
			}

			const block = buildBlockOfType( blockName, { html, text } );
			if ( ! block ) {
				return;
			}

			const rootClientId = getBlockRootClientId( targetClientId );
			const index = getBlockIndex( targetClientId );
			insertBlocks( [ block ], index + 1, rootClientId );
		},
		[
			blockName,
			createErrorNotice,
			getBlockIndex,
			getBlockRootClientId,
			insertBlocks,
		]
	);
}

function buildBlockOfType( blockName, { html, text } ) {
	switch ( blockName ) {
		case 'core/preformatted':
			return createBlock( 'core/preformatted', { content: text } );
		case 'core/paragraph':
			return createBlock( 'core/paragraph', { content: text } );
		case 'core/html':
			return createBlock( 'core/html', { content: html || text } );
		case 'core/list': {
			const lines = ( text || '' )
				.split( '\n' )
				.map( ( line ) => line.trim() )
				.filter( Boolean );
			const items = ( lines.length ? lines : [ text || '' ] ).map(
				( line ) => createBlock( 'core/list-item', { content: line } )
			);
			return createBlock( 'core/list', {}, items );
		}
		case 'core/table': {
			// Best-effort: tab-separated cells, newline-separated rows. If
			// there are no rows the table block falls back to its own empty
			// placeholder.
			const rows = ( text || '' )
				.split( '\n' )
				.map( ( line ) => line )
				.filter( ( line ) => line.length > 0 )
				.map( ( line ) => ( {
					cells: line.split( '\t' ).map( ( cell ) => ( {
						content: cell.trim(),
						tag: 'td',
					} ) ),
				} ) );
			return createBlock(
				'core/table',
				rows.length ? { body: rows } : {}
			);
		}
		default:
			return null;
	}
}
