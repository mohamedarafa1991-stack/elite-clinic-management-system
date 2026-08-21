[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$HubIp,

    [Parameter(Mandatory = $false)]
    [string]$CertificateDirectory = (Join-Path (Get-Location) "artifacts\windows-lan-tls"),

    [Parameter(Mandatory = $false)]
    [switch]$LaunchHub
)

$ErrorActionPreference = "Stop"

function Stop-TlsSetup([string]$Message) {
    Write-Error "ELITE_TLS_SETUP_FAILED: $Message"
    exit 1
}

$openssl = Get-Command openssl.exe -ErrorAction SilentlyContinue
if (-not $openssl) {
    Stop-TlsSetup "openssl.exe was not found. Install OpenSSL for Windows, reopen PowerShell, and run this script again."
}

if ([string]::IsNullOrWhiteSpace($HubIp)) {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Sort-Object InterfaceMetric, SkipAsSource
    $HubIp = $candidates | Select-Object -First 1 -ExpandProperty IPAddress
}

if ([string]::IsNullOrWhiteSpace($HubIp)) {
    Stop-TlsSetup "No usable LAN IPv4 address was found. Run Get-NetIPAddress and rerun with -HubIp YOUR_HUB_IP."
}

if ($HubIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    Stop-TlsSetup "HubIp must be an IPv4 address, for example 192.168.1.25."
}

New-Item -ItemType Directory -Path $CertificateDirectory -Force | Out-Null
$certificatePath = Join-Path $CertificateDirectory "hub-cert.pem"
$privateKeyPath = Join-Path $CertificateDirectory "hub-key.pem"
$configPath = Join-Path $CertificateDirectory "openssl-san.cnf"
$computerName = [System.Net.Dns]::GetHostName()

@"
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = Elite Clinic Windows Hub

[v3_req]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
DNS.2 = $computerName
IP.1 = 127.0.0.1
IP.2 = $HubIp
"@ | Set-Content -LiteralPath $configPath -Encoding ascii

& $openssl.Source req -x509 -newkey rsa:3072 -sha256 -nodes -days 365 `
    -config $configPath `
    -keyout $privateKeyPath `
    -out $certificatePath

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $certificatePath) -or -not (Test-Path $privateKeyPath)) {
    Stop-TlsSetup "OpenSSL did not create both certificate and private-key files."
}

$env:ELITE_SYNC_TLS_CERT_PATH = (Resolve-Path $certificatePath).Path
$env:ELITE_SYNC_TLS_KEY_PATH = (Resolve-Path $privateKeyPath).Path
$env:ELITE_SYNC_TLS_REQUIRED = "true"

Write-Host "ELITE_TLS_SETUP_PASS: certificate created for $HubIp"
Write-Host "Certificate: $($env:ELITE_SYNC_TLS_CERT_PATH)"
Write-Host "Private key: $($env:ELITE_SYNC_TLS_KEY_PATH)"
Write-Host "The private key is local-only. Do not send it to Android devices."
Write-Host "Use the certificate file as the Android trust anchor during device enrollment."

if ($LaunchHub) {
    $hub = Get-ChildItem (Join-Path (Get-Location) "release\win-unpacked") -Filter "*.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $hub) {
        Stop-TlsSetup "The packaged Hub executable was not found. Run pnpm desktop:package:dir first."
    }
    Start-Process -FilePath $hub.FullName -WorkingDirectory $hub.DirectoryName
    Write-Host "ELITE_TLS_SETUP_PASS: Hub launched with HTTPS/TLS configuration."
}
else {
    Write-Host "TLS paths are set for this PowerShell session. Start the Hub from this same window."
    Write-Host "Example: & (Get-ChildItem .\release\win-unpacked -Filter *.exe | Select-Object -First 1).FullName"
}
