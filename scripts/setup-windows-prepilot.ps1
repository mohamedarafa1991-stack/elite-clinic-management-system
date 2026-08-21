[CmdletBinding()]
param(
    [string]$RepoPath = (Get-Location).Path,
    [switch]$SkipAndroid,
    [switch]$SkipReleaseReadiness,
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDirectory = Join-Path $RepoPath "artifacts\windows-prepilot"
$logPath = Join-Path $logDirectory "setup-$timestamp.log"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Write-SetupMessage {
    param(
        [ValidateSet("INFO", "PASS", "WARN", "FAIL")]
        [string]$Level,
        [string]$Message
    )
    $line = "[$(Get-Date -Format o)] [$Level] $Message"
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line
}

function Stop-Setup {
    param([string]$Message)
    Write-SetupMessage -Level "FAIL" -Message $Message
    Write-Host ""
    Write-Host "Fix the problem above, then run this same command again." -ForegroundColor Yellow
    exit 1
}

function Get-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        Stop-Setup "Required command '$Name' was not found in PATH. Install it, restart PowerShell, and try again."
    }
    return $command.Source
}

function Invoke-CheckedCommand {
    param(
        [string]$Name,
        [string[]]$Arguments
    )
    Write-SetupMessage -Level "INFO" -Message ("Running: {0} {1}" -f $Name, ($Arguments -join " "))
    & $Name @Arguments 2>&1 | Tee-Object -FilePath $logPath -Append
    if ($LASTEXITCODE -ne 0) {
        Stop-Setup "Command failed with exit code $LASTEXITCODE: $Name $($Arguments -join ' ')"
    }
    Write-SetupMessage -Level "PASS" -Message "Completed: $Name $($Arguments -join ' ')"
}

function Get-ToolVersion {
    param(
        [string]$Name,
        [string[]]$Arguments
    )
    $output = (& $Name @Arguments 2>&1 | Out-String).Trim()
    Add-Content -LiteralPath $logPath -Value $output
    return $output
}

function Assert-MinimumVersion {
    param(
        [string]$Tool,
        [string]$Output,
        [version]$Minimum,
        [string]$Pattern = '(\d+\.\d+(?:\.\d+)?)'
    )
    $match = [regex]::Match($Output, $Pattern)
    if (-not $match.Success) {
        Stop-Setup "Could not read the $Tool version. Detected output: $Output"
    }
    $detected = [version]$match.Groups[1].Value
    if ($detected -lt $Minimum) {
        Stop-Setup "$Tool $detected is too old. Elite Clinic requires version $Minimum or newer."
    }
    Write-SetupMessage -Level "PASS" -Message "$Tool $detected is available."
}

Write-SetupMessage -Level "INFO" -Message "Elite Clinic Windows pre-pilot setup started."
Write-SetupMessage -Level "INFO" -Message "Repository: $RepoPath"
Write-SetupMessage -Level "INFO" -Message "Log file: $logPath"
Write-SetupMessage -Level "WARN" -Message "This script uses synthetic validation only. It does not start the Hub, create patient data, install an application, or modify a production database."

if (-not (Test-Path -LiteralPath (Join-Path $RepoPath "package.json"))) {
    Stop-Setup "This folder does not contain package.json. Run the script from the repository root or pass -RepoPath 'C:\path\to\elite-clinic-management-system'."
}
if (-not (Test-Path -LiteralPath (Join-Path $RepoPath "pnpm-lock.yaml"))) {
    Stop-Setup "pnpm-lock.yaml is missing. Use a complete repository checkout; do not run this setup from a partial folder."
}
if (-not (Test-Path -LiteralPath (Join-Path $RepoPath "apps\android\gradlew.bat"))) {
    Stop-Setup "The Android Gradle wrapper is missing at apps\android\gradlew.bat. Re-download the complete repository before continuing."
}

