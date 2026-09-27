"""Local, offline Laya deployment; HTTP handling is provided by laya.serve."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "laya" / ".runtime"
os.environ.update({
    "HF_HOME": str(RUNTIME / "hf-cache"),
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
    "USE_TF": "0",
    "TOKENIZERS_PARALLELISM": "false",
    "LAYA_DEVICE": "mps",
})
os.environ["LAYA_API_KEY"] = (RUNTIME / "api-key").read_text().strip()
if not os.environ["LAYA_API_KEY"]:
    raise RuntimeError("Missing local API key")

import torch
import uvicorn
from laya import Router
import laya.serve as serve

torch.set_num_threads(4)
torch.set_num_interop_threads(1)
if not torch.backends.mps.is_available():
    raise RuntimeError("This deployment requires Apple MPS; GPU is unavailable")


class LocalRouter(Router):
    def predict(self, state, questions, model=None):
        if model not in (None, "multilingual"):
            raise ValueError("This deployment serves only multilingual")
        # Reserve room for the question/options instead of silently cutting off evidence.
        agent = self.load("multilingual")
        from laya.common import serialize_state
        tokens = agent.tok(serialize_state(state), add_special_tokens=False)["input_ids"]
        if len(tokens) > 1750:
            raise ValueError("State exceeds 1750 tokens; split the evidence into shorter passages")
        return super().predict(state, questions, model="multilingual", max_len=2048)


router = LocalRouter(
    models={"multilingual": str(RUNTIME / "model")},
    default="multilingual", device="mps", max_loaded=1,
)
router.preload(["multilingual"])
serve.MAX_QUESTIONS = 8
serve.MAX_STATE_CHARS = 12000
serve.MAX_BODY_BYTES = 128 * 1024
app = serve.create_app(router=router)


@app.get("/deployment")
def deployment():
    return {
        "package": "laya==0.3.20", "model": "convaiinnovations/laya-multilingual",
        "revision": "e4e9ddf21a7b1903b7acffd8814ad4307bf63a67",
        "device": "mps", "max_len": 2048, "max_state_tokens": 1750,
        "max_questions": 8, "offline": True,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8766, access_log=False)
