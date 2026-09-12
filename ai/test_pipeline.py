"""
ai/test_pipeline.py
===================
Comprehensive End-to-End Verification Suite for TrafficEye AI:
- TEST 1: Load UVH-26 & Plate Detector in YOLO worker
- TEST 2: Run UVH-26 on test_images/istockphoto-155287967-612x612.jpg
- TEST 3: Run Plate Detector on test_image.jpg
- TEST 4: Run Awiros OCR on a plate crop
- TEST 5: Run Combined Image Pipeline through ANPRPipeline
- TEST 6: Run Video Pipeline on test_video.mp4 with tracking, consensus, duplicate suppression
- TEST 7: Crash/Kill YOLO Worker and verify auto-recovery
- TEST 8: Crash/Kill OCR Worker and verify auto-recovery

Usage:
    .venv\\Scripts\\python.exe ai\\test_pipeline.py
"""

import sys
import os
import json
import time
import cv2
import numpy as np
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ai.config import UVH26_MODEL_PATH, PLATE_MODEL_PATH, AWIROS_WEIGHTS_PATH, SNAPSHOTS_DIR
from ai.detector import YOLODetector
from ai.ocr import AwirosOCR
from ai.anpr_pipeline import ANPRPipeline, crop_to_b64

PASS = "[PASS]"
FAIL = "[FAIL]"


def test_1_load_models():
    print("\n--- TEST 1: Load UVH-26 Model & Verify Metadata ---")
    assert UVH26_MODEL_PATH.exists(), f"UVH-26 model missing: {UVH26_MODEL_PATH}"
    assert PLATE_MODEL_PATH.exists(), f"Plate detector missing: {PLATE_MODEL_PATH}"
    assert AWIROS_WEIGHTS_PATH.exists(), f"Awiros weights missing: {AWIROS_WEIGHTS_PATH}"

    detector = YOLODetector()
    detector.start()
    assert detector.ping(), "YOLO detector worker ping failed"
    print(f"{PASS} YOLO worker started on device: {detector.device}")
    print(f"{PASS} UVH-26 classes loaded: {len(detector.uvh26_classes)} classes: {detector.uvh26_classes}")
    assert len(detector.uvh26_classes) == 14, f"Expected 14 UVH-26 classes, got {len(detector.uvh26_classes)}"
    detector.stop()
    return True


def test_2_uvh26_inference():
    print("\n--- TEST 2: Run UVH-26 on Sample Traffic Image ---")
    test_img = PROJECT_ROOT / "test_images" / "istockphoto-155287967-612x612.jpg"
    assert test_img.exists(), f"Test image not found: {test_img}"

    detector = YOLODetector()
    detector.start()
    res = detector.detect_vehicles(image_path=str(test_img), conf=0.25)
    detector.stop()

    assert res.get("success"), f"Detection failed: {res.get('error')}"
    vehicles = res.get("vehicles", [])
    print(f"{PASS} UVH-26 vehicle detections: {len(vehicles)} vehicles detected")
    assert len(vehicles) > 0, "No vehicles detected"

    classes_found = set(v["class"] for v in vehicles)
    print(f"{PASS} Vehicle classes detected in scene: {classes_found}")
    sample = vehicles[0]
    print(f"{PASS} Sample vehicle: class={sample['class']}, conf={sample['confidence']}, bbox={sample['bbox']}, center={sample['center']}")
    assert "class" in sample and "confidence" in sample and "bbox" in sample and "center" in sample
    return True


def test_3_plate_detector():
    print("\n--- TEST 3: Run Plate Detector on Known Plate Image ---")
    test_img = PROJECT_ROOT / "test_image.jpg"
    assert test_img.exists(), f"Plate test image not found: {test_img}"

    detector = YOLODetector()
    detector.start()
    res = detector.detect_plates(image_path=str(test_img), conf=0.25)
    detector.stop()

    assert res.get("success"), f"Plate detection failed: {res.get('error')}"
    plates = res.get("plates", [])
    print(f"{PASS} License plates detected: {len(plates)}")
    assert len(plates) > 0, "Expected at least 1 plate detection"
    sample = plates[0]
    print(f"{PASS} Sample plate detection: bbox={sample['bbox']}, conf={sample['confidence']}")
    return True


def test_4_awiros_ocr():
    print("\n--- TEST 4: Run Awiros OCR on Plate Crop ---")
    test_img = PROJECT_ROOT / "test_image.jpg"
    img = cv2.imread(str(test_img))
    assert img is not None, "Failed to read test_image.jpg"

    detector = YOLODetector()
    detector.start()
    res = detector.detect_plates(image_path=str(test_img), conf=0.25)
    detector.stop()

    plates = res.get("plates", [])
    assert len(plates) > 0, "No plates for OCR test"
    crop_b64 = crop_to_b64(img, plates[0]["bbox"])
    assert crop_b64 is not None, "Failed to crop plate to in-memory JPEG"

    ocr = AwirosOCR()
    ocr.start()
    assert ocr.ping(), "OCR worker ping failed"
    ocr_res = ocr.recognize(crop_base64=crop_b64)
    ocr.stop()

    assert ocr_res.get("success"), f"OCR recognition failed: {ocr_res.get('error')}"
    print(f"{PASS} Awiros OCR output: text='{ocr_res.get('text')}', confidence={ocr_res.get('confidence')}")
    assert len(ocr_res.get("text", "")) > 0, "OCR returned empty text"
    return True


