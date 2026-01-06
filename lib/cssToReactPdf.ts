/**
 * CSS to react-pdf Style Converter (Complete Version)
 * 
 * Parses CSS from EPUBs and converts to react-pdf StyleSheet format.
 * Based on react-pdf styling.md documentation (Jan 2026)
 * 
 * Philosophy: Words > Layout > Styling
 * - Never lose text content
 * - Unsupported properties get silently skipped
 * - Graceful degradation over crashes
 */

import * as csstree from 'css-tree';

// =============================================================================
// SUPPORTED PROPERTIES (from react-pdf styling.md)
// =============================================================================

const SUPPORTED_PROPERTIES = new Set([
  // Flexbox
  'alignContent', 'alignItems', 'alignSelf', 'flex', 'flexDirection',
  'flexWrap', 'flexFlow', 'flexGrow', 'flexShrink', 'flexBasis',
  'justifyContent', 'gap', 'rowGap', 'columnGap',
  
  // Layout
  'bottom', 'display', 'left', 'position', 'right', 'top', 'overflow', 'zIndex',
  
  // Dimension
  'height', 'maxHeight', 'maxWidth', 'minHeight', 'minWidth', 'width',
  
  // Color
  'backgroundColor', 'color', 'opacity',
  
  // Text (font properties excluded - use hard-coded styles for font/size)
  'letterSpacing', 'maxLines', 'textAlign', 'textDecoration', 'textDecorationColor',
  'textDecorationStyle', 'textIndent', 'textOverflow', 'textTransform',
  
  // Sizing/positioning
  'objectFit', 'objectPosition',
  
  // Margin/padding (including react-pdf specific horizontal/vertical)
  'margin', 'marginHorizontal', 'marginVertical',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingHorizontal', 'paddingVertical',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  
  // Transforms
  'transform', 'transformOrigin',
  
  // Borders
  'border', 'borderColor', 'borderStyle', 'borderWidth',
  'borderTop', 'borderTopColor', 'borderTopStyle', 'borderTopWidth',
  'borderRight', 'borderRightColor', 'borderRightStyle', 'borderRightWidth',
  'borderBottom', 'borderBottomColor', 'borderBottomStyle', 'borderBottomWidth',
  'borderLeft', 'borderLeftColor', 'borderLeftStyle', 'borderLeftWidth',
  'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomRightRadius', 'borderBottomLeftRadius',
]);

// =============================================================================
// CSS PROPERTY NAME TO REACT-PDF PROPERTY NAME MAPPING
// =============================================================================

const PROPERTY_MAP: Record<string, string> = {
  // Text
  'text-indent': 'textIndent',
  'text-align': 'textAlign',
  'text-decoration': 'textDecoration',
  'text-decoration-color': 'textDecorationColor',
  'text-decoration-style': 'textDecorationStyle',
  'text-transform': 'textTransform',
  'text-overflow': 'textOverflow',
  // font-size, font-family, font-style, font-weight, line-height excluded
  // use hard-coded styles for font properties
  'letter-spacing': 'letterSpacing',
  'max-lines': 'maxLines',
  
  // Color
  'background-color': 'backgroundColor',
  
  // Sizing/positioning
  'object-fit': 'objectFit',
  'object-position': 'objectPosition',
  
  // Margin
  'margin-top': 'marginTop',
  'margin-right': 'marginRight',
  'margin-bottom': 'marginBottom',
  'margin-left': 'marginLeft',
  
  // Padding
  'padding-top': 'paddingTop',
  'padding-right': 'paddingRight',
  'padding-bottom': 'paddingBottom',
  'padding-left': 'paddingLeft',
  
  // Transforms
  'transform': 'transform',
  'transform-origin': 'transformOrigin',
  
  // Borders
  'border-color': 'borderColor',
  'border-style': 'borderStyle',
  'border-width': 'borderWidth',
  'border-top': 'borderTop',
  'border-top-color': 'borderTopColor',
  'border-top-style': 'borderTopStyle',
  'border-top-width': 'borderTopWidth',
  'border-right': 'borderRight',
  'border-right-color': 'borderRightColor',
  'border-right-style': 'borderRightStyle',
  'border-right-width': 'borderRightWidth',
  'border-bottom': 'borderBottom',
  'border-bottom-color': 'borderBottomColor',
  'border-bottom-style': 'borderBottomStyle',
  'border-bottom-width': 'borderBottomWidth',
  'border-left': 'borderLeft',
  'border-left-color': 'borderLeftColor',
  'border-left-style': 'borderLeftStyle',
  'border-left-width': 'borderLeftWidth',
  'border-top-left-radius': 'borderTopLeftRadius',
  'border-top-right-radius': 'borderTopRightRadius',
  'border-bottom-right-radius': 'borderBottomRightRadius',
  'border-bottom-left-radius': 'borderBottomLeftRadius',
  
  // Dimension
  'max-width': 'maxWidth',
  'max-height': 'maxHeight',
  'min-width': 'minWidth',
  'min-height': 'minHeight',
  
  // Flexbox
  'flex-direction': 'flexDirection',
  'flex-wrap': 'flexWrap',
  'flex-flow': 'flexFlow',
  'flex-grow': 'flexGrow',
  'flex-shrink': 'flexShrink',
  'flex-basis': 'flexBasis',
  'justify-content': 'justifyContent',
  'align-items': 'alignItems',
  'align-self': 'alignSelf',
  'align-content': 'alignContent',
  'row-gap': 'rowGap',
  'column-gap': 'columnGap',
  
  // Layout
  'z-index': 'zIndex',
  
  // Direct mappings (CSS name = react-pdf name)
  'margin': 'margin',
  'padding': 'padding',
  'border': 'border',
  'width': 'width',
  'height': 'height',
  'top': 'top',
  'right': 'right',
  'bottom': 'bottom',
  'left': 'left',
  'position': 'position',
  'display': 'display',
  'overflow': 'overflow',
  'opacity': 'opacity',
  'color': 'color',
  'flex': 'flex',
  'gap': 'gap',
};

