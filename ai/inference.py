"""
AI Service Orchestrator and Pipeline.
Lightweight FastAPI server running in .venv.
Does NOT import torch or paddle directly.
Manages isolated PlateDetector and AwirosOCR workers via IPC.
"""

import sys
import os
import json
import base64
import tempfile
from pathlib import Path
from typing import Optional, List
import cv2
import numpy as np

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ai.config import AI_HOST, AI_PORT, YOLO_MODEL_PATH, AWIROS_WEIGHTS_PATH
from ai.detector import PlateDetector
from ai.ocr import AwirosOCR

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

class ANPRPipeline:
    def __init__(self):
        self.detector = PlateDetector()
        self.ocr = AwirosOCR()
        self._is_ready = False

    def start(self):
        if not self._is_ready:
            print("[ANPRPipeline] Starting YOLO detector worker...")
            self.detector.start()
            print(f"[ANPRPipeline] YOLO detector ready on device: {self.detector.device}")

            print("[ANPRPipeline] Starting Awiros OCR worker...")
            self.ocr.start()
            print(f"[ANPRPipeline] Awiros OCR ready on device: {self.ocr.device}")

            self._is_ready = True

    def stop(self):
        if self._is_ready:
            print("[ANPRPipeline] Stopping workers...")
            self.detector.stop()
            self.ocr.stop()
            self._is_ready = False

    def is_healthy(self) -> bool:
        return self._is_ready and self.detector.ping() and self.ocr.ping()

    def get_status(self):
        return {
            "status": "ready" if self._is_ready else "initializing",
            "detector": {
                "model": str(YOLO_MODEL_PATH),
                "device": self.detector.device,
                "alive": self.detector.ping()
            },
            "ocr": {
                "weights": str(AWIROS_WEIGHTS_PATH),
                "device": self.ocr.device,
                "alive": self.ocr.ping()
            }
        }

    def process_image(self, img_bgr: np.ndarray, conf_threshold: float = 0.25):
        if not self._is_ready:
            self.start()

        h, w = img_bgr.shape[:2]

        # 1. Encode image to temp file for YOLO worker
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            cv2.imwrite(tmp_path, img_bgr)
            det_result = self.detector.detect(image_path=tmp_path, conf=conf_threshold)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

        if not det_result.get("success"):
            raise RuntimeError(f"Plate detection failed: {det_result.get('error')}")

        detections = det_result.get("detections", [])
        plates = []

        # 2. For each detected plate, crop and pass to OCR worker
        for det in detections:
            bbox = det["bbox"]
            x1 = max(0, int(round(bbox[0])))
            y1 = max(0, int(round(bbox[1])))
            x2 = min(w, int(round(bbox[2])))
            y2 = min(h, int(round(bbox[3])))

            # Guard against invalid box
            if x2 <= x1 or y2 <= y1:
                continue

            crop = img_bgr[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as crop_tmp:
                crop_path = crop_tmp.name
            try:
                cv2.imwrite(crop_path, crop)
                ocr_result = self.ocr.recognize(crop_path=crop_path)
            finally:
                if os.path.exists(crop_path):
                    try:
                        os.remove(crop_path)
                    except Exception:
                        pass

            if ocr_result.get("success"):
                plate_text = ocr_result.get("text", "")
                ocr_conf = ocr_result.get("confidence", 0.0)
                plates.append({
                    "text": plate_text,
                    "ocr_confidence": ocr_conf,
                    "detection_confidence": det.get("confidence", 0.0),
                    "bbox": [x1, y1, x2, y2]
                })

        return {
            "success": True,
            "plates": plates,
            "device": {
                "detector": self.detector.device,
                "ocr": self.ocr.device
            }
        }

# Global Pipeline Singleton
pipeline = ANPRPipeline()

# FastAPI App
app = FastAPI(title="TrafficEye Local AI ANPR Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    pipeline.start()

@app.on_event("shutdown")
def on_shutdown():
    pipeline.stop()

@app.get("/health")
def health_check():
    return {
        "status": "ok" if pipeline.is_healthy() else "degraded",
        "service": "TrafficEye AI Local Inference Engine",
        "telemetry": pipeline.get_status()
    }

@app.post("/infer")
async def infer(request: Request):
    content_type = request.headers.get("content-type", "")
    img_bgr = None
    conf = 0.25

    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file") or form.get("image")
        if file:
            file_bytes = await file.read()
            nparr = np.frombuffer(file_bytes, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if form.get("conf"):
            conf = float(form.get("conf"))
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}

        conf = float(body.get("conf", 0.25))
        image_path = body.get("image_path")
        image_base64 = body.get("image_base64")

        if image_path:
            p = Path(image_path)
            if not p.is_absolute():
                p = PROJECT_ROOT / p
            img_bgr = cv2.imread(str(p))
        elif image_base64:
            b64_data = image_base64
            if "," in b64_data:
                b64_data = b64_data.split(",")[1]
            file_bytes = base64.b64decode(b64_data)
            nparr = np.frombuffer(file_bytes, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_bgr is None or img_bgr.size == 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid image provided or image file could not be read"
        )

    try:
        res = pipeline.process_image(img_bgr, conf_threshold=conf)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=AI_HOST, port=AI_PORT)
