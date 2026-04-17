$envContent = Get-Content 'c:\Users\luis_\OneDrive\Desktop\KommoAgroriegos\.env'
$apiKeyLine = ($envContent | Where-Object { $_ -match '^N8N_API_KEY=' })
$apiKey = ($apiKeyLine -replace '^N8N_API_KEY=', '').Trim()
$headers = @{ 'X-N8N-API-KEY' = $apiKey }
$resp = Invoke-RestMethod -Uri 'https://n8n.srv1388533.hstgr.cloud/api/v1/workflows/gfJm4JUoiUi7zZgaB2ob0' -Headers $headers -Method Get
$resp | ConvertTo-Json -Depth 100 | Set-Content -Path 'c:\Users\luis_\OneDrive\Desktop\KommoAgroriegos\.tmp_wf_verify_after_deploy.json' -Encoding UTF8
Write-Output "OK"