// Base font size for em conversion (standard is 11pt)
const BASE_FONT_SIZE_PT = 11;

// =============================================================================
// UNIT CONVERSION
// =============================================================================

/**
 * Convert CSS unit value to react-pdf compatible value
 * Supports: em, rem, px, pt, in, mm, cm, %, vw, vh
 */
function convertUnit(value: string): number | string {
  if (!value || value === 'inherit' || value === 'initial' || value === 'unset' || value === 'auto') {
    return value;
  }

  const trimmed = value.trim();
  
  // Pure number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Percentage - keep as string
  if (trimmed.endsWith('%')) {
    return trimmed;
  }

  // em units - convert to pt
  const emMatch = trimmed.match(/^(-?\d+\.?\d*)em$/);
  if (emMatch) {
    return parseFloat(emMatch[1]) * BASE_FONT_SIZE_PT;
  }

  // rem units - treat same as em
  const remMatch = trimmed.match(/^(-?\d+\.?\d*)rem$/);
  if (remMatch) {
    return parseFloat(remMatch[1]) * BASE_FONT_SIZE_PT;
  }

  // px units - convert to pt (1px = 0.75pt at 72dpi)
  const pxMatch = trimmed.match(/^(-?\d+\.?\d*)px$/);
  if (pxMatch) {
    return parseFloat(pxMatch[1]) * 0.75;
  }

  // pt units - extract number
  const ptMatch = trimmed.match(/^(-?\d+\.?\d*)pt$/);
  if (ptMatch) {
    return parseFloat(ptMatch[1]);
  }

  // in units - convert to pt (1in = 72pt)
  const inMatch = trimmed.match(/^(-?\d+\.?\d*)in$/);
  if (inMatch) {
    return parseFloat(inMatch[1]) * 72;
  }

  // mm units - convert to pt (1mm = 2.83465pt)
  const mmMatch = trimmed.match(/^(-?\d+\.?\d*)mm$/);
  if (mmMatch) {
    return parseFloat(mmMatch[1]) * 2.83465;
  }

  // cm units - convert to pt (1cm = 28.3465pt)
  const cmMatch = trimmed.match(/^(-?\d+\.?\d*)cm$/);
  if (cmMatch) {
    return parseFloat(cmMatch[1]) * 28.3465;
  }

  // vw/vh - keep as string, react-pdf supports these
  if (trimmed.endsWith('vw') || trimmed.endsWith('vh')) {
    return trimmed;
  }

  // Return as-is for keywords like 'auto', 'none', 'bold', 'italic', etc.
  return trimmed;
}

// =============================================================================
// TRANSFORM PARSING
// =============================================================================

