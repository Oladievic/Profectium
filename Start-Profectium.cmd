@echo off
REM * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
REM * Все права сохранены.
REM *
REM * Автор: Криницин Вячеслав Александрович
setlocal
title Profectium - redesign
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Start-Design.ps1" %*
set "launchResult=%errorlevel%"
if "%~1"=="" goto interactiveExit
if not "%launchResult%"=="0" pause
exit /b %launchResult%

:interactiveExit
echo.
echo The launch result and site address are shown above.
echo Press any key to close this window.
pause >nul
exit /b %launchResult%
