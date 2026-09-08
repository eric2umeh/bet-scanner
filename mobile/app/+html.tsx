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
                background: radial-gradient(ellipse at 50% 10%, #ffffff 0%, #E8EEF0 55%);
                /* Contain rubber-band to the app scroll view (in-app pull), not full page reload */
                overscroll-behavior-y: contain;
              }
              /* Hide scrollbars; scrolling still works (wheel / trackpad / touch). */
              * {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
              }
              *::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
