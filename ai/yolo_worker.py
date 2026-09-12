"""
Standalone persistent YOLO Worker (Vehicles + Plates).
Isolated process: imports torch & ultralytics exclusively.
Must NOT import paddle.
"""

import sys
import os
import json
import base64
from pathlib import Path

# Bound thread pools to prevent Windows memory manager commit exhaustion
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ai.config import UVH26_MODEL_PATH, PLATE_MODEL_PATH, ANPR_DEVICE, setup_windows_nvidia_dlls

setup_windows_nvidia_dlls()


def init_yolo_models():
    import torch
    from ultralytics import YOLO

    device = "cpu"
    target_device = ANPR_DEVICE.strip()
    if target_device.isdigit():
        target_device = int(target_device)

    if torch.cuda.is_available():
        try:
            # Verify CUDA compute capability with a quick tensor op
            _ = torch.zeros(1, device=target_device if isinstance(target_device, int) else "cuda:0")
            device = target_device if isinstance(target_device, int) else "cuda:0"
        except Exception:
            device = "cpu"

    # Load UVH-26 Vehicle Detection Model
    if not UVH26_MODEL_PATH.exists():
        raise FileNotFoundError(f"UVH-26 model not found: {UVH26_MODEL_PATH}")
    vehicle_model = YOLO(str(UVH26_MODEL_PATH))
    try:
        vehicle_model.to(device)
    except Exception:
        device = "cpu"
        vehicle_model.to("cpu")

    # Load Plate Detection Model
    if not PLATE_MODEL_PATH.exists():
        raise FileNotFoundError(f"Plate detector model not found: {PLATE_MODEL_PATH}")
    plate_model = YOLO(str(PLATE_MODEL_PATH))
    try:
        plate_model.to(device)
    except Exception:
        plate_model.to("cpu")

    return vehicle_model, plate_model, device


def compute_box_center(bbox):
    return [round((bbox[0] + bbox[2]) / 2.0, 2), round((bbox[1] + bbox[3]) / 2.0, 2)]


def is_plate_in_vehicle(plate_bbox, vehicle_bbox, tolerance=10):
    # Center of plate inside vehicle box (with tolerance)
    px, py = (plate_bbox[0] + plate_bbox[2]) / 2.0, (plate_bbox[1] + plate_bbox[3]) / 2.0
    vx1, vy1, vx2, vy2 = vehicle_bbox
    return (vx1 - tolerance) <= px <= (vx2 + tolerance) and (vy1 - tolerance) <= py <= (vy2 + tolerance)


