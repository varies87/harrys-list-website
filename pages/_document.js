import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Declare UTF-8 explicitly and first, so browsers never guess the
            encoding and mangle non-ASCII characters (e.g. the ▲ thumbs-up
            glyph was rendering as "â–²"). */}
        <meta charSet="utf-8" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
