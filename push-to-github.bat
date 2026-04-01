@echo off
echo ========================================
echo Pushing MabiniLMS to GitHub
echo ========================================
echo.

echo Initializing git repository...
git init
if errorlevel 1 goto :error

echo.
echo Adding all files...
git add .
if errorlevel 1 goto :error

echo.
echo Creating initial commit...
git commit -m "Initial commit: Monorepo setup with Vite React + Express" -m "- Set up client with Vite, React, TypeScript, Tailwind CSS, PWA" -m "- Set up server with Express and TypeScript" -m "- Configure ESLint, Prettier, EditorConfig" -m "- Add workspace configuration for monorepo" -m "" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
if errorlevel 1 goto :error

echo.
echo Setting default branch to main...
git branch -M main
if errorlevel 1 goto :error

echo.
echo Adding remote repository...
git remote add origin https://github.com/Wr3ckage7719/MabiniLMS.git
if errorlevel 1 (
    echo Remote already exists, updating URL...
    git remote set-url origin https://github.com/Wr3ckage7719/MabiniLMS.git
)

echo.
echo Pushing to GitHub...
git push -u origin main
if errorlevel 1 goto :error

echo.
echo ========================================
echo SUCCESS! Code pushed to GitHub!
echo ========================================
echo.
echo Repository: https://github.com/Wr3ckage7719/MabiniLMS
echo.
echo Next steps:
echo 1. Add team members as collaborators
echo 2. Set up GitHub Projects board
echo 3. Run: npm install
echo 4. Run: npm run dev
echo.
goto :end

:error
echo.
echo ========================================
echo ERROR: Something went wrong!
echo ========================================
echo.
echo Please check the error message above.
echo You may need to:
echo - Install Git if not already installed
echo - Configure Git credentials
echo - Check your GitHub repository exists
echo.

:end
pause
