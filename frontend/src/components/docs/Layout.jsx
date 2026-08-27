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
          {/* The sidebar is hidden under 980px. Without this, the only way
              between pages on a phone is the prev/next pager — 13 taps to reach
              the far end of the docs. <details> needs no JS to work. */}
          <details className="docs-mobile-nav">
            <summary>All pages</summary>
            {PAGES.map((g) => (
              <div key={g.group}>
                <div className="docs-side__group">{g.group}</div>
                {g.items.map(([s, label]) => (
                  <a key={s} href={href(s)} className={s === slug ? "is-active" : undefined}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </details>

          <SectionLabel>Documentation</SectionLabel>
          <h1>{title}</h1>
          <p className="lede">{blurb}</p>

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
