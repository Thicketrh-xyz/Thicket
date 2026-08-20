// How to actually run a node against the live Thicket network. Running a node
// is a program on your machine, not a webapp action — these are the real steps.
export function NodeGuide({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Run a Thicket node</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
            A node is a small program you run on a machine with a GPU. It bonds THKT, passes
            verification challenges, and earns THKT per minute online. The network is live on
            Robinhood Chain testnet.
          </p>

          <div className="modal-step">
            <div className="num">1</div>
            <div>
              <h4>Get a funded wallet</h4>
              <p>You need a wallet with at least <b>1,000 THKT</b> (the operator bond) plus a little
                testnet ETH for gas. Testnet ETH is free from the Robinhood faucet; THKT is
                distributed by the team for now.</p>
            </div>
          </div>

          <div className="modal-step">
            <div className="num">2</div>
            <div>
              <h4>Get the code &amp; configure</h4>
              <p>Clone the repo and set your wallet key. The coordinator URL and contract
                addresses are already filled in.</p>
              <div className="code">{`git clone https://github.com/Thicketrh-xyz/Thicket.git
cd Thicket/node
cp .env.example .env
#  → open .env and set THICKET_PRIVATE_KEY=0x...`}</div>
            </div>
          </div>

          <div className="modal-step">
            <div className="num">3</div>
            <div>
              <h4>Run it</h4>
              <p>The node bonds itself on-chain, registers, and starts earning. Watch your
                earnings tick up on this dashboard.</p>
              <div className="code">{`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -u -m thicket_node.client`}</div>
            </div>
          </div>

          <div className="modal-note">
            Already bonded from the Stake tab? Set <code>SKIP_BOND=true</code> in <code>.env</code> and
            the node skips bonding. Earnings settle to an on-chain root each epoch, then Claim here.
          </div>
        </div>
      </div>
    </div>
  );
}
