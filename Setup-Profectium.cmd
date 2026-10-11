@echo off
REM * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
REM * Все права сохранены.
REM *
REM * Автор: Криницин Вячеслав Александрович
setlocal
title Profectium - setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Setup-Profectium.ps1" %*
set "setupResult=%errorlevel%"
pause
exit /b %setupResult%
