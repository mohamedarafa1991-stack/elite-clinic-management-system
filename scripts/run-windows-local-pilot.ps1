#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [string]$RepoPath = "",
    [string]$EvidenceRoot = "artifacts\windows-local-pilot",
    [switch]$SkipFullReadiness,
    [switch]$SkipWindowsPackage,
    [switch]$SkipEvidencePack,
    [switch]$AllowDirtyWorktree
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
else {
    $RepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
}

if (-not [System.IO.Path]::IsPathRooted($EvidenceRoot)) {
    $EvidenceRoot = Join-Path $RepoPath $EvidenceRoot
}
else {
    $EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
}

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$RunLog = Join-Path $EvidenceRoot "windows-local-pilot.log"
$ReportPath = Join-Path $EvidenceRoot "windows-local-pilot-report.json"
$StartedAt = (Get-Date).ToUniversalTime()
$script:Checks = @()
$script:FailureMessage = $null

$PhysicalWindowsScenarios = @(
    [ordered]@{
        id = "WIN-INSTALL-001"
        status = "pending"
        detail = "Requires human-observed clean packaged installation on the intended Windows workstation."
    },
    [ordered]@{
        id = "WIN-INSTALL-002"
        status = "pending"
        detail = "Requires human-observed upgrade and migration preservation using synthetic records."
    },
    [ordered]@{
        id = "WIN-INSTALL-003"
        status = "pending"
        detail = "Requires human-approved uninstall/reinstall retention test; this runner does not delete user data."
    },
    [ordered]@{
        id = "WIN-DB-001"
        status = "pending"
        detail = "Requires packaged encrypted startup, approved key reopen, and disposable wrong-key fail-closed observation."
    },
    [ordered]@{
        id = "WIN-SEC-001"
        status = "pending"
        detail = "Requires packaged boundary observation and sanitized logging review on Windows."
    },
    [ordered]@{
        id = "WIN-LAN-001"
        status = "pending"
        detail = "Requires isolated-LAN, firewall, certificate, wrong-anchor, Hub-stop, and Hub-restart observation."
    },
    [ordered]@{
        id = "WIN-BACKUP-001"
        status = "pending"
        detail = "Requires Admin-controlled encrypted USB backup and plaintext-artifact inspection."
    },
    [ordered]@{
        id = "WIN-RESTORE-001"
        status = "pending"
        detail = "Requires replacement-Hub restore with approved key, count/hash reconciliation, and Admin approval."
    },
    [ordered]@{
        id = "WIN-RECOVERY-001"
        status = "pending"
        detail = "Requires human-controlled interrupted-upgrade rollback; this runner does not interrupt upgrades."
    }
)

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][ValidateSet("passed", "failed", "blocked", "skipped")][string]$Status,
        [Parameter(Mandatory = $true)][string]$Detail,
        [string[]]$Evidence = @()
    )

    $script:Checks += [ordered]@{
        id = $Id
        status = $Status
        detail = $Detail
        evidence = @($Evidence)
    }
}

function Write-RunLog {
    param([Parameter(Mandatory = $true)][string]$Message)

    $timestamp = (Get-Date).ToUniversalTime().ToString("o")
    $line = "[$timestamp] $Message"
    Add-Content -LiteralPath $RunLog -Value $line -Encoding UTF8
    Write-Host $line
}

function Invoke-LocalStep {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$Command,
        [string[]]$Arguments = @(),
        [string[]]$Evidence = @()
    )

    $displayArguments = if ($Arguments.Count -gt 0) { " " + ($Arguments -join " ") } else { "" }
    $displayCommand = "$Command$displayArguments"

    if ($WhatIfPreference) {
        Write-RunLog "WHATIF: $displayCommand"
        Add-Check -Id $Id -Status "skipped" -Detail "$DisplayName was not executed because -WhatIf was supplied." -Evidence $Evidence
        return
    }

    Write-RunLog "START $Id - $DisplayName - $displayCommand"
    try {
        & $Command @Arguments 2>&1 | Tee-Object -FilePath $RunLog -Append
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
        if ($exitCode -ne 0) {
            Add-Check -Id $Id -Status "failed" -Detail "$DisplayName failed with exit code $exitCode." -Evidence $Evidence
            throw "[$Id] $DisplayName failed with exit code $exitCode."
        }
        Add-Check -Id $Id -Status "passed" -Detail "$DisplayName passed." -Evidence $Evidence
        Write-RunLog "PASS $Id"
    }
    catch {
        if (-not $_.Exception.Message.StartsWith("[$Id]")) {
            Add-Check -Id $Id -Status "failed" -Detail "$DisplayName raised an exception: $($_.Exception.Message)." -Evidence $Evidence
        }
        throw
    }
}

