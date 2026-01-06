import JSZip from 'jszip';
import { parseCssToReactPdf, StyleMap } from './cssToReactPdf';

// =============================================================================
// CONTENT NODE - Tree structure for HTML content
// =============================================================================

export interface ContentNode {
  type: 'container' | 'text';
  tagName: string;
  classNames: string[];
  text?: string;            // for text nodes only
  children?: ContentNode[]; // for containers only
}

// Keep StyledElement for backwards compatibility (used in convert.tsx)
export interface StyledElement {
  text: string;
  tagName: string;
  classNames: string[];
}

export interface Chapter {
  title: string;
  content: ContentNode;  // tree root
  type: 'titlepage' | 'frontmatter' | 'chapter' | 'backmatter';
  author?: string;
}

export interface ParsedEpub {
  title: string;
  author: string;
  chapters: Chapter[];
  styleMap: StyleMap;
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse an EPUB file and extract its content
 */
export async function parseEpub(epubData: Uint8Array): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(epubData);

  // 1. Read container.xml to find OPF file path
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) {
    throw new Error('Invalid EPUB: missing container.xml');
  }

  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) {
    throw new Error('Invalid EPUB: could not find OPF path');
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Read and parse OPF file
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) {
    throw new Error(`Invalid EPUB: could not read OPF file at ${opfPath}`);
  }

  const { title, author, spineItems, manifest } = parseOpf(opfContent);

  // 3. Extract and parse CSS
  const cssText = await extractCss(zip, opfDir, manifest);
  console.log('=== EXTRACTED CSS ===');
  console.log('CSS length:', cssText.length);
  console.log('First 500 chars:', cssText.substring(0, 500));
  const styleMap = parseCssToReactPdf(cssText);

  // 4. Read each chapter in spine order
  const chapters: Chapter[] = [];

  for (const itemId of spineItems) {
    const item = manifest.get(itemId);
    if (!item) continue;

    const chapterPath = opfDir + item.href;
    const chapterContent = await zip.file(chapterPath)?.async('text');

    if (chapterContent) {
      const { chapterTitle, contentTree, pageType, author: chapterAuthor } = parseHtmlToTree(chapterContent);

      // Only include if there's content or it's a title page
      if (hasTextContent(contentTree) || pageType === 'titlepage') {
        chapters.push({
          title: chapterTitle || `Chapter ${chapters.length + 1}`,
          content: contentTree,
          type: pageType,
          author: chapterAuthor,
        });
      }
    }
  }

  return {
    title: title || 'Untitled',
    author: author || 'Unknown Author',
    chapters,
    styleMap,
  };
}

/**
 * Check if a content tree has any text
 */
function hasTextContent(node: ContentNode): boolean {
  if (node.type === 'text' && node.text && node.text.trim().length > 0) {
    return true;
  }
  if (node.children) {
    return node.children.some(child => hasTextContent(child));
  }
  return false;
}

// =============================================================================
// CSS EXTRACTION
// =============================================================================

/**
 * Extract all CSS from EPUB
 */
async function extractCss(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, { href: string; mediaType: string }>
): Promise<string> {
  let combinedCss = '';

  for (const [, item] of manifest) {
    if (item.mediaType === 'text/css' || item.href.endsWith('.css')) {
      const cssPath = opfDir + item.href;
      const cssContent = await zip.file(cssPath)?.async('text');
      if (cssContent) {
        combinedCss += cssContent + '\n';
      }
    }
  }

  return combinedCss;
}

// =============================================================================
// OPF PARSING
// =============================================================================

/**
 * Extract OPF file path from container.xml
 */
function extractOpfPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path=["']([^"']+)["']/);
  return match ? match[1] : null;
}

/**
 * Parse OPF file to extract metadata and spine
 */