/**
 * Parse CSS transform value to react-pdf transform array
 * 
 * CSS: transform: rotate(45deg) scale(1.5) translateX(10px)
 * react-pdf: [{ rotate: '45deg' }, { scale: 1.5 }, { translateX: 10 }]
 * 
 * Supported: rotate, scale, scaleX, scaleY, translate, translateX, translateY,
 *            skew, skewX, skewY, matrix
 */
function parseTransform(cssValue: string): Array<Record<string, any>> | null {
  const transforms: Array<Record<string, any>> = [];
  
  // Match transform functions: name(value) or name(value, value)
  const regex = /(\w+)\(([^)]+)\)/g;
  let match;
  
  while ((match = regex.exec(cssValue)) !== null) {
    const funcName = match[1];
    const args = match[2].split(',').map(a => a.trim());
    
    switch (funcName) {
      case 'rotate':
        transforms.push({ rotate: args[0] });
        break;
        
      case 'scale':
        if (args.length === 1) {
          transforms.push({ scale: parseFloat(args[0]) || 1 });
        } else {
          transforms.push({ scaleX: parseFloat(args[0]) || 1 });
          transforms.push({ scaleY: parseFloat(args[1]) || 1 });
        }
        break;
        
      case 'scaleX':
        transforms.push({ scaleX: parseFloat(args[0]) || 1 });
        break;
        
      case 'scaleY':
        transforms.push({ scaleY: parseFloat(args[0]) || 1 });
        break;
        
      case 'translate':
        if (args.length >= 1) {
          transforms.push({ translateX: convertUnit(args[0]) });
        }
        if (args.length >= 2) {
          transforms.push({ translateY: convertUnit(args[1]) });
        }
        break;
        
      case 'translateX':
        transforms.push({ translateX: convertUnit(args[0]) });
        break;
        
      case 'translateY':
        transforms.push({ translateY: convertUnit(args[0]) });
        break;
        
      case 'skew':
        if (args.length >= 1) {
          transforms.push({ skewX: args[0] });
        }
        if (args.length >= 2) {
          transforms.push({ skewY: args[1] });
        }
        break;
        
      case 'skewX':
        transforms.push({ skewX: args[0] });
        break;
        
      case 'skewY':
        transforms.push({ skewY: args[0] });
        break;
        
      case 'matrix':
        // matrix(a, b, c, d, tx, ty)
        if (args.length === 6) {
          transforms.push({
            matrix: args.map(a => parseFloat(a) || 0),
          });
        }
        break;
        
      default:
        // Unknown transform function - skip silently
        break;
    }
  }
  
  return transforms.length > 0 ? transforms : null;
}

// =============================================================================
// MARGIN/PADDING SHORTHAND HANDLING
// =============================================================================

/**
 * Convert result type for properties that may expand to multiple properties
 */
type ConvertResult = 
  | { key: string; value: any }
  | { multiple: Array<{ key: string; value: any }> }
  | null;

/**
 * Handle margin/padding shorthand (1-4 values)
 * Uses react-pdf's marginHorizontal, marginVertical, etc.
 */
function convertBoxShorthand(property: string, value: string): ConvertResult {
  const parts = value.split(/\s+/).map(v => convertUnit(v));
  const prefix = property; // 'margin' or 'padding'
  
  // 1 value: all sides
  if (parts.length === 1) {
    return { key: property, value: parts[0] };
  }
  
  // 2 values: vertical horizontal
  if (parts.length === 2) {
    return {
      multiple: [
        { key: `${prefix}Vertical`, value: parts[0] },
        { key: `${prefix}Horizontal`, value: parts[1] },
      ]
    };
  }
  
  // 3 values: top horizontal bottom
  if (parts.length === 3) {
    return {
      multiple: [
        { key: `${prefix}Top`, value: parts[0] },
        { key: `${prefix}Horizontal`, value: parts[1] },
        { key: `${prefix}Bottom`, value: parts[2] },
      ]
    };
  }
  
  // 4 values: top right bottom left
  if (parts.length === 4) {
    return {
      multiple: [
        { key: `${prefix}Top`, value: parts[0] },
        { key: `${prefix}Right`, value: parts[1] },
        { key: `${prefix}Bottom`, value: parts[2] },
        { key: `${prefix}Left`, value: parts[3] },
      ]
    };
  }
  
  // Fallback
  return { key: property, value: parts[0] };
}

