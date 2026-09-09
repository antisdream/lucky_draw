param([string]$JavaRuntime = 'C:\Program Files\Android\Android Studio\jbr')
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskSigning = Join-Path $taskRepo '.signing'
$taskStore = Join-Path $taskSigning 'lucky-draw-release.p12'
$taskPasswordFile = Join-Path $taskSigning 'password.dpapi'
$storeExists = Test-Path -LiteralPath $taskStore
$passwordExists = Test-Path -LiteralPath $taskPasswordFile
if ($storeExists -and $passwordExists) { Write-Host 'Existing release signing identity retained.'; return }
if ($storeExists -or $passwordExists) { throw 'Incomplete signing identity. Restore its matching files; do not replace the existing key.' }
$taskKeytool = Join-Path $JavaRuntime 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $taskKeytool)) { throw 'keytool was not found in the requested Java runtime.' }
New-Item -ItemType Directory -Path $taskSigning -Force | Out-Null
# Keep the signing material private to the current Windows account and SYSTEM.
$taskAcl = New-Object System.Security.AccessControl.DirectorySecurity
$taskAcl.SetAccessRuleProtection($true,$false)
$taskRights = [System.Security.AccessControl.FileSystemRights]::FullControl
$taskInheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
foreach ($taskIdentity in @([System.Security.Principal.WindowsIdentity]::GetCurrent().User,[System.Security.Principal.SecurityIdentifier]'S-1-5-18')) {
    $taskAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($taskIdentity,$taskRights,$taskInheritance,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
}
Set-Acl -LiteralPath $taskSigning -AclObject $taskAcl
$taskRandom = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($taskRandom)
$taskPassword = [Convert]::ToBase64String($taskRandom)
$previousPassword = $env:LUCKY_DRAW_KEYTOOL_PASSWORD
try {
    $taskSecurePassword = ConvertTo-SecureString $taskPassword -AsPlainText -Force
    $taskSecurePassword | ConvertFrom-SecureString | Set-Content -LiteralPath $taskPasswordFile -Encoding utf8
    $env:LUCKY_DRAW_KEYTOOL_PASSWORD = $taskPassword
    & $taskKeytool -genkeypair -keystore $taskStore -storetype PKCS12 -alias lucky-draw-release -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname 'CN=Lucky Draw Release, O=antisdream, C=KR' -storepass:env LUCKY_DRAW_KEYTOOL_PASSWORD -keypass:env LUCKY_DRAW_KEYTOOL_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed. Preserve partial files for recovery.' }
    Write-Host 'Release signing identity created. Its password is protected for this Windows account.'
} finally {
    $env:LUCKY_DRAW_KEYTOOL_PASSWORD = $previousPassword
    $taskPassword = $null
    if ($taskSecurePassword) { $taskSecurePassword.Dispose() }
    [Array]::Clear($taskRandom,0,$taskRandom.Length)
}
