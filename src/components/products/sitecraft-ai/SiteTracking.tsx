import Script from "next/script";
import { splitSnippet, type TrackingSettings } from "@/lib/products/sitecraft-ai/tracking-shared";

/**
 * The company's own analytics and tracking on its PUBLIC website (CMS → Settings → Tracking). Built-in tags
 * (GA4, Tag Manager, Clarity, Meta Pixel) from their IDs, plus the company's custom head/body code. Renders nothing
 * for a company that hasn't set any up, and is only mounted on the public site — never inside a product.
 */
function Custom({ html, prefix, lazy }: { html: string; prefix: string; lazy: boolean }) {
  if (!html.trim()) return null;
  const { scripts, markup } = splitSnippet(html);
  return (
    <>
      {markup && <div style={{ display: "none" }} dangerouslySetInnerHTML={{ __html: markup }} />}
      {scripts.map((s, i) =>
        s.src ? (
          <Script key={`${prefix}${i}`} id={`${prefix}${i}`} src={s.src} strategy={lazy ? "lazyOnload" : "afterInteractive"} async={"async" in s.attrs} defer={"defer" in s.attrs} />
        ) : (
          <Script key={`${prefix}${i}`} id={`${prefix}${i}`} strategy={lazy ? "lazyOnload" : "afterInteractive"} dangerouslySetInnerHTML={{ __html: s.inline ?? "" }} />
        )
      )}
    </>
  );
}

export default function SiteTracking({ t }: { t: TrackingSettings }) {
  return (
    <>
      {t.gtmIds.map((id) => (
        <span key={`gtm-${id}`} hidden>
          <Script id={`gtm-${id}`} strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`}
          </Script>
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${id}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
          </noscript>
        </span>
      ))}
      {t.ga4Ids.length > 0 && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${t.ga4Ids[0]}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${t.ga4Ids.map((id) => `gtag('config','${id}');`).join("")}`}
          </Script>
        </>
      )}
      {t.clarityIds.map((id) => (
        <Script key={`clarity-${id}`} id={`clarity-${id}`} strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
        </Script>
      ))}
      {t.metaPixelIds.length > 0 && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');${t.metaPixelIds.map((id) => `fbq('init','${id}');`).join("")}fbq('track','PageView');`}
        </Script>
      )}
      {/* Meta tags that aren't `name=` ones (property / http-equiv); React hoists <meta> into <head>. */}
      {t.verificationMeta.filter((m) => m.attr !== "name").map((m, i) =>
        m.attr === "property" ? <meta key={`mp-${i}`} property={m.name} content={m.content} /> : <meta key={`mh-${i}`} httpEquiv={m.name} content={m.content} />
      )}
      {t.scripts.filter((s) => s.enabled).map((s) => (
        <Custom key={s.id} html={s.code} prefix={`custom-${s.id}-`} lazy={s.placement === "body-end"} />
      ))}
    </>
  );
}
