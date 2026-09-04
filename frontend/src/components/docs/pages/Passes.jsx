import { RELIC, RELIC_SALE, EXPLORER } from "../shared";

export function Passes() {
  return (
    <>
      <p>A <strong>Node NFT</strong> multiplies what your node earns per minute for being online. Fifty exist, split across four tiers, and the multiplier applies for as long as the NFT stays in the wallet your node runs from.</p>

      <table className="docs-table">
        <thead><tr><th>Tier</th><th>Token ids</th><th>Multiplier</th><th>Price</th><th>Uptime per day</th></tr></thead>
        <tbody>
          <tr><td>Emergent</td><td>1–5</td><td><strong>11×</strong></td><td>2,000,000 THKT</td><td>5,544</td></tr>
          <tr><td>Canopy</td><td>6–15</td><td><strong>7×</strong></td><td>1,000,000 THKT</td><td>3,528</td></tr>
          <tr><td>Understory</td><td>16–30</td><td><strong>5×</strong></td><td>750,000 THKT</td><td>2,520</td></tr>
          <tr><td>Bracken</td><td>31–50</td><td><strong>2×</strong></td><td>200,000 THKT</td><td>1,008</td></tr>
          <tr><td>No NFT</td><td>—</td><td>1×</td><td>—</td><td>504</td></tr>
        </tbody>
      </table>

      <p>Those per-day figures assume a node online the full 1,440 minutes at the current <code>REWARD_PER_MINUTE</code> of 0.35. They are the uptime half of your earnings only — read on, because this is the part most people get wrong.</p>

      <h3>What the multiplier applies to</h3>
      <p>Your earnings have two components, and an NFT touches only one of them:</p>
      <div className="code">{`earned = contribution_minutes × REWARD_PER_MINUTE × multiplier   ← an NFT multiplies this
       + work_thkt                                            ← and never this`}</div>
      <p><code>work_thkt</code> is your share of what a buyer actually paid for a job your node ran. Multiplying it would pay you more than the buyer paid, and the difference would come out of the rewards pool — so it is left alone deliberately. <strong>An NFT increases what you earn for being available, not what you earn for doing work.</strong></p>
      <p>If most of your earnings come from completed jobs rather than uptime, an NFT moves your total less than the tier table suggests. Check the split on your own node before you buy: <code>{`GET /node/<your address>`}</code> returns <code>uptime_thkt</code> and <code>work_thkt</code> separately.</p>

      <h3>They do not stack</h3>
      <p>Holding several NFTs in one wallet gives you the <strong>highest</strong> multiplier you hold, not the sum. Two Brackens is 2×, not 4×. A Bracken alongside an Emergent is 11×, and the Bracken adds nothing.</p>
      <p>This is enforced on-chain in <code>multiplierFor</code>, so collecting NFTs into a single wallet cannot compound into an unbounded rate. If you run several nodes, each operator address needs its own — and there are only fifty.</p>

      <h3>It has to be in the operator address</h3>
      <p>The multiplier follows whoever holds the token, and settlement matches the holder against the <strong>operator address your node registered with</strong>. Buying from a different wallet than the one your node runs from is the most common way for an NFT to appear to do nothing: the purchase succeeded, the NFT is real, it is simply boosting an address that does not run a node.</p>
      <p>They are freely transferable, so this is fixable — send it to the operator address and the next sync picks it up.</p>

      <h3>How it is verified</h3>
      <p>Ownership is never self-reported. The coordinator reads all fifty owners directly from the contract on a schedule and mirrors them, then settlement uses that mirror. Two consequences worth knowing:</p>
      <ul>
        <li><strong>There is a lag of up to five minutes</strong> after you buy or transfer an NFT before the multiplier takes effect. That is the sync interval, not a failure.</li>
        <li><strong>If the chain cannot be read, the previous mirror is kept</strong> rather than treated as "nobody owns anything". An RPC outage will not silently drop every holder back to 1×.</li>
      </ul>
      <p>To confirm yours is live, check your node:</p>
      <div className="code">{`curl https://thicket-production.up.railway.app/node/<your address>

  "relic_multiplier": 2,          ← 1 means no NFT is being applied
  "effective_per_minute": 0.7,    ← REWARD_PER_MINUTE × multiplier`}</div>
      <p>If <code>relic_multiplier</code> is 1 more than five minutes after your purchase, the NFT is in a wallet that is not your registered operator address.</p>

      <h3>What it does not change</h3>
      <ul>
        <li><strong>Challenges and slashing.</strong> An NFT buys no leniency. A node that fails its challenges has its earnings voided and, on repeated failure, its bond slashed — multiplier or not.</li>
        <li><strong>Your stake.</strong> An NFT is not a substitute for the operator bond, and holding one does not reduce the minimum.</li>
        <li><strong>Claiming.</strong> Earnings still settle per epoch into the Merkle root and are still paid from the pool. See <a href="/docs/claiming">Claiming rewards</a>.</li>
        <li><strong>The 70% revenue share</strong> on paid work, which is untouched.</li>
      </ul>

      <h3>Supply and the burn</h3>
      <p>Buying one <strong>burns</strong> the THKT. It is not sent to a treasury and the sale contract never holds it — <code>burnFrom</code> destroys the tokens and total supply falls. The sale contract has no withdraw function, deliberately.</p>
      <p>There are fifty token ids and no more can ever exist; the contract rejects any id above 50. They are minted <em>on purchase</em>, not at deploy, so an unsold id has no owner yet. Minting is restricted to the sale contract, and the collection owner controls which address holds that permission.</p>
      <p>If all fifty sell, 35,250,000 THKT is destroyed permanently.</p>

      <h3>Contracts</h3>
      <table className="docs-table">
        <tbody>
          <tr><th>NodeRelic (ERC-721)</th><td><a href={`${EXPLORER}/address/${RELIC}`} target="_blank" rel="noreferrer"><code>{RELIC}</code></a></td></tr>
          <tr><th>RelicSale</th><td><a href={`${EXPLORER}/address/${RELIC_SALE}`} target="_blank" rel="noreferrer"><code>{RELIC_SALE}</code></a></td></tr>
        </tbody>
      </table>
      <p>Availability, prices and the running burn total are live on the <a href="/nft">NFTs page</a>. Buying is disabled whenever the sale is closed; the page says which state it is in.</p>
    </>
  );
}
