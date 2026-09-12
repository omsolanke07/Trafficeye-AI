import os
import sys
from pathlib import Path

# Bound thread pools to prevent Windows memory manager pagefile commit exhaustion
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

# Project root is one directory up from ai/
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Model Paths
MODELS_DIR = PROJECT_ROOT / "models"
UVH26_MODEL_PATH = MODELS_DIR / "UVH-26-MV-YOLOv11-S.pt"
PLATE_MODEL_PATH = MODELS_DIR / "plate_detector.pt"
YOLO_MODEL_PATH = PLATE_MODEL_PATH  # Backward compatibility alias

AWIROS_DIR = MODELS_DIR / "awiros"
AWIROS_WEIGHTS_PATH = AWIROS_DIR / "model.safetensors"
AWIROS_DICT_PATH = AWIROS_DIR / "en_dict.txt"
AWIROS_PADDLEOCR_DIR = AWIROS_DIR / "PaddleOCR"
AWIROS_TEST_PY = AWIROS_DIR / "test.py"

# Data Directories
DATA_DIR = PROJECT_ROOT / "server" / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
UPLOADS_DIR = DATA_DIR / "uploads"

# Ensure directories exist
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Hardware & Video processing configuration
ANPR_DEVICE = os.getenv("ANPR_DEVICE", "0")
VIDEO_PROCESS_FPS = int(os.getenv("VIDEO_PROCESS_FPS", os.getenv("ANPR_TARGET_FPS", "5")))

# UVH-26 14 Classes
UVH26_CLASSES = {
    0: "Hatchback",
    1: "Sedan",
    2: "SUV",
    3: "MUV",
    4: "Bus",
    5: "Truck",
    6: "Three-wheeler",
    7: "Two-wheeler",
    8: "LCV",
    9: "Mini-bus",
    10: "tempo-traveller",
    11: "bicycle",
    12: "Van",
    13: "Others",
}

# Python interpreter from current virtual environment
venv_py = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
PYTHON_EXE = str(venv_py) if venv_py.exists() else sys.executable

# Service configuration
AI_HOST = os.getenv("AI_HOST", "127.0.0.1")
AI_PORT = int(os.getenv("AI_PORT", "8000"))

def setup_windows_nvidia_dlls():
    """Register site-packages/nvidia/*/bin directories for Windows DLL loader."""
    if sys.platform == "win32":
        site_pkg = os.path.join(sys.prefix, "Lib", "site-packages")
        nvidia_dir = os.path.join(site_pkg, "nvidia")
        if os.path.exists(nvidia_dir):
            for sub in os.listdir(nvidia_dir):
                bin_dir = os.path.join(nvidia_dir, sub, "bin")
                if os.path.exists(bin_dir):
                    try:
                        os.add_dll_directory(bin_dir)
                    except Exception:
                        pass
