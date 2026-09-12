"""
ANPR Pipeline Orchestrator — Persistent Process & Production Video Pipeline
===========================================================================
Node/Express spawns this as a long-lived subprocess.
Communicates with Node via JSON lines on stdin/stdout.
NEVER prints non-JSON to stdout when running in IPC mode. Diagnostic output goes to stderr.

Supports:
- Full-frame sequential video decoding (no vehicle discovery skipping).
- Decoupled detection vs tracking: late-appearing vehicles entering at ANY frame immediately create new tracks.
- Accurate distinction: DETECTION (detector fired), TRACK_PREDICTION (missed frame maintained), RE_DETECTION.
- Multi-frame plate detection & quality-scored in-memory OCR.
- Positional Indian license plate normalization & confidence-weighted temporal consensus.
- Failure attribution: VEHICLE_DETECTED_NO_PLATE, PLATE_DETECTED_OCR_FAILED, OCR_SUCCESS_UNVALIDATED, OCR_SUCCESS_VALIDATED.
- 4K frame resolution scaling & exact coordinate remapping.
- Frame-by-frame diagnostics.
- Optional annotated debug video generation.
- CLI argument parsing for standalone testing and automated benchmarking.
"""

import sys
import os
import json
import base64
import re
import time
import uuid
import threading
import argparse
import cv2
import numpy as np
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
from ai.config import (
    setup_windows_nvidia_dlls,
    SNAPSHOTS_DIR,
    VIDEO_PROCESS_FPS,
    ANPR_DEVICE,
    UVH26_CLASSES,
)
setup_windows_nvidia_dlls()

from ai.detector import YOLODetector
from ai.ocr import AwirosOCR

# Runtime configuration (env-overridable)
TARGET_FPS            = int(os.getenv("ANPR_TARGET_FPS", str(VIDEO_PROCESS_FPS)))
VEHICLE_CONF          = float(os.getenv("ANPR_VEHICLE_CONF", "0.25"))
PLATE_CONF            = float(os.getenv("ANPR_PLATE_CONF", "0.25"))
IOU_THRESHOLD         = float(os.getenv("ANPR_TRACK_IOU", "0.30"))
MAX_TRACK_AGE         = int(os.getenv("ANPR_MAX_TRACK_AGE", "15"))
OCR_INTERVAL          = int(os.getenv("ANPR_OCR_INTERVAL", "2"))
OCR_MIN_CONF          = float(os.getenv("ANPR_OCR_MIN_CONF", "0.70"))
PROGRESS_EVERY        = int(os.getenv("ANPR_PROGRESS_EVERY", "5"))
MAX_CENTROID_DIST     = float(os.getenv("ANPR_MAX_CENTROID", "250"))
MAX_INFER_DIM         = int(os.getenv("ANPR_MAX_INFER_DIM", "1280"))

# Indian state/UT registration prefixes
INDIAN_STATES = {
    "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA",
    "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH",
    "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ", "SK",
    "TN", "TR", "TS", "UK", "UP", "WB", "AN", "CT", "DH", "UT",
    "NR", "KI", "EA", "BH",
}

# I/O helpers
def emit(data: dict):
    """Emit a single JSON line to stdout (channel to Node)."""
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()


def log(msg: str):
    """Send diagnostic messages to stderr (never stdout)."""
    sys.stderr.write(f"[ANPR-Pipeline] {msg}\n")
    sys.stderr.flush()


# Geometry utilities
def compute_iou(b1, b2) -> float:
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    area2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = area1 + area2 - inter
    return inter / union if union > 0 else 0.0


