param(
    [string]$Remote = "deploy@v2585796.hostpapavps.net",
    [string]$RemoteRepo = "/var/www/servicescoeliaque/repo",
    [string]$BranchName = "master"
)

$ErrorActionPreference = "Stop"

$localScript = Join-Path $PSScriptRoot "deploy-prod.sh"
if (-not (Test-Path $localScript)) {
    throw "Missing local deploy script: $localScript"
}

$remoteScript = "$RemoteRepo/scripts/deploy-prod.sh"

Write-Host "Uploading deploy script to $Remote..."
scp $localScript "${Remote}:$remoteScript"

Write-Host "Running remote deploy..."
ssh $Remote "chmod +x '$remoteScript' && BRANCH_NAME='$BranchName' '$remoteScript'"
