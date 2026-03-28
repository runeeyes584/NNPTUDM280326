@echo off
setlocal
title NNPTUD-C4 Mailtrap Import (.env)

cd /d "%~dp0"

echo ===============================================
echo   NNPTUD-C4 - User Import + Mailtrap (.env)
echo ===============================================
echo.

if not exist ".env" (
  echo Khong tim thay file .env
  echo Hay copy .env.example thanh .env va dien thong tin.
  pause
  exit /b 1
)

echo [1/4] Kiem tra dependencies...
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    echo npm install that bai.
    pause
    exit /b 1
  )
)

set /p IMPORT_MODE=Import 1 user test hay tat ca? (nhap 1 hoac all): 
if /I "%IMPORT_MODE%"=="1" (
  set IMPORT_URL=http://localhost:3000/api/v1/upload/excel/users-docs?limit=1
) else (
  set IMPORT_URL=http://localhost:3000/api/v1/upload/excel/users-docs
)

echo.
echo [2/4] Mo server (doc bien tu .env)...
start "NNPTUD-C4 Server" cmd /k "cd /d %cd% && npm start"
timeout /t 8 /nobreak >nul

echo.
echo [3/4] Tao role user (neu da ton tai co the bo qua)...
curl -S -X POST "http://localhost:3000/api/v1/roles" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"user\",\"description\":\"Default user role\"}"
echo.

echo.
echo [4/4] Import user tu docs/user.xlsx...
curl -S -X POST "%IMPORT_URL%"
echo.
echo.

echo Hoan tat. Mo Mailtrap Inbox de kiem tra subject "TAI KHOAN MOI".
pause
endlocal
