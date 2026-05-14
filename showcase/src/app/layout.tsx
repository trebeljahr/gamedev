import type { Metadata } from "next";
import Script from "next/script";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const plausibleDomain = "gamedev.trebeljahr.com";
const plausibleScriptUrl =
  "https://plausible.trebeljahr.com/js/script.file-downloads.hash.outbound-links.pageview-props.revenue.tagged-events.js";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    type: "website",
    images: [
      {
        url: "/favicon.png",
        width: 512,
        height: 512,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/favicon.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        <Script id="plausible-loader" strategy="afterInteractive">
          {`
              (function () {
                var domain = ${JSON.stringify(plausibleDomain)};
                if (location.hostname !== domain) return;
                window.plausible = window.plausible || function() {
                  (window.plausible.q = window.plausible.q || []).push(arguments);
                };
                var script = document.createElement("script");
                script.defer = true;
                script.dataset.domain = domain;
                script.src = ${JSON.stringify(plausibleScriptUrl)};
                document.head.appendChild(script);
              })();
            `}
        </Script>
        {children}
      </body>
    </html>
  );
}
