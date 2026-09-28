TrafficEye AI

City-Wide AI Engine for Multi-Camera ANPR, Vehicle Observation & Urban Traffic Analytics

TrafficEye AI is an AI-powered traffic intelligence platform developed as a Smart India Hackathon (SIH) project and originally developed as a Project Based Learning (PBL) project.

The system transforms traffic-camera footage into structured, searchable and actionable information by combining vehicle detection, number-plate detection, OCR, confidence-aware validation, blacklist matching, event storage, alerts and traffic analytics.

Project status: Prototype / proof-of-concept
Demo input: Recorded traffic footage
Inference: Local GPU-based AI
Production vision: Authorized RTSP/live camera feeds with scalable edge/central infrastructure

Problem Statement

Modern cities generate enormous amounts of traffic-camera data. However, simply having cameras does not automatically provide useful traffic intelligence.

A typical camera system may identify a vehicle or read a number plate, but traffic operators still need to connect observations across cameras, validate recognition results, identify vehicles of interest, and understand larger traffic patterns.

TrafficEye AI addresses this problem through a unified pipeline:

Camera / Video Input
        ↓
Frame Validation & Preprocessing
        ↓
Vehicle Detection
        ↓
Number Plate Detection
        ↓
OCR / Number Plate Recognition
        ↓
Confidence & Plate Validation
        ↓
Duplicate Suppression
        ↓
Blacklist Matching
        ↓
Structured Detection Storage
        ↓
Alerts + Vehicle Observation History + Analytics
        ↓
TrafficEye AI Dashboard

Key Features

Vehicle Detection using an Indian-traffic-oriented YOLO model.

Number Plate Detection for Indian vehicle registration plates.

ANPR / OCR using the Awiros ANPR OCR pipeline with PaddleOCR components.

Confidence-Aware Validation so AI output is not blindly treated as ground truth.

OCR Normalization & Duplicate Suppression to reduce repeated frame-level detections.

Blacklist Matching with alert generation for authorized blacklist entries.

Camera & Traffic Visualization through a React dashboard and map visualization.

Traffic Analytics including detection trends, vehicle observations and traffic-flow analysis.

Reports for structured detection and alert information.

Local GPU Inference using an NVIDIA GPU without requiring cloud inference.

Modular AI Architecture with isolated Python workers for detection and OCR.

System Architecture

                         ┌──────────────────────┐
                         │     Camera Input     │
                         │ RTSP / Video / Webcam│
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Frame Validation &   │
                         │    Preprocessing     │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Node.js Backend    │
                         │       Express        │
                         └──────────┬───────────┘
                                    │
                              HTTP / FastAPI
                                    │
                                    ▼
                 ┌─────────────────────────────────────┐
                 │          Python AI Service          │
                 │              FastAPI                │
                 └─────────────────┬───────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          ┌──────────────────┐          ┌──────────────────┐
          │ Detection Worker │          │    OCR Worker    │
          │ PyTorch/YOLO     │          │ Awiros/PaddleOCR │
          └────────┬─────────┘          └────────┬─────────┘
                   │                             │
                   └──────────────┬──────────────┘
                                  ▼
                         ┌──────────────────────┐
                         │ Structured AI Result │
                         │ Plate + Confidence   │
                         │ Vehicle + Metadata   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Validation & Business│
                         │      Logic           │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               SQLite DB       Blacklist        Analytics
                    │             Match              │
                    │               │                 │
                    └───────────────┼─────────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │    React Dashboard   │
                         │ Cameras / ANPR /     │
                         │ Alerts / Analytics   │
                         └──────────────────────┘

AI Pipeline

1. Vehicle Detection

Traffic frames are processed by the vehicle detection model to identify vehicles and provide bounding boxes/class information.

Traffic Frame
      ↓
Vehicle Detector
      ↓
Vehicle Bounding Boxes
      ↓
Vehicle Regions

2. Number Plate Detection

The plate detector identifies the number-plate region associated with the detected vehicle.

Vehicle Region
      ↓
Plate Detector
      ↓
Plate Bounding Box
      ↓
Plate Crop

