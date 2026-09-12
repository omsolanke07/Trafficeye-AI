"""
Client wrapper for the persistent YOLO Worker process (UVH-26 + Plate Detector).
Communicates with ai/yolo_worker.py via JSON IPC over stdin/stdout.
Auto-recovers and restarts if the worker crashes.
"""

import sys
import os
import json
import subprocess
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ai.config import PYTHON_EXE, PROJECT_ROOT


class YOLODetector:
    def __init__(self):
        self.process = None
        self.device = "unknown"
        self.uvh26_classes = {}
        self.plate_classes = {}
        self.classes = {}  # backward-compatibility alias
        self._worker_script = PROJECT_ROOT / "ai" / "yolo_worker.py"

    def start(self):
        if self.process is not None and self.process.poll() is None:
            return

        self.process = subprocess.Popen(
            [PYTHON_EXE, str(self._worker_script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=str(PROJECT_ROOT),
        )

        # Read ready payload
        while True:
            line = self.process.stdout.readline()
            if not line:
                err = self.process.stderr.read() if self.process.stderr else "Unknown error"
                raise RuntimeError(f"Failed to start YOLO worker: {err}")
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    data = json.loads(line)
                    if data.get("status") == "ready":
                        self.device = data.get("device", "unknown")
                        self.uvh26_classes = data.get("uvh26_classes", {})
                        self.plate_classes = data.get("plate_classes", {})
                        self.classes = self.plate_classes
                        break
                    elif data.get("status") == "error":
                        raise RuntimeError(f"YOLO worker error: {data.get('error')}")
                except json.JSONDecodeError:
                    continue

    def _ensure_alive(self):
        if self.process is None or self.process.poll() is not None:
            self.start()

    def _send_cmd(self, req):
        max_retries = 2
        for attempt in range(max_retries):
            self._ensure_alive()
            try:
                self.process.stdin.write(json.dumps(req) + "\n")
                self.process.stdin.flush()

                while True:
                    line = self.process.stdout.readline()
                    if not line:
                        raise RuntimeError("YOLO worker pipe closed unexpectedly")
                    line = line.strip()
                    if line.startswith("{") and line.endswith("}"):
                        try:
                            data = json.loads(line)
                            if "success" in data or "status" in data:
                                return data
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                self.stop()
                if attempt == max_retries - 1:
                    raise e

    def detect_vehicles(self, image_path=None, image_base64=None, conf=0.25):
        req = {"action": "detect_vehicles", "vehicle_conf": conf}
        if image_path:
            req["image_path"] = str(image_path)
        elif image_base64:
            req["image_base64"] = image_base64
        else:
            raise ValueError("Either image_path or image_base64 must be provided")
        return self._send_cmd(req)

    def detect_plates(self, image_path=None, image_base64=None, conf=0.25):
        req = {"action": "detect_plates", "plate_conf": conf}
        if image_path:
            req["image_path"] = str(image_path)
        elif image_base64:
            req["image_base64"] = image_base64
        else:
            raise ValueError("Either image_path or image_base64 must be provided")
        return self._send_cmd(req)

    def detect_all(self, image_path=None, image_base64=None, vehicle_conf=0.25, plate_conf=0.25):
        req = {
            "action": "detect_all",
            "vehicle_conf": vehicle_conf,
            "plate_conf": plate_conf,
        }
        if image_path:
            req["image_path"] = str(image_path)
        elif image_base64:
            req["image_base64"] = image_base64
        else:
            raise ValueError("Either image_path or image_base64 must be provided")
        return self._send_cmd(req)

    def detect(self, image_path=None, image_base64=None, conf=0.25):
        """Backward compatibility method for legacy callers."""
        req = {"action": "detect", "conf": conf}
        if image_path:
            req["image_path"] = str(image_path)
        elif image_base64:
            req["image_base64"] = image_base64
        else:
            raise ValueError("Either image_path or image_base64 must be provided")
        return self._send_cmd(req)

    def ping(self, auto_restart=False):
        if self.process is None or self.process.poll() is not None:
            if auto_restart:
                self.start()
            else:
                return False
        try:
            resp = self._send_cmd({"action": "ping"})
            return resp.get("status") == "pong" or resp.get("success") is True
        except Exception:
            return False

    def restart(self):
        self.stop()
        self.start()

    def stop(self):
        if self.process is not None:
            try:
                if self.process.poll() is None:
                    self.process.stdin.write(json.dumps({"action": "quit"}) + "\n")
                    self.process.stdin.flush()
                    self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            finally:
                self.process = None

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()


# Backward compatibility alias
PlateDetector = YOLODetector
