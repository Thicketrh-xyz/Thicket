"""
Model runtime — the node's actual AI work, via a local Ollama install.

Ollama handles model downloads, GPU/Metal acceleration, and cross-platform
quirks, so a node operator installs one thing and we talk HTTP to it.

Capabilities are detected, not declared: we ask Ollama what models are present
and advertise only what this machine can really do. A node without Ollama still
runs fine — it just advertises no AI capability and keeps earning from uptime
and challenges.

  text   → generate text from a prompt            (e.g. llama3.2:1b)
  vision → describe/caption an image              (e.g. llava, moondream)

Image *generation* is not Ollama's job; that needs a diffusion runtime and is a
separate capability we can add later.
"""
from __future__ import annotations

import base64
import os
import time

import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
TEXT_MODEL = os.getenv("THICKET_TEXT_MODEL", "llama3.2:1b")
VISION_MODEL = os.getenv("THICKET_VISION_MODEL", "llava:7b")
GEN_TIMEOUT = int(os.getenv("THICKET_JOB_TIMEOUT", "180"))

# Any locally-installed model whose name starts with one of these counts as
# vision-capable. Everything else is treated as text-only.
_VISION_HINTS = ("llava", "moondream", "bakllava", "llama3.2-vision", "minicpm-v", "qwen2-vision")


def _tags() -> list[str]:
    """Model names installed in the local Ollama, or [] if it isn't reachable."""
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=4)
        r.raise_for_status()
        return [m.get("name", "") for m in r.json().get("models", [])]
    except Exception:  # noqa: BLE001 — no Ollama, wrong port, not started
        return []


def detect_capabilities() -> dict:
    """What this machine can actually do right now."""
    models = _tags()
    if not models:
        return {"caps": [], "models": {}, "runtime": None}

    def pick(preferred: str, want_vision: bool) -> str | None:
        if preferred in models:
            return preferred
        for m in models:
            is_vision = any(m.lower().startswith(h) for h in _VISION_HINTS)
            if is_vision == want_vision:
                return m
        return None

    text_model = pick(TEXT_MODEL, want_vision=False)
    vision_model = pick(VISION_MODEL, want_vision=True)

    caps, chosen = [], {}
    if text_model:
        caps.append("text"); chosen["text"] = text_model
    if vision_model:
        caps.append("vision"); chosen["vision"] = vision_model
    return {"caps": caps, "models": chosen, "runtime": "ollama"}


def _generate(model: str, prompt: str, images: list[str] | None = None) -> str:
    payload = {"model": model, "prompt": prompt, "stream": False}
    if images:
        payload["images"] = images          # base64, no data: prefix
    r = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=GEN_TIMEOUT)
    r.raise_for_status()
    return (r.json().get("response") or "").strip()


def run(kind: str, prompt: str, image_b64: str | None = None) -> dict:
    """Execute one job. Returns {ok, output, model, seconds} — never raises, so
    a bad job can't take the node down."""
    started = time.time()
    caps = detect_capabilities()
    model = caps["models"].get(kind)

    if not model:
        return {"ok": False, "output": f"this node cannot run '{kind}' jobs",
                "model": None, "seconds": 0.0}
    try:
        if kind == "vision":
            if not image_b64:
                return {"ok": False, "output": "vision job needs an image",
                        "model": model, "seconds": 0.0}
            out = _generate(model, prompt or "Describe this image.", [image_b64])
        else:
            out = _generate(model, prompt)
        return {"ok": True, "output": out, "model": model,
                "seconds": round(time.time() - started, 2)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "output": f"inference failed: {e}", "model": model,
                "seconds": round(time.time() - started, 2)}


def encode_image(path: str) -> str:
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode()