function Get-RepositoryCommit {
    $commit = (& git rev-parse HEAD 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($commit)) {
        throw "Unable to resolve the current Git commit."
    }
    return $commit
}

function Get-ArtifactEvidence {
    $releasePath = Join-Path $RepoPath "release"
    if (-not (Test-Path -LiteralPath $releasePath)) {
        return @()
    }

    $artifactFiles = Get-ChildItem -LiteralPath $releasePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in @(".exe", ".msi", ".apk") -or $_.Name -eq "app.asar"
        }

    return @(
        $artifactFiles | ForEach-Object {
            $relativePath = $_.FullName.Substring($RepoPath.Length).TrimStart("\", "/")
            [ordered]@{
                path = $relativePath.Replace("\", "/")
                bytes = $_.Length
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        }
    )
}

function Write-RunReport {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryCommit,
        [Parameter(Mandatory = $true)][string]$OverallStatus
    )

    $report = [ordered]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString("o")
        startedAt = $StartedAt.ToString("o")
        syntheticOnly = $true
        repositoryCommit = $RepositoryCommit
        repositoryPath = $RepoPath
        overallStatus = $OverallStatus
        noRealPatientDataUsed = $true
        localChecks = @($script:Checks)
        physicalWindowsScenarios = @($PhysicalWindowsScenarios)
        artifacts = @(Get-ArtifactEvidence)
        logPath = $RunLog
        limitations = @(
            "This script does not install or uninstall over a user-approved data directory.",
            "This script does not replace human observation of packaged startup, DPAPI/key behavior, firewall/TLS behavior, USB backup/restore, or interrupted-upgrade rollback.",
            "No physical scenario is marked passed by this script; the operator must update the 23-scenario physical record with evidence and use the status-aware readiness command."
        )
        failure = $script:FailureMessage
    }

    $json = $report | ConvertTo-Json -Depth 8
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ReportPath, "$json`r`n", $utf8NoBom)
    Write-RunLog "REPORT $ReportPath"
}

