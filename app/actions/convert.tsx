'use server';

import React from 'react';
import path from 'path';
import { renderToBuffer, Font } from '@react-pdf/renderer';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import { parseEpub, ContentNode } from '@/lib/epubParser';
import { getStylesForElement, StyleMap } from '@/lib/cssToReactPdf';

// Chapter type for BookDocument (matches epubParser)
interface Chapter {
  title: string;
  content: ContentNode;
  type: 'titlepage' | 'frontmatter' | 'chapter' | 'backmatter';
  author?: string;
}

// Register EB Garamond fonts for KDP embedding
const fontsDir = path.join(process.cwd(), 'public/fonts');

Font.register({
  family: 'EBGaramond',
  fonts: [
    { src: path.join(fontsDir, 'EBGaramond-Regular.ttf') },
    { src: path.join(fontsDir, 'EBGaramond-Bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'EBGaramond-Italic.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'EBGaramond-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
});

// KDP 6x9 page size in points (72 dpi)
const KDP_6x9 = { width: 432, height: 648 };

const styles = StyleSheet.create({
  page: {
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 54,
    paddingRight: 36,
    fontFamily: 'EBGaramond',
    fontSize: 11,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
  },
  chapterTitle: {
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'center',
  },
  paragraph: {
    textAlign: 'justify',
  },
  // Title page styles - proper layout like KDP
  titlePage: {
    flex: 1,
    fontFamily: 'EBGaramond',
  },
  titlePageTitleSection: {
    marginTop: 150,
    alignItems: 'center',
  },
  titlePageTitle: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  titlePageUnderline: {
    width: 150,
    height: 1,
    backgroundColor: '#000',
    marginTop: 8,
  },
  titlePageAuthorSection: {
    marginTop: 80,
    alignItems: 'center',
  },
  titlePageAuthor: {
    fontSize: 14,
    textAlign: 'center',
  },
  titlePageCreditsSection: {
    position: 'absolute',
    bottom: 72,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  titlePageCredits: {
    fontSize: 11,
    textAlign: 'center',
  },
  // Running headers for chapter pages
  headerContainer: {
    position: 'absolute',
    top: 36,
    left: 54,
    right: 36,
    flexDirection: 'row',
    fontSize: 9,
  },
  headerLeft: {
    textAlign: 'left',
    flex: 1,
  },
  headerRight: {
    textAlign: 'right',
    flex: 1,
  },
});

// =============================================================================
// RECURSIVE NODE RENDERER
// =============================================================================

/**
 * Recursively render a ContentNode tree to react-pdf components
 */
function renderNode(
  node: ContentNode,
  styleMap: StyleMap,
  key: string,
  debugLog: boolean = false
): React.ReactNode {
  // Get CSS styles for this node
  const cssStyles = getStylesForElement(styleMap, node.tagName, node.classNames);

  if (debugLog) {
    console.log(`=== NODE ${key} ===`);
    console.log(`  type: ${node.type}, tag: ${node.tagName}, classes: [${node.classNames.join(', ')}]`);
    console.log(`  cssStyles:`, cssStyles);
  }

  if (node.type === 'text') {
    // Text node - render as Text with paragraph base style + CSS styles
    return (
      <Text key={key} style={[styles.paragraph, cssStyles]}>
        {node.text}
      </Text>
    );
  }

  // Container node - render as View with CSS styles, recursively render children
  // Skip the 'body' wrapper - just render its children
  if (node.tagName === 'body' && node.children) {
    return (
      <View key={key}>
        {node.children.map((child, i) => renderNode(child, styleMap, `${key}-${i}`, debugLog && i < 3))}
      </View>
    );
  }

  return (
    <View key={key} style={cssStyles}>
      {node.children?.map((child, i) => renderNode(child, styleMap, `${key}-${i}`, debugLog && i < 3))}
    </View>
  );
}

/**
 * Extract text from a ContentNode tree (for title page credits)
 */
function extractTextFromTree(node: ContentNode): string[] {
  const texts: string[] = [];

  if (node.type === 'text' && node.text) {
    texts.push(node.text);
  }

  if (node.children) {
    for (const child of node.children) {
      texts.push(...extractTextFromTree(child));
    }
  }

  return texts;
}

// =============================================================================
// BOOK DOCUMENT COMPONENT
// =============================================================================

const BookDocument = ({
  chapters,
  title,
  author,
  styleMap,
}: {
  chapters: Chapter[];
  title: string;
  author: string;
  styleMap: StyleMap;
}) => {
  // Separate chapters by type
  const titlePages = chapters.filter((ch) => ch.type === 'titlepage');
  const frontMatter = chapters.filter((ch) => ch.type === 'frontmatter');
  const storyChapters = chapters.filter((ch) => ch.type === 'chapter');
  const backMatter = chapters.filter((ch) => ch.type === 'backmatter');

  return (
    <Document pageLayout="twoPageLeft">
      {/* Title pages - proper KDP layout */}
      {titlePages.map((chapter, idx) => {
        const creditTexts = extractTextFromTree(chapter.content);
        return (
          <Page key={`title-${idx}`} size={KDP_6x9} style={styles.page}>
            <View style={styles.titlePage}>
              {/* Title in upper area with underline */}
              <View style={styles.titlePageTitleSection}>
                <Text style={styles.titlePageTitle}>{chapter.title}</Text>
                <View style={styles.titlePageUnderline} />
              </View>

              {/* Author in middle */}
              {chapter.author && (
                <View style={styles.titlePageAuthorSection}>
                  <Text style={styles.titlePageAuthor}>{chapter.author}</Text>
                </View>
              )}

              {/* Credits at bottom */}
              {creditTexts.length > 0 && (
                <View style={styles.titlePageCreditsSection}>
                  {creditTexts.map((text, lineIdx) => (
                    <Text key={lineIdx} style={styles.titlePageCredits}>
                      {text}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </Page>
        );
      })}

      {/* Front matter - NO headers */}
      {frontMatter.length > 0 && (
        <Page size={KDP_6x9} style={styles.page} wrap>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
          {frontMatter.map((chapter, chapterIndex) => (
            <View key={chapterIndex} break={chapterIndex > 0}>
              <Text style={styles.chapterTitle}>{chapter.title}</Text>
              {renderNode(chapter.content, styleMap, `fm-${chapterIndex}`)}
            </View>
          ))}
        </Page>
      )}

      {/* Story chapters - WITH headers */}
      {storyChapters.length > 0 && (
        <Page size={KDP_6x9} style={styles.page} wrap>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
          {/* Running header: author on left (even) pages, title on right (odd) pages */}
          <View
            style={styles.headerContainer}
            fixed
            render={({ pageNumber }) =>
              pageNumber % 2 === 0 ? (
                <Text style={styles.headerLeft}>{author}</Text>
              ) : (
                <Text style={styles.headerRight}>{title}</Text>
              )
            }
          />
          {storyChapters.map((chapter, chapterIndex) => (
            <View key={chapterIndex} break={chapterIndex > 0}>
              <Text style={styles.chapterTitle}>{chapter.title}</Text>
              {renderNode(chapter.content, styleMap, `ch-${chapterIndex}`, chapterIndex === 0)}
            </View>
          ))}
        </Page>
      )}

      {/* Back matter - NO headers */}
      {backMatter.length > 0 && (
        <Page size={KDP_6x9} style={styles.page} wrap>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
          {backMatter.map((chapter, chapterIndex) => (
            <View key={chapterIndex} break={chapterIndex > 0}>
              <Text style={styles.chapterTitle}>{chapter.title}</Text>
              {renderNode(chapter.content, styleMap, `bm-${chapterIndex}`)}
            </View>
          ))}
        </Page>
      )}
    </Document>
  );
};

// =============================================================================
// MAIN CONVERSION FUNCTION
// =============================================================================

export interface ConvertResult {
  success: boolean;
  pdfBase64?: string;
  error?: string;
}

export async function convertEpubToPdf(
  formData: FormData
): Promise<ConvertResult> {
  try {
    // Get EPUB file from form data
    const epubFile = formData.get('epub') as File;
    if (!epubFile) {
      return { success: false, error: 'No EPUB file provided' };
    }

    const epubData = new Uint8Array(await epubFile.arrayBuffer());
    const parsed = await parseEpub(epubData);

    if (parsed.chapters.length === 0) {
      return { success: false, error: 'No chapters found in EPUB' };
    }

    const document = (
      <BookDocument
        chapters={parsed.chapters}
        title={parsed.title}
        author={parsed.author}
        styleMap={parsed.styleMap}
      />
    );

    const pdfBuffer = await renderToBuffer(document);

    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    return { success: true, pdfBase64 };
  } catch (err) {
    console.error('Server: Conversion error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
