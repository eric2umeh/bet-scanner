import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root { height: 100%; }
              body {
                margin: 0;
                background: radial-gradient(ellipse at 50% 20%, #0f151c 0%, #040608 55%);
                overscroll-behavior: none;
              }
              /* React Navigation bottom tabs — labels were clipped on web */
              [role="tablist"] [role="tab"] {
                overflow: visible !important;
                min-height: 52px;
              }
              [role="tablist"] [role="tab"] span {
                overflow: visible !important;
                line-height: 14px !important;
                font-size: 11px !important;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
