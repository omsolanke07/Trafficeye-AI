"""
Backward-compatibility proxy for YOLO Worker.
Delegates directly to ai/yolo_worker.py.
"""
from ai.yolo_worker import run_worker

if __name__ == "__main__":
    run_worker()
