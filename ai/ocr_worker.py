"""
Standalone persistent Awiros OCR Worker.
Isolated process: imports paddle & local PaddleOCR exclusively.
Directly reuses the verified implementation from models/awiros/test.py.
"""

import sys
import os
import json
import base64
from pathlib import Path

# Bound thread pools and memory to ensure Windows process stability
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["FLAGS_fraction_of_gpu_memory_to_use"] = "0.2"
os.environ["FLAGS_initial_gpu_memory_in_mb"] = "300"

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ai.config import (
    AWIROS_DIR,
    AWIROS_WEIGHTS_PATH,
    AWIROS_DICT_PATH,
    AWIROS_PADDLEOCR_DIR,
    setup_windows_nvidia_dlls,
)

# Set up DLL paths for paddle on Windows
setup_windows_nvidia_dlls()

# Add models/awiros to sys.path so we reuse the verified test.py directly
if str(AWIROS_DIR) not in sys.path:
    sys.path.insert(0, str(AWIROS_DIR))

import test as awiros_verified

def init_ocr():
    # 1. Ensure local PaddleOCR is importable
    awiros_verified._ensure_paddleocr(str(AWIROS_PADDLEOCR_DIR))

    import paddle
    from ppocr.modeling.architectures import build_model as ppocr_build_model
    from ppocr.postprocess import build_post_process

    # 2. Select device
    device = "gpu" if paddle.is_compiled_with_cuda() else "cpu"
    try:
        paddle.set_device(device)
    except Exception:
        device = "cpu"
        paddle.set_device("cpu")

    # 3. Post processor
    post_process = build_post_process({
        "name": "CTCLabelDecode",
        "character_dict_path": str(AWIROS_DICT_PATH),
        "use_space_char": True,
    })

    # 4. Model construction
    config = awiros_verified.MODEL_CONFIG
    model = ppocr_build_model(config["Architecture"])
    model.eval()

    # 5. Load weights from model.safetensors
    state_dict = awiros_verified.load_safetensors_to_paddle(paddle, str(AWIROS_WEIGHTS_PATH))
    model.set_state_dict(state_dict)

    active_device = paddle.get_device()
    return model, post_process, active_device

def run_worker():
    import cv2
    import numpy as np

    try:
        model, post_process, device = init_ocr()
        ready_payload = {
            "status": "ready",
            "weights": str(AWIROS_WEIGHTS_PATH),
            "device": str(device)
        }
        sys.stdout.write(json.dumps(ready_payload) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"status": "error", "error": str(e)}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            sys.stdout.write(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}) + "\n")
            sys.stdout.flush()
            continue

        action = req.get("action", "recognize")
        if action == "ping":
            sys.stdout.write(json.dumps({"success": True, "status": "pong", "device": str(device)}) + "\n")
            sys.stdout.flush()
            continue
        elif action == "quit":
            break

        img_bgr = None
        if "crop_path" in req and req["crop_path"]:
            img_bgr = cv2.imread(req["crop_path"])
        elif "crop_base64" in req and req["crop_base64"]:
            img_bytes = base64.b64decode(req["crop_base64"])
            nparr = np.frombuffer(img_bytes, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_bgr is None or img_bgr.size == 0:
            sys.stdout.write(json.dumps({"success": False, "error": "Invalid or unreadable image"}) + "\n")
            sys.stdout.flush()
            continue

        try:
            # Use exact verified preprocessing from test.py
            import paddle
            preprocessed = awiros_verified.preprocess(img_bgr, awiros_verified.IMAGE_SHAPE)
            tensor = paddle.to_tensor(np.expand_dims(preprocessed, axis=0))

            with paddle.no_grad():
                preds = model(tensor)

            if isinstance(preds, dict):
                pred_tensor = preds.get("ctc", next(iter(preds.values())))
            elif isinstance(preds, (list, tuple)):
                pred_tensor = preds[0]
            else:
                pred_tensor = preds

            post_result = post_process(pred_tensor.numpy())
            if isinstance(post_result, (list, tuple)) and len(post_result) > 0:
                text, confidence = post_result[0]
            else:
                text, confidence = "", 0.0

            text = text.strip().upper()
            resp = {
                "success": True,
                "text": text,
                "confidence": round(float(confidence), 4),
                "device": str(device)
            }
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"success": False, "error": str(e)}) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    run_worker()
