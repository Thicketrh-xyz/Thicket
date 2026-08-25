import { CONTRACTS_LIVE } from "../config";

// Running a node is a program on your machine, not a webapp action — these are
// the real steps against the live network.
export function NodeGuide({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Run a Thicket node</h3>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal__body">
          <p className="panel__hint">
            A node is a small program you run on a machine with a GPU. It bonds THKT, passes
            verification challenges, and earns per verified minute online. This site is the portal —
            it can't run the node for you.
          </p>

          <div className="modal__step">
            <div className="n">1</div>
            <div>
              <h4>Get a funded wallet</h4>
              <p>You need at least <b>1,000 THKT</b> (the operator bond) plus a little testnet ETH for gas.</p>
            </div>
          </div>

          <div className="modal__step">
            <div className="n">2</div>
            <div>
              <h4>Get the code &amp; configure</h4>
              <p>The coordinator URL and contract addresses are already filled in.</p>
              <div className="code">{`git clone https://github.com/Thicketrh-xyz/Thicket.git
cd Thicket/node
cp .env.example .env
#  → set THICKET_PRIVATE_KEY=0x...`}</div>
            </div>
          </div>

          <div className="modal__step">
            <div className="n">3</div>
            <div>
              <h4>Run it</h4>
              <p>The node bonds itself on-chain, registers, and starts earning.</p>
              <div className="code">{`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -u -m thicket_node.client`}</div>
            </div>
          </div>

          <div className="note">
            Already bonded from the Stake tab? Set <code>SKIP_BOND=true</code> in <code>.env</code>.
            Earnings settle to an on-chain root each epoch, then you claim here.
            {!CONTRACTS_LIVE && " Contracts aren't wired in this build, so figures are illustrative."}
          </div>
        </div>
      </div>
    </div>
  );
}
