@echo off
chcp 65001 >nul
title WhatsApp Sales Bot Studio
echo ========================================================
echo   🚀 INICIANDO PANEL VISUAL - BOT DE VENTAS WHATSAPP
echo ========================================================
echo.

set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if exist "%NODE_EXE%" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
) else (
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] No se encontró Node.js instalado en C:\Program Files\nodejs.
        echo Por favor asegúrate de haber instalado Node.js.
        pause
        exit /b 1
    )
)

echo Abriendo panel en tu navegador: http://localhost:3000
start "" "http://localhost:3000"

echo.
echo Presiona Ctrl + C en esta ventana para detener el bot cuando desees.
echo.

node server.js
pause
