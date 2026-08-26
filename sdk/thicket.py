"""
Thicket SDK — buy verified AI compute from a wallet.

An autonomous agent can't open an account, add a card, or click through a
billing flow. It can hold a wallet. This wraps the whole purchase into one call:

    from thicket import Thicket

    t = Thicket(private_key="0x...")
    print(t.run("Summarise this in one line: ...").output)

Under the hood each job is: approve THKT -> fund the rewards pool on-chain ->
submit the job -> wait for a node to return the result.

Requires: web3, requests   (pip install web3 requests)
Optional: pillow           (auto-converts images to a format vision models accept)
"""
from __future__ import annotations

import base64
import time
from dataclasses import dataclass

import requests
from web3 import Web3

COORDINATOR = "https://thicket-production.up.railway.app"
RPC = "https://rpc.testnet.chain.robinhood.com/rpc"
TOKEN = "0x4D4837ddb309a8dCeC3Abe727dbfED584771aEE2"
DISTRIBUTOR = "0xD5afab6f1d786be0fad6281b9c842D0662Fa88e5"

_ERC20 = [
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "s", "type": "address"}, {"name": "a", "type": "uint256"}],
     "outputs": [{"name": "", "type": "bool"}]},
    {"name": "allowance", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]},
]
_DISTRIBUTOR = [
    {"name": "fund", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "amount", "type": "uint256"}], "outputs": []},
]


class ThicketError(RuntimeError):
    """Anything that stops a job completing."""


@dataclass
class BatchResult:
    id: str
    total: int
    done: int
    failed: int
    price_thkt: float
    results: list           # [{id, status, prompt, result, node}]

    @property
    def ok(self) -> bool:
        return self.failed == 0 and self.done == self.total

    def outputs(self) -> list[str]:
        """Just the text, in submission order."""
        return [r.get("result") or "" for r in self.results]


@dataclass
class JobResult:
    id: str
    status: str          # done | failed | pending | assigned
    output: str
    price_thkt: float
    node: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "done"

    def __str__(self) -> str:
        return self.output


