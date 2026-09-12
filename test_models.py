#!/usr/bin/env python3
"""
TrafficEye Local Model Test Script
Tests and verifies local availability and integrity of:
1. Custom YOLO number-plate detector (models/plate_detector.pt)
2. Awiros Indian ANPR OCR model & resources (models/awiros/)
"""

import os
import sys
import json
import struct
import platform
import subprocess
from pathlib import Path

def get_file_size_str(file_path):
    size_bytes = os.path.getsize(file_path)
    if size_bytes >= 1024 * 1024 * 1024:
        human = f"{size_bytes / (1024 ** 3):.2f} GB"
    elif size_bytes >= 1024 * 1024:
        human = f"{size_bytes / (1024 ** 2):.2f} MB"
    elif size_bytes >= 1024:
        human = f"{size_bytes / 1024:.2f} KB"
    else:
        human = f"{size_bytes} bytes"
    return f"{size_bytes:,} bytes ({human})"

def inspect_gpu():
    gpu_name = "None detected"
    cuda_ver = "None"
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            check=False
        )
        if res.returncode == 0 and res.stdout.strip():
            gpu_name = res.stdout.strip().split("\n")[0]
    except Exception:
        pass

    try:
        # Check torch cuda if torch available
        import torch
        if torch.cuda.is_available():
            cuda_ver = f"PyTorch CUDA {torch.version.cuda} (Device: {torch.cuda.get_device_name(0)})"
        else:
            cuda_ver = "Torch installed (CPU only / CUDA not active)"
    except ImportError:
        # Check nvidia-smi CUDA version
        try:
            res = subprocess.run(["nvidia-smi"], capture_output=True, text=True, check=False)
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    if "CUDA Version:" in line or "CUDA UMD Version:" in line:
                        cuda_ver = line.strip()
                        break
                if cuda_ver == "None":
                    cuda_ver = "NVIDIA Driver present (Torch not yet installed)"
        except Exception:
            cuda_ver = "None / Not detected"
    return gpu_name, cuda_ver

def validate_safetensors_file(file_path):
    try:
        # Try importing official safetensors package if available
        try:
            from safetensors import safe_open
            with safe_open(file_path, framework="np") as f:
                keys = list(f.keys())
                metadata = f.metadata() or {}
                return True, f"VALID ({len(keys)} tensors, metadata: {metadata})"
        except ImportError:
            # Native binary parser per safetensors specification
            with open(file_path, "rb") as f:
                header_bytes = f.read(8)
                if len(header_bytes) < 8:
                    return False, "INVALID (File too short / empty header)"
                header_len = struct.unpack("<Q", header_bytes)[0]
                if header_len <= 0 or header_len > 50 * 1024 * 1024:
                    return False, f"INVALID (Abnormal header size: {header_len} bytes)"
                header_data = f.read(header_len)
                header = json.loads(header_data.decode("utf-8"))
                metadata = header.get("__metadata__", {})
                tensors = [k for k in header.keys() if k != "__metadata__"]
                return True, f"VALID ({len(tensors)} tensors, metadata: {metadata})"
    except Exception as e:
        return False, f"INVALID ({type(e).__name__}: {e})"

