import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* Allow pinch-zoom for accessibility (was previously disabled) (M-5) */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Tabler icon webfont pinned to an exact version with Subresource
            Integrity, instead of @latest, so a CDN change can't silently ship
            new/altered CSS (M-10). */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.44.0/dist/tabler-icons.min.css"
          integrity="sha384-ccZHbezhtZWmNy0cg8odL0D/jFU5k5HIls9y78Qd6lWor7rpvFIZtK0fTFG4z456"
          crossOrigin="anonymous"
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
