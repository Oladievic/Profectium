@echo off
REM * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
REM * Все права сохранены.
REM *
REM * Автор: Криницин Вячеслав Александрович
setlocal
title Profectium - backup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Backup-Profectium.ps1" %*
set "backupResult=%errorlevel%"
pause
exit /b %backupResult%