// =============================================================================
// PROPERTY CONVERSION
// =============================================================================

/**
 * Convert a CSS property-value pair to react-pdf format
 */
function convertProperty(cssProperty: string, cssValue: string): ConvertResult {
  const reactPdfKey = PROPERTY_MAP[cssProperty] || camelCase(cssProperty);

  // Skip if react-pdf doesn't support this property
  if (!SUPPORTED_PROPERTIES.has(reactPdfKey)) {
    return null;
  }

  // Skip CSS keyword values that react-pdf doesn't support
  if (['inherit', 'initial', 'unset', 'revert'].includes(cssValue.trim().toLowerCase())) {
    return null;
  }

  // Special handling for certain properties
  switch (cssProperty) {
    case 'font-weight':
      if (cssValue === 'bold') return { key: reactPdfKey, value: 'bold' };
      if (cssValue === 'normal') return { key: reactPdfKey, value: 'normal' };
      const weight = parseInt(cssValue);
      if (!isNaN(weight)) return { key: reactPdfKey, value: weight };
      return { key: reactPdfKey, value: cssValue };

    case 'font-style':
      // 'normal' | 'italic' | 'oblique'
      return { key: reactPdfKey, value: cssValue };

    case 'text-align':
      // 'left' | 'right' | 'center' | 'justify'
      if (['left', 'right', 'center', 'justify'].includes(cssValue)) {
        return { key: reactPdfKey, value: cssValue };
      }
      return null;

    case 'text-decoration':
      // 'none' | 'underline' | 'line-through' | 'underline line-through'
      if (['none', 'underline', 'line-through', 'underline line-through'].includes(cssValue)) {
        return { key: reactPdfKey, value: cssValue };
      }
      return null;

    case 'text-transform':
      // 'none' | 'uppercase' | 'lowercase' | 'capitalize'
      if (['none', 'uppercase', 'lowercase', 'capitalize'].includes(cssValue)) {
        return { key: reactPdfKey, value: cssValue };
      }
      return null;

    case 'display':
      // react-pdf only supports 'flex' and 'none'
      // We IGNORE 'none' to preserve text (Words > Layout > Styling)
      if (cssValue === 'flex') return { key: reactPdfKey, value: 'flex' };
      return null;

    case 'position':
      // 'absolute' | 'relative'
      if (['absolute', 'relative'].includes(cssValue)) {
        return { key: reactPdfKey, value: cssValue };
      }
      return null;

    case 'line-height':
      return { key: reactPdfKey, value: convertUnit(cssValue) };

    case 'margin':
    case 'padding':
      return convertBoxShorthand(reactPdfKey, cssValue);

    case 'transform':
      const transformArray = parseTransform(cssValue);
      if (transformArray) {
        return { key: 'transform', value: transformArray };
      }
      return null;

    case 'transform-origin':
      // Keep as string: "50% 50%", "center center", "left top", etc.
      return { key: 'transformOrigin', value: cssValue };

    case 'object-fit':
      // 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
      return { key: reactPdfKey, value: cssValue };

    case 'object-position':
      // Keep as string
      return { key: reactPdfKey, value: cssValue };

    default:
      // Generic conversion
      return { key: reactPdfKey, value: convertUnit(cssValue) };
  }
}

/**
 * Convert kebab-case to camelCase
 */
function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

// =============================================================================
// DECLARATION BLOCK PARSING
// =============================================================================

/**
 * Parse a CSS declaration block string and return react-pdf style object
 */
function parseDeclarationBlock(cssText: string): Record<string, any> {
  const style: Record<string, any> = {};
  
  const declarations = cssText.split(';').filter(d => d.trim());
  
  for (const decl of declarations) {
    const colonIndex = decl.indexOf(':');
    if (colonIndex === -1) continue;
    
    const property = decl.slice(0, colonIndex).trim();
    const value = decl.slice(colonIndex + 1).trim();
    
    const converted = convertProperty(property, value);
    
    if (converted) {
      if ('multiple' in converted) {
        // Expanded shorthand (margin/padding with multiple values)
        for (const item of converted.multiple) {
          style[item.key] = item.value;
        }
      } else {
        style[converted.key] = converted.value;
      }
    }
  }
  
  return style;
}

