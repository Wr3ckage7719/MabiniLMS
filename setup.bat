@echo off
echo Creating directory structure...
mkdir client\src 2>nul
mkdir server\src 2>nul
echo Directories created!
echo.
echo Installing dependencies...
call npm install
echo.
echo Setup complete! Next steps:
echo 1. Create a GitHub repository
echo 2. Add team members as collaborators
echo 3. Set up GitHub Projects board with columns: Backlog, In Progress, Review, Done
echo 4. Run 'npm run dev' to start development