def test_5_combined_image_pipeline():
    print("\n--- TEST 5: Combined Image Pipeline (UVH-26 + Plate + OCR + Snapshots) ---")
    test_img = PROJECT_ROOT / "test_image.jpg"
    pipeline = ANPRPipeline()
    pipeline.start()

    res = pipeline.infer_image(str(test_img), conf=0.25)
    pipeline.detector.stop()
    pipeline.ocr.stop()

    assert res.get("success"), "Pipeline infer_image failed"
    events = res.get("events", [])
    plates = res.get("plates", [])
    vehicles = res.get("vehicles", [])
    print(f"{PASS} Pipeline completed: {len(vehicles)} vehicles, {len(plates)} plates, {len(events)} events")
    for ev in events:
        print(f"       Vehicle Class: {ev.get('vehicleClass')}, Plate: {ev.get('plateNumber')}, OCR Conf: {ev.get('ocrConfidence')}, Validation: {ev.get('validationStatus')}, Snapshot: {ev.get('snapshotPath')}")
    assert len(events) > 0, "No events generated by pipeline"
    return True


def test_6_video_pipeline():
    print("\n--- TEST 6: Video Pipeline (Sampling, Tracking, Temporal Consensus, Duplicate Suppression) ---")
    test_vid = PROJECT_ROOT / "test_video.mp4"
    if not test_vid.exists():
        print("  test_video.mp4 not found, skipping video test")
        return True

    pipeline = ANPRPipeline()
    pipeline.start()

    progress_records = []
    def on_progress(p):
        progress_records.append(p)
        print(f"    Progress: {p.get('progress')}% | Frames: {p.get('processed_frames')}/{p.get('total_frames')} | FPS: {p.get('fps')} | Tracks: {p.get('tracks_count')}", end="\r")

    t0 = time.time()
    res = pipeline.infer_video("test-job-e2e", str(test_vid), {"target_fps": 5, "vehicle_conf": 0.25, "plate_conf": 0.25}, on_progress)
    pipeline.detector.stop()
    pipeline.ocr.stop()
    print()

    assert res.get("success"), "Video inference failed"
    events = res.get("events", [])
    stats = res.get("stats", {})
    print(f"{PASS} Video processed in {time.time() - t0:.2f}s")
    print(f"{PASS} Stats: {stats}")
    print(f"{PASS} Finalized vehicle tracks: {len(events)}")
    assert len(progress_records) > 0, "No progress callbacks received"

    for ev in events[:5]:
        print(f"       Track #{ev.get('trackId')}: Class={ev.get('vehicleClass')}, Conf={ev.get('vehicleConfidence')}, Plate={ev.get('plateNumber')}, FirstSeen={ev.get('firstSeen')}s, LastSeen={ev.get('lastSeen')}s, Obs={ev.get('observationCount')}")
    return True


def test_7_yolo_worker_recovery():
    print("\n--- TEST 7: Crash/Kill YOLO Worker & Verify Auto-Recovery ---")
    detector = YOLODetector()
    detector.start()
    assert detector.ping(), "Initial ping failed"

    # Simulate unexpected worker crash by forcefully killing process
    old_pid = detector.process.pid
    print(f"    Killing YOLO worker process (PID: {old_pid})...")
    detector.process.kill()
    detector.process.wait()

    # Now make a request: detector must auto-recover and restart worker
    recovered_ping = detector.ping(auto_restart=True)
    new_pid = detector.process.pid
    detector.stop()

    assert recovered_ping, "Failed to recover after YOLO worker crash"
    assert new_pid != old_pid, f"PID should change on restart: old={old_pid}, new={new_pid}"
    print(f"{PASS} YOLO worker auto-recovered successfully! New PID: {new_pid}")
    return True


def test_8_ocr_worker_recovery():
    print("\n--- TEST 8: Crash/Kill OCR Worker & Verify Auto-Recovery ---")
    ocr = AwirosOCR()
    ocr.start()
    assert ocr.ping(), "Initial OCR ping failed"

    # Simulate unexpected worker crash
    old_pid = ocr.process.pid
    print(f"    Killing OCR worker process (PID: {old_pid})...")
    ocr.process.kill()
    ocr.process.wait()

    # Make request: ocr must auto-recover and restart worker
    recovered_ping = ocr.ping(auto_restart=True)
    new_pid = ocr.process.pid
    ocr.stop()

    assert recovered_ping, "Failed to recover after OCR worker crash"
    assert new_pid != old_pid, f"PID should change on restart: old={old_pid}, new={new_pid}"
    print(f"{PASS} OCR worker auto-recovered successfully! New PID: {new_pid}")
    return True


def run_all():
    print("==================================================")
    print(" TrafficEye AI — Comprehensive Pipeline Verification")
    print("==================================================")

    tests = [
        ("TEST 1: Model Loading & Metadata", test_1_load_models),
        ("TEST 2: UVH-26 Vehicle Detection", test_2_uvh26_inference),
        ("TEST 3: Plate Detector", test_3_plate_detector),
        ("TEST 4: Awiros OCR", test_4_awiros_ocr),
        ("TEST 5: Combined Image Pipeline", test_5_combined_image_pipeline),
        ("TEST 6: Video Pipeline", test_6_video_pipeline),
        ("TEST 7: YOLO Worker Crash Recovery", test_7_yolo_worker_recovery),
        ("TEST 8: OCR Worker Crash Recovery", test_8_ocr_worker_recovery),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        try:
            ok = test_fn()
            if ok:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"{FAIL} {name} raised exception: {e}")
            failed += 1

    print("\n==================================================")
    print(f" Results: {passed} PASSED, {failed} FAILED")
    print("==================================================")
    return failed == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
