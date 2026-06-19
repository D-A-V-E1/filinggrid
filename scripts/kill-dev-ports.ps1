param(
    [int[]]$Ports = @(8000, 3000, 3001)
)

$ErrorActionPreference = "SilentlyContinue"
$root = "Reporting - Comparative Viewer"

foreach ($port in $Ports) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $owners) {
        if ($procId -and $procId -ne 0) {
            Stop-Process -Id $procId -Force
        }
    }
}

if ($Ports -contains 8000) {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object {
            $_.CommandLine -match [regex]::Escape($root) -and (
                $_.CommandLine -match 'multiprocessing\.spawn' -or
                $_.CommandLine -match 'uvicorn main:app'
            )
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

if ($Ports -contains 3000 -or $Ports -contains 3001) {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object {
            $_.CommandLine -match 'start-server\.js' -and
            $_.CommandLine -match [regex]::Escape($root)
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

exit 0
