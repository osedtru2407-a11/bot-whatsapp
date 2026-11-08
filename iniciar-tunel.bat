@echo off
chcp 65001 >nul
title Compartir Panel de Ventas - Túnel Público Seguro
echo ========================================================
echo   🌐 CREANDO TÚNEL PÚBLICO SEGURO (HTTPS)
echo ========================================================
echo.
echo Conectando con Cloudflare para generar tu URL pública...
echo.

set "CLOUDFLARED=C:\Users\David\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"

if not exist "%CLOUDFLARED%" (
    where cloudflared >nul 2>nul
    if %errorlevel% equ 0 (
        set "CLOUDFLARED=cloudflared"
    ) else (
        echo [INFO] Cloudflared no detectado en ruta fija, iniciando túnel con LocalTunnel...
        npx --yes localtunnel --port 3000
        pause
        exit /b 0
    )
)

echo ========================================================
echo  ✅ Tu enlace público aparecerá a continuación en un recuadro.
echo  📱 Cópialo y ábrelo desde cualquier celular, tablet u otro PC.
echo  🛑 Para detener el túnel, presiona Ctrl + C en esta ventana.
echo ========================================================
echo.

"%CLOUDFLARED%" tunnel --url http://localhost:3000
pause

