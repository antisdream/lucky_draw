param(
    [string]$JavaRuntime = 'C:\Program Files\Android\Android Studio\jbr',
    [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk",
    [ValidateSet('Release','Debug')][string]$Variant = 'Release',
    [switch]$Offline,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$previousJava = $env:JAVA_HOME
$previousSdk = $env:ANDROID_HOME
$previousStore = $env:LUCKY_DRAW_STORE_FILE
$previousStorePassword = $env:LUCKY_DRAW_STORE_PASSWORD
$previousKeyPassword = $env:LUCKY_DRAW_KEY_PASSWORD
Push-Location $taskRepo
try {
    if (-not (Test-Path -LiteralPath (Join-Path $JavaRuntime 'bin\java.exe'))) { throw 'Java runtime not found. Pass -JavaRuntime with your JDK directory.' }
    if (-not (Test-Path -LiteralPath (Join-Path $AndroidSdk 'platforms\android-36'))) { throw 'Android SDK 36 not found. Pass -AndroidSdk with your SDK directory.' }
    $env:JAVA_HOME = $JavaRuntime
    $env:ANDROID_HOME = $AndroidSdk
    if ($Variant -eq 'Release') {
        & (Join-Path $PSScriptRoot 'init-android-signing.ps1') -JavaRuntime $JavaRuntime
        $taskSigning = Join-Path $taskRepo '.signing'
        $taskProtectedPassword = (Get-Content -LiteralPath (Join-Path $taskSigning 'password.dpapi') -Raw).Trim()
        $taskSecurePassword = ConvertTo-SecureString $taskProtectedPassword
        $taskBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecurePassword)
        try { $taskPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskBstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskBstr); $taskSecurePassword.Dispose() }
        $env:LUCKY_DRAW_STORE_FILE = Join-Path $taskSigning 'lucky-draw-release.p12'
        $env:LUCKY_DRAW_STORE_PASSWORD = $taskPassword
        $env:LUCKY_DRAW_KEY_PASSWORD = $taskPassword
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'HTML build failed.' }
    Push-Location (Join-Path $taskRepo 'android')
    try {
        $taskArguments = @((":app:assemble{0}" -f $Variant), '--no-daemon')
        if ($Offline) { $taskArguments += '--offline' }
        if ($Check) { $taskArguments += (":app:lint{0}" -f $Variant) }
        & .\gradlew.bat @taskArguments
        if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    } finally { Pop-Location }
    $taskArtifacts = Join-Path $taskRepo 'artifacts'
    New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
    $taskVersion = (Get-Content -LiteralPath (Join-Path $taskRepo 'package.json') -Raw | ConvertFrom-Json).version
    $taskSuffix = if ($Variant -eq 'Debug') { '-test' } else { '-release' }
    $taskApk = Join-Path $taskArtifacts ("lucky-draw-{0}{1}.apk" -f $taskVersion,$taskSuffix)
    $taskVariantFolder = $Variant.ToLowerInvariant()
    Copy-Item -LiteralPath (Join-Path $taskRepo "android\app\build\outputs\apk\$taskVariantFolder\app-$taskVariantFolder.apk") -Destination $taskApk
    $taskHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
    "$taskHash  $([IO.Path]::GetFileName($taskApk))" | Set-Content -LiteralPath "$taskApk.sha256" -Encoding utf8
    Get-FileHash -LiteralPath $taskApk -Algorithm SHA256 | Format-List
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousSdk
    $env:LUCKY_DRAW_STORE_FILE = $previousStore
    $env:LUCKY_DRAW_STORE_PASSWORD = $previousStorePassword
    $env:LUCKY_DRAW_KEY_PASSWORD = $previousKeyPassword
    $taskPassword = $null
    Pop-Location
}
