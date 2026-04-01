# Setup script for MabiniLMS
Write-Host "Creating directory structure..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path "client/src" | Out-Null
New-Item -ItemType Directory -Force -Path "server/src" | Out-Null
Write-Host "Directories created!" -ForegroundColor Green

Write-Host "`nInstalling dependencies..." -ForegroundColor Green
npm install

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Create a GitHub repository"
Write-Host "2. Add team members as collaborators"
Write-Host "3. Set up GitHub Projects board with columns: Backlog, In Progress, Review, Done"
Write-Host "4. Run 'npm run dev' to start development"
