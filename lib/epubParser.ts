import JSZip from 'jszip';

export interface Chapter {
  title: string;
  content: string[];
  type: 'titlepage' | 'frontmatter' | 'chapter' | 'backmatter';
  author?: string; // For title pages
}

export interface ParsedEpub {
  title: string;
  author: string;
  chapters: Chapter[];
}

/**
 * Parse an EPUB file and extract its content
 *
 * EPUB structure:
 * - META-INF/container.xml -> points to OPF file location
 * - OPF file (e.g., content.opf) -> metadata + spine (reading order)
 * - Chapter files (XHTML/HTML) -> actual content
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

  // Get the base directory for resolving relative paths
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Read and parse OPF file
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) {
    throw new Error(`Invalid EPUB: could not read OPF file at ${opfPath}`);
  }

  const { title, author, spineItems, manifest } = parseOpf(opfContent);

  // 3. Read each chapter in spine order and extract text
  const chapters: Chapter[] = [];

  for (const itemId of spineItems) {
    const item = manifest.get(itemId);
    if (!item) continue;

    // Resolve the full path
    const chapterPath = opfDir + item.href;
    const chapterContent = await zip.file(chapterPath)?.async('text');

    if (chapterContent) {
      const { chapterTitle, paragraphs, pageType, author: chapterAuthor } = extractTextFromHtml(chapterContent);

      // Only add chapters that have content (or are title pages)
      if (paragraphs.length > 0 || pageType === 'titlepage') {
        chapters.push({
          title: chapterTitle || `Chapter ${chapters.length + 1}`,
          content: paragraphs,
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
  };
}

/**
 * Extract OPF file path from container.xml
 */
function extractOpfPath(containerXml: string): string | null {
  // Look for: <rootfile full-path="..." media-type="application/oebps-package+xml"/>
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
  // Extract title
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

  // Extract author (creator)
  const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const author = authorMatch ? decodeHtmlEntities(authorMatch[1].trim()) : '';

  // Build manifest map: id -> { href, mediaType }
  const manifest = new Map<string, { href: string; mediaType: string }>();
  const manifestRegex = /<item\s+[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*(?:media-type=["']([^"']+)["'])?[^>]*\/?>/gi;
  let manifestMatch;

  while ((manifestMatch = manifestRegex.exec(opfContent)) !== null) {
    const id = manifestMatch[1];
    const href = decodeURIComponent(manifestMatch[2]);
    const mediaType = manifestMatch[3] || '';
    manifest.set(id, { href, mediaType });
  }

  // Also try alternate attribute order (href before id)
  const manifestRegex2 = /<item\s+[^>]*href=["']([^"']+)["'][^>]*id=["']([^"']+)["'][^>]*(?:media-type=["']([^"']+)["'])?[^>]*\/?>/gi;
  while ((manifestMatch = manifestRegex2.exec(opfContent)) !== null) {
    const href = decodeURIComponent(manifestMatch[1]);
    const id = manifestMatch[2];
    const mediaType = manifestMatch[3] || '';
    if (!manifest.has(id)) {
      manifest.set(id, { href, mediaType });
    }
  }

  // Extract spine items (reading order)
  const spineItems: string[] = [];
  const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*\/?>/gi;
  let spineMatch;

  while ((spineMatch = spineRegex.exec(opfContent)) !== null) {
    spineItems.push(spineMatch[1]);
  }

  return { title, author, spineItems, manifest };
}

/**
 * Extract text content from HTML/XHTML chapter
 */
function extractTextFromHtml(html: string): {
  chapterTitle: string;
  paragraphs: string[];
  pageType: 'titlepage' | 'frontmatter' | 'chapter' | 'backmatter';
  author?: string;
} {
  // Detect page type from epub:type attributes
  const isTitlePage = /epub:type=["'][^"']*titlepage[^"']*["']/.test(html);
  const isCopyright = /epub:type=["'][^"']*copyright[^"']*["']/.test(html);
  const isToc = /epub:type=["'][^"']*toc[^"']*["']/.test(html);
  const isEpubFrontMatter = /epub:type=["'][^"']*(dedication|preface|foreword|prologue)[^"']*["']/.test(html);
  const isEpubBackMatter = /epub:type=["'][^"']*(afterword|colophon|acknowledgment|epilogue)[^"']*["']/.test(html);

  // Try to extract chapter title from h1
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

  // For title pages, h2 is usually the author
  if (isTitlePage && h2Match) {
    author = cleanText(h2Match[1]);
  } else if (!isTitlePage && h2Match && !h1Match) {
    // For regular chapters without h1, use h2 as title
    chapterTitle = cleanText(h2Match[1]);
  }

  // Extract paragraphs
  const paragraphs: string[] = [];

  // Match <p> tags and extract content
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;

  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = cleanText(pMatch[1]);
    // Skip if text is same as title or author (avoid duplicates)
    if (text.length > 0 && text !== chapterTitle && text !== author) {
      paragraphs.push(text);
    }
  }

  // If no <p> tags found, try to extract content
  if (paragraphs.length === 0) {
    if (isTitlePage) {
      // For title pages, extract each span as separate line (preserves credits formatting)
      const spanRegex = /<span[^>]*>([\s\S]*?)<\/span>/gi;
      let spanMatch;
      while ((spanMatch = spanRegex.exec(html)) !== null) {
        const text = cleanText(spanMatch[1]);
        if (text.length > 0 && text !== chapterTitle && text !== author) {
          paragraphs.push(text);
        }
      }
    } else {
      // For non-title pages, extract from divs
      const divRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
      let divMatch;
      while ((divMatch = divRegex.exec(html)) !== null) {
        const text = cleanText(divMatch[1]);
        if (text.length > 0 && text !== chapterTitle && text !== author) {
          paragraphs.push(text);
        }
      }
    }
  }

  // If still no content, try body
  if (paragraphs.length === 0) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      const bodyText = cleanText(bodyMatch[1]);
      if (bodyText.length > 0) {
        const parts = bodyText.split(/\n\n+/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.length > 0 && trimmed !== chapterTitle && trimmed !== author) {
            paragraphs.push(trimmed);
          }
        }
      }
    }
  }

  // Determine page type - fallback to title patterns if epub:type not present
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

  return { chapterTitle, paragraphs, pageType, author: author || undefined };
}

/**
 * Clean text by removing HTML tags and normalizing whitespace
 */
function cleanText(html: string): string {
  return html
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    // Normalize whitespace
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
