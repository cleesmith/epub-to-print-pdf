'use server';

import React from 'react';
import path from 'path';
import { renderToBuffer, Font } from '@react-pdf/renderer';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import { parseEpub } from '@/lib/epubParser';

// Chapter type for BookDocument
interface Chapter {
  title: string;
  content: string[];
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
    marginBottom: 12,
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

const BookDocument = ({
  chapters,
  title,
  author,
}: {
  chapters: Chapter[];
  title: string;
  author: string;
}) => {
  // Separate chapters by type
  const titlePages = chapters.filter((ch) => ch.type === 'titlepage');
  const frontMatter = chapters.filter((ch) => ch.type === 'frontmatter');
  const storyChapters = chapters.filter((ch) => ch.type === 'chapter');
  const backMatter = chapters.filter((ch) => ch.type === 'backmatter');

  return (
    <Document pageLayout="twoPageLeft">
      {/* Title pages - proper KDP layout */}
      {titlePages.map((chapter, idx) => (
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
            {chapter.content.length > 0 && (
              <View style={styles.titlePageCreditsSection}>
                {chapter.content.map((line, lineIdx) => (
                  <Text key={lineIdx} style={styles.titlePageCredits}>
                    {line}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </Page>
      ))}

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
              {chapter.content.map((para, paraIndex) => (
                <Text key={paraIndex} style={styles.paragraph}>
                  {para}
                </Text>
              ))}
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
              {chapter.content.map((para, paraIndex) => (
                <Text key={paraIndex} style={styles.paragraph}>
                  {para}
                </Text>
              ))}
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
              {chapter.content.map((para, paraIndex) => (
                <Text key={paraIndex} style={styles.paragraph}>
                  {para}
                </Text>
              ))}
            </View>
          ))}
        </Page>
      )}
    </Document>
  );
};

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