def run_worker():
    try:
        vehicle_model, plate_model, device = init_yolo_models()
        ready_payload = {
            "status": "ready",
            "device": str(device),
            "uvh26_model": str(UVH26_MODEL_PATH),
            "plate_model": str(PLATE_MODEL_PATH),
            "uvh26_classes": vehicle_model.names,
            "plate_classes": plate_model.names,
        }
        sys.stdout.write(json.dumps(ready_payload) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"status": "error", "error": str(e)}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    import cv2
    import numpy as np

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

        action = req.get("action", "detect_all")
        if action == "ping":
            sys.stdout.write(json.dumps({"success": True, "status": "pong", "device": str(device)}) + "\n")
            sys.stdout.flush()
            continue
        elif action == "quit":
            break

        # Decode image
        image_input = None
        if "image_path" in req and req["image_path"]:
            image_input = req["image_path"]
        elif "image_base64" in req and req["image_base64"]:
            img_bytes = base64.b64decode(req["image_base64"])
            nparr = np.frombuffer(img_bytes, np.uint8)
            image_input = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image_input is None:
            sys.stdout.write(json.dumps({"success": False, "error": "No image_path or image_base64 provided"}) + "\n")
            sys.stdout.flush()
            continue

        vehicle_conf = float(req.get("vehicle_conf", req.get("conf", 0.25)))
        plate_conf = float(req.get("plate_conf", req.get("conf", 0.25)))

        try:
            # 1. Action: detect_vehicles only
            if action == "detect_vehicles":
                v_results = vehicle_model.predict(image_input, conf=vehicle_conf, device=device, verbose=False)
                vehicles = []
                for b in v_results[0].boxes:
                    xyxy = [round(float(c), 2) for c in b.xyxy[0].cpu().numpy().tolist()]
                    conf_val = round(float(b.conf[0]), 4)
                    cls_id = int(b.cls[0])
                    cls_name = vehicle_model.names.get(cls_id, f"Class_{cls_id}")
                    vehicles.append({
                        "bbox": xyxy,
                        "confidence": conf_val,
                        "class_id": cls_id,
                        "class": cls_name,
                        "center": compute_box_center(xyxy),
                    })
                sys.stdout.write(json.dumps({"success": True, "vehicles": vehicles, "device": str(device)}) + "\n")
                sys.stdout.flush()
                continue

            # 2. Action: detect_plates only (backward compatibility for legacy detector_worker)
            elif action in ("detect_plates", "detect"):
                p_results = plate_model.predict(image_input, conf=plate_conf, device=device, verbose=False)
                plates = []
                for b in p_results[0].boxes:
                    xyxy = [round(float(c), 2) for c in b.xyxy[0].cpu().numpy().tolist()]
                    conf_val = round(float(b.conf[0]), 4)
                    cls_id = int(b.cls[0])
                    cls_name = plate_model.names.get(cls_id, "license_plate")
                    plates.append({
                        "bbox": xyxy,
                        "confidence": conf_val,
                        "class": cls_name,
                        "center": compute_box_center(xyxy),
                    })
                # For backward compatibility with tests expecting "detections"
                sys.stdout.write(json.dumps({"success": True, "plates": plates, "detections": plates, "device": str(device)}) + "\n")
                sys.stdout.flush()
                continue

            # 3. Action: detect_all (Vehicles + Plates + Association)
            elif action == "detect_all":
                # Detect vehicles
                v_results = vehicle_model.predict(image_input, conf=vehicle_conf, device=device, verbose=False)
                vehicles = []
                for b in v_results[0].boxes:
                    xyxy = [round(float(c), 2) for c in b.xyxy[0].cpu().numpy().tolist()]
                    conf_val = round(float(b.conf[0]), 4)
                    cls_id = int(b.cls[0])
                    cls_name = vehicle_model.names.get(cls_id, f"Class_{cls_id}")
                    vehicles.append({
                        "bbox": xyxy,
                        "confidence": conf_val,
                        "class_id": cls_id,
                        "class": cls_name,
                        "center": compute_box_center(xyxy),
                        "plate": None,
                    })

                # Detect license plates
                p_results = plate_model.predict(image_input, conf=plate_conf, device=device, verbose=False)
                plates = []
                for b in p_results[0].boxes:
                    xyxy = [round(float(c), 2) for c in b.xyxy[0].cpu().numpy().tolist()]
                    conf_val = round(float(b.conf[0]), 4)
                    cls_id = int(b.cls[0])
                    cls_name = plate_model.names.get(cls_id, "license_plate")
                    plates.append({
                        "bbox": xyxy,
                        "confidence": conf_val,
                        "class": cls_name,
                        "center": compute_box_center(xyxy),
                    })

                # Associate plates with vehicles
                matched_plates = set()
                for v in vehicles:
                    best_p = None
                    best_p_idx = -1
                    for p_idx, p in enumerate(plates):
                        if p_idx in matched_plates:
                            continue
                        if is_plate_in_vehicle(p["bbox"], v["bbox"]):
                            best_p = p
                            best_p_idx = p_idx
                            break
                    if best_p:
                        v["plate"] = best_p
                        matched_plates.add(best_p_idx)

                # Plates not inside any detected vehicle (e.g. tight crop or unclassified vehicle)
                unmatched_plates = [p for i, p in enumerate(plates) if i not in matched_plates]

                resp = {
                    "success": True,
                    "vehicles": vehicles,
                    "plates": plates,
                    "unmatched_plates": unmatched_plates,
                    "detections": plates,  # backward compatibility alias
                    "device": str(device),
                }
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
                continue

            else:
                sys.stdout.write(json.dumps({"success": False, "error": f"Unknown action: {action}"}) + "\n")
                sys.stdout.flush()

        except Exception as e:
            sys.stdout.write(json.dumps({"success": False, "error": str(e)}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    run_worker()