class Thicket:
    def __init__(self, private_key: str, coordinator: str = COORDINATOR, rpc: str = RPC,
                 token: str = TOKEN, distributor: str = DISTRIBUTOR):
        if not private_key:
            raise ThicketError("a wallet private key is required")
        if not private_key.startswith("0x"):
            private_key = "0x" + private_key

        self.coordinator = coordinator.rstrip("/")
        self.w3 = Web3(Web3.HTTPProvider(rpc))
        self.account = self.w3.eth.account.from_key(private_key)
        self.address = self.account.address
        self._token = self.w3.eth.contract(address=Web3.to_checksum_address(token), abi=_ERC20)
        self._dist_addr = Web3.to_checksum_address(distributor)
        self._dist = self.w3.eth.contract(address=self._dist_addr, abi=_DISTRIBUTOR)

    # ---------- read-only helpers ----------
    def balance(self) -> float:
        """THKT held by this wallet."""
        return self._token.functions.balanceOf(self.address).call() / 1e18

    def capabilities(self) -> list[str]:
        """What the network can serve right now, e.g. ['text', 'vision']."""
        try:
            return self._get("/stats").get("capabilities", [])
        except Exception:  # noqa: BLE001
            return []

    def quote(self, prompt: str = "", kind: str = "text", image_pixels: int = 0) -> float:
        """What a job would cost, before committing any THKT."""
        return self._post("/compute/quote", {
            "kind": kind, "prompt": prompt,
            "has_image": kind == "vision", "image_pixels": image_pixels,
        })["price_thkt"]

    # ---------- running work ----------
    def run(self, prompt: str, document: str | None = None, timeout: int = 300,
            max_price: float | None = None) -> JobResult:
        """Run a text job. `document` is appended to the instruction."""
        full = f"{prompt.strip()}\n\n{document}" if document else prompt
        return self._execute("text", full, timeout=timeout, max_price=max_price)

    def run_batch(self, instruction: str, items: list[str], kind: str = "text",
                  timeout: int = 1800, max_price: float | None = None,
                  on_progress=None) -> BatchResult:
        """Run many items under one instruction, with a single payment.

        The network fans the work out across every capable node, so a batch
        finishes far faster than submitting items one at a time.

            res = t.run_batch("Summarise this row", [row1, row2, ...])
        """
        if not items:
            raise ThicketError("no items to run")

        caps = self.capabilities()
        if caps and kind not in caps:
            raise ThicketError(f"no node online can run '{kind}' jobs (network serves: {caps})")

        price = self.quote_batch(instruction, items, kind)
        if max_price is not None and price > max_price:
            raise ThicketError(f"batch would cost {price} THKT, above your max_price of {max_price}")
        held = self.balance()
        if held < price:
            raise ThicketError(f"wallet holds {held:.2f} THKT but this batch costs {price} THKT")

        tx = self._pay(price)
        batch = self._post("/batches", {
            "kind": kind, "instruction": instruction,
            "items": [{"prompt": it} for it in items],
            "payer": self.address, "payment_tx": tx, "payment_thkt": price,
        })
        return self._wait_batch(batch["id"], timeout, on_progress)

    def quote_batch(self, instruction: str, items: list[str], kind: str = "text") -> float:
        """Price a whole batch without submitting it."""
        p = self._pricing()
        total = 0.0
        for it in items:
            chars = len((f"{instruction.strip()}\n\n{it}" if instruction else it))
            total += p["base_thkt"] + (chars / 1000.0) * p["per_1k_chars_thkt"]
            if kind == "vision":
                total += p["vision_thkt"]
        return round(total, 2)

    def _pricing(self) -> dict:
        if not getattr(self, "_pricing_cache", None):
            self._pricing_cache = self._get("/compute/price")
        return self._pricing_cache

    def _wait_batch(self, batch_id: str, timeout: int, on_progress=None) -> BatchResult:
        deadline = time.time() + timeout
        last = -1
        while time.time() < deadline:
            b = self._get(f"/batches/{batch_id}")
            finished = b["done"] + b["failed"]
            if on_progress and finished != last:
                on_progress(finished, b["total"])
                last = finished
            if b.get("finished"):
                return BatchResult(id=batch_id, total=b["total"], done=b["done"],
                                   failed=b["failed"], price_thkt=b["price_thkt"],
                                   results=b["results"])
            time.sleep(3)
        b = self._get(f"/batches/{batch_id}")
        raise ThicketError(
            f"batch {batch_id} unfinished after {timeout}s ({b['done']}/{b['total']} done) — "
            f"it is paid for and still running; poll GET /batches/{batch_id}")

    def caption(self, image: str | bytes, prompt: str = "Describe this image.",
                timeout: int = 300, max_price: float | None = None) -> JobResult:
        """Run a vision job on an image path or raw bytes."""
        raw = open(image, "rb").read() if isinstance(image, str) else image
        b64, pixels = _prepare_image(raw)
        return self._execute("vision", prompt, image=b64, image_pixels=pixels,
                             timeout=timeout, max_price=max_price)

    # ---------- internals ----------
    def _execute(self, kind: str, prompt: str, image: str | None = None, image_pixels: int = 0,
                 timeout: int = 300, max_price: float | None = None) -> JobResult:
        caps = self.capabilities()
        if caps and kind not in caps:
            raise ThicketError(
                f"no node online can run '{kind}' jobs right now (network serves: {caps or 'nothing'}). "
                "Not spending your THKT on work nobody can do.")

        price = self.quote(prompt, kind, image_pixels)
        if max_price is not None and price > max_price:
            raise ThicketError(f"job would cost {price} THKT, above your max_price of {max_price}")
        held = self.balance()
        if held < price:
            raise ThicketError(f"wallet holds {held:.2f} THKT but this job costs {price} THKT")

        tx = self._pay(price)
        job = self._post("/jobs", {
            "kind": kind, "prompt": prompt, "image": image, "image_pixels": image_pixels,
            "payer": self.address, "payment_tx": tx, "payment_thkt": price,
        })
        return self._wait(job["id"], price, timeout)

    def _pay(self, amount_thkt: float) -> str:
        """approve (if needed) then fund the rewards pool. Returns the fund tx hash."""
        amount = int(round(amount_thkt * 1e18))
        if self._token.functions.allowance(self.address, self._dist_addr).call() < amount:
            self._send(self._token.functions.approve(self._dist_addr, amount))
        return self._send(self._dist.functions.fund(amount))

    def _send(self, fn) -> str:
        tx = fn.build_transaction({
            "from": self.address,
            "nonce": self.w3.eth.get_transaction_count(self.address),
        })
        signed = self.account.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(h, timeout=180)
        if receipt.status != 1:
            raise ThicketError(f"transaction reverted: {self.w3.to_hex(h)}")
        return self.w3.to_hex(h)

    def _wait(self, job_id: str, price: float, timeout: int) -> JobResult:
        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(2)
            j = self._get(f"/jobs/{job_id}")
            if j.get("status") in ("done", "failed"):
                return JobResult(id=job_id, status=j["status"], output=j.get("result") or "",
                                 price_thkt=price, node=j.get("node"))
        raise ThicketError(
            f"job {job_id} did not finish within {timeout}s — it is paid for and may still "
            f"complete; poll GET /jobs/{job_id}")

    def _get(self, path: str):
        r = requests.get(f"{self.coordinator}{path}", timeout=20)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, body: dict):
        r = requests.post(f"{self.coordinator}{path}", json=body, timeout=30)
        if r.status_code >= 400:
            raise ThicketError(f"{path} failed ({r.status_code}): {r.text[:200]}")
        return r.json()


def _prepare_image(raw: bytes) -> tuple[str, int]:
    """Vision models can't decode every format (WebP notably fails). Convert to
    JPEG and downscale when Pillow is available; otherwise pass the bytes through
    and let the caller find out."""
    try:
        import io
        from PIL import Image
    except ImportError:
        return base64.b64encode(raw).decode(), 0

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((1280, 1280))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode(), img.width * img.height