// =============================================================================
// MEDIA QUERY CONVERSION
// =============================================================================

/**
 * Convert CSS media query to react-pdf format
 * 
 * CSS: @media (max-width: 400px) or @media screen and (orientation: landscape)
 * react-pdf: '@media max-width: 400' or '@media orientation: landscape'
 */
function convertMediaQuery(mediaText: string): string | null {
  const patterns = [
    { regex: /max-width:\s*(\d+)/i, format: (m: RegExpMatchArray) => `max-width: ${m[1]}` },
    { regex: /min-width:\s*(\d+)/i, format: (m: RegExpMatchArray) => `min-width: ${m[1]}` },
    { regex: /max-height:\s*(\d+)/i, format: (m: RegExpMatchArray) => `max-height: ${m[1]}` },
    { regex: /min-height:\s*(\d+)/i, format: (m: RegExpMatchArray) => `min-height: ${m[1]}` },
    { regex: /orientation:\s*(landscape|portrait)/i, format: (m: RegExpMatchArray) => `orientation: ${m[1]}` },
  ];
  
  for (const { regex, format } of patterns) {
    const match = mediaText.match(regex);
    if (match) {
      return `@media ${format(match)}`;
    }
  }
  
  return null;
}

// =============================================================================
// SELECTOR HELPERS
// =============================================================================

/**
 * Normalize a CSS selector
 */
function normalizeSelector(selector: string): string {
  return selector.trim().replace(/\s+/g, ' ');
}

/**
 * Extract class names from a selector
 * "p.subsq.first" -> ["subsq", "first"]
 */
function extractClassNames(selector: string): string[] {
  const matches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1));
}

/**
 * Extract tag name from a selector
 * "p.subsq" -> "p", ".calibre3" -> null
 */
function extractTagName(selector: string): string | null {
  const match = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  return match ? match[1].toLowerCase() : null;
}

// =============================================================================
// STYLE MAP TYPES AND MAIN PARSER
// =============================================================================

export interface StyleMap {
  bySelector: Record<string, Record<string, any>>;
  byClass: Record<string, Record<string, any>>;
  byTag: Record<string, Record<string, any>>;
  byTagClass: Record<string, Record<string, any>>;
}

/**
 * Merge styles, handling nested media query objects
 */
function mergeStyles(
  existing: Record<string, any> | undefined,
  incoming: Record<string, any>
): Record<string, any> {
  if (!existing) return { ...incoming };
  
  const merged = { ...existing };
  
  for (const [key, value] of Object.entries(incoming)) {
    if (key.startsWith('@media') && typeof value === 'object') {
      merged[key] = { ...(merged[key] || {}), ...value };
    } else {
      merged[key] = value;
    }
  }
  
  return merged;
}

/**
 * Main function: Parse CSS text and return a StyleMap
 */
