import os
import sys
from pathlib import Path
from ultralytics import YOLO

if __name__ == '__main__':
    project_dir = Path(__file__).resolve().parent
    os.chdir(project_dir)

    data_yaml = project_dir / "Datasets" / "data.yaml"
    last_checkpoint = project_dir / "runs" / "train" / "pcb_defect" / "weights" / "last.pt"

    if last_checkpoint.exists():
        print("Resuming training from last checkpoint...")
        model = YOLO(str(last_checkpoint))
        results = model.train(resume=True)
    else:
        print("Starting training with YOLO11m model...")
        base_model = project_dir / "yolo11m.pt"
        model = YOLO(str(base_model) if base_model.exists() else "yolo11m.pt")
        results = model.train(
            data=str(data_yaml),
            epochs=50,
            imgsz=640,
            batch=8,
            device=0,
            workers=0,
            project="runs/train",
            name="pcb_defect",
            patience=10,
            lr0=0.001,
            augment=True,
            verbose=True
        )

    print("\n" + "=" * 60)
    print("Training finished successfully!")
    print("Best weights saved at: runs/train/pcb_defect/weights/best.pt")
    print("=" * 60)