function parseOpf(opfContent: string): {
  title: string;
  author: string;
  spineItems: string[];
  manifest: Map<string, { href: string; mediaType: string }>;
} {
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

  const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const author = authorMatch ? decodeHtmlEntities(authorMatch[1].trim()) : '';

  const manifest = new Map<string, { href: string; mediaType: string }>();
  const manifestRegex = /<item\s+[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*(?:media-type=["']([^"']+)["'])?[^>]*\/?>/gi;
  let manifestMatch;

  while ((manifestMatch = manifestRegex.exec(opfContent)) !== null) {
    const id = manifestMatch[1];
    const href = decodeURIComponent(manifestMatch[2]);
    const mediaType = manifestMatch[3] || '';
    manifest.set(id, { href, mediaType });
  }

  const manifestRegex2 = /<item\s+[^>]*href=["']([^"']+)["'][^>]*id=["']([^"']+)["'][^>]*(?:media-type=["']([^"']+)["'])?[^>]*\/?>/gi;
  while ((manifestMatch = manifestRegex2.exec(opfContent)) !== null) {
    const href = decodeURIComponent(manifestMatch[1]);
    const id = manifestMatch[2];
    const mediaType = manifestMatch[3] || '';
    if (!manifest.has(id)) {
      manifest.set(id, { href, mediaType });
    }
  }

  const spineItems: string[] = [];
  const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*\/?>/gi;
  let spineMatch;

  while ((spineMatch = spineRegex.exec(opfContent)) !== null) {
    spineItems.push(spineMatch[1]);
  }

  return { title, author, spineItems, manifest };
}

// =============================================================================
// HTML TO TREE PARSER
// =============================================================================

// Container elements that should preserve structure
const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'blockquote', 'aside', 'nav',
  'header', 'footer', 'main', 'figure', 'figcaption'
]);

// Text elements that contain readable content
// NOTE: h1-h6 are excluded because we extract them separately as chapter.title
const TEXT_TAGS = new Set([
  'p', 'span', 'li'
]);

// Self-closing tags to skip
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base',
  'col', 'embed', 'param', 'source', 'track', 'wbr'
]);

/**
 * Parse HTML into a ContentNode tree
 */
