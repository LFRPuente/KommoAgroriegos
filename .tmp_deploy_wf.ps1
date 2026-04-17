$envContent = Get-Content 'c:\Users\luis_\OneDrive\Desktop\KommoAgroriegos\.env'
$apiKeyLine = ($envContent | Where-Object { $_ -match '^N8N_API_KEY=' })
$apiKey = ($apiKeyLine -replace '^N8N_API_KEY=', '').Trim()

$headers = @{ 
    'X-N8N-API-KEY' = $apiKey
    'Content-Type' = 'application/json' 
}

# Leer el backup para obtener los settings y staticData originales
$backupPath = 'c:\Users\luis_\OneDrive\Desktop\KommoAgroriegos\.tmp_wf_before_recepcion_patch.json'
$backupRaw = Get-Content $backupPath -Raw
# Handle BOM if present
if ($backupRaw[0] -eq 65279) { $backupRaw = $backupRaw.Substring(1) }
$backup = $backupRaw | ConvertFrom-Json

# Leer el workflow patchado (que tiene los nodos nuevos)
$patchPath = 'c:\Users\luis_\OneDrive\Desktop\KommoAgroriegos\.tmp_wf_after_recepcion_patch.json'
$patchRaw = Get-Content $patchPath -Raw
if ($patchRaw[0] -eq 65279) { $patchRaw = $patchRaw.Substring(1) }
$patch = $patchRaw | ConvertFrom-Json

# Construir el body
$bodyObj = @{ 
    name = $patch.name
    nodes = $patch.nodes
    connections = $patch.connections
    settings = $backup.settings
    staticData = $backup.staticData
}

$bodyJson = $bodyObj | ConvertTo-Json -Depth 100

$url = 'https://n8n.srv1388533.hstgr.cloud/api/v1/workflows/gfJm4JUoiUi7zZgaB2ob0'

try {
    $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Put -Body $bodyJson
    Write-Output "OK"
} catch {
    Write-Error $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Error $reader.ReadToEnd()
    }
}