def main():
    base_dir = Path(__file__).resolve().parent
    models_dir = base_dir / "models"
    yolo_path = models_dir / "plate_detector.pt"
    awiros_dir = models_dir / "awiros"
    safetensors_path = awiros_dir / "model.safetensors"
    dict_path = awiros_dir / "en_dict.txt"
    test_py_path = awiros_dir / "test.py"
    paddleocr_dir = awiros_dir / "PaddleOCR"

    gpu_name, cuda_info = inspect_gpu()

    print("==============================")
    print("TrafficEye Local Model Test")
    print("==============================")
    print("Environment:")
    print(f"OS: {platform.system()} {platform.release()} ({platform.architecture()[0]})")
    print(f"Python: {sys.version.split()[0]} ({sys.executable})")
    print(f"GPU: {gpu_name}")
    print(f"CUDA: {cuda_info}")
    print("------------------------------")

    # 1. UVH-26 Vehicle Detector
    uvh26_path = models_dir / "UVH-26-MV-YOLOv11-S.pt"
    print("IISc AIM UVH-26 Vehicle Detector:")
    print(f"Path: models/UVH-26-MV-YOLOv11-S.pt (Absolute: {uvh26_path})")
    if uvh26_path.is_file():
        print("Exists: YES")
        print(f"Size: {get_file_size_str(uvh26_path)}")
        try:
            from ultralytics import YOLO
            try:
                uvh_model = YOLO(str(uvh26_path))
                print("Load: SUCCESS")
                params = sum(p.numel() for p in uvh_model.model.parameters())
                print(f"Parameters: {params:,}")
                print(f"Classes ({len(uvh_model.names)}): {uvh_model.names}")
            except Exception as e:
                print(f"Load: FAILED ({e})")
        except ImportError:
            print("Load: FAILED (ultralytics not installed)")
    else:
        print("Exists: NO")
        print("Load: FAILED (File not found)")

    print("------------------------------")

    # 2. YOLO Plate Detector
    print("YOLO Plate Detector:")
    print(f"Path: models/plate_detector.pt (Absolute: {yolo_path})")
    if yolo_path.is_file():
        print("Exists: YES")
        print(f"Size: {get_file_size_str(yolo_path)}")
        try:
            from ultralytics import YOLO
            try:
                model = YOLO(str(yolo_path))
                print("Load: SUCCESS")
                print(f"Classes: {model.names}")
            except Exception as e:
                print("Load: FAILED")
                print(f"Error loading model: {e}")
        except ImportError:
            print("Load: FAILED (ultralytics package not installed in environment)")
            print("Classes: N/A (Install ultralytics to inspect classes)")
    else:
        print("Exists: NO")
        print("Size: N/A")
        print("Load: FAILED (File not found)")
        print("Classes: N/A")

    print("------------------------------")

    # 2. Awiros OCR Model
    print("Awiros OCR:")
    print(f"Path: models/awiros/model.safetensors (Absolute: {safetensors_path})")
    if safetensors_path.is_file():
        print("Exists: YES")
        print(f"Size: {get_file_size_str(safetensors_path)}")
        is_valid, msg = validate_safetensors_file(safetensors_path)
        print(f"SafeTensors: {'VALID' if is_valid else 'INVALID'}")
        print(f"SafeTensors Details: {msg}")
    else:
        print("Exists: NO")
        print("Size: N/A")
        print("SafeTensors: INVALID (File not found)")

    print("\nDictionary:")
    print(f"models/awiros/en_dict.txt (Absolute: {dict_path})")
    if dict_path.is_file():
        print("Exists: YES")
        try:
            content = dict_path.read_text(encoding="utf-8")
            entries = [line.strip() for line in content.splitlines() if line.strip()]
            print("Readable: YES")
            print(f"Entries: {len(entries)} characters")
        except Exception as e:
            print("Readable: NO")
            print(f"Error reading dictionary: {e}")
    else:
        print("Exists: NO")
        print("Readable: NO")
        print("Entries: N/A")

    print("\nAwiros test.py:")
    if test_py_path.is_file():
        print("Exists: YES")
        try:
            _ = test_py_path.read_text(encoding="utf-8")
            print("Readable: YES")
        except Exception as e:
            print("Readable: NO")
            print(f"Error reading test.py: {e}")
    else:
        print("Exists: NO")
        print("Readable: NO")

    print("\nPaddleOCR:")
    if paddleocr_dir.is_dir() and (paddleocr_dir / "ppocr" / "__init__.py").is_file():
        print(f"Source: {paddleocr_dir}")
        print("Exists: YES")
        try:
            commit_res = subprocess.run(
                ["git", "-C", str(paddleocr_dir), "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                check=False
            )
            commit = commit_res.stdout.strip() if commit_res.returncode == 0 else "Unknown"
            print(f"Commit: {commit}")
        except Exception:
            pass
    else:
        print(f"Source: {paddleocr_dir}")
        print("Exists: NO")

    print("\nAwiros Model Loading Check:")
    try:
        check_code = (
            "from ai.config import setup_windows_nvidia_dlls; setup_windows_nvidia_dlls(); "
            "from ai.ocr_worker import init_ocr; model, post, dev = init_ocr(); "
            "print(f'Active device: {dev}')"
        )
        res = subprocess.run(
            [sys.executable, "-c", check_code],
            capture_output=True,
            text=True,
            check=False,
            cwd=str(base_dir)
        )
        if res.returncode == 0:
            print("PaddlePaddle: INSTALLED")
            print("Awiros model loading: SUCCESS")
            for line in res.stdout.splitlines():
                if "Active device:" in line:
                    print(f"Device: {line.split('Active device:')[-1].strip()}")
        else:
            print("PaddlePaddle: FAILED TO INITIALIZE")
            err_msg = res.stderr.strip() or res.stdout.strip()
            print(f"Details: {err_msg[:200]}")
    except Exception as e:
        print(f"Awiros model loading: FAILED ({e})")

    print("==============================")

if __name__ == "__main__":
    main()
