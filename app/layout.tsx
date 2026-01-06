export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root {
            color-scheme: light dark;
            --bg: #ffffff;
            --bg-secondary: #f3f4f6;
            --bg-error: #fee2e2;
            --text: #111111;
            --text-muted: #666666;
            --text-error: #dc2626;
            --border: #cccccc;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #1a1a1a;
              --bg-secondary: #2a2a2a;
              --bg-error: #3d1f1f;
              --text: #e5e5e5;
              --text-muted: #999999;
              --text-error: #f87171;
              --border: #444444;
            }
          }
          body {
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
