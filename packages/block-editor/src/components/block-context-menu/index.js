/**
 * WordPress dependencies
 */
import {
	Button,
	MenuGroup,
	MenuItem,
	NavigableMenu,
	Popover,
} from '@wordpress/components';
import {
	createBlock,
	getBlockMenuDefaultClassName,
	getBlockType,
	getPossibleBlockTransformations,
	switchToBlockType,
} from '@wordpress/blocks';
import { useDispatch, useSelect } from '@wordpress/data';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { chevronLeft } from '@wordpress/icons';
import { create, slice, toHTMLString } from '@wordpress/rich-text';
import { pipe } from '@wordpress/compose';

/**
 * Internal dependencies
 */
import BlockActions from '../block-actions';
import BlockContextMenuControls from '../block-context-menu-controls';
import BlockIcon from '../block-icon';
import BlockModeToggle from '../block-settings-menu/block-mode-toggle';
import QuickInserter from '../inserter/quick-inserter';
import ParagraphContextMenuFills from './paragraph-fills';
import PasteNewBlockSubmenu from './paste-new-block-submenu';
import TextColorPopover from './text-color-popover';
import { store as blockEditorStore } from '../../store';
import { getBlockClientId } from '../../utils/dom';
import { useNotifyCopy } from '../../utils/use-notify-copy';
import {
	useCopyBlocksToClipboard,
	useCopyTextToClipboard,
	useInlinePasteAtRange,
} from './use-clipboard-helpers';

// Strip leading and trailing whitespace from a RichText Value while preserving
// any internal formats and inline objects. Returns the original value when
// there's nothing to trim.
function trimRichTextValue( value ) {
	const { text } = value;
	let start = 0;
	while ( start < text.length && /\s/.test( text[ start ] ) ) {
		start++;
	}
	let end = text.length;
	while ( end > start && /\s/.test( text[ end - 1 ] ) ) {
		end--;
	}
	if ( start === 0 && end === text.length ) {
		return value;
	}
	return slice( value, start, end );
}

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

function getCursorAnchor( ownerDocument, clientX, clientY ) {
	const { defaultView } = ownerDocument || {};
	const frame = defaultView?.frameElement;
	const offset = frame ? frame.getBoundingClientRect() : null;
	const x = offset ? clientX + offset.left : clientX;
	const y = offset ? clientY + offset.top : clientY;
	return {
		// Anchor lives in the parent document so the popover layers above
		// the canvas (and over any iframe).
		ownerDocument: typeof document !== 'undefined' ? document : undefined,
		getBoundingClientRect() {
			return new window.DOMRect( x, y, 0, 0 );
		},
	};
}

