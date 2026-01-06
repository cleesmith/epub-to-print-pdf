import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// KDP page sizes in points (72 dpi)
// 1 inch = 72 points
export const PAGE_SIZES = {
  'kdp-6x9': { width: 432, height: 648 },      // 6 * 72 = 432, 9 * 72 = 648
  'kdp-5.5x8.5': { width: 396, height: 612 },  // 5.5 * 72 = 396, 8.5 * 72 = 612
  'a4': 'A4' as const,
  'letter': 'LETTER' as const,
};

export type PageSizeKey = keyof typeof PAGE_SIZES;

// KDP margin requirements:
// - Minimum outside margin: 0.25" (18pt)
// - Minimum inside (gutter) margin: depends on page count, typically 0.375" (27pt) minimum
// Using generous margins for good readability
const styles = StyleSheet.create({
  page: {
    paddingTop: 72,        // 1 inch top margin
    paddingBottom: 72,     // 1 inch bottom margin
    paddingLeft: 54,       // 0.75 inch inside/gutter margin
    paddingRight: 36,      // 0.5 inch outside margin
    fontFamily: 'Times-Roman',
    fontSize: 11,
    lineHeight: 17,
  },
  chapter: {
    marginBottom: 24,
  },
  chapterTitle: {
    fontSize: 18,
    fontFamily: 'Times-Bold',
    marginBottom: 24,
    marginTop: 36,
    textAlign: 'center',
  },
  // First paragraph after chapter title - no indent
  firstParagraph: {
    marginBottom: 0,
    textAlign: 'justify',
  },
  // Regular paragraphs - indented
  paragraph: {
    textIndent: 24,
    marginBottom: 0,
    textAlign: 'justify',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Times-Roman',
  },
});

export interface Chapter {
  title: string;
  content: string[];
}

export interface BookDocumentProps {
  title: string;
  author: string;
  chapters: Chapter[];
  pageSize: PageSizeKey;
}

export const BookDocument: React.FC<BookDocumentProps> = ({
  title,
  author,
  chapters,
  pageSize,
}) => (
  <Document title={title} author={author} creator="react-pdf EPUB Converter">
    <Page size={PAGE_SIZES[pageSize]} style={styles.page} wrap>
      {/* Page numbers - rendered on every page using fixed + render prop */}
      <Text
        style={styles.pageNumber}
        render={({ pageNumber }) => pageNumber}
        fixed
      />

      {/* Render each chapter */}
      {chapters.map((chapter, chapterIndex) => (
        <View key={chapterIndex} style={styles.chapter} break={chapterIndex > 0}>
          {/* Chapter title */}
          <Text style={styles.chapterTitle}>{chapter.title}</Text>

          {/* Chapter paragraphs */}
          {chapter.content.map((paragraph, paraIndex) => (
            <Text
              key={paraIndex}
              style={paraIndex === 0 ? styles.firstParagraph : styles.paragraph}
            >
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </Page>
  </Document>
);
