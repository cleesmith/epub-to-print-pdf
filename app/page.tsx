'use client';

import { useState } from 'react';
import { convertEpubToPdf } from './actions/convert';
import type { PageSizeKey } from '@/lib/BookDocument';

const PAGE_SIZE_OPTIONS: { value: PageSizeKey; label: string }[] = [
  { value: 'kdp-6x9', label: 'KDP 6×9 (Trade Paperback)' },
  { value: 'kdp-5.5x8.5', label: 'KDP 5.5×8.5 (Digest)' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'US Letter' },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [pageSize, setPageSize] = useState<PageSizeKey>('kdp-6x9');
  const [status, setStatus] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [pdfData, setPdfData] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.toLowerCase().endsWith('.epub')) {
      setFile(selectedFile);
      setStatus(`Selected: ${selectedFile.name}`);
      setPdfData(null);
    } else if (selectedFile) {
      setStatus('Please select an EPUB file');
      setFile(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsConverting(true);
    setStatus('Converting...');
    setPdfData(null);

    try {
      const formData = new FormData();
      formData.append('epub', file);
      formData.append('pageSize', pageSize);

      const result = await convertEpubToPdf(formData);

      if (result.success && result.pdfBase64) {
        setPdfData(result.pdfBase64);
        setStatus('Done! Click Download to save your PDF.');
      } else {
        setStatus(`Error: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsConverting(false);
    }
  };

  const createPdfBlob = () => {
    if (!pdfData) return null;
    const byteCharacters = atob(pdfData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'application/pdf' });
  };

  const handlePreview = () => {
    const blob = createPdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleDownload = () => {
    if (!file) return;
    const blob = createPdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace(/\.epub$/i, '.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{
      padding: '40px',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <h1 style={{ marginTop: 0, marginBottom: '8px' }}>EPUB to PDF Converter</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '32px' }}>
        Convert EPUB files to KDP-ready PDFs using react-pdf
      </p>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
          1. Select EPUB file
        </label>
        <input
          type="file"
          accept=".epub"
          onChange={handleFileChange}
          style={{ fontSize: '14px' }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
          2. Choose page size
        </label>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(e.target.value as PageSizeKey)}
          style={{
            fontSize: '14px',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg)',
            color: 'var(--text)'
          }}
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
        <button
          onClick={handleConvert}
          disabled={!file || isConverting}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: file && !isConverting ? 'pointer' : 'not-allowed',
            opacity: file && !isConverting ? 1 : 0.5,
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
          }}
        >
          {isConverting ? 'Converting...' : 'Convert to PDF'}
        </button>

        <button
          onClick={handlePreview}
          disabled={!pdfData}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: pdfData ? 'pointer' : 'not-allowed',
            opacity: pdfData ? 1 : 0.5,
            backgroundColor: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
          }}
        >
          Preview PDF
        </button>

        <button
          onClick={handleDownload}
          disabled={!pdfData}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: pdfData ? 'pointer' : 'not-allowed',
            opacity: pdfData ? 1 : 0.5,
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
          }}
        >
          Download PDF
        </button>
      </div>

      {status && (
        <p style={{
          padding: '16px',
          backgroundColor: status.startsWith('Error') ? 'var(--bg-error)' : 'var(--bg-secondary)',
          borderRadius: '6px',
          margin: 0,
          color: status.startsWith('Error') ? 'var(--text-error)' : 'var(--text)',
        }}>
          {status}
        </p>
      )}
    </main>
  );
}
