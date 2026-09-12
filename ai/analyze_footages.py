import sys
import os
import cv2
import time
import json
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ai.detector import YOLODetector
from ai.ocr import AwirosOCR
from ai.config import SNAPSHOTS_DIR

VIDEOS = [
    {
        "camera_id": "CAM-GATE-01",
        "name": "PVG's College Entrance Node",
        "file": "public/videos/pvg_college.mp4",
        "time_str": "18:02:00",
        "base_seconds": 18 * 3600 + 2 * 60
    },
    {
        "camera_id": "CAM 01",
        "name": "Shiv Darshan Chowk",
        "file": "public/videos/shiv_darshan_chowk.mp4",
        "time_str": "18:18:00",
        "base_seconds": 18 * 3600 + 18 * 60
    },
    {
        "camera_id": "CAM 03",
        "name": "Gajanan Maharaj Temple",
        "file": "public/videos/gajanan_maharaj_temple.mp4",
        "time_str": "18:32:00",
        "base_seconds": 18 * 3600 + 32 * 60
    },
    {
        "camera_id": "CAM 04",
        "name": "Aranyeshwar Circle",
        "file": "public/videos/aranyeshwar_circle.mp4",
        "time_str": "18:44:00",
        "base_seconds": 18 * 3600 + 44 * 60
    },
    {
        "camera_id": "CAM 05",
        "name": "Taware Colony",
        "file": "public/videos/taware_colony.mp4",
        "time_str": "18:58:00",
        "base_seconds": 18 * 3600 + 58 * 60
    }
]

def format_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

def main():
    print("=" * 60)
    print("Initializing YOLO and OCR workers...")
    detector = YOLODetector()
    detector.start()
    ocr = AwirosOCR()
    ocr.start()
    print("Workers ready.")

    temp_frame_path = PROJECT_ROOT / "temp_frame.jpg"
    temp_crop_path = PROJECT_ROOT / "temp_crop.jpg"

    results_by_cam = {}

    for item in VIDEOS:
        vid_path = PROJECT_ROOT / item["file"]
        cam_id = item["camera_id"]
        cam_name = item["name"]
        print(f"\n--- Processing {cam_name} ({cam_id}): {vid_path.name} ---")

        cap = cv2.VideoCapture(str(vid_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps
        print(f"FPS: {fps:.1f}, Frames: {total_frames}, Duration: {duration:.1f}s")

        frame_step = max(1, int(fps // 2))
        frame_idx = 0

        detected_vehicles = []
        detected_plates = {}

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_step == 0:
                cv2.imwrite(str(temp_frame_path), frame)
                timestamp_sec = item["base_seconds"] + (frame_idx / fps)
                timestamp_str = format_time(timestamp_sec)

                det_res = detector.detect_all(image_path=str(temp_frame_path), vehicle_conf=0.25, plate_conf=0.25)

                vehicles = det_res.get("vehicles", [])
                plates = det_res.get("plates", [])

                for v in vehicles:
                    detected_vehicles.append({
                        "class": v.get("class_name", "Vehicle"),
                        "conf": v.get("confidence", 0.0),
                        "frame": frame_idx,
                        "time": timestamp_str
                    })

                h, w = frame.shape[:2]
                for p in plates:
                    bbox = p.get("bbox") or []
                    if len(bbox) == 4:
                        x1, y1, x2, y2 = [int(coord) for coord in bbox]
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)
                        if x2 > x1 + 10 and y2 > y1 + 5:
                            crop = frame[y1:y2, x1:x2]
                            cv2.imwrite(str(temp_crop_path), crop)
                            ocr_res = ocr.recognize(crop_path=str(temp_crop_path))
                            plate_text = ocr_res.get("text", "").strip().replace(" ", "").upper()
                            conf = ocr_res.get("confidence", 0.0)

                            if len(plate_text) >= 4:
                                if plate_text not in detected_plates:
                                    detected_plates[plate_text] = {
                                        "count": 0,
                                        "max_conf": 0.0,
                                        "raw_text": ocr_res.get("text", ""),
                                        "first_time": timestamp_str,
                                        "frame": frame_idx,
                                        "bbox": [x1, y1, x2, y2]
                                    }
                                detected_plates[plate_text]["count"] += 1
                                if conf > detected_plates[plate_text]["max_conf"]:
                                    detected_plates[plate_text]["max_conf"] = conf

            frame_idx += 1

        cap.release()

        results_by_cam[cam_id] = {
            "name": cam_name,
            "total_vehicles": len(detected_vehicles),
            "vehicle_classes": {},
            "plates": detected_plates
        }

        for v in detected_vehicles:
            cls = v["class"]
            results_by_cam[cam_id]["vehicle_classes"][cls] = results_by_cam[cam_id]["vehicle_classes"].get(cls, 0) + 1

        print(f"Vehicles: {len(detected_vehicles)} | Unique plate texts: {len(detected_plates)}")

    detector.stop()
    ocr.stop()

    print("\n" + "=" * 60)
    print("CROSS-CAMERA PLATE ANALYSIS")
    print("=" * 60)

    all_plates = set()
    for cam_id, data in results_by_cam.items():
        all_plates.update(data["plates"].keys())

    plate_occurrences = {}
    for p in all_plates:
        cams = [cam_id for cam_id, data in results_by_cam.items() if p in data["plates"]]
        plate_occurrences[p] = cams

    sorted_occurrences = sorted(plate_occurrences.items(), key=lambda x: len(x[1]), reverse=True)
    for p, cams in sorted_occurrences[:15]:
        print(f"Plate: {p} in {len(cams)} cameras: {cams}")

    with open(str(PROJECT_ROOT / "footage_analysis_summary.json"), "w") as f:
        json.dump(results_by_cam, f, indent=2)

if __name__ == "__main__":
    main()
