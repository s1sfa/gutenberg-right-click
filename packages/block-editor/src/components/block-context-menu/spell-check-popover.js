/**
 * WordPress dependencies
 */
import { Button, Popover, Spinner } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { closeSmall } from '@wordpress/icons';
import { create, insert, toHTMLString } from '@wordpress/rich-text';

/**
 * Internal dependencies
 */
import { store as blockEditorStore } from '../../store';

const LANGUAGETOOL_ENDPOINT = 'https://api.languagetool.org/v2/check';
// LanguageTool returns dozens of replacements for some rules; trim to keep the
// popover usable. The remaining ones are rarely useful.
const MAX_REPLACEMENTS_PER_MATCH = 4;

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

export default function SpellCheckPopover( {
	clientId,
	text,
	range,
	anchor,
	onClose,
	language = 'en-US',
} ) {
	const [ matches, setMatches ] = useState( [] );
	const [ status, setStatus ] = useState( 'loading' );
	const [ error, setError ] = useState( null );
	const [ fullValue, setFullValue ] = useState( null );
	const [ selectionStartInBlock, setSelectionStartInBlock ] =
		useState( null );

	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { getBlockAttributes } = useSelect( blockEditorStore );

	useEffect( () => {
		let cancelled = false;

		// Snapshot the block's full rich-text value and the highlight's
		// start offset inside it. We work against this snapshot for the
		// session so successive replacements don't have to re-read a DOM
		// that's been mutated by the previous replacement.
		const editable = getEditableFromRange( range );
		if ( editable ) {
			const valueWithSelection = create( { element: editable, range } );
			if ( valueWithSelection.start !== undefined ) {
				setFullValue( create( { element: editable } ) );
				setSelectionStartInBlock( valueWithSelection.start );
			}
		}

		async function check() {
			try {
				const response = await fetch( LANGUAGETOOL_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: new URLSearchParams( {
						text,
						language,
					} ),
				} );
				if ( ! response.ok ) {
					throw new Error(
						`LanguageTool returned ${ response.status }`
					);
				}
				const data = await response.json();
				if ( cancelled ) {
					return;
				}
				setMatches( data.matches || [] );
				setStatus( 'done' );
			} catch ( err ) {
				if ( cancelled ) {
					return;
				}
				setError(
					err?.message ||
						__( 'Could not reach the spell-check service.' )
				);
				setStatus( 'error' );
			}
		}

		check();

		return () => {
			cancelled = true;
		};
	}, [ text, language, range ] );

	function applyReplacement( matchIndex, replacementValue ) {
		const match = matches[ matchIndex ];
		if ( ! fullValue || selectionStartInBlock === null || ! match ) {
			return;
		}

		// Fall back to the current block attribute if our cached fullValue
		// got out of sync (e.g. concurrent edit). Better to misplace one
		// replacement than to corrupt the block.
		const currentAttrs = getBlockAttributes( clientId );
		const baseValue =
			currentAttrs?.content !== undefined
				? create( { html: String( currentAttrs.content ) } )
				: fullValue;

		const replaceStart = selectionStartInBlock + match.offset;
		const replaceEnd = replaceStart + match.length;

		// Refuse to apply if the offset is out of bounds — the block
		// likely changed under us.
		if ( replaceEnd > baseValue.text.length ) {
			return;
		}

		const newValue = insert(
			baseValue,
			replacementValue,
			replaceStart,
			replaceEnd
		);
		updateBlockAttributes( clientId, {
			content: toHTMLString( { value: newValue } ),
		} );
		setFullValue( newValue );

		// Remove the applied match and shift remaining offsets by the
		// length delta so subsequent replacements still target the right
		// characters. Matches before the applied one are unaffected.
		const delta = replacementValue.length - match.length;
		setMatches(
			matches
				.filter( ( _, i ) => i !== matchIndex )
				.map( ( m ) => ( {
					...m,
					offset:
						m.offset > match.offset ? m.offset + delta : m.offset,
				} ) )
		);
	}

	function ignoreMatch( matchIndex ) {
		setMatches( matches.filter( ( _, i ) => i !== matchIndex ) );
	}

	return (
		<Popover
			anchor={ anchor }
			placement="bottom-start"
			onClose={ onClose }
			onFocusOutside={ onClose }
			className="block-editor-block-context-menu__spell-check-popover"
		>
			<div className="block-editor-block-context-menu__spell-check-header">
				<h3>{ __( 'Spelling & grammar' ) }</h3>
				<Button
					size="small"
					icon={ closeSmall }
					label={ __( 'Close' ) }
					onClick={ onClose }
				/>
			</div>

			{ status === 'loading' && (
				<div className="block-editor-block-context-menu__spell-check-status">
					<Spinner />
					<span>{ __( 'Checking…' ) }</span>
				</div>
			) }

			{ status === 'error' && (
				<p className="block-editor-block-context-menu__spell-check-error">
					{ error }
				</p>
			) }

			{ status === 'done' && matches.length === 0 && (
				<p className="block-editor-block-context-menu__spell-check-empty">
					{ __( 'No issues found.' ) }
				</p>
			) }

			{ status === 'done' && matches.length > 0 && (
				<ul className="block-editor-block-context-menu__spell-check-matches">
					{ matches.map( ( match, idx ) => (
						<li
							key={ `${ match.offset }-${
								match.rule?.id ?? idx
							}` }
							className="block-editor-block-context-menu__spell-check-match"
						>
							<p className="block-editor-block-context-menu__spell-check-message">
								{ match.shortMessage || match.message }
							</p>
							{ match.context?.text && (
								<p className="block-editor-block-context-menu__spell-check-context">
									{ renderContext( match.context ) }
								</p>
							) }
							<div className="block-editor-block-context-menu__spell-check-actions">
								{ match.replacements
									?.slice( 0, MAX_REPLACEMENTS_PER_MATCH )
									.map( ( replacement, i ) => (
										<Button
											key={ i }
											size="small"
											variant="secondary"
											onClick={ () =>
												applyReplacement(
													idx,
													replacement.value
												)
											}
										>
											{ replacement.value }
										</Button>
									) ) }
								<Button
									size="small"
									variant="tertiary"
									onClick={ () => ignoreMatch( idx ) }
								>
									{ __( 'Ignore' ) }
								</Button>
							</div>
						</li>
					) ) }
				</ul>
			) }

			<p className="block-editor-block-context-menu__spell-check-footer">
				{ sprintf(
					// translators: %s: name of the spell-check service.
					__( 'Suggestions provided by %s.' ),
					'LanguageTool'
				) }
			</p>
		</Popover>
	);
}

// LanguageTool returns an excerpt with offset/length pointing at the
// problematic span inside it. Render the surrounding text plain and the
// problematic span marked so the user can see what's flagged.
function renderContext( context ) {
	const { text, offset, length } = context;
	if (
		typeof offset !== 'number' ||
		typeof length !== 'number' ||
		offset < 0 ||
		offset + length > text.length
	) {
		return text;
	}
	const before = text.slice( 0, offset );
	const target = text.slice( offset, offset + length );
	const after = text.slice( offset + length );
	return (
		<>
			{ before }
			<mark>{ target }</mark>
			{ after }
		</>
	);
}
