$gql = "http://localhost:4000/graphql"
$h = @{"Content-Type"="application/json"}

Write-Host "=== HEALTH ===" -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method GET
Write-Host "Redis=$($health.redis) | Elasticsearch=$($health.elasticsearch)" -ForegroundColor $(if($health.elasticsearch -eq "UP"){"Green"}else{"Red"})

Write-Host "`n=== LOGIN ===" -ForegroundColor Cyan
$loginBody = '{"query":"mutation{login(input:{email:\"test@example.com\",password:\"Test@1234\"}){token user{name}}}"}'
$loginResp = Invoke-RestMethod -Uri $gql -Method POST -Headers $h -Body $loginBody
$token = $loginResp.data.login.token
Write-Host "Logged in as: $($loginResp.data.login.user.name)" -ForegroundColor Green
$a = @{"Content-Type"="application/json";"Authorization"="Bearer $token"}

Write-Host "`n=== ELASTICSEARCH SEARCH TESTS ===" -ForegroundColor Cyan
$words = @("Redis","GraphQL","React","frontend","documentation","cache","API","task")
foreach ($word in $words) {
    $body = '{"query":"{ searchTasks(query:\"' + $word + '\") { id title priority } }"}'
    $resp = Invoke-RestMethod -Uri $gql -Method POST -Headers $a -Body $body
    if ($resp.errors) {
        Write-Host "  '$word' -> ERROR: $($resp.errors[0].message)" -ForegroundColor Red
    } else {
        $cnt = $resp.data.searchTasks.Count
        Write-Host "  '$word' -> $cnt result(s)" -ForegroundColor $(if($cnt -gt 0){"Green"}else{"Gray"})
        foreach ($task in $resp.data.searchTasks) {
            Write-Host "    [$($task.priority.ToUpper())] $($task.title)" -ForegroundColor Cyan
        }
    }
}
Write-Host "`nDone!" -ForegroundColor Cyan