function parseHtmlToTree(html: string): {
  chapterTitle: string;
  contentTree: ContentNode;
  pageType: 'titlepage' | 'frontmatter' | 'chapter' | 'backmatter';
  author?: string;
} {
  // Detect page type
  const isTitlePage = /epub:type=["'][^"']*titlepage[^"']*["']/.test(html);
  const isCopyright = /epub:type=["'][^"']*copyright[^"']*["']/.test(html);
  const isToc = /epub:type=["'][^"']*toc[^"']*["']/.test(html);
  const isEpubFrontMatter = /epub:type=["'][^"']*(dedication|preface|foreword|prologue)[^"']*["']/.test(html);
  const isEpubBackMatter = /epub:type=["'][^"']*(afterword|colophon|acknowledgment|epilogue)[^"']*["']/.test(html);

  // Extract title and author
  let chapterTitle = '';
  let author = '';

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

  if (h1Match) {
    chapterTitle = cleanText(h1Match[1]);
  } else if (titleMatch && !isTitlePage) {
    chapterTitle = cleanText(titleMatch[1]);
  }

  if (isTitlePage && h2Match) {
    author = cleanText(h2Match[1]);
  } else if (!isTitlePage && h2Match && !h1Match) {
    chapterTitle = cleanText(h2Match[1]);
  }

  // Determine page type
  const isFrontMatterByTitle = /^(copyright|table of contents|contents|dedication|preface|foreword|introduction|prologue)$/i.test(chapterTitle.trim());
  const isBackMatterByTitle = /^(about the author|acknowledgments?|afterword|epilogue|appendix|notes|bibliography|index)$/i.test(chapterTitle.trim());

  let pageType: 'titlepage' | 'frontmatter' | 'chapter' | 'backmatter' = 'chapter';
  if (isTitlePage) {
    pageType = 'titlepage';
  } else if (isCopyright || isToc || isEpubFrontMatter || isFrontMatterByTitle) {
    pageType = 'frontmatter';
  } else if (isEpubBackMatter || isBackMatterByTitle) {
    pageType = 'backmatter';
  }

  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;

  // Parse into tree
  const contentTree = parseElement(bodyHtml, 'body', []);

  return {
    chapterTitle,
    contentTree,
    pageType,
    author: author || undefined,
  };
}

/**
 * Parse an HTML string into a ContentNode
 */
function parseElement(html: string, tagName: string, classNames: string[]): ContentNode {
  const children: ContentNode[] = [];

  // Tokenize: find all tags and text between them
  const tagRegex = /<(\/?)(\w+)([^>]*)>/g;
  let lastIndex = 0;
  let match;

  const stack: { tagName: string; classNames: string[]; children: ContentNode[]; startIndex: number }[] = [];

  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, isClosing, matchTagName, attributes] = match;
    const tagLower = matchTagName.toLowerCase();

    // Text before this tag
    if (match.index > lastIndex) {
      const textBetween = html.slice(lastIndex, match.index);
      const cleanedText = cleanText(textBetween);
      if (cleanedText.length > 0 && stack.length === 0) {
        // Top-level text
        children.push({
          type: 'text',
          tagName: 'span',
          classNames: [],
          text: cleanedText,
        });
      }
    }

    lastIndex = match.index + fullMatch.length;

    // Skip void tags
    if (VOID_TAGS.has(tagLower)) {
      continue;
    }

    // Skip script, style, head, and headings (h1-h6 are extracted separately as chapter.title)
    if (!isClosing && ['script', 'style', 'head', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagLower)) {
      // Find closing tag and skip content
      const closeRegex = new RegExp(`</${tagLower}>`, 'i');
      const closeMatch = closeRegex.exec(html.slice(lastIndex));
      if (closeMatch) {
        lastIndex = lastIndex + closeMatch.index + closeMatch[0].length;
        tagRegex.lastIndex = lastIndex;
      }
      continue;
    }

    if (isClosing) {
      // Closing tag - pop from stack
      if (stack.length > 0 && stack[stack.length - 1].tagName === tagLower) {
        const item = stack.pop()!;
        const innerHtml = html.slice(item.startIndex, match.index);

        // Parse the inner content
        const node = parseElementContent(innerHtml, item.tagName, item.classNames);

        if (stack.length === 0) {
          // Add to top-level children
          children.push(node);
        } else {
          // Add to parent on stack
          stack[stack.length - 1].children.push(node);
        }
      }
    } else {
      // Opening tag
      const elementClasses = extractClassNames(attributes);

      // Check for self-closing syntax
      const isSelfClosing = attributes.trim().endsWith('/');

      if (isSelfClosing) {
        continue;
      }

      // Push to stack for container and text tags
      if (CONTAINER_TAGS.has(tagLower) || TEXT_TAGS.has(tagLower)) {
        stack.push({
          tagName: tagLower,
          classNames: elementClasses,
          children: [],
          startIndex: lastIndex,
        });
      }
    }
  }

  // Handle any remaining text
  if (lastIndex < html.length) {
    const remainingText = cleanText(html.slice(lastIndex));
    if (remainingText.length > 0 && stack.length === 0) {
      children.push({
        type: 'text',
        tagName: 'span',
        classNames: [],
        text: remainingText,
      });
    }
  }

  return {
    type: 'container',
    tagName,
    classNames,
    children,
  };
}

/**
 * Parse element content into a ContentNode
 */
function parseElementContent(innerHtml: string, tagName: string, classNames: string[]): ContentNode {
  // Check if this is a text element
  if (TEXT_TAGS.has(tagName)) {
    // For text elements, extract text but also check for nested structure
    const hasNestedTags = /<(div|blockquote|section|p)\b/i.test(innerHtml);

    if (!hasNestedTags) {
      // Simple text element
      const text = cleanText(innerHtml);
      return {
        type: 'text',
        tagName,
        classNames,
        text,
      };
    }
  }

  // Container element - recursively parse children
  const parsed = parseElement(innerHtml, tagName, classNames);

  // If no children were found but there's text, treat as text node
  // BUT skip if the text came from h1-h6 (which we intentionally skip)
  if (parsed.children && parsed.children.length === 0) {
    const hasSkippedHeading = /<h[1-6]\b/i.test(innerHtml);
    if (!hasSkippedHeading) {
      const text = cleanText(innerHtml);
      if (text.length > 0) {
        return {
          type: 'text',
          tagName,
          classNames,
          text,
        };
      }
    }
  }

  return parsed;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Extract class names from HTML attributes string
 */
function extractClassNames(attributes: string): string[] {
  const classMatch = attributes.match(/class=["']([^"']+)["']/i);
  if (!classMatch) return [];
  return classMatch[1].split(/\s+/).filter(c => c.length > 0);
}

/**
 * Clean text by removing HTML tags and normalizing whitespace
 */
function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
