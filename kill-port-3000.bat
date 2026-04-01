@echo off
echo Killing process on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /F /PID %%a 2>nul
    if errorlevel 1 (
        echo No process found on port 3000
    ) else (
        echo Process killed successfully!
    )
)
echo.
echo Port 3000 is now free. You can run 'npm run dev' now.
pause
