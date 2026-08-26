import { DocsLayout } from "./docs/Layout";
import { currentSlug } from "./docs/shared";

import { Overview } from "./docs/pages/Overview";
import { Status } from "./docs/pages/Status";
import { Architecture } from "./docs/pages/Architecture";
import { RunNode } from "./docs/pages/RunNode";
import { Verification } from "./docs/pages/Verification";
import { Staking } from "./docs/pages/Staking";
import { Claiming } from "./docs/pages/Claiming";
import { Security } from "./docs/pages/Security";
import { Compute } from "./docs/pages/Compute";
import { Sdk } from "./docs/pages/Sdk";
import { Api } from "./docs/pages/Api";
import { Tokenomics } from "./docs/pages/Tokenomics";
import { Migration } from "./docs/pages/Migration";
import { Troubleshooting } from "./docs/pages/Troubleshooting";
import { Faq } from "./docs/pages/Faq";

// Slug -> page. The docs used to be one very long document; each section is now
// its own URL, which keeps a page short enough to read and makes a link to a
// specific topic survive edits to everything around it.
const ROUTES = {
  "": Overview,
  "status": Status,
  "architecture": Architecture,
  "run-a-node": RunNode,
  "verification": Verification,
  "staking": Staking,
  "claiming": Claiming,
  "security": Security,
  "compute": Compute,
  "sdk": Sdk,
  "api": Api,
  "tokenomics": Tokenomics,
  "migration": Migration,
  "troubleshooting": Troubleshooting,
  "faq": Faq,
};

export function Docs() {
  const slug = currentSlug();
  // An unknown slug shows the overview rather than a blank page, so links made
  // before the split land somewhere useful instead of nowhere.
  const known = Object.prototype.hasOwnProperty.call(ROUTES, slug);
  const Page = known ? ROUTES[slug] : Overview;
  return (
    <DocsLayout slug={known ? slug : ""}>
      <Page />
    </DocsLayout>
  );
}