Push-Location $RepoPath
try {
    Get-CommandPath -Name "node" | Out-Null
    Get-CommandPath -Name "pnpm" | Out-Null
    $nodeOutput = Get-ToolVersion -Name "node" -Arguments @("--version")
    Assert-MinimumVersion -Tool "Node.js" -Output $nodeOutput -Minimum ([version]"22.13.0") -Pattern '(\d+\.\d+\.\d+)'
    $pnpmOutput = Get-ToolVersion -Name "pnpm" -Arguments @("--version")
    Assert-MinimumVersion -Tool "pnpm" -Output $pnpmOutput -Minimum ([version]"10.14.0") -Pattern '(\d+\.\d+\.\d+)'

    Get-CommandPath -Name "java" | Out-Null
    $javaOutput = Get-ToolVersion -Name "java" -Arguments @("-version")
    Assert-MinimumVersion -Tool "Java" -Output $javaOutput -Minimum ([version]"17.0.0") -Pattern 'version "(\d+\.\d+\.\d+)'

    if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
        Write-SetupMessage -Level "WARN" -Message "Git was not found. The script can still validate a copied folder, but commit and update operations will not be available."
    } else {
        $gitRoot = (& git -C $RepoPath rev-parse --show-toplevel 2>$null | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($gitRoot)) {
            Write-SetupMessage -Level "WARN" -Message "This folder is not a Git checkout. That is acceptable for validation, but use a real checkout for updates and release evidence."
        } else {
            Write-SetupMessage -Level "PASS" -Message "Git checkout detected at $gitRoot"
        }
    }

    if (-not $SkipAndroid) {
        $sdkRoot = $env:ANDROID_SDK_ROOT
        if ([string]::IsNullOrWhiteSpace($sdkRoot)) { $sdkRoot = $env:ANDROID_HOME }
        if ([string]::IsNullOrWhiteSpace($sdkRoot) -or -not (Test-Path -LiteralPath $sdkRoot)) {
            Stop-Setup "Android SDK was not found. Install Android Studio or the command-line SDK, then set ANDROID_SDK_ROOT before running again."
        }
        $adbPath = Join-Path $sdkRoot "platform-tools\adb.exe"
        if (-not (Test-Path -LiteralPath $adbPath)) {
            Stop-Setup "adb.exe was not found under $sdkRoot\platform-tools. Install Android Platform-Tools before continuing."
        }
        Write-SetupMessage -Level "PASS" -Message "Android SDK and adb detected at $sdkRoot"
    } else {
        Write-SetupMessage -Level "WARN" -Message "Android checks were skipped because -SkipAndroid was supplied."
    }

    if ($CheckOnly) {
        Write-SetupMessage -Level "PASS" -Message "Prerequisite check completed. No dependencies or validation commands were run because -CheckOnly was supplied."
        exit 0
    }

    $installArguments = @("install")
    if (Test-Path -LiteralPath (Join-Path $RepoPath "pnpm-lock.yaml")) {
        $installArguments += "--frozen-lockfile"
    }
    Invoke-CheckedCommand -Name "pnpm" -Arguments $installArguments

    Invoke-CheckedCommand -Name "pnpm" -Arguments @("windows:pilot:verify")
    Invoke-CheckedCommand -Name "pnpm" -Arguments @("windows:payout-task:verify")
    Invoke-CheckedCommand -Name "pnpm" -Arguments @("test")
    Invoke-CheckedCommand -Name "pnpm" -Arguments @("typecheck")
    Invoke-CheckedCommand -Name "pnpm" -Arguments @("desktop:build")

    if (-not $SkipAndroid) {
        Invoke-CheckedCommand -Name "pnpm" -Arguments @("android:release-check")
    }
    if (-not $SkipReleaseReadiness -and -not $SkipAndroid) {
        Invoke-CheckedCommand -Name "pnpm" -Arguments @("release:readiness")
    } elseif ($SkipReleaseReadiness) {
        Write-SetupMessage -Level "WARN" -Message "Full release-readiness was skipped because -SkipReleaseReadiness was supplied."
    } else {
        Write-SetupMessage -Level "WARN" -Message "Full release-readiness was skipped because it includes Android checks and -SkipAndroid was supplied."
    }

    Write-SetupMessage -Level "PASS" -Message "Windows pre-pilot setup and local validation completed. Physical scenarios still require the Windows Hub and Android devices."
    Write-Host ""
    Write-Host "Next: follow docs\templates\physical-device-validation-checklist.md using synthetic data only." -ForegroundColor Green
    Write-Host "Evidence log: $logPath" -ForegroundColor Green
}
finally {
    Pop-Location
}