Push-Location -LiteralPath $RepoPath
try {
    if ($env:OS -ne "Windows_NT") {
        throw "This runner must execute on the actual Windows Hub."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $RepoPath "package.json"))) {
        throw "Repository path does not contain package.json: $RepoPath"
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required but was not found on PATH."
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm is required but was not found on PATH."
    }

    $commit = Get-RepositoryCommit
    Write-RunLog "Repository: $RepoPath"
    Write-RunLog "Commit: $commit"
    Write-RunLog "Synthetic-only mode is enforced."

    $statusLines = @(& git -c color.status=false status --short 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect the Git worktree."
    }
    $unexpectedStatus = @(
        $statusLines | Where-Object {
            $line = $_.ToString().Trim()
            $line.Length -gt 0 -and -not $line.StartsWith("?? .github/")
        }
    )
    if ($unexpectedStatus.Count -gt 0 -and -not $AllowDirtyWorktree) {
        throw "Worktree is not clean. Commit or stash source changes first, or explicitly use -AllowDirtyWorktree. Unexpected status: $($unexpectedStatus -join '; ')"
    }
    if ($unexpectedStatus.Count -gt 0) {
        Add-Check -Id "WIN-PREFLIGHT-001" -Status "blocked" -Detail "Dirty worktree explicitly allowed for development verification; do not use this run for sign-off." -Evidence @($RunLog)
        Write-RunLog "WARNING: dirty worktree allowed by -AllowDirtyWorktree."
    }
    else {
        Add-Check -Id "WIN-PREFLIGHT-001" -Status "passed" -Detail "Git worktree is clean except for the protected .github/ directory." -Evidence @($RunLog)
    }

    Invoke-LocalStep -Id "WIN-PREFLIGHT-002" -DisplayName "Node runtime check" -Command "node" -Arguments @("--version") -Evidence @($RunLog)
    Invoke-LocalStep -Id "WIN-PREFLIGHT-003" -DisplayName "pnpm runtime check" -Command "pnpm" -Arguments @("--version") -Evidence @($RunLog)
    Invoke-LocalStep -Id "WIN-PREFLIGHT-004" -DisplayName "Frozen dependency installation" -Command "pnpm" -Arguments @("install", "--frozen-lockfile") -Evidence @($RunLog)

    Invoke-LocalStep -Id "LOCAL-TS-001" -DisplayName "TypeScript and desktop test suite" -Command "pnpm" -Arguments @("test") -Evidence @($RunLog)
    Invoke-LocalStep -Id "LOCAL-TS-002" -DisplayName "TypeScript workspace typecheck" -Command "pnpm" -Arguments @("typecheck") -Evidence @($RunLog)
    Invoke-LocalStep -Id "LOCAL-DESKTOP-001" -DisplayName "Desktop production build" -Command "pnpm" -Arguments @("desktop:build") -Evidence @($RunLog)
    Invoke-LocalStep -Id "LOCAL-DESKTOP-002" -DisplayName "Desktop IPC security smoke tests" -Command "pnpm" -Arguments @("desktop:ipc:smoke") -Evidence @($RunLog)
    Invoke-LocalStep -Id "LOCAL-PILOT-001" -DisplayName "Synthetic clinic-day and recovery rehearsal" -Command "pnpm" -Arguments @("pilot:rehearsal") -Evidence @($RunLog)
    Invoke-LocalStep -Id "LOCAL-FORMAT-001" -DisplayName "Repository formatting check" -Command "pnpm" -Arguments @("format:check") -Evidence @($RunLog)
    Invoke-LocalStep -Id "LOCAL-GIT-001" -DisplayName "Git whitespace check" -Command "git" -Arguments @("diff", "--check") -Evidence @($RunLog)

    if (-not $SkipWindowsPackage) {
        Invoke-LocalStep -Id "WIN-PACKAGE-001" -DisplayName "Windows NSIS packaging and native rebuild" -Command "pnpm" -Arguments @("desktop:package:win") -Evidence @($RunLog)
        Invoke-LocalStep -Id "WIN-PACKAGE-002" -DisplayName "Windows packaged archive verification" -Command "pnpm" -Arguments @("desktop:package:verify") -Evidence @($RunLog)
    }
    else {
        Add-Check -Id "WIN-PACKAGE-001" -Status "skipped" -Detail "Windows packaging skipped by -SkipWindowsPackage." -Evidence @($RunLog)
        Add-Check -Id "WIN-PACKAGE-002" -Status "skipped" -Detail "Windows package verification skipped by -SkipWindowsPackage." -Evidence @($RunLog)
    }

    if (-not $SkipFullReadiness) {
        Invoke-LocalStep -Id "LOCAL-READINESS-001" -DisplayName "Unified local release readiness" -Command "pnpm" -Arguments @("release:readiness") -Evidence @($RunLog)
    }
    elseif (-not $SkipEvidencePack) {
        throw "Evidence-pack generation requires the full readiness run. Use -SkipEvidencePack when using -SkipFullReadiness."
    }

    if (-not $SkipEvidencePack) {
        $previousEvidenceOverride = $env:ELITE_EVIDENCE_ALLOW_WORKTREE
        try {
            if ($AllowDirtyWorktree) {
                $env:ELITE_EVIDENCE_ALLOW_WORKTREE = "true"
            }
            Invoke-LocalStep -Id "PILOT-EVIDENCE-001" -DisplayName "Synthetic evidence-pack generation" -Command "pnpm" -Arguments @("pilot:evidence", "--", "--clean", "--require-artifacts") -Evidence @($RunLog)
        }
        finally {
            if ($null -eq $previousEvidenceOverride) {
                Remove-Item Env:ELITE_EVIDENCE_ALLOW_WORKTREE -ErrorAction SilentlyContinue
            }
            else {
                $env:ELITE_EVIDENCE_ALLOW_WORKTREE = $previousEvidenceOverride
            }
        }
        Invoke-LocalStep -Id "PILOT-EVIDENCE-002" -DisplayName "Physical record template validation" -Command "pnpm" -Arguments @("pilot:validate-record", "--", "--record", "docs/templates/physical-device-validation-record.json", "--allow-template") -Evidence @($RunLog)
    }
    else {
        Add-Check -Id "PILOT-EVIDENCE-001" -Status "skipped" -Detail "Evidence-pack generation skipped by -SkipEvidencePack." -Evidence @($RunLog)
        Add-Check -Id "PILOT-EVIDENCE-002" -Status "skipped" -Detail "Physical record validation skipped by -SkipEvidencePack." -Evidence @($RunLog)
    }

    $failedChecks = @($script:Checks | Where-Object { $_.status -eq "failed" })
    if ($failedChecks.Count -gt 0) {
        throw "One or more local pilot checks failed: $($failedChecks.id -join ', ')"
    }

    Write-RunReport -RepositoryCommit $commit -OverallStatus "local-passed-physical-pending"
    Write-RunLog "LOCAL WINDOWS PILOT COMPLETE: local checks passed; physical Windows scenarios remain pending human evidence."
}
catch {
    $script:FailureMessage = $_.Exception.Message
    Write-RunLog "FAILURE: $script:FailureMessage"
    try {
        $commitForReport = Get-RepositoryCommit
    }
    catch {
        $commitForReport = "unknown"
    }
    Write-RunReport -RepositoryCommit $commitForReport -OverallStatus "failed"
    throw
}
finally {
    Pop-Location
}