def centroid_sim(b1, b2, max_dist: float = MAX_CENTROID_DIST) -> float:
    cx1 = (b1[0] + b1[2]) / 2.0
    cy1 = (b1[1] + b1[3]) / 2.0
    cx2 = (b2[0] + b2[2]) / 2.0
    cy2 = (b2[1] + b2[3]) / 2.0
    dist = ((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2) ** 0.5
    return max(0.0, 1.0 - dist / max_dist)


# String utilities & OCR normalization
def edit_distance(s1: str, s2: str) -> int:
    m, n = len(s1), len(s2)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            temp = dp[j]
            if s1[i - 1] == s2[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[n]


def str_sim(s1: str, s2: str) -> float:
    if not s1 or not s2:
        return 0.0
    if s1 == s2:
        return 1.0
    return max(0.0, 1.0 - edit_distance(s1, s2) / max(len(s1), len(s2)))


# Positional OCR correction for Indian plates:
#   [0-1]   state code   -> LETTERS
#   [2-3]   district     -> DIGITS
#   [4-..]  series       -> LETTERS then DIGITS (last 4 = number)
_D2L = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B"}
_L2D = {"O": "0", "I": "1", "Z": "2", "S": "5", "B": "8"}


def normalize_ocr_text(text: str) -> str:
    """Deterministic positional OCR correction without global blind substitution."""
    if not text:
        return ""
    text = text.upper()
    text = re.sub(r"[\s\-]", "", text)
    text = re.sub(r"[^A-Z0-9]", "", text)
    if not text:
        return ""

    chars = list(text)
    n = len(chars)

    # State code (pos 0-1) -> letters
    for i in range(min(2, n)):
        if chars[i] in _D2L:
            chars[i] = _D2L[chars[i]]

    # District code (pos 2-3) -> digits
    for i in range(2, min(4, n)):
        if chars[i] in _L2D:
            chars[i] = _L2D[chars[i]]

    # Series + number (pos 4+)
    if n > 4:
        num_start = max(4, n - 4)  # last 4 digits
        for i in range(4, num_start):
            if chars[i] in _D2L:
                chars[i] = _D2L[chars[i]]
        for i in range(num_start, n):
            if chars[i] in _L2D:
                chars[i] = _L2D[chars[i]]

    return "".join(chars)


def validate_indian_plate(text: str) -> str:
    """Returns 'valid', 'invalid_state', 'invalid_format', or 'invalid'."""
    if not text or len(text) < 6:
        return "invalid"
    if text[:2] not in INDIAN_STATES:
        return "invalid_state"
    patterns = [
        r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}$",
        r"^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$",
        r"^[A-Z]{2}\d{2}[A-Z]{3}\d{4}$",
        r"^[A-Z]{2}\d{1,2}[A-Z]{2}\d{4}$",
        r"^\d{2}BH\d{4}[A-Z]{1,2}$",  # Bharat series
    ]
    for pat in patterns:
        if re.match(pat, text):
            return "valid"
    return "invalid_format"


# Crop quality measurement
def compute_crop_quality(crop: np.ndarray) -> float:
    """Evaluate sharpness, resolution, and aspect ratio of a plate crop."""
    if crop is None or crop.size == 0:
        return 0.0
    h, w = crop.shape[:2]
    area = h * w
    if area < 50:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    aspect = w / max(1, h)
    aspect_score = 1.0 if (1.8 <= aspect <= 5.5) else 0.5
    sharpness_score = min(1.0, blur_var / 250.0)
    size_score = min(1.0, area / 6000.0)
    return round(0.4 * sharpness_score + 0.4 * size_score + 0.2 * aspect_score, 4)


# In-memory image encoding & cropping
def crop_to_b64(frame: np.ndarray, bbox: list) -> str | None:
    h, w = frame.shape[:2]
    x1 = max(0, int(round(bbox[0])))
    y1 = max(0, int(round(bbox[1])))
    x2 = min(w, int(round(bbox[2])))
    y2 = min(h, int(round(bbox[3])))
    if x2 <= x1 or y2 <= y1:
        return None
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0 or crop.shape[0] < 4 or crop.shape[1] < 4:
        return None
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        return None
    return base64.b64encode(buf).decode("ascii")


def frame_to_b64(frame: np.ndarray, quality: int = 85) -> str:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Failed to JPEG-encode frame in memory")
    return base64.b64encode(buf).decode("ascii")


def save_snapshot(frame: np.ndarray, bbox: list = None, prefix: str = "snap", plate_bbox: list = None) -> str | None:
    """Save vehicle snapshot under server/data/snapshots/ with optional plate highlight."""
    try:
        SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{prefix}_{uuid.uuid4().hex[:12]}.jpg"
        filepath = SNAPSHOTS_DIR / filename

        h, w = frame.shape[:2]
        if bbox is not None and len(bbox) == 4:
            pad_x = int((bbox[2] - bbox[0]) * 0.12)
            pad_y = int((bbox[3] - bbox[1]) * 0.12)
            x1 = max(0, int(bbox[0]) - pad_x)
            y1 = max(0, int(bbox[1]) - pad_y)
            x2 = min(w, int(bbox[2]) + pad_x)
            y2 = min(h, int(bbox[3]) + pad_y)
            if x2 > x1 and y2 > y1:
                target = frame[y1:y2, x1:x2].copy()
                # If plate bbox provided and within crop, draw subtle green plate box
                if plate_bbox and len(plate_bbox) == 4:
                    px1 = max(0, int(plate_bbox[0]) - x1)
                    py1 = max(0, int(plate_bbox[1]) - y1)
                    px2 = min(target.shape[1], int(plate_bbox[2]) - x1)
                    py2 = min(target.shape[0], int(plate_bbox[3]) - y1)
                    if px2 > px1 and py2 > py1:
                        cv2.rectangle(target, (px1, py1), (px2, py2), (0, 255, 0), 2)
            else:
                target = frame
        else:
            target = frame

        cv2.imwrite(str(filepath), target, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return f"/snapshots/{filename}"
    except Exception as e:
        log(f"Failed to save snapshot: {e}")
        return None


# Advanced Vehicle Tracker with Decoupled Discovery & Missed-Detection Reconnection
class VehicleTracker:
    def __init__(self, iou_threshold=IOU_THRESHOLD, max_track_age=MAX_TRACK_AGE, max_centroid_dist=MAX_CENTROID_DIST):
        self.tracks: dict = {}  # track_id -> track dict
        self.next_id: int = 1
        self.iou_threshold = iou_threshold
        self.max_track_age = max_track_age
        self.max_centroid_dist = max_centroid_dist

    def get_active_tracks(self) -> list:
        return [t for t in self.tracks.values() if t.get("status") != "RETIRED"]

    def update(self, vehicle_detections: list, frame_number: int, timestamp: float) -> tuple:
        """
        Match vehicle detections to existing tracks or create new tracks.
        Returns (frame_hits, new_tids, reconnected_tids, missed_tids).
        """
        matched_tids = set()
        frame_hits = []
        new_tids = []
        reconnected_tids = []

        # Candidate tracks for matching: active tracks that have not aged out
        candidates = {
            tid: t for tid, t in self.tracks.items()
            if t["age"] <= self.max_track_age and t.get("status") != "RETIRED"
        }

        for v in vehicle_detections:
            v_box = v["bbox"]
            v_cls = v.get("class", "Others")
            best_tid = None
            best_score = -1.0

            for tid, track in candidates.items():
                if tid in matched_tids:
                    continue

                # Motion projection: if track missed frames, project bbox using velocity
                age = track["age"]
                t_box = track["bbox"]
                if age > 0:
                    vx, vy = track.get("vx", 0.0), track.get("vy", 0.0)
                    pred_box = [
                        t_box[0] + vx * age,
                        t_box[1] + vy * age,
                        t_box[2] + vx * age,
                        t_box[3] + vy * age,
                    ]
                else:
                    pred_box = t_box

                iou = compute_iou(v_box, pred_box)
                csim = centroid_sim(v_box, pred_box, self.max_centroid_dist)

                # Class consistency bonus
                t_cls = track.get("vehicle_class")
                if v_cls == t_cls:
                    class_bonus = 0.20
                elif (v_cls in ("Two-wheeler", "bicycle") and t_cls in ("Two-wheeler", "bicycle")) or \
                     (v_cls in ("Sedan", "Hatchback", "SUV", "MUV") and t_cls in ("Sedan", "Hatchback", "SUV", "MUV")):
                    class_bonus = 0.10
                else:
                    class_bonus = -0.10  # incompatible class penalty

                # Temporal proximity discount for older missed tracks
                time_discount = max(0.70, 1.0 - 0.03 * age)

                score = (0.50 * iou + 0.35 * csim + class_bonus) * time_discount

                # Match condition: strong IoU or strong centroid proximity
                if score > best_score and (iou >= self.iou_threshold or csim >= 0.65):
                    best_score = score
                    best_tid = tid

            if best_tid is not None:
                matched_tids.add(best_tid)
                t = self.tracks[best_tid]

                # Distinguish RE_DETECTION from continuous DETECTION
                was_missed = t["age"] > 0
                if was_missed:
                    t["re_detections"] += 1
                    t["status"] = "RE_DETECTION"
                    reconnected_tids.append(best_tid)
                else:
                    t["status"] = "DETECTION"

                # Update velocity
                old_center = t["center"]
                new_center = v.get("center", [(v_box[0] + v_box[2]) / 2.0, (v_box[1] + v_box[3]) / 2.0])
                dt = t["age"] + 1
                curr_vx = (new_center[0] - old_center[0]) / dt
                curr_vy = (new_center[1] - old_center[1]) / dt
                t["vx"] = 0.65 * t.get("vx", 0.0) + 0.35 * curr_vx
                t["vy"] = 0.65 * t.get("vy", 0.0) + 0.35 * curr_vy

                # Update track state
                t["bbox"] = list(v_box)
                t["center"] = new_center
                t["last_seen_frame"] = frame_number
                t["last_seen_time"] = timestamp
                t["last_seen_timestamp_ms"] = int(timestamp * 1000)
                t["age"] = 0
                t["total_detections"] += 1
                t["detection_frames"].append(frame_number)

                if v["confidence"] > t["vehicle_confidence"]:
                    t["vehicle_confidence"] = v["confidence"]
                    t["vehicle_class"] = v_cls

                frame_hits.append((best_tid, v))
            else:
                # NEW VEHICLE DISCOVERED AT THIS FRAME
                tid = self.next_id
                self.next_id += 1
                new_tids.append(tid)

                center = v.get("center", [(v_box[0] + v_box[2]) / 2.0, (v_box[1] + v_box[3]) / 2.0])
                self.tracks[tid] = {
                    "track_id": tid,
                    "vehicle_class": v_cls,
                    "vehicle_confidence": float(v.get("confidence", 0.0)),
                    "bbox": list(v_box),
                    "center": center,
                    "vx": 0.0,
                    "vy": 0.0,
                    "first_seen_frame": frame_number,
                    "last_seen_frame": frame_number,
                    "first_seen_time": timestamp,
                    "last_seen_time": timestamp,
                    "first_seen_timestamp_ms": int(timestamp * 1000),
                    "last_seen_timestamp_ms": int(timestamp * 1000),
                    "age": 0,
                    "total_detections": 1,
                    "detection_frames": [frame_number],
                    "missed_frames": [],
                    "predicted_frames": 0,
                    "re_detections": 0,
                    "status": "DETECTION",
                    "processed_frame_count": 0,
                    "plate_detections_count": 0,
                    "ocr_attempts_count": 0,
                    "best_ocr_conf": 0.0,
                    "best_plate_area": 0.0,
                    "best_crop_quality": 0.0,
                    "best_frame_number": frame_number,
                    "best_plate_bbox": None,
                    "plate_text": None,
                    "plate_confidence": 0.0,
                    "plate_bbox": None,
                    "snapshot_path": None,
                    "observations": [],
                    "failure_stage": "VEHICLE_DETECTED_NO_PLATE",
                }
                frame_hits.append((tid, v))

        # Handle candidate tracks with no detection in this frame: TRACK_PREDICTION
        missed_tids = []
        for tid, track in candidates.items():
            if tid not in matched_tids:
                track["age"] += 1
                track["predicted_frames"] += 1
                track["missed_frames"].append(frame_number)
                track["status"] = "TRACK_PREDICTION"
                missed_tids.append(tid)
                if track["age"] > self.max_track_age:
                    track["status"] = "RETIRED"

        return frame_hits, new_tids, reconnected_tids, missed_tids


# Temporal OCR consensus voting
def aggregate_ocr_votes(observations: list) -> tuple:
    """
    Confidence-weighted temporal voting with character-level grouping.
    Returns (best_plate_text, averaged_confidence).
    """
    if not observations:
        return None, 0.0

    groups = []
    for obs in observations:
        text = obs["text"]
        conf = float(obs["confidence"])
        val_status = validate_indian_plate(text)
        val_weight = 1.40 if val_status == "valid" else 1.0

        placed = False
        for g in groups:
            if str_sim(text, g["rep"]) >= 0.78:
                g["obs"].append(obs)
                g["total_score"] += conf * val_weight
                g["count"] += 1
                if conf > g["best_conf"]:
                    g["best_conf"] = conf
                    g["rep"] = text
                placed = True
                break
        if not placed:
            groups.append({
                "rep": text,
                "obs": [obs],
                "total_score": conf * val_weight,
                "count": 1,
                "best_conf": conf,
            })

    best = max(groups, key=lambda g: g["total_score"] + g["count"] * 0.25)
    avg_conf = best["total_score"] / best["count"]
    return best["rep"], round(min(1.0, avg_conf), 4)


# Main pipeline class
class ANPRPipeline:
    def __init__(self):
        self.detector = YOLODetector()
        self.ocr = AwirosOCR()
        self._cancel_flags: dict = {}

    def start(self):
        log("Starting persistent YOLO worker (UVH-26 + Plate Detector)...")
        self.detector.start()
        log(f"YOLO ready -> device: {self.detector.device} | UVH-26 classes: {len(self.detector.uvh26_classes)}")
        log("Starting persistent Awiros OCR worker...")
        self.ocr.start()
        log(f"OCR ready -> device: {self.ocr.device}")

    def cancel_job(self, job_id: str):
        if job_id in self._cancel_flags:
            self._cancel_flags[job_id].set()

    def _cancelled(self, job_id: str) -> bool:
        flag = self._cancel_flags.get(job_id)
        return flag is not None and flag.is_set()

    # Image inference pipeline
    def infer_image(self, image_path: str, conf: float = VEHICLE_CONF) -> dict:
        img = cv2.imread(str(image_path))
        if img is None:
            raise ValueError(f"Cannot read image from path: {image_path}")

        h, w = img.shape[:2]

        # 1. Run YOLO worker: detect vehicles (UVH-26) and plates
        yolo_res = self.detector.detect_all(image_path=str(image_path), vehicle_conf=conf, plate_conf=conf)
        if not yolo_res.get("success"):
            raise RuntimeError(f"YOLO detection error: {yolo_res.get('error')}")

        vehicles = yolo_res.get("vehicles", [])
        plates = yolo_res.get("plates", [])
        unmatched_plates = yolo_res.get("unmatched_plates", [])

        events = []
        track_counter = 1

        # Process vehicles with matched plates first
        for v in vehicles:
            p = v.get("plate")
            plate_text = None
            raw_text = None
            ocr_conf = 0.0
            validation = "invalid"
            plate_bbox = p["bbox"] if p else None
            snap_path = None
            fail_stage = "VEHICLE_DETECTED_NO_PLATE"

            if p:
                fail_stage = "PLATE_DETECTED_OCR_FAILED"
                crop_b64 = crop_to_b64(img, p["bbox"])
                if crop_b64:
                    try:
                        ocr_res = self.ocr.recognize(crop_base64=crop_b64)
                        if ocr_res.get("success"):
                            raw_text = ocr_res.get("text", "")
                            plate_text = normalize_ocr_text(raw_text) if raw_text else None
                            validation = validate_indian_plate(plate_text) if plate_text else "invalid"
                            ocr_conf = float(ocr_res.get("confidence", 0.0))
                            if plate_text:
                                fail_stage = "OCR_SUCCESS_VALIDATED" if validation == "valid" else "OCR_SUCCESS_UNVALIDATED"
                    except Exception as e:
                        log(f"OCR recognition error: {e}")

                snap_path = save_snapshot(img, v["bbox"], prefix="veh", plate_bbox=plate_bbox)
            else:
                snap_path = save_snapshot(img, v["bbox"], prefix="veh")

            events.append({
                "trackId": track_counter,
                "track_id": track_counter,
                "vehicleClass": v.get("class", "Others"),
                "vehicle_class": v.get("class", "Others"),
                "vehicleConfidence": v.get("confidence", 0.0),
                "vehicle_confidence": v.get("confidence", 0.0),
                "vehicleBbox": v["bbox"],
                "center": v.get("center"),
                "plateNumber": plate_text,
                "plate_text": plate_text,
                "rawOCRText": raw_text,
                "raw_ocr_text": raw_text,
                "plateConfidence": ocr_conf,
                "plate_confidence": ocr_conf,
                "ocrConfidence": ocr_conf,
                "detectionConfidence": p.get("confidence", v.get("confidence", 0.0)) if p else v.get("confidence", 0.0),
                "validationStatus": validation,
                "plate_validation_status": validation,
                "failureStage": fail_stage,
                "failure_stage": fail_stage,
                "bbox": plate_bbox or v["bbox"],
                "snapshotPath": snap_path,
                "snapshot_path": snap_path,
                "firstSeen": 0.0,
                "lastSeen": 0.0,
                "first_seen_at": 0.0,
                "last_seen_at": 0.0,
                "frameNumber": 0,
                "frame_number": 0,
                "observationCount": 1 if plate_text else 0,
                "observations": [{
                    "frameNumber": 0,
                    "frame_number": 0,
                    "timestamp": 0.0,
                    "x1": (plate_bbox or v["bbox"])[0],
                    "y1": (plate_bbox or v["bbox"])[1],
                    "x2": (plate_bbox or v["bbox"])[2],
                    "y2": (plate_bbox or v["bbox"])[3],
                    "bbox": plate_bbox or v["bbox"],
                    "ocr_text": plate_text,
                    "ocr_confidence": ocr_conf,
                    "detection_confidence": v.get("confidence", 0.0),
                    "vehicle_class": v.get("class", "Others"),
                }] if plate_text else [],
            })
            track_counter += 1

        # Process unmatched plates
        for p in unmatched_plates:
            crop_b64 = crop_to_b64(img, p["bbox"])
            plate_text = None
            raw_text = None
            ocr_conf = 0.0
            validation = "invalid"
            fail_stage = "PLATE_DETECTED_OCR_FAILED"
            if crop_b64:
                try:
                    ocr_res = self.ocr.recognize(crop_base64=crop_b64)
                    if ocr_res.get("success"):
                        raw_text = ocr_res.get("text", "")
                        plate_text = normalize_ocr_text(raw_text) if raw_text else None
                        validation = validate_indian_plate(plate_text) if plate_text else "invalid"
                        ocr_conf = float(ocr_res.get("confidence", 0.0))
                        if plate_text:
                            fail_stage = "OCR_SUCCESS_VALIDATED" if validation == "valid" else "OCR_SUCCESS_UNVALIDATED"
                except Exception as e:
                    log(f"OCR error on unmatched plate: {e}")

            snap_path = save_snapshot(img, p["bbox"], prefix="plate")
            events.append({
                "trackId": track_counter,
                "track_id": track_counter,
                "vehicleClass": "Others",
                "vehicle_class": "Others",
                "vehicleConfidence": round(float(p.get("confidence", 0.0)), 4),
                "vehicle_confidence": round(float(p.get("confidence", 0.0)), 4),
                "vehicleBbox": p["bbox"],
                "center": [(p["bbox"][0] + p["bbox"][2]) / 2, (p["bbox"][1] + p["bbox"][3]) / 2],
                "plateNumber": plate_text,
                "plate_text": plate_text,
                "rawOCRText": raw_text,
                "raw_ocr_text": raw_text,
                "plateConfidence": ocr_conf,
                "plate_confidence": ocr_conf,
                "ocrConfidence": ocr_conf,
                "detectionConfidence": round(float(p.get("confidence", 0.0)), 4),
                "validationStatus": validation,
                "plate_validation_status": validation,
                "failureStage": fail_stage,
                "failure_stage": fail_stage,
                "bbox": p["bbox"],
                "snapshotPath": snap_path,
                "snapshot_path": snap_path,
                "firstSeen": 0.0,
                "lastSeen": 0.0,
                "first_seen_at": 0.0,
                "last_seen_at": 0.0,
                "frameNumber": 0,
                "frame_number": 0,
                "observationCount": 1 if plate_text else 0,
                "observations": [{
                    "frameNumber": 0,
                    "frame_number": 0,
                    "timestamp": 0.0,
                    "x1": p["bbox"][0],
                    "y1": p["bbox"][1],
                    "x2": p["bbox"][2],
                    "y2": p["bbox"][3],
                    "bbox": p["bbox"],
                    "ocr_text": plate_text,
                    "ocr_confidence": ocr_conf,
                    "detection_confidence": p.get("confidence", 0.0),
                    "vehicle_class": "Others",
                }] if plate_text else [],
            })
            track_counter += 1

        plates_output = [e for e in events if e.get("plateNumber")] or events

        return {
            "success": True,
            "events": events,
            "plates": plates_output,
            "vehicles": vehicles,
            "imageWidth": w,
            "imageHeight": h,
            "detectorDevice": self.detector.device,
            "ocrDevice": self.ocr.device,
        }

    # Production Video Inference Pipeline
    def infer_video(self, job_id: str, video_path: str, opts: dict, progress_cb) -> dict:
        cancel_flag = threading.Event()
        self._cancel_flags[job_id] = cancel_flag

        vehicle_conf = float(opts.get("vehicle_conf", opts.get("yolo_conf", VEHICLE_CONF)))
        plate_conf = float(opts.get("plate_conf", opts.get("yolo_conf", PLATE_CONF)))
        iou_thresh = float(opts.get("iou_threshold", IOU_THRESHOLD))
        max_age = int(opts.get("max_track_age", MAX_TRACK_AGE))
        ocr_interval = int(opts.get("ocr_interval", OCR_INTERVAL))
        ocr_min_conf = float(opts.get("ocr_min_conf", OCR_MIN_CONF))
        debug_video = bool(opts.get("debug_video", False) or os.getenv("ANPR_DEBUG_VIDEO") == "1")

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Cannot open video from path: {video_path}")

        # Dynamically determine actual video metadata
        source_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = round(total_frames / source_fps if source_fps > 0 else 0.0, 2)
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        tracker = VehicleTracker(iou_threshold=iou_thresh, max_track_age=max_age)

        # Video writer for optional debug video
        video_writer = None
        debug_video_url = None
        if debug_video:
            SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
            debug_filename = f"debug_{job_id}_{uuid.uuid4().hex[:6]}.mp4"
            debug_path = SNAPSHOTS_DIR / debug_filename
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            video_writer = cv2.VideoWriter(str(debug_path), fourcc, source_fps, (frame_width, frame_height))
            debug_video_url = f"/snapshots/{debug_filename}"

        frame_idx = 0
        decoded_frames = 0
        vehicle_detection_frames = 0
        total_raw_vehicle_detections = 0
        total_raw_plate_detections = 0
        total_ocr_attempts = 0
        total_ocr_successes = 0

        frame_diagnostics = []
        start_time = time.time()

        try:
            while True:
                if self._cancelled(job_id):
                    log(f"Job {job_id} cancelled at frame {frame_idx}")
                    raise RuntimeError("cancelled")

                ret, frame = cap.read()
                if not ret:
                    break

                decoded_frames += 1
                vehicle_detection_frames += 1
                current_frame_number = frame_idx
                timestamp = round(current_frame_number / source_fps, 3)
                timestamp_ms = int(timestamp * 1000)

                # 4K Resolution handling: scaled working frame for UVH-26
                orig_h, orig_w = frame.shape[:2]
                if max(orig_w, orig_h) > MAX_INFER_DIM:
                    scale = MAX_INFER_DIM / float(max(orig_w, orig_h))
                    work_w = int(round(orig_w * scale))
                    work_h = int(round(orig_h * scale))
                    working_frame = cv2.resize(frame, (work_w, work_h), interpolation=cv2.INTER_AREA)
                    scale_x = orig_w / float(work_w)
                    scale_y = orig_h / float(work_h)
                else:
                    working_frame = frame
                    scale_x = 1.0
                    scale_y = 1.0

                # Run UVH-26 vehicle detection on every decoded frame (zero discovery skipping)
                try:
                    f_b64 = frame_to_b64(working_frame, quality=85)
                    yolo_res = self.detector.detect_all(image_base64=f_b64, vehicle_conf=vehicle_conf, plate_conf=plate_conf)
                    raw_vehicles = yolo_res.get("vehicles", []) if yolo_res.get("success") else []
                    raw_plates = yolo_res.get("plates", []) if yolo_res.get("success") else []
                except Exception as exc:
                    log(f"YOLO error frame {current_frame_number}: {exc}")
                    raw_vehicles = []
                    raw_plates = []

                # Remap bounding boxes back to original coordinates if working frame was scaled
                vehicle_detections = []
                for rv in raw_vehicles:
                    b = rv["bbox"]
                    orig_box = [
                        round(b[0] * scale_x, 2),
                        round(b[1] * scale_y, 2),
                        round(b[2] * scale_x, 2),
                        round(b[3] * scale_y, 2),
                    ]
                    center = [(orig_box[0] + orig_box[2]) / 2.0, (orig_box[1] + orig_box[3]) / 2.0]
                    p = rv.get("plate")
                    orig_plate = None
                    if p:
                        pb = p["bbox"]
                        orig_plate = {
                            "bbox": [
                                round(pb[0] * scale_x, 2),
                                round(pb[1] * scale_y, 2),
                                round(pb[2] * scale_x, 2),
                                round(pb[3] * scale_y, 2),
                            ],
                            "confidence": p.get("confidence", 0.0),
                            "class": p.get("class", "license_plate"),
                        }

                    vehicle_detections.append({
                        "bbox": orig_box,
                        "confidence": rv.get("confidence", 0.0),
                        "class": rv.get("class", "Others"),
                        "class_id": rv.get("class_id", -1),
                        "center": center,
                        "plate": orig_plate,
                    })

                plate_detections = []
                for rp in raw_plates:
                    pb = rp["bbox"]
                    plate_detections.append({
                        "bbox": [
                            round(pb[0] * scale_x, 2),
                            round(pb[1] * scale_y, 2),
                            round(pb[2] * scale_x, 2),
                            round(pb[3] * scale_y, 2),
                        ],
                        "confidence": rp.get("confidence", 0.0),
                        "class": rp.get("class", "license_plate"),
                    })

                total_raw_vehicle_detections += len(vehicle_detections)
                total_raw_plate_detections += len(plate_detections)

                # Update Vehicle Tracker with detections
                frame_hits, new_tids, reconnected_tids, missed_tids = tracker.update(
                    vehicle_detections, current_frame_number, timestamp
                )

                frame_ocr_attempts = 0
                frame_ocr_success = 0
                frame_plate_count = 0

                # Process plate detection & multi-frame OCR for active tracks
                for tid, v_det in frame_hits:
                    track = tracker.tracks.get(tid)
                    if not track:
                        continue

                    pfc = track["processed_frame_count"]
                    best_conf = track["best_ocr_conf"]

                    # 1. Search for plate on this vehicle
                    p = v_det.get("plate")
                    if not p:
                        # Check global frame plate detections intersecting vehicle
                        vx1, vy1, vx2, vy2 = v_det["bbox"]
                        v_area = max(1.0, (vx2 - vx1) * (vy2 - vy1))
                        for pd in plate_detections:
                            px1, py1, px2, py2 = pd["bbox"]
                            p_area = max(1.0, (px2 - px1) * (py2 - py1))
                            ix1 = max(vx1, px1)
                            iy1 = max(vy1, py1)
                            ix2 = min(vx2, px2)
                            iy2 = min(vy2, py2)
                            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
                            if inter / p_area >= 0.40:
                                p = pd
                                break

                    # 2. If plate found, register plate opportunity and evaluate OCR
                    if p:
                        frame_plate_count += 1
                        track["plate_detections_count"] += 1
                        p_box = p["bbox"]
                        track["plate_bbox"] = p_box

                        # Extract high-resolution plate crop from original frame
                        p_crop_b64 = crop_to_b64(frame, p_box)
                        if p_crop_b64:
                            # Quality measurement
                            px1 = max(0, int(p_box[0]))
                            py1 = max(0, int(p_box[1]))
                            px2 = min(orig_w, int(p_box[2]))
                            py2 = min(orig_h, int(p_box[3]))
                            crop_np = frame[py1:py2, px1:px2]
                            q_score = compute_crop_quality(crop_np)

                            # Multi-frame OCR scheduling
                            should_run_ocr = False
                            if track["ocr_attempts_count"] == 0:
                                should_run_ocr = True
                            elif best_conf < ocr_min_conf and pfc % ocr_interval == 0:
                                should_run_ocr = True
                            elif q_score > track["best_crop_quality"] * 1.15:
                                should_run_ocr = True
                            elif best_conf >= ocr_min_conf and pfc % (ocr_interval * 3) == 0:
                                should_run_ocr = True

                            if should_run_ocr:
                                frame_ocr_attempts += 1
                                total_ocr_attempts += 1
                                track["ocr_attempts_count"] += 1
                                try:
                                    ocr_res = self.ocr.recognize(crop_base64=p_crop_b64)
                                    if ocr_res.get("success") and ocr_res.get("text"):
                                        raw_t = ocr_res["text"]
                                        norm_t = normalize_ocr_text(raw_t)
                                        oconf = float(ocr_res.get("confidence", 0.0))

                                        if norm_t and len(norm_t) >= 4:
                                            frame_ocr_success += 1
                                            total_ocr_successes += 1

                                            obs = {
                                                "frame_number": current_frame_number,
                                                "frameNumber": current_frame_number,
                                                "timestamp": timestamp,
                                                "timestamp_ms": timestamp_ms,
                                                "text": norm_t,
                                                "ocr_text": norm_t,
                                                "raw_text": raw_t,
                                                "raw_ocr_text": raw_t,
                                                "confidence": oconf,
                                                "ocr_confidence": oconf,
                                                "crop_quality": q_score,
                                                "detection_confidence": round(float(p.get("confidence", v_det.get("confidence", 0.0))), 4),
                                                "vehicle_class": track["vehicle_class"],
                                                "bbox": [round(c, 2) for c in p_box],
                                                "x1": round(p_box[0], 2),
                                                "y1": round(p_box[1], 2),
                                                "x2": round(p_box[2], 2),
                                                "y2": round(p_box[3], 2),
                                            }
                                            track["observations"].append(obs)

                                            # Update best observation & snapshot if better confidence or crop quality
                                            if oconf > track["best_ocr_conf"] or (oconf >= track["best_ocr_conf"] - 0.05 and q_score > track["best_crop_quality"]):
                                                track["best_ocr_conf"] = oconf
                                                track["best_crop_quality"] = q_score
                                                track["best_frame_number"] = current_frame_number
                                                track["best_plate_bbox"] = p_box
                                                track["plate_text"] = norm_t
                                                track["plate_confidence"] = oconf
                                                track["snapshot_path"] = save_snapshot(frame, v_det["bbox"], prefix="veh", plate_bbox=p_box)
                                except Exception as exc:
                                    log(f"OCR error track #{tid} frame {current_frame_number}: {exc}")

                    # Ensure at least one baseline vehicle snapshot is captured
                    if not track.get("snapshot_path"):
                        track["snapshot_path"] = save_snapshot(frame, v_det["bbox"], prefix="veh")

                    track["processed_frame_count"] = pfc + 1

                # 3. Process any plates not inside a detected vehicle (e.g. tight camera view or unclassified vehicle)
                matched_plate_boxes = [t["plate_bbox"] for t in tracker.tracks.values() if t.get("plate_bbox")]
                for pd in plate_detections:
                    pb = pd["bbox"]
                    already_matched = False
                    for mb in matched_plate_boxes:
                        if compute_iou(pb, mb) >= 0.50:
                            already_matched = True
                            break
                    if already_matched:
                        continue

                    v_proxy = {
                        "bbox": pb,
                        "confidence": pd.get("confidence", 0.0),
                        "class": "Others",
                        "class_id": 13,
                        "center": [(pb[0] + pb[2]) / 2.0, (pb[1] + pb[3]) / 2.0],
                        "plate": pd,
                    }
                    proxy_hits, proxy_new, _, _ = tracker.update([v_proxy], current_frame_number, timestamp)
                    for ptid, pv_det in proxy_hits:
                        ptrack = tracker.tracks.get(ptid)
                        if not ptrack:
                            continue
                        frame_plate_count += 1
                        ptrack["plate_detections_count"] += 1
                        ptrack["plate_bbox"] = pb

                        p_crop_b64 = crop_to_b64(frame, pb)
                        if p_crop_b64:
                            q_score = compute_crop_quality(frame[max(0, int(pb[1])):min(orig_h, int(pb[3])), max(0, int(pb[0])):min(orig_w, int(pb[2]))])
                            if ptrack["ocr_attempts_count"] == 0 or q_score > ptrack.get("best_crop_quality", 0.0) * 1.10:
                                frame_ocr_attempts += 1
                                total_ocr_attempts += 1
                                ptrack["ocr_attempts_count"] += 1
                                try:
                                    ocr_res = self.ocr.recognize(crop_base64=p_crop_b64)
                                    if ocr_res.get("success") and ocr_res.get("text"):
                                        raw_t = ocr_res["text"]
                                        norm_t = normalize_ocr_text(raw_t)
                                        oconf = float(ocr_res.get("confidence", 0.0))
                                        if norm_t and len(norm_t) >= 4:
                                            frame_ocr_success += 1
                                            total_ocr_successes += 1
                                            obs = {
                                                "frame_number": current_frame_number,
                                                "frameNumber": current_frame_number,
                                                "timestamp": timestamp,
                                                "timestamp_ms": timestamp_ms,
                                                "text": norm_t,
                                                "ocr_text": norm_t,
                                                "raw_text": raw_t,
                                                "raw_ocr_text": raw_t,
                                                "confidence": oconf,
                                                "ocr_confidence": oconf,
                                                "crop_quality": q_score,
                                                "detection_confidence": round(float(pd.get("confidence", 0.0)), 4),
                                                "vehicle_class": "Others",
                                                "bbox": [round(c, 2) for c in pb],
                                                "x1": round(pb[0], 2),
                                                "y1": round(pb[1], 2),
                                                "x2": round(pb[2], 2),
                                                "y2": round(pb[3], 2),
                                            }
                                            ptrack["observations"].append(obs)
                                            if oconf > ptrack["best_ocr_conf"]:
                                                ptrack["best_ocr_conf"] = oconf
                                                ptrack["best_crop_quality"] = q_score
                                                ptrack["best_frame_number"] = current_frame_number
                                                ptrack["best_plate_bbox"] = pb
                                                ptrack["plate_text"] = norm_t
                                                ptrack["plate_confidence"] = oconf
                                                ptrack["snapshot_path"] = save_snapshot(frame, pb, prefix="plate", plate_bbox=pb)
                                except Exception as exc:
                                    log(f"OCR error unmatched plate: {exc}")
                        if not ptrack.get("snapshot_path"):
                            ptrack["snapshot_path"] = save_snapshot(frame, pb, prefix="plate", plate_bbox=pb)

                # Optional Debug Video Frame Rendering
                if video_writer is not None:
                    debug_frame = frame.copy()
                    # Top HUD Banner
                    hud_text = f"FRAME: {current_frame_number} | TIME: {timestamp:.3f}s | ACTIVE: {len(tracker.get_active_tracks())} | NEW: {len(new_tids)} | RE-DET: {len(reconnected_tids)}"
                    cv2.rectangle(debug_frame, (0, 0), (orig_w, 36), (20, 25, 30), -1)
                    cv2.putText(debug_frame, hud_text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)

                    # Draw vehicles
                    for tid, v_det in frame_hits:
                        track = tracker.tracks.get(tid, {})
                        v_box = v_det["bbox"]
                        vx1, vy1, vx2, vy2 = [int(c) for c in v_box]
                        v_cls = track.get("vehicle_class", "Others")
                        v_conf = track.get("vehicle_confidence", 0.0)
                        status = track.get("status", "DETECTION")

                        # Color by class
                        color = (0, 220, 255) if v_cls in ("Two-wheeler", "bicycle") else (0, 165, 255) if v_cls in ("Bus", "Truck") else (255, 128, 0)
                        cv2.rectangle(debug_frame, (vx1, vy1), (vx2, vy2), color, 2)
                        lbl = f"#{tid} {v_cls} {v_conf:.2f} [{status}]"
                        cv2.putText(debug_frame, lbl, (vx1, max(18, vy1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2)

                        # Draw plate if present
                        if track.get("plate_bbox"):
                            px1, py1, px2, py2 = [int(c) for c in track["plate_bbox"]]
                            cv2.rectangle(debug_frame, (px1, py1), (px2, py2), (0, 255, 0), 2)
                            if track.get("plate_text"):
                                p_lbl = f"{track['plate_text']} ({track.get('best_ocr_conf', 0.0):.2f})"
                                cv2.putText(debug_frame, p_lbl, (px1, min(orig_h - 6, py2 + 18)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)

                    video_writer.write(debug_frame)

                # Collect diagnostics for this frame
                diag = {
                    "frame_number": current_frame_number,
                    "timestamp": timestamp,
                    "vehicle_detections": len(vehicle_detections),
                    "new_tracks": len(new_tids),
                    "reconnected_tracks": len(reconnected_tids),
                    "active_tracks": len(tracker.get_active_tracks()),
                    "missed_tracks": len(missed_tids),
                    "plate_detections": frame_plate_count,
                    "ocr_attempts": frame_ocr_attempts,
                    "successful_ocr": frame_ocr_success,
                }
                frame_diagnostics.append(diag)

                # Progress reporting
                elapsed = time.time() - start_time
                fps = round(decoded_frames / elapsed, 2) if elapsed > 0 else 0.0

                if decoded_frames % PROGRESS_EVERY == 0 or decoded_frames == 1:
                    pct = round((decoded_frames / total_frames) * 100) if total_frames > 0 else 0
                    progress_cb({
                        "event": "progress",
                        "job_id": job_id,
                        "progress": pct,
                        "processed_frames": decoded_frames,
                        "processedFrames": decoded_frames,
                        "decoded_frames": decoded_frames,
                        "total_frames": total_frames,
                        "totalFrames": total_frames,
                        "frame_number": current_frame_number,
                        "frameNumber": current_frame_number,
                        "fps": fps,
                        "elapsed_time": round(elapsed, 1),
                        "detections_count": len(vehicle_detections),
                        "tracks_count": len(tracker.tracks),
                        "plates_count": total_raw_plate_detections,
                        "ocr_success_count": total_ocr_successes,
                    })

                frame_idx += 1
                del frame

        finally:
            cap.release()
            if video_writer is not None:
                video_writer.release()
            if job_id in self._cancel_flags:
                del self._cancel_flags[job_id]

        total_proc_time = round(time.time() - start_time, 2)

        # Finalize vehicle events & apply failure attribution
        final_events = []
        for tid, track in tracker.tracks.items():
            obs_list = track["observations"]
            resolved_plate = None
            avg_ocr_conf = 0.0

            if obs_list:
                resolved_plate, avg_ocr_conf = aggregate_ocr_votes(obs_list)

            val_status = validate_indian_plate(resolved_plate) if resolved_plate else "invalid"

            # Failure Attribution
            if resolved_plate:
                fail_stage = "OCR_SUCCESS_VALIDATED" if val_status == "valid" else "OCR_SUCCESS_UNVALIDATED"
            elif track["plate_detections_count"] > 0:
                fail_stage = "PLATE_DETECTED_OCR_FAILED"
            else:
                fail_stage = "VEHICLE_DETECTED_NO_PLATE"

            v_box = track.get("bbox", [0, 0, 0, 0])
            p_box = track.get("best_plate_bbox") or track.get("plate_bbox") or v_box

            final_events.append({
                "trackId": tid,
                "track_id": tid,
                "vehicleClass": track["vehicle_class"],
                "vehicle_class": track["vehicle_class"],
                "vehicleConfidence": round(float(track["vehicle_confidence"]), 4),
                "vehicle_confidence": round(float(track["vehicle_confidence"]), 4),
                "plateNumber": resolved_plate,
                "plate_text": resolved_plate,
                "rawOCRText": obs_list[0].get("raw_text", resolved_plate) if obs_list else None,
                "raw_ocr_text": obs_list[0].get("raw_text", resolved_plate) if obs_list else None,
                "plateConfidence": avg_ocr_conf,
                "plate_confidence": avg_ocr_conf,
                "ocrConfidence": avg_ocr_conf,
                "detectionConfidence": round(float(track["vehicle_confidence"]), 4),
                "validationStatus": val_status,
                "plate_validation_status": val_status,
                "failureStage": fail_stage,
                "failure_stage": fail_stage,
                "firstSeen": track["first_seen_time"],
                "lastSeen": track["last_seen_time"],
                "first_seen_at": track["first_seen_time"],
                "last_seen_at": track["last_seen_time"],
                "first_seen_timestamp_ms": track["first_seen_timestamp_ms"],
                "last_seen_timestamp_ms": track["last_seen_timestamp_ms"],
                "firstFrame": track["first_seen_frame"],
                "lastFrame": track["last_seen_frame"],
                "frameNumber": track["first_seen_frame"],
                "frame_number": track["first_seen_frame"],
                "totalDetections": track["total_detections"],
                "total_detections": track["total_detections"],
                "missedFrames": track["missed_frames"],
                "missed_frames": track["missed_frames"],
                "predictedFrames": track["predicted_frames"],
                "predicted_frames": track["predicted_frames"],
                "reDetections": track["re_detections"],
                "re_detections": track["re_detections"],
                "observationCount": len(obs_list),
                "observation_count": len(obs_list),
                "observations": obs_list,
                "bbox": p_box,
                "vehicleBbox": v_box,
                "x1": v_box[0],
                "y1": v_box[1],
                "x2": v_box[2],
                "y2": v_box[3],
                "snapshotPath": track.get("snapshot_path"),
                "snapshot_path": track.get("snapshot_path"),
            })

        # Duplicate suppression: group events with the same valid plate number
        unique_events = []
        seen_plates = {}
        dup_count = 0

        for ev in final_events:
            p_text = ev.get("plateNumber")
            if p_text and ev.get("validationStatus") == "valid":
                if p_text in seen_plates:
                    existing = seen_plates[p_text]
                    existing["lastSeen"] = max(existing["lastSeen"], ev["lastSeen"])
                    existing["last_seen_at"] = existing["lastSeen"]
                    existing["observationCount"] += ev["observationCount"]
                    existing["observations"].extend(ev["observations"])
                    if ev["ocrConfidence"] > existing["ocrConfidence"]:
                        existing["ocrConfidence"] = ev["ocrConfidence"]
                        existing["plateConfidence"] = ev["ocrConfidence"]
                    dup_count += 1
                    continue
                seen_plates[p_text] = ev
            unique_events.append(ev)

        unique_events.sort(key=lambda e: e["firstSeen"])
        final_plates = [e for e in unique_events if e.get("plateNumber")] or unique_events

        # Aggregate metrics
        total_missed_detections = sum(len(t["missed_frames"]) for t in tracker.tracks.values())
        total_predicted_frames = sum(t["predicted_frames"] for t in tracker.tracks.values())
        total_re_detections = sum(t["re_detections"] for t in tracker.tracks.values())

        stats = {
            "sourceFps": round(source_fps, 2),
            "totalFrames": total_frames,
            "actual_total_frames": total_frames,
            "decodedFrames": decoded_frames,
            "decoded_frames": decoded_frames,
            "vehicleDetectionFrames": vehicle_detection_frames,
            "vehicle_detection_frames": vehicle_detection_frames,
            "width": frame_width,
            "height": frame_height,
            "duration": duration,
            "processingTimeSeconds": total_proc_time,
            "totalVehicleDetections": total_raw_vehicle_detections,
            "total_vehicle_detections": total_raw_vehicle_detections,
            "uniqueVehicleTracks": len(unique_events),
            "unique_vehicle_tracks": len(unique_events),
            "totalMissedDetections": total_missed_detections,
            "total_missed_detections": total_missed_detections,
            "totalPredictedFrames": total_predicted_frames,
            "total_predicted_frames": total_predicted_frames,
            "totalReDetections": total_re_detections,
            "total_re_detections": total_re_detections,
            "totalPlateDetections": total_raw_plate_detections,
            "total_plate_detections": total_raw_plate_detections,
            "ocrAttempts": total_ocr_attempts,
            "ocr_attempts": total_ocr_attempts,
            "successfulOCR": total_ocr_successes,
            "successful_ocr": total_ocr_successes,
            "finalRecognizedPlates": len([e for e in unique_events if e.get("plateNumber")]),
            "duplicateSuppressionCount": dup_count,
            "duplicate_suppression_count": dup_count,
            "debugVideoUrl": debug_video_url,
            "debug_video_url": debug_video_url,
        }

        return {
            "success": True,
            "events": unique_events,
            "plates": final_plates,
            "stats": stats,
            "diagnostics": frame_diagnostics,
            "detectorDevice": self.detector.device,
            "ocrDevice": self.ocr.device,
        }


# Command IPC & CLI runner
def main():
    parser = argparse.ArgumentParser(description="TrafficEye AI ANPR Pipeline")
    parser.add_argument("--video", type=str, help="Process video file")
    parser.add_argument("--image", type=str, help="Process image file")
    parser.add_argument("--debug-video", action="store_true", help="Generate annotated debug video")
    parser.add_argument("--conf", type=float, default=VEHICLE_CONF, help="Detection confidence threshold")
    parser.add_argument("--target-fps", type=int, default=TARGET_FPS, help="Target FPS")
    args, unknown = parser.parse_known_args()

    pipeline = ANPRPipeline()
    try:
        pipeline.start()
    except Exception as exc:
        emit({"status": "error", "error": str(exc)})
        sys.exit(1)

    # CLI standalone mode
    if args.video or args.image:
        if args.video:
            log(f"Running standalone video inference on {args.video}...")
            def _cli_prog(p):
                sys.stderr.write(f"\rProgress: {p.get('progress')}% | Decoded: {p.get('processed_frames')}/{p.get('total_frames')} | FPS: {p.get('fps')} | Tracks: {p.get('tracks_count')}")
                sys.stderr.flush()

            opts = {
                "vehicle_conf": args.conf,
                "plate_conf": args.conf,
                "debug_video": args.debug_video,
                "target_fps": args.target_fps,
            }
            res = pipeline.infer_video("cli-job", args.video, opts, _cli_prog)
            sys.stderr.write("\n")
            print(json.dumps(res, indent=2))
        elif args.image:
            log(f"Running standalone image inference on {args.image}...")
            res = pipeline.infer_image(args.image, conf=args.conf)
            print(json.dumps(res, indent=2))

        pipeline.detector.stop()
        pipeline.ocr.stop()
        return

    # Standard IPC mode on stdin / stdout
    emit({
        "status": "ready",
        "detector_device": pipeline.detector.device,
        "ocr_device": pipeline.ocr.device,
    })

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            msg = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            emit({"event": "error", "error": f"Invalid JSON: {exc}"})
            continue

        request_id = msg.get("request_id", "")
        action = msg.get("action", "")

        try:
            if action == "ping":
                emit({
                    "request_id": request_id,
                    "event": "pong",
                    "detector_device": pipeline.detector.device,
                    "ocr_device": pipeline.ocr.device,
                    "detector_alive": pipeline.detector.ping(),
                    "ocr_alive": pipeline.ocr.ping(),
                })

            elif action == "status":
                emit({
                    "request_id": request_id,
                    "event": "status",
                    "detector_device": pipeline.detector.device,
                    "ocr_device": pipeline.ocr.device,
                    "detector_alive": pipeline.detector.ping(),
                    "ocr_alive": pipeline.ocr.ping(),
                })

            elif action == "infer_image":
                image_path = msg.get("image_path")
                conf = float(msg.get("conf", VEHICLE_CONF))
                if not image_path:
                    emit({"request_id": request_id, "event": "error", "error": "image_path required"})
                    continue
                result = pipeline.infer_image(image_path, conf=conf)
                emit({"request_id": request_id, "event": "completed", **result})

            elif action == "infer_video":
                video_path = msg.get("video_path")
                job_id = msg.get("job_id", request_id)
                if not video_path:
                    emit({"request_id": request_id, "event": "error", "error": "video_path required"})
                    continue

                opts = {
                    "target_fps": int(msg.get("target_fps", TARGET_FPS)),
                    "yolo_conf": float(msg.get("yolo_conf", VEHICLE_CONF)),
                    "vehicle_conf": float(msg.get("vehicle_conf", VEHICLE_CONF)),
                    "plate_conf": float(msg.get("plate_conf", PLATE_CONF)),
                    "iou_threshold": float(msg.get("iou_threshold", IOU_THRESHOLD)),
                    "max_track_age": int(msg.get("max_track_age", MAX_TRACK_AGE)),
                    "ocr_interval": int(msg.get("ocr_interval", OCR_INTERVAL)),
                    "ocr_min_conf": float(msg.get("ocr_min_conf", OCR_MIN_CONF)),
                    "debug_video": bool(msg.get("debug_video", False)),
                }

                def _progress_cb(event_data):
                    emit({"request_id": request_id, **event_data})

                result = pipeline.infer_video(job_id, video_path, opts, _progress_cb)
                emit({"request_id": request_id, "event": "completed", **result})

            elif action == "cancel":
                job_id = msg.get("job_id")
                if job_id:
                    pipeline.cancel_job(job_id)
                emit({"request_id": request_id, "event": "cancelled", "job_id": job_id})

            elif action == "quit":
                break

            else:
                emit({"request_id": request_id, "event": "error", "error": f"Unknown action: {action}"})

        except RuntimeError as exc:
            if str(exc) == "cancelled":
                emit({"request_id": request_id, "event": "cancelled"})
            else:
                log(f"RuntimeError [{action}]: {exc}")
                emit({"request_id": request_id, "event": "error", "error": str(exc)})
        except Exception as exc:
            log(f"Unhandled error [{action}]: {exc}")
            emit({"request_id": request_id, "event": "error", "error": str(exc)})

    pipeline.detector.stop()
    pipeline.ocr.stop()


if __name__ == "__main__":
    main()