export default function BlockContextMenu( { __unstableContentRef } ) {
	const [ state, setState ] = useState( null );
	const [ view, setView ] = useState( 'main' );
	const [ inserterState, setInserterState ] = useState( null );
	const [ colorPickerState, setColorPickerState ] = useState( null );
	const popoverRef = useRef( null );
	const { selectBlock, clearSelectedBlock, replaceBlock } =
		useDispatch( blockEditorStore );
	const {
		getBlock,
		getBlockRootClientId,
		getNextBlockClientId,
		getSelectedBlockClientIds,
	} = useSelect( blockEditorStore );
	const notifyCopy = useNotifyCopy();
	const pasteInline = useInlinePasteAtRange();
	const pasteInlineAsPlainText = useInlinePasteAtRange( {
		plainTextOnly: true,
	} );
	const copyBlocks = useCopyBlocksToClipboard();
	const copyText = useCopyTextToClipboard();

	const close = useCallback( () => {
		setState( null );
		setView( 'main' );
	}, [] );

	const closeInserter = useCallback( () => setInserterState( null ), [] );
	const closeColorPicker = useCallback(
		() => setColorPickerState( null ),
		[]
	);

	// Close the menu when the user interacts with the canvas — typing or
	// clicking inside the editor signals they're done with the menu. The
	// listeners only install while the menu is open and are scoped to the
	// canvas document so they don't disturb interactions elsewhere in the
	// editor chrome.
	useEffect( () => {
		if ( ! state?.ownerDocument ) {
			return undefined;
		}
		const doc = state.ownerDocument;
		function dismiss( event ) {
			// In non-iframed editors the popover renders into the same
			// document as the canvas, so menu-item mousedowns reach this
			// capture-phase listener before their click can fire. Skip the
			// dismiss when the event originates inside the popover itself.
			if ( popoverRef.current?.contains( event.target ) ) {
				return;
			}
			// Right-button mousedowns are paired with a contextmenu event
			// just after. `handleContextMenu` reads `popoverRef.current` to
			// decide whether to keep the menu, close it (second right-click
			// → native menu fall-through), or open a fresh one. Closing here
			// would break that detection.
			if ( event.type === 'mousedown' && event.button === 2 ) {
				return;
			}
			close();
		}
		doc.addEventListener( 'mousedown', dismiss, true );
		doc.addEventListener( 'keydown', dismiss, true );
		return () => {
			doc.removeEventListener( 'mousedown', dismiss, true );
			doc.removeEventListener( 'keydown', dismiss, true );
		};
	}, [ state, close ] );

	useEffect( () => {
		// The canvas content ref points at the iframe's <body>, which is
		// mounted via createPortal only after the iframe's load event — that
		// happens several render cycles after BlockTools mounts. We poll on
		// requestAnimationFrame until the ref is populated, then install the
		// listener once. The `cancelled` flag guards both the poll and the
		// install path against late callbacks after unmount.
		let cancelled = false;
		let frameId = 0;
		let installedDoc = null;
		let installedHandler = null;

		function handleContextMenu( event ) {
			// A second right-click while the menu is already open falls
			// through to the browser's native menu — useful for reaching
			// spell-check / "Search …" / etc. without first dismissing the
			// menu by other means. The mousedown dismiss handler skips
			// right-button events so the popover is still mounted at this
			// point and `popoverRef.current` is truthy.
			if ( popoverRef.current ) {
				setState( null );
				setView( 'main' );
				return;
			}

			// Shift + right-click also bypasses the custom menu — same
			// reasoning, but works on the first right-click too.
			if ( event.shiftKey ) {
				return;
			}

			// Resolve the right-clicked block. If the click did not land on a
			// block (canvas margin, between blocks, on chrome inside the
			// iframe), bail and let the browser show its native menu.
			const clientId = getBlockClientId( event.target );
			if ( ! clientId ) {
				return;
			}
			event.preventDefault();

			// Preserve an existing multi-selection when right-clicking inside
			// it. Otherwise, single-select the right-clicked block.
			const selected = getSelectedBlockClientIds();
			const targetClientIds =
				selected.length > 1 && selected.includes( clientId )
					? selected
					: [ clientId ];
			if ( targetClientIds.length === 1 ) {
				selectBlock( clientId );
			}

			// Capture the selection at right-click time, before opening the
			// popover steals focus. The cloned Range survives focus changes
			// as long as the underlying DOM nodes aren't replaced. The
			// captured range and `selectionText` flow into paste-at-cursor
			// and copy-highlighted-text actions, and into per-block fills
			// (e.g. paragraph formatting) via the BlockContextMenuControls
			// slot's fillProps.
			//
			// Only keep the range if it sits inside the right-clicked block.
			// Without this guard, the selection from a previously focused
			// block A could be used by an action targeting block B —
			// formats would be computed from A and written into B, paste
			// would land in A's editable, etc.
			const selection = installedDoc?.getSelection?.();
			let range = null;
			let selectionText = '';
			if ( selection && selection.rangeCount > 0 ) {
				const candidate = selection.getRangeAt( 0 );
				const rangeBlockId = getBlockClientId(
					candidate.startContainer
				);
				if ( rangeBlockId === clientId ) {
					range = candidate.cloneRange();
					selectionText = selection.toString();
				}
			}

			setView( 'main' );
			setInserterState( null );
			setColorPickerState( null );
			setState( {
				clientIds: targetClientIds,
				ownerDocument: installedDoc,
				clientX: event.clientX,
				clientY: event.clientY,
				range,
				selectionText,
			} );
		}

		function tryInstall() {
			if ( cancelled ) {
				return;
			}
			const ownerDocument = __unstableContentRef?.current?.ownerDocument;
			if ( ! ownerDocument ) {
				frameId = window.requestAnimationFrame( tryInstall );
				return;
			}
			installedDoc = ownerDocument;
			installedHandler = handleContextMenu;
			ownerDocument.addEventListener( 'contextmenu', handleContextMenu );
		}

		tryInstall();

		return () => {
			cancelled = true;
			if ( frameId ) {
				window.cancelAnimationFrame( frameId );
			}
			if ( installedDoc && installedHandler ) {
				installedDoc.removeEventListener(
					'contextmenu',
					installedHandler
				);
			}
		};
	}, [ __unstableContentRef, selectBlock, getSelectedBlockClientIds ] );

	const anchor = useMemo( () => {
		if ( ! state ) {
			return null;
		}
		return getCursorAnchor(
			state.ownerDocument,
			state.clientX,
			state.clientY
		);
	}, [ state ] );

	const inserterAnchor = useMemo( () => {
		if ( ! inserterState ) {
			return null;
		}
		return getCursorAnchor(
			inserterState.ownerDocument,
			inserterState.clientX,
			inserterState.clientY
		);
	}, [ inserterState ] );

	const colorPickerAnchor = useMemo( () => {
		if ( ! colorPickerState ) {
			return null;
		}
		return getCursorAnchor(
			colorPickerState.ownerDocument,
			colorPickerState.clientX,
			colorPickerState.clientY
		);
	}, [ colorPickerState ] );

	const openColorPicker = useCallback(
		( payload ) => {
			if ( ! state ) {
				return;
			}
			setColorPickerState( {
				clientId: payload.clientId,
				range: payload.range,
				editable: payload.editable,
				clientX: state.clientX,
				clientY: state.clientY,
				ownerDocument: state.ownerDocument,
			} );
			close();
		},
		[ state, close ]
	);

	// Split block is meaningful only for a single-block target with a
	// non-empty text selection, and only for blocks whose rich content lives
	// in a `content` attribute and have no nested innerBlocks (paragraph,
	// heading, quote, preformatted, code, verse, etc.). Build the three
	// sliced RichText values up-front so the picker can list possible block
	// transformations without re-slicing on each interaction.
	const splitSlices = useMemo( () => {
		if ( ! state ) {
			return null;
		}
		const { clientIds: ids, range: r, selectionText: sel } = state;
		if ( ids.length !== 1 || ! sel || ! r ) {
			return null;
		}
		const block = getBlock( ids[ 0 ] );
		if (
			! block ||
			typeof block.attributes?.content === 'undefined' ||
			( block.innerBlocks?.length ?? 0 ) > 0
		) {
			return null;
		}
		const editable = getEditableFromRange( r );
		if ( ! editable ) {
			return null;
		}
		const value = create( { element: editable, range: r } );
		if (
			value.start === undefined ||
			value.end === undefined ||
			value.start === value.end
		) {
			return null;
		}
		return {
			block,
			before: slice( value, 0, value.start ),
			selected: slice( value, value.start, value.end ),
			after: slice( value, value.end, value.text.length ),
		};
	}, [ state, getBlock ] );

	// Block types the selection can become. `getPossibleBlockTransformations`
	// returns the set of types whose `from` transforms accept the middle piece
	// (built as a paragraph-shaped block). The original type is prepended so
	// "split as same type" is always available.
	const splitTransformOptions = useMemo( () => {
		if ( ! splitSlices ) {
			return [];
		}
		const { block, selected } = splitSlices;
		const middleAsOriginal = createBlock( block.name, {
			...block.attributes,
			content: toHTMLString( { value: selected } ),
		} );
		const originalType = getBlockType( block.name );
		const transforms = getPossibleBlockTransformations( [
			middleAsOriginal,
		] ).filter( ( item ) => item.name !== block.name );
		return [
			{
				name: originalType.name,
				title: originalType.title,
				icon: originalType.icon,
			},
			...transforms.map( ( t ) => ( {
				name: t.name,
				title: t.title,
				icon: t.icon,
			} ) ),
		];
	}, [ splitSlices ] );
	const canSplitBlock = !! splitSlices;

	const inserterPopover = inserterState && (
		<Popover
			anchor={ inserterAnchor }
			placement="bottom-start"
			onClose={ closeInserter }
			onFocusOutside={ closeInserter }
			className="block-editor-block-context-menu__inserter-popover"
		>
			<QuickInserter
				rootClientId={ inserterState.rootClientId }
				clientId={ inserterState.clientId ?? undefined }
				isAppender={ inserterState.isAppender }
				selectBlockOnInsert
				onSelect={ closeInserter }
			/>
		</Popover>
	);

	const colorPickerPopover = colorPickerState && (
		<TextColorPopover
			anchor={ colorPickerAnchor }
			clientId={ colorPickerState.clientId }
			range={ colorPickerState.range }
			editable={ colorPickerState.editable }
			onClose={ closeColorPicker }
		/>
	);

	if ( ! state ) {
		return (
			<>
				{ inserterPopover }
				{ colorPickerPopover }
			</>
		);
	}

	const { clientIds, range, selectionText, ownerDocument } = state;
	const isSingleBlock = clientIds.length === 1;
	const hasTextSelection = !! selectionText;
	// Right-click inside a multi-selection still copies the selected blocks;
	// the per-text selection is only meaningful when the menu targets a
	// single block.
	const canCopyTextSelection = isSingleBlock && hasTextSelection;

	function handleCopy() {
		if ( canCopyTextSelection ) {
			copyText( selectionText );
		} else if ( ! isSingleBlock ) {
			// Multi-block selection: fall back to copying all blocks.
			copyBlocks( clientIds ).then( ( ok ) => {
				if ( ok ) {
					notifyCopy( 'copy', clientIds );
				}
			} );
		}
		close();
	}

	function splitBlockAs( targetBlockName ) {
		if ( ! splitSlices ) {
			close();
			return;
		}
		const { block, before, selected, after } = splitSlices;
		const { name: origName, attributes: origAttrs } = block;

		// Trim whitespace at the block boundaries so split pieces don't keep a
		// dangling space at the join. Internal whitespace is preserved.
		const selectedT = trimRichTextValue( selected );
		if ( selectedT.text.length === 0 ) {
			close();
			return;
		}
		const beforeT = trimRichTextValue( before );
		const afterT = trimRichTextValue( after );

		// `anchor` is an HTML id and so unique by definition. Keep it on the
		// first resulting fragment and strip it from the rest so split
		// pieces don't collide on the same DOM id.
		const { anchor: _anchor, ...attrsWithoutAnchor } = origAttrs;
		const hasBefore = beforeT.text.length > 0;

		const middleAsOriginal = createBlock( origName, {
			...( hasBefore ? attrsWithoutAnchor : origAttrs ),
			content: toHTMLString( { value: selectedT } ),
		} );
		const middleBlocks =
			targetBlockName === origName
				? [ middleAsOriginal ]
				: switchToBlockType(
						[ middleAsOriginal ],
						targetBlockName
				  ) || [ middleAsOriginal ];

		const newBlocks = [];
		if ( hasBefore ) {
			newBlocks.push(
				createBlock( origName, {
					...origAttrs,
					content: toHTMLString( { value: beforeT } ),
				} )
			);
		}
		newBlocks.push( ...middleBlocks );
		if ( afterT.text.length > 0 ) {
			newBlocks.push(
				createBlock( origName, {
					...attrsWithoutAnchor,
					content: toHTMLString( { value: afterT } ),
				} )
			);
		}
		replaceBlock( clientIds[ 0 ], newBlocks );
		close();
	}

	const lastTargetClientId = clientIds[ clientIds.length - 1 ];
	const firstTargetClientId = clientIds[ 0 ];

	function openInserter( position ) {
		const referenceClientId =
			position === 'above' ? firstTargetClientId : lastTargetClientId;
		const rootClientId = getBlockRootClientId( referenceClientId );

		// Build the Inserter target so QuickInserter computes the right
		// destinationIndex. Inserting at `getBlockIndex(clientId)` pushes that
		// block down, so passing `clientId={target}` inserts BEFORE target,
		// and passing the next-sibling's clientId inserts AFTER target. When
		// there is no next sibling, fall back to `isAppender` so the new
		// block lands at the end of the parent.
		let targetClientId;
		let isAppender = false;
		if ( position === 'above' ) {
			targetClientId = referenceClientId;
		} else {
			const next = getNextBlockClientId( referenceClientId );
			if ( next ) {
				targetClientId = next;
			} else {
				targetClientId = null;
				isAppender = true;
			}
		}

		// Clear the selection before the inserter opens. `useInsertionPoint`'s
		// onInsertBlocks branches to `replaceBlocks` whenever the currently
		// selected block is an unmodified default paragraph — which is exactly
		// the case after right-clicking an empty paragraph and choosing
		// `Add block above/below`. Without this, the inserter would *replace*
		// the empty paragraph instead of inserting a new sibling.
		clearSelectedBlock();

		setInserterState( {
			clientId: targetClientId,
			rootClientId,
			isAppender,
			clientX: state.clientX,
			clientY: state.clientY,
			ownerDocument: state.ownerDocument,
		} );
		close();
	}

	return (
		<Popover
			ref={ popoverRef }
			anchor={ anchor }
			placement="bottom-start"
			onClose={ close }
			onFocusOutside={ close }
			className="block-editor-block-context-menu"
		>
			{ view === 'paste-new-block' ? (
				<PasteNewBlockSubmenu
					targetClientId={ lastTargetClientId }
					onBack={ () => setView( 'main' ) }
					onClose={ close }
				/>
			) : (
				<BlockActions clientIds={ clientIds }>
					{ ( {
						canDuplicate,
						canInsertBlock,
						canRemove,
						onDuplicate,
						onRemove,
					} ) => (
						<NavigableMenu>
							{ view === 'split-block-picker' && (
								<>
									<MenuGroup>
										<Button
											__next40pxDefaultSize
											className="block-editor-block-context-menu__back"
											icon={ chevronLeft }
											onClick={ () =>
												setView( 'blocks-submenu' )
											}
										>
											{ __( 'Back' ) }
										</Button>
									</MenuGroup>
									<MenuGroup label={ __( 'Split block as' ) }>
										{ splitTransformOptions.map(
											( item ) => (
												<MenuItem
													key={ item.name }
													className={ getBlockMenuDefaultClassName(
														item.name
													) }
													onClick={ () =>
														splitBlockAs(
															item.name
														)
													}
												>
													<BlockIcon
														icon={ item.icon }
														showColors
													/>
													{ item.title }
												</MenuItem>
											)
										) }
									</MenuGroup>
								</>
							) }
							{ view === 'blocks-submenu' && (
								<>
									<MenuGroup>
										<Button
											__next40pxDefaultSize
											className="block-editor-block-context-menu__back"
											icon={ chevronLeft }
											onClick={ () => setView( 'main' ) }
										>
											{ __( 'Back' ) }
										</Button>
									</MenuGroup>
									<MenuGroup label={ __( 'Blocks' ) }>
										{ canInsertBlock && (
											<>
												<MenuItem
													onClick={ () =>
														openInserter( 'above' )
													}
												>
													{ __( 'Add block above…' ) }
												</MenuItem>
												<MenuItem
													onClick={ () =>
														openInserter( 'below' )
													}
												>
													{ __( 'Add block below…' ) }
												</MenuItem>
											</>
										) }
										{ canDuplicate && (
											<MenuItem
												onClick={ pipe(
													close,
													onDuplicate
												) }
											>
												{ __( 'Duplicate' ) }
											</MenuItem>
										) }
										<MenuItem
											disabled={
												! canSplitBlock || ! canRemove
											}
											accessibleWhenDisabled
											onClick={ () =>
												setView( 'split-block-picker' )
											}
										>
											{ __( 'Split block ▸' ) }
										</MenuItem>
									</MenuGroup>
								</>
							) }
							{ view === 'main' && (
								<>
									<MenuGroup>
										<MenuItem
											onClick={ () =>
												setView( 'blocks-submenu' )
											}
										>
											{ __( 'Blocks ▸' ) }
										</MenuItem>
									</MenuGroup>
									<MenuGroup>
										<MenuItem
											disabled={
												! canCopyTextSelection &&
												isSingleBlock
											}
											accessibleWhenDisabled
											onClick={ handleCopy }
										>
											{ isSingleBlock
												? __( 'Copy Text' )
												: __( 'Copy Blocks' ) }
										</MenuItem>
										<MenuItem
											onClick={ () => {
												pasteInline( {
													range,
													ownerDocument,
												} );
												close();
											} }
										>
											{ __( 'Paste' ) }
										</MenuItem>
									</MenuGroup>
									<MenuGroup label={ __( 'Paste special' ) }>
										<MenuItem
											onClick={ () => {
												pasteInlineAsPlainText( {
													range,
													ownerDocument,
												} );
												close();
											} }
										>
											{ __( 'Paste as plain text' ) }
										</MenuItem>
										<MenuItem
											onClick={ () =>
												setView( 'paste-new-block' )
											}
										>
											{ __( 'Paste as new block ▸' ) }
										</MenuItem>
									</MenuGroup>
									{ isSingleBlock && (
										<MenuGroup label={ __( 'Tools' ) }>
											<BlockModeToggle
												clientId={ firstTargetClientId }
												onToggle={ close }
											/>
										</MenuGroup>
									) }
								</>
							) }
							{ /* Block-specific items and plugin extensions
							 * fill into the BlockContextMenuControls slot.
							 * Fills receive `view` and `setView` so they can
							 * push their own submenu — when `view` is a
							 * fill-owned name (anything other than 'main' or
							 * 'paste-new-block'), the parent skips its own
							 * items and the matching fill renders its submenu
							 * exclusively. Paragraph fills mount alongside so
							 * they register in time for first render. */ }
							<ParagraphContextMenuFills
								clientIds={ clientIds }
							/>
							<BlockContextMenuControls.Slot
								fillProps={ {
									clientIds,
									range,
									ownerDocument,
									selectionText,
									view,
									setView,
									openColorPicker,
									onClose: close,
								} }
							/>
							{ view === 'main' && canRemove && (
								<MenuGroup>
									<MenuItem
										onClick={ pipe( close, onRemove ) }
										isDestructive
									>
										{ isSingleBlock
											? __( 'Delete Block' )
											: __( 'Delete Blocks' ) }
									</MenuItem>
								</MenuGroup>
							) }
						</NavigableMenu>
					) }
				</BlockActions>
			) }
		</Popover>
	);
}
