import { SiteHeader, SiteFooter, SectionLabel } from "../SiteChrome";
import { NAV, PAGES, href, neighbours, pageMeta } from "./shared";
import "../../ref-landing.css";
import "../../app-docs.css";

/**
 * Shell for every docs page: header, sidebar, content, pager.
 *
 * The sidebar links to real URLs rather than anchors — each page is its own
 * document now, so the browser handles history and deep links without a router.
 */
export function DocsLayout({ slug, children }) {
  const [, title, blurb] = pageMeta(slug);
  const { prev, next } = neighbours(slug);

  return (
    <div id="top" className="site-shell">
      <SiteHeader links={NAV} />

      <div className="docs-layout">
        <aside className="docs-side">
          {PAGES.map((g) => (
            <div key={g.group}>
              <div className="docs-side__group">{g.group}</div>
              {g.items.map(([s, label]) => (
                <a key={s} href={href(s)} className={s === slug ? "is-active" : undefined}
                   aria-current={s === slug ? "page" : undefined}>
                  {label}
                </a>
              ))}
            </div>
          ))}
        </aside>

        <main className="docs-main">
          <SectionLabel>Documentation</SectionLabel>
          <h1>{title}</h1>
          <p className="lede">{blurb}</p>

          {/* Shown on every page: the one caveat a reader must not miss, wherever
              they landed. Self-links are dropped so it doesn't point at itself. */}
          <div className="callout" style={{ marginBottom: 28 }}>
            <strong>Testnet, unaudited.</strong> Thicket runs on{" "}
            {slug === "status" ? "Robinhood Chain testnet"
              : <a href="/docs/status">Robinhood Chain testnet</a>}. THKT here has no
            monetary value and the contracts have not been audited. Never put real funds
            behind it, and never share your private key with anyone.
            {slug !== "security" && <> See <a href="/docs/security">Private key security</a>.</>}
          </div>

          {children}

          <nav className="docs-pager">
            {prev ? (
              <a href={href(prev[0])} className="docs-pager__link">
                <span>Previous</span>
                <strong>{prev[1]}</strong>
              </a>
            ) : <span />}
            {next ? (
              <a href={href(next[0])} className="docs-pager__link docs-pager__link--next">
                <span>Next</span>
                <strong>{next[1]}</strong>
              </a>
            ) : <span />}
          </nav>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
