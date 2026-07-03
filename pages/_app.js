import Head from "next/head";
import Script from "next/script";
import "../styles/globals.css";

// Meta (Facebook) Pixel ID -- set NEXT_PUBLIC_META_PIXEL_ID in Vercel env vars.
// Left blank locally so nothing fires until it's configured in production.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* Allow pinch-zoom for accessibility (was previously disabled) (M-5) */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Explicit favicon link -- Pages Router doesn't auto-use
            public/favicon.ico, so without this the browser guesses and can
            fall back to a default icon. */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
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

      {/* Meta Pixel -- only loads if a Pixel ID is configured. Fires a default
          PageView; specific events (e.g. CompleteRegistration on contractor
          signup) are fired from the app via window.fbq(...). */}
      {META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      <Component {...pageProps} />
    </>
  );
}
