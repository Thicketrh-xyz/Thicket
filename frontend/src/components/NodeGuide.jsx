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
            verification challenges, and earns two ways: per minute online, plus a share of what
            buyers paid for the jobs it completes. This site is the portal — it can't run the node
            for you.
          </p>

          <div className="modal__step">
            <div className="n">1</div>
            <div>
              <h4>Get the code and install</h4>
              <div className="code">{`git clone https://github.com/Thicketrh-xyz/Thicket.git
cd Thicket/node
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`}</div>
            </div>
          </div>

          <div className="modal__step">
            <div className="n">2</div>
            <div>
              <h4>Need a wallet? Make one</h4>
              <p>Then send it 1,000+ THKT (the bond) and a little ETH for gas.</p>
              <div className="code">{`.venv/bin/python -m thicket_node.client --new-wallet`}</div>
            </div>
          </div>

          <div className="modal__step">
            <div className="n">3</div>
            <div>
              <h4>Save your key once</h4>
              <p>On macOS it goes in the Keychain — macOS asks for it directly, so it never lands in your shell history.</p>
              <div className="code">{`.venv/bin/python -m thicket_node.client --save-key`}</div>
            </div>
          </div>

          <div className="modal__step">
            <div className="n">4</div>
            <div>
              <h4>Start earning</h4>
              <p>Bonds on-chain, registers, and starts earning. Ctrl+C to stop.</p>
              <div className="code">{`.venv/bin/python -u -m thicket_node.client`}</div>
            </div>
          </div>

          <div className="note">
            Not on macOS? Run it without <code>--save-key</code> and it will ask for the key each time (hidden input), or put <code>THICKET_PRIVATE_KEY</code> in <code>node/.env</code> and <code>chmod 600</code> it. Already bonded from the Stake tab? Add <code>--skip-bond</code>.
            Earnings settle to an on-chain root each epoch, then you claim here.
            {!CONTRACTS_LIVE && " Contracts aren't wired in this build, so figures are illustrative."}
          </div>
        </div>
      </div>
    </div>
  );
}
