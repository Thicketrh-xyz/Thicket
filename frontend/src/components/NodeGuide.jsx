import { CONTRACTS_LIVE } from "../config";

// Honest "how to actually run a node" guide. Running a node is NOT a webapp
// action — it's a program you run on your machine. This modal shows the real
// commands instead of pretending a button does it.
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
            A node is a small program you run on a machine with a GPU. It shares your
            compute, passes verification challenges, and earns THKT. This website is the
            portal — it can't run the node for you.
          </p>

          {!CONTRACTS_LIVE && (
            <div className="modal-step">
              <div className="num">1</div>
              <div>
                <h4>Deploy the contracts to testnet</h4>
                <p>Not done yet — the network isn't live. Deploy with a funded key (see DEPLOY.md), then wire the addresses:</p>
                <div className="code">{`cd contracts
export PRIVATE_KEY=0xYOUR_FUNDED_TESTNET_KEY
forge script script/Deploy.s.sol \\
  --rpc-url https://rpc.testnet.chain.robinhood.com/rpc --broadcast
cd .. && ./scripts/write-env.sh`}</div>
              </div>
            </div>
          )}

          <div className="modal-step">
            <div className="num">{CONTRACTS_LIVE ? "1" : "2"}</div>
            <div>
              <h4>Start the coordinator</h4>
              <p>The backend that tracks heartbeats, issues challenges, and settles rewards.</p>
              <div className="code">{`cd coordinator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000`}</div>
            </div>
          </div>

          <div className="modal-step">
            <div className="num">{CONTRACTS_LIVE ? "2" : "3"}</div>
            <div>
              <h4>Run the node client</h4>
              <p>On the machine with the GPU. It registers (bonding THKT), heartbeats, and solves challenges — earnings then show on your dashboard here.</p>
              <div className="code">{`cd node
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m thicket_node.client`}</div>
            </div>
          </div>

          <div className="modal-note">
            The node client currently runs a placeholder compute challenge — swapping in a
            real GPU model runtime is on the roadmap (Sapling). Bonding THKT requires the
            contracts to be deployed and your wallet funded on testnet.
          </div>
        </div>
      </div>
    </div>
  );
}
