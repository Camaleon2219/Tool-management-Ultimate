@echo off
chcp 65001 >nul
title FJK CNC-Werkzeugverwaltung

set "URL=https://ais-pre-wpnyg2itor6x6by2sihzpz-550906376930.europe-west2.run.app"

echo =================================================================
echo   FJK CNC-Werkzeugverwaltung wird als Windows-App gestartet...
echo =================================================================

:: 1. Pruefe Microsoft Edge an Standard-Pfaden (Standard auf jedem Windows 10 & 11)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%URL%"
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%URL%"
    exit
)
if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" --app="%URL%"
    exit
)

:: 2. Pruefe Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%"
    exit
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%"
    exit
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%URL%"
    exit
)

:: 3. Befehl ueber App Paths
start "" msedge --app="%URL%" 2>nul
if %errorlevel% equ 0 exit

start "" chrome --app="%URL%" 2>nul
if %errorlevel% equ 0 exit

:: 4. Universeller Fallback im Standardbrowser
start "" "%URL%"
exit
