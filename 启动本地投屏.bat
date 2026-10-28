@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-desktop.ps1"
if errorlevel 1 pause