3. OCR

The detected plate crop is passed to the OCR pipeline.

Plate Crop
    ↓
Awiros ANPR OCR / PaddleOCR
    ↓
Registration Number
    ↓
OCR Confidence

4. Validation

AI output is not automatically treated as ground truth. The pipeline can apply confidence thresholds, registration-number normalization, Indian plate-format validation, duplicate suppression and review status.

Conceptually:

High Confidence   → Verified
Medium Confidence → Review
Low Confidence    → Low Confidence

Important: model confidence is not the same as real-world OCR accuracy. A defensible accuracy percentage requires a representative labeled ground-truth dataset.

Why FastAPI?

FastAPI acts as the communication layer between the Node.js backend and the Python AI service.

Node.js Backend
      ↓
HTTP Request
      ↓
FastAPI
      ↓
Python AI Workers
      ↓
Inference Result
      ↓
FastAPI
      ↓
Node.js Backend

This keeps the AI environment isolated from the main application and allows the AI service to be independently replaced or scaled.

AI Process Isolation

TrafficEye AI separates the AI workers rather than importing every deep-learning framework into one process.

Python AI Service
│
├── Detection Worker
│   └── PyTorch / Ultralytics
│
└── OCR Worker
    └── PaddlePaddle / PaddleOCR

Benefits include dependency isolation, process stability, independent model loading, GPU resource management, easier debugging and easier future model replacement.

Current Demo Architecture

For the SIH prototype, recorded traffic videos are used as camera sources.

Recorded Traffic Video
        ↓
Frame Extraction
        ↓
Vehicle / Plate Detection
        ↓
OCR
        ↓
Validation
        ↓
Backend
        ↓
SQLite
        ↓
Dashboard / Alerts / Analytics

The camera abstraction is designed so that a future authorized deployment can replace the recorded-video source with an RTSP/live camera stream without redesigning the complete downstream pipeline.

Cross-Camera Intelligence

A major goal of TrafficEye AI is to move beyond isolated ANPR events.

Instead of treating every detection independently, the platform can construct an observation history using signals such as plate identity, timestamp, camera ID, camera location and detection confidence.

CAM-01
  ↓
MH12AB1234
  ↓
CAM-07
  ↓
MH12AB1234
  ↓
CAM-14
  ↓
MH12AB1234

This can be used to build cross-camera vehicle observation/journey histories.

The prototype should not be interpreted as continuous GPS tracking. It reconstructs observations from available camera detections. Full production-grade multi-camera re-identification can be added as a future module.

Technology Stack

Frontend

React

JavaScript

Leaflet

OpenStreetMap

Backend

Node.js

Express.js

REST APIs

AI / Computer Vision

Python

FastAPI

PyTorch

Ultralytics YOLO

PaddlePaddle

PaddleOCR

OpenCV

Database

SQLite for the current prototype

Hardware

NVIDIA GPU

CUDA-enabled local inference

Real-Scale Deployment Vision

The current prototype runs local inference, but the architecture can be extended for city-scale deployment.

Hybrid Edge + Central Architecture

Camera Network
      │
      ├──────────────┐
      ▼              ▼
   Edge AI        Edge AI
   Zone A         Zone B
      │              │
      └──────┬───────┘
             ▼
      Central Platform
             │
      ┌──────┼────────┐
      ▼      ▼        ▼
    ANPR   Alerts  Analytics
      │      │        │
      └──────┼────────┘
             ▼
        Command Center

At production scale, edge nodes can perform video inference, structured events can be sent to a central platform, central services can perform cross-camera correlation, production databases can replace SQLite, AI workers can be horizontally scaled across GPU infrastructure, and authorized RTSP/live camera feeds can replace recorded files.

Project Structure

