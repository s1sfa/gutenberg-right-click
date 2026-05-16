/**
 * WordPress dependencies
 */
import {
	Popover,
	privateApis as componentsPrivateApis,
} from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	applyFormat,
	create,
	getActiveFormat,
	removeFormat,
	toHTMLString,
} from '@wordpress/rich-text';

/**
 * Internal dependencies
 */
import ColorPalette from '../color-palette';
import {
	getColorClassName,
	getColorObjectByColorValue,
	getColorObjectByAttributeValues,
} from '../colors';
import { store as blockEditorStore } from '../../store';
import { unlock } from '../../lock-unlock';

const { Tabs } = unlock( componentsPrivateApis );

const FORMAT_NAME = 'core/text-color';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const TABS = [
	{ name: 'color', title: __( 'Text' ) },
	{ name: 'backgroundColor', title: __( 'Background' ) },
];

function parseCSS( css = '' ) {
	return css.split( ';' ).reduce( ( acc, rule ) => {
		if ( ! rule ) {
			return acc;
		}
		const [ property, value ] = rule.split( ':' );
		if ( property === 'color' ) {
			acc.color = value;
		}
		if ( property === 'background-color' && value !== TRANSPARENT ) {
			acc.backgroundColor = value;
		}
		return acc;
	}, {} );
}

function parseClassName( className = '', colorSettings ) {
	return className.split( ' ' ).reduce( ( acc, cls ) => {
		if ( cls.startsWith( 'has-' ) && cls.endsWith( '-color' ) ) {
			const slug = cls.replace( /^has-/, '' ).replace( /-color$/, '' );
			const obj = getColorObjectByAttributeValues( colorSettings, slug );
			if ( obj?.color ) {
				acc.color = obj.color;
			}
		}
		return acc;
	}, {} );
}

function getActiveColors( value, colorSettings ) {
	const active = getActiveFormat( value, FORMAT_NAME );
	if ( ! active ) {
		return {};
	}
	return {
		...parseCSS( active.attributes?.style ),
		...parseClassName( active.attributes?.class, colorSettings ),
	};
}

// Build the format attributes (class for palette colors, style for custom)
// the same way the format library's text-color does. Returns a new Value with
// the format applied or removed.
function setColors( value, colorSettings, partial ) {
	const merged = {
		...getActiveColors( value, colorSettings ),
		...partial,
	};
	const { color, backgroundColor } = merged;

	if ( ! color && ! backgroundColor ) {
		return removeFormat( value, FORMAT_NAME );
	}

	const styles = [];
	const classNames = [];
	const attributes = {};

	if ( backgroundColor ) {
		styles.push( `background-color:${ backgroundColor }` );
	} else {
		// Override the browser's default yellow <mark> background.
		styles.push( `background-color:${ TRANSPARENT }` );
	}

	if ( color ) {
		const colorObject = getColorObjectByColorValue( colorSettings, color );
		if ( colorObject ) {
			classNames.push( getColorClassName( 'color', colorObject.slug ) );
		} else {
			styles.push( `color:${ color }` );
		}
	}

	if ( styles.length ) {
		attributes.style = styles.join( ';' );
	}
	if ( classNames.length ) {
		attributes.class = classNames.join( ' ' );
	}

	return applyFormat( value, { type: FORMAT_NAME, attributes } );
}

function ColorTab( { property, value, onChange, colors } ) {
	const activeColors = useMemo(
		() => getActiveColors( value, colors ),
		[ value, colors ]
	);
	return (
		<ColorPalette
			value={ activeColors[ property ] }
			onChange={ ( next ) =>
				onChange( setColors( value, colors, { [ property ]: next } ) )
			}
			enableAlpha
			__experimentalIsRenderedInSidebar
		/>
	);
}

/**
 * Inline color picker triggered from the right-click menu's Font color item.
 * Mirrors the format library's `InlineColorUI` (Text / Background tabs, palette
 * + custom color), but lives in `block-editor` so this layer doesn't have to
 * depend on `format-library`.
 *
 * @param {Object}      props
 * @param {Object}      props.anchor   Popover anchor (cursor virtual rect).
 * @param {string}      props.clientId Target block client id.
 * @param {Range}       props.range    Captured DOM Range to apply the format to.
 * @param {HTMLElement} props.editable The block's contenteditable element.
 * @param {Function}    props.onClose  Close callback.
 * @return {Element} The popover.
 */
export default function TextColorPopover( {
	anchor,
	clientId,
	range,
	editable,
	onClose,
} ) {
	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const colors = useSelect(
		( select ) => select( blockEditorStore ).getSettings().colors ?? [],
		[]
	);

	const [ value, setValue ] = useState( () =>
		create( { element: editable, range } )
	);

	function onChange( nextValue ) {
		setValue( nextValue );
		updateBlockAttributes( clientId, {
			content: toHTMLString( { value: nextValue } ),
		} );
	}

	return (
		<Popover
			anchor={ anchor }
			placement="bottom-start"
			onClose={ onClose }
			onFocusOutside={ onClose }
			className="block-editor-block-context-menu__text-color-popover"
		>
			<Tabs>
				<Tabs.TabList>
					{ TABS.map( ( tab ) => (
						<Tabs.Tab tabId={ tab.name } key={ tab.name }>
							{ tab.title }
						</Tabs.Tab>
					) ) }
				</Tabs.TabList>
				{ TABS.map( ( tab ) => (
					<Tabs.TabPanel
						tabId={ tab.name }
						focusable={ false }
						key={ tab.name }
					>
						<ColorTab
							property={ tab.name }
							value={ value }
							onChange={ onChange }
							colors={ colors }
						/>
					</Tabs.TabPanel>
				) ) }
			</Tabs>
		</Popover>
	);
}
