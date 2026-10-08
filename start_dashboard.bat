@echo off
cd /d "%~dp0"
title PCB Defect Vision AI Dashboard
color 0A
echo =====================================================================
echo       PCB DEFECT VISION AI - Automated Optical Inspection (AOI)
echo =====================================================================
echo Starting server  http://127.0.0.1:8000 ...
python run_dashboard.py
pause
