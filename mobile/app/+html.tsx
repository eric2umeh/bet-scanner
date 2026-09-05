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
                /* Contain rubber-band to the app scroll view (in-app pull), not full page reload */
                overscroll-behavior-y: contain;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
