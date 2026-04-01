# Git Commit & Push (PowerShell)

Write-Host "📦 Staging all changes..." -ForegroundColor Cyan
git add .

Write-Host "`n💬 Creating commit..." -ForegroundColor Cyan
git commit -m "feat: Complete Phase 1 - Authentication & Project Structure

- Implement user authentication with Supabase (login, register, logout)
- Set up Supabase database with complete schema (profiles, courses, assignments, etc.)
- Create organized project structure with proper folder hierarchy
- Move components to organized folders (auth/, common/, layout/)
- Fix all import paths after reorganization
- Add authentication context and hooks
- Create Login and Register components with Tailwind CSS
- Set up protected routes and user dashboard
- Configure environment variables for Supabase
- Add development utilities (kill-port scripts)
- Create comprehensive documentation (README, QUICKSTART, PROJECT_STRUCTURE)

Phase 1 Complete: ✅ Authentication Working

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🚀 Pushing to GitHub..." -ForegroundColor Cyan
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Successfully pushed to GitHub!" -ForegroundColor Green
        Write-Host "`n📍 View your repository at:" -ForegroundColor Yellow
        Write-Host "   https://github.com/Wr3ckage7719/MabiniLMS" -ForegroundColor Blue
    } else {
        Write-Host "`n❌ Push failed. Check your credentials or remote URL." -ForegroundColor Red
    }
} else {
    Write-Host "`n❌ Commit failed. Check the error above." -ForegroundColor Red
}
