# Kill process on port 3000 (Windows)
$port = 3000
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($process) {
    Write-Host "Found process using port $port (PID: $process)"
    Write-Host "Stopping process..."
    Stop-Process -Id $process -Force
    Write-Host "✓ Process stopped!"
    Start-Sleep -Seconds 1
    Write-Host "`nPort $port is now free. You can run 'npm run dev' now."
} else {
    Write-Host "No process found using port $port"
}
