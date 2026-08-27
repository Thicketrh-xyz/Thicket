// Values every docs page quotes. One definition, so a network change is a
// single edit rather than a hunt through prose.
export const RPC = "https://rpc.mainnet.chain.robinhood.com/rpc";
export const EXPLORER = "https://robinhoodchain.blockscout.com";
export const CHAIN_ID = 4663;
export const NETWORK = "Robinhood Chain";
export const COORD = "https://thicket-production.up.railway.app";
export const TOKEN = "0xC4F36C7c1D00dcaab1d01159466afa189BFc7161";
export const STAKING = "0xB179254Ca9A5eB59270c6a0088DD46a8a07b9bb9";
export const DIST = "0x1c890110e9cc3dAdeBD6c449437606783B4B682b";
export const REPO = "https://github.com/Thicketrh-xyz/Thicket";
export const PORTAL = "/app";

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/#verification", label: "How it works" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: "/app", label: "App" },
];

// The docs are one page per slug. `""` is /docs itself.
export const PAGES = [
  {
    group: "Start here",
    items: [
      ["", "Overview", "What Thicket is and how the loop fits together"],
      ["status", "What's live now", "Exactly what is deployed, and what isn't"],
      ["architecture", "Architecture", "The pieces, and which of them you trust"],
    ],
  },
  {
    group: "Run a node",
    items: [
      ["run-a-node", "Run a node", "Requirements, install, and keeping it healthy"],
      ["verification", "Challenges & slashing", "How work is checked and what it costs to fail"],
      ["staking", "Staking & delegation", "Bonding, unbonding, and what delegation does not do"],
      ["claiming", "Claiming rewards", "When earnings settle and why claimable can be zero"],
      ["security", "Private key security", "The one mistake you cannot undo"],
    ],
  },
  {
    group: "Buy compute",
    items: [
      ["compute", "Run compute", "Paying for jobs, pricing, and what happens when they fail"],
      ["sdk", "Agent SDK", "Buy compute from a wallet in one call"],
      ["api", "Coordinator API", "Endpoints, auth, and error codes"],
    ],
  },
  {
    group: "Reference",
    items: [
      ["tokenomics", "Tokenomics & contracts", "Supply, the pool, and deployed addresses"],
      ["troubleshooting", "Troubleshooting", "When something is not working"],
      ["faq", "FAQ", "Short answers"],
    ],
  },
];

export const ALL = PAGES.flatMap((g) => g.items);

export const href = (slug) => (slug ? `/docs/${slug}` : "/docs");

/** Current slug from the URL: /docs -> "", /docs/run-a-node -> "run-a-node". */
export function currentSlug() {
  const m = window.location.pathname.replace(/\/+$/, "").match(/^\/docs(?:\/(.*))?$/);
  return m ? (m[1] || "") : "";
}

export function pageMeta(slug) {
  return ALL.find(([s]) => s === slug) || ALL[0];
}

/** Previous/next in reading order, for the footer pager. */
export function neighbours(slug) {
  const i = ALL.findIndex(([s]) => s === slug);
  return { prev: i > 0 ? ALL[i - 1] : null, next: i >= 0 && i < ALL.length - 1 ? ALL[i + 1] : null };
}