TrafficEye-AI/
│
├── ai/
│   ├── config.py
│   ├── detector.py
│   ├── detector_worker.py
│   ├── ocr.py
│   ├── ocr_worker.py
│   ├── inference.py
│   └── requirements.txt
│
├── server/
│   ├── routes/
│   │   ├── ai.js
│   │   ├── kpis.js
│   │   ├── analytics.js
│   │   └── trajectory.js
│   │
│   ├── services/
│   │   └── aiService.js
│   │
│   └── index.js
│
├── src/
│   └── screens/
│       ├── Dashboard.jsx
│       ├── LiveFeed.jsx
│       ├── CameraNetworkMap.jsx
│       ├── TrajectorySearch.jsx
│       └── TrafficAnalytics.jsx
│
├── models/
│   ├── plate_detector.pt
│   └── awiros/
│       ├── model.safetensors
│       └── en_dict.txt
│
└── README.md

Local AI Environment

The prototype was developed and tested with:

OS: Windows 11
Python: 3.11.9
GPU: NVIDIA GeForce RTX 4050 Laptop GPU
PyTorch: 2.11.0+cu128
Ultralytics: 8.4.145
PaddlePaddle: 3.3.0
CUDA-enabled inference

Exact performance depends on video resolution, model configuration, input conditions and hardware.

Example AI Output

A processed observation can conceptually contain:

Plate:
MH12AB1234

Detection Confidence:
0.90+

OCR Confidence:
0.97+

Camera:
CAM-01

Timestamp:
YYYY-MM-DD HH:MM:SS

Validation:
Valid

Blacklist:
No Match

The actual values depend on the input footage and inference result.

Reliability & Limitations

TrafficEye AI is a prototype and should not be interpreted as a production-ready city-wide surveillance system.

Real-world performance can be affected by motion blur, low-light conditions, rain, glare, occluded plates, small/distant vehicles, non-standard plates, camera angle, compression artifacts, OCR errors and network availability.

A production deployment would require representative Indian traffic datasets, ground-truth evaluation, extensive night/weather testing, security hardening, role-based access control, data retention policies, authorized camera access, production-grade distributed storage, scalable GPU infrastructure, and operational monitoring/logging.

Privacy & Responsible Deployment

TrafficEye AI is intended as a decision-support and traffic-management platform.

A real deployment should operate only with appropriate authorization and follow applicable privacy, security and data-governance requirements.

Recommended production controls include role-based access, secure API communication, controlled blacklist management, audit logs, data retention policies, restricted access to ANPR information and human verification for sensitive alerts.

Future Scope

Multi-camera vehicle re-identification

More robust cross-camera journey reconstruction

Real-time RTSP camera ingestion

Edge GPU deployment

Distributed GPU inference

Production PostgreSQL/database architecture

Advanced traffic congestion estimation

Vehicle speed estimation

Road-segment travel-time estimation

Improved night/rain robustness

Model benchmarking on labeled Indian traffic datasets

Role-based authentication and audit trails

Scalable event-stream processing

Project Goals

TrafficEye AI aims to demonstrate how raw traffic-camera footage can be converted into:

Video
 ↓
Computer Vision
 ↓
ANPR
 ↓
Validated Events
 ↓
Vehicle Observation History
 ↓
Alerts
 ↓
Traffic Intelligence

Detecting a vehicle is only the first step. The real value comes from connecting observations and turning them into actionable traffic intelligence.

References

Ultralytics YOLO — https://docs.ultralytics.com/

PaddleOCR — https://github.com/PaddlePaddle/PaddleOCR

OpenCV — https://opencv.org/

FastAPI — https://fastapi.tiangolo.com/

PyTorch — https://pytorch.org/

React — https://react.dev/

Node.js — https://nodejs.org/

Leaflet — https://leafletjs.com/

OpenStreetMap — https://www.openstreetmap.org/

Disclaimer

TrafficEye AI is an academic/prototype project developed for Project Based Learning and Smart India Hackathon purposes.

The demonstration uses recorded traffic footage and locally generated AI detections. It does not claim access to government traffic-camera infrastructure or production traffic databases.

Any real-world deployment would require appropriate authorization, infrastructure, security controls, privacy safeguards and validation against representative operational data.

Team

TrafficEye AI — Smart India Hackathon / PBL Project

Built with:

React · Node.js · Python · FastAPI · PyTorch · YOLO · PaddleOCR · OpenCV · SQLite · Leaflet · OpenStreetMap
