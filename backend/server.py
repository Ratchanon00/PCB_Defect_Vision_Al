import os
import glob
import time
import shutil
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.model_manager import (
    WORKSPACE_DIR,
    get_available_models,
    get_best_model_path,
    run_detection,
    get_sample_images
)

app = FastAPI(
    title="PCB Defect Detection API",
    description="Vision AI Dashboard for Automated PCB Defect Inspection",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.join(WORKSPACE_DIR, "frontend")

TRAINING_STATE = {
    "is_training": False,
    "progress": 0,
    "epoch": 0,
    "total_epochs": 0,
    "current_map": 0.0,
    "message": "Idle"
}

@app.get("/api/status")
def get_system_status():
    import torch
    cuda_avail = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_avail else "CPU Only"
    best_m = get_best_model_path()

    return {
        "status": "online",
        "cuda_available": cuda_avail,
        "device": device_name,
        "active_model": os.path.basename(best_m),
        "active_model_path": best_m,
        "training_active": TRAINING_STATE["is_training"]
    }

@app.get("/api/models")
def list_models():
    return {
        "models": get_available_models(),
        "active_model": get_best_model_path()
    }

@app.get("/api/samples")
def list_samples():
    return {
        "samples": get_sample_images(limit=24)
    }

@app.get("/api/sample-image/{filename}")
def get_sample_image(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    for sub in ["valid", "train"]:
        img_p = os.path.join(WORKSPACE_DIR, "Datasets", sub, "images", filename)
        if os.path.exists(img_p):
            return FileResponse(img_p, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Sample image not found")

@app.get("/api/dataset-stats")
def get_dataset_statistics():
    train_dir = os.path.join(WORKSPACE_DIR, "Datasets", "train", "images")
    valid_dir = os.path.join(WORKSPACE_DIR, "Datasets", "valid", "images")

    n_train = len(os.listdir(train_dir)) if os.path.exists(train_dir) else 0
    n_valid = len(os.listdir(valid_dir)) if os.path.exists(valid_dir) else 0

    return {
        "train_count": n_train,
        "valid_count": n_valid,
        "total_images": n_train + n_valid,
        "classes": ["missing_hole"],
        "class_count": 1,
        "base_model": "YOLO11m (Medium Architecture, ~20M parameters)"
    }

@app.post("/api/detect")
async def detect_defects(
    file: UploadFile = None,
    sample_filename: str = Form(None),
    conf_thresh: float = Form(0.50),
    iou_thresh: float = Form(0.45),
    model_path: str = Form(None)
):
    try:
        img_bytes = None
        source_name = "uploaded_pcb.jpg"

        if sample_filename:
            source_name = sample_filename
            found = False
            for sub in ["valid", "train"]:
                p = os.path.join(WORKSPACE_DIR, "Datasets", sub, "images", sample_filename)
                if os.path.exists(p):
                    with open(p, "rb") as fp:
                        img_bytes = fp.read()
                    found = True
                    break
            if not found:
                raise HTTPException(status_code=404, detail="Sample image not found")
        elif file is not None:
            source_name = file.filename
            img_bytes = await file.read()
        else:
            raise HTTPException(status_code=400, detail="Either file or sample_filename must be provided")

        nparr = np.frombuffer(img_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_bgr is None:
            raise HTTPException(status_code=400, detail="Could not decode image file")

        result = run_detection(
            img_bgr=img_bgr,
            conf_thresh=conf_thresh,
            iou_thresh=iou_thresh,
            model_path=model_path
        )

        result["filename"] = source_name
        return JSONResponse(content=result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.server:app", host="127.0.0.1", port=8000, reload=True)