export function parseCssToReactPdf(cssText: string): StyleMap {
  const styleMap: StyleMap = {
    bySelector: {},
    byClass: {},
    byTag: {},
    byTagClass: {},
  };

  function addToStyleMap(selector: string, style: Record<string, any>) {
    const normalized = normalizeSelector(selector);

    // Handle descendant selectors - use last part as target
    const parts = normalized.split(/\s+/);
    const targetPart = parts[parts.length - 1];

    // By full selector (always)
    styleMap.bySelector[normalized] = mergeStyles(styleMap.bySelector[normalized], style);

    const classNames = extractClassNames(targetPart);
    const tagName = extractTagName(targetPart);

    // ONLY store in byClass if there's exactly ONE class (not compound selectors)
    // This prevents p.subsq.continues-interrupted-paragraph from overwriting p.subsq
    if (classNames.length === 1) {
      styleMap.byClass[classNames[0]] = mergeStyles(styleMap.byClass[classNames[0]], style);
    }

    // By tag name (only if no classes)
    if (tagName && classNames.length === 0) {
      styleMap.byTag[tagName] = mergeStyles(styleMap.byTag[tagName], style);
    }

    // By tag.class combo (only if exactly one class)
    if (tagName && classNames.length === 1) {
      const key = `${tagName}.${classNames[0]}`;
      styleMap.byTagClass[key] = mergeStyles(styleMap.byTagClass[key], style);
    }
  }

  function processRule(node: any, mediaKey: string | null = null) {
    if (node.type !== 'Rule' || !node.prelude || !node.block) return;

    const selectorText = csstree.generate(node.prelude);
    const declText = csstree.generate(node.block).replace(/^\{|\}$/g, '').trim();
    
    let style = parseDeclarationBlock(declText);
    if (Object.keys(style).length === 0) return;

    // Nest under media key if applicable
    if (mediaKey) {
      style = { [mediaKey]: style };
    }

    // Handle comma-separated selectors
    const selectors = selectorText.split(',').map(s => s.trim());
    for (const selector of selectors) {
      addToStyleMap(selector, style);
    }
  }

  try {
    const ast = csstree.parse(cssText);

    csstree.walk(ast, {
      visit: 'Rule',
      enter(node: any) {
        // @ts-ignore - csstree types
        const parent = this.atrule;
        if (parent && parent.name === 'media' && parent.prelude) {
          const mediaText = csstree.generate(parent.prelude);
          const mediaKey = convertMediaQuery(mediaText);
          processRule(node, mediaKey);
        } else {
          processRule(node, null);
        }
      },
    });
  } catch (err) {
    console.warn('CSS parsing error (continuing with empty styles):', err);
  }

  console.log('=== STYLE MAP ===');
  console.log('byTag keys:', Object.keys(styleMap.byTag));
  console.log('byClass keys:', Object.keys(styleMap.byClass).slice(0, 20), '...');
  console.log('byTagClass keys:', Object.keys(styleMap.byTagClass).slice(0, 20), '...');
  console.log('byTag[p]:', styleMap.byTag['p']);
  console.log('byClass[subsq]:', styleMap.byClass['subsq']);
  console.log('byTagClass[p.subsq]:', styleMap.byTagClass['p.subsq']);

  return styleMap;
}

// =============================================================================
// STYLE LOOKUP FUNCTIONS
// =============================================================================

/**
 * Get styles for an element by tag name and class list
 * Applies specificity: tag < class < tag.class
 */
export function getStylesForElement(
  styleMap: StyleMap,
  tagName: string,
  classList: string[]
): Record<string, any> {
  let merged: Record<string, any> = {};
  const tagLower = tagName.toLowerCase();

  // 1. Tag styles (lowest specificity)
  if (styleMap.byTag[tagLower]) {
    merged = { ...merged, ...styleMap.byTag[tagLower] };
  }

  // 2. Class styles
  for (const className of classList) {
    if (styleMap.byClass[className]) {
      merged = { ...merged, ...styleMap.byClass[className] };
    }
  }

  // 3. Tag.class combos (highest specificity)
  for (const className of classList) {
    const key = `${tagLower}.${className}`;
    if (styleMap.byTagClass[key]) {
      merged = { ...merged, ...styleMap.byTagClass[key] };
    }
  }

  return merged;
}

/**
 * Convenience: Parse CSS and return a lookup function
 */
export function createStyleLookup(cssText: string) {
  const styleMap = parseCssToReactPdf(cssText);
  return (tagName: string, classList: string[]) => getStylesForElement(styleMap, tagName, classList);
}

// =============================================================================
// DEFAULT STYLES (fallbacks when CSS doesn't define them)
// =============================================================================

export const DEFAULT_STYLES: Record<string, Record<string, any>> = {
  p: { textAlign: 'justify', marginBottom: 0, marginTop: 0 },
  blockquote: { marginLeft: 16.5, marginRight: 16.5, marginTop: 11, marginBottom: 11 },
  h1: { fontSize: 22, fontWeight: 'bold', marginTop: 16.5, marginBottom: 11 },
  h2: { fontSize: 18, fontWeight: 'bold', marginTop: 14, marginBottom: 8 },
  h3: { fontSize: 14, fontWeight: 'bold', marginTop: 11, marginBottom: 6 },
  h4: { fontSize: 12, fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  em: { fontStyle: 'italic' },
  i: { fontStyle: 'italic' },
  strong: { fontWeight: 'bold' },
  b: { fontWeight: 'bold' },
};

/**
 * Get styles with fallbacks to defaults
 */
export function getStylesWithDefaults(
  styleMap: StyleMap,
  tagName: string,
  classList: string[]
): Record<string, any> {
  const fromCss = getStylesForElement(styleMap, tagName, classList);
  const defaults = DEFAULT_STYLES[tagName.toLowerCase()] || {};
  return { ...defaults, ...fromCss };
}
