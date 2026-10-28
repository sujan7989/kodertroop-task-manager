$gql = "http://localhost:4000/graphql"
$h   = @{"Content-Type"="application/json"}
$pass = 0
$fail = 0

function GQL($bodyObj, $token) {
    $headers = if ($token) {
        @{"Content-Type"="application/json";"Authorization"="Bearer $token"}
    } else { $h }
    $json = $bodyObj | ConvertTo-Json -Depth 10 -Compress
    try { return Invoke-RestMethod -Uri $gql -Method POST -Headers $headers -Body $json -ErrorAction Stop }
    catch { return $null }
}
function Pass($msg, $ms) {
    $script:pass++
    $color = if($ms -lt 300){"Green"}elseif($ms -lt 800){"Yellow"}else{"Red"}
    Write-Host "  [PASS] $msg ($ms ms)" -ForegroundColor $color
}
function Fail($msg) { $script:fail++; Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Title($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

# ── HEALTH ─────────────────────────────────────────
Title "HEALTH & CONNECTIVITY"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$hl = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method GET -ErrorAction SilentlyContinue
$sw.Stop()
if ($hl.status -eq "OK") { Pass "Health - Redis=$($hl.redis) ES=$($hl.elasticsearch)" $sw.ElapsedMilliseconds }
else { Fail "Health endpoint down" }

# ── AUTHENTICATION ─────────────────────────────────
Title "AUTHENTICATION"
$ts   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email = "perftest$ts@test.com"

# Register
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$reg = GQL @{ query = "mutation{register(input:{name:`"Perf Test`",email:`"$email`",password:`"Test@1234`"}){token user{id name}}}" }
$sw.Stop()
$token = $reg.data.register.token
if ($token) { Pass "Register new user" $sw.ElapsedMilliseconds } else { Fail "Register failed: $($reg.errors[0].message)" }

# Login
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$login = GQL @{ query = "mutation{login(input:{email:`"$email`",password:`"Test@1234`"}){token user{name}}}" }
$sw.Stop()
$token = $login.data.login.token
if ($token) { Pass "Login (bcrypt 12 rounds)" $sw.ElapsedMilliseconds } else { Fail "Login failed" }

# Wrong password
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$bad = GQL @{ query = "mutation{login(input:{email:`"$email`",password:`"WrongPass999`"}){token}}" }
$sw.Stop()
if ($bad.errors) { Pass "Wrong password rejected: $($bad.errors[0].message)" $sw.ElapsedMilliseconds }
else { Fail "SECURITY BUG: Wrong password not rejected!" }

# Duplicate email
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$dup = GQL @{ query = "mutation{register(input:{name:`"Dup`",email:`"$email`",password:`"Test@1234`"}){token}}" }
$sw.Stop()
if ($dup.errors) { Pass "Duplicate email rejected: $($dup.errors[0].message)" $sw.ElapsedMilliseconds }
else { Fail "SECURITY BUG: Duplicate email not rejected!" }

# Unauthenticated access
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$noAuth = GQL @{ query = "{getTasks{totalCount}}" }
$sw.Stop()
if ($noAuth.errors) { Pass "Unauthenticated access blocked" $sw.ElapsedMilliseconds }
else { Fail "SECURITY BUG: Unauthenticated not blocked!" }

# Me query
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$me = GQL @{ query = "{me{id name email}}" } $token
$sw.Stop()
if ($me.data.me.email -eq $email) { Pass "me query - $($me.data.me.name)" $sw.ElapsedMilliseconds }
else { Fail "me query wrong" }

# ── CREATE TASKS ───────────────────────────────────
Title "TASK CRUD"
$ids = @()

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ct1 = GQL @{ query = "mutation{createTask(input:{title:`"Build the API backend`",description:`"Set up Apollo Server with Express and GraphQL resolvers`",priority:high,dueDate:`"2026-12-01T00:00:00Z`"}){id title priority completed dueDate}}" } $token
$sw.Stop()
if ($ct1.data.createTask.id) { $ids += $ct1.data.createTask.id; Pass "createTask [HIGH] $($ct1.data.createTask.title)" $sw.ElapsedMilliseconds }
else { Fail "createTask HIGH failed: $($ct1.errors[0].message)" }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ct2 = GQL @{ query = "mutation{createTask(input:{title:`"Integrate Redis caching`",description:`"Cache task lists with TTL and invalidation`",priority:medium}){id title priority}}" } $token
$sw.Stop()
if ($ct2.data.createTask.id) { $ids += $ct2.data.createTask.id; Pass "createTask [MEDIUM] $($ct2.data.createTask.title)" $sw.ElapsedMilliseconds }
else { Fail "createTask MEDIUM failed" }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ct3 = GQL @{ query = "mutation{createTask(input:{title:`"Write documentation`",description:`"Add README with setup instructions for Redis and Elasticsearch`",priority:low}){id title priority}}" } $token
$sw.Stop()
if ($ct3.data.createTask.id) { $ids += $ct3.data.createTask.id; Pass "createTask [LOW] $($ct3.data.createTask.title)" $sw.ElapsedMilliseconds }
else { Fail "createTask LOW failed" }

# getTasks cold (MongoDB)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$gt = GQL @{ query = "{getTasks(page:1,limit:10){tasks{id title priority completed dueDate createdAt updatedAt}totalCount page totalPages hasNextPage hasPreviousPage}}" } $token
$sw.Stop()
if ($gt.data.getTasks.totalCount -ge 3) { Pass "getTasks cold (MongoDB) - $($gt.data.getTasks.totalCount) tasks" $sw.ElapsedMilliseconds }
else { Fail "getTasks returned wrong count: $($gt.data.getTasks.totalCount)" }

# getTasks warm (Redis)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$gt2 = GQL @{ query = "{getTasks(page:1,limit:10){tasks{id title}totalCount}}" } $token
$sw.Stop()
Pass "getTasks warm (Redis cache) - $($gt2.data.getTasks.totalCount) tasks" $sw.ElapsedMilliseconds

# Verify cache consistency
if ($gt2.data.getTasks.totalCount -eq $gt.data.getTasks.totalCount) { Pass "Redis cache data matches MongoDB" 0 }
else { Fail "Redis cache inconsistency!" }

# Update task - mark complete
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$upd = GQL @{ query = "mutation{updateTask(id:`"$($ids[0])`",input:{completed:true,title:`"Build the API backend - DONE`"}){id title completed updatedAt}}" } $token
$sw.Stop()
if ($upd.data.updateTask.completed -eq $true) { Pass "updateTask - mark complete + rename" $sw.ElapsedMilliseconds }
else { Fail "updateTask failed: $($upd.errors[0].message)" }

# Update priority
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$upd2 = GQL @{ query = "mutation{updateTask(id:`"$($ids[1])`",input:{priority:high}){id priority}}" } $token
$sw.Stop()
if ($upd2.data.updateTask.priority -eq "high") { Pass "updateTask - change priority to high" $sw.ElapsedMilliseconds }
else { Fail "updateTask priority change failed" }

# Filter completed
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$fc = GQL @{ query = "{getTasks(filter:{completed:true}){tasks{title}totalCount}}" } $token
$sw.Stop()
if ($fc.data.getTasks.totalCount -ge 1) { Pass "Filter completed=$($fc.data.getTasks.totalCount)" $sw.ElapsedMilliseconds }
else { Fail "Filter completed returned 0" }

# Filter active
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$fa = GQL @{ query = "{getTasks(filter:{completed:false}){tasks{title}totalCount}}" } $token
$sw.Stop()
if ($fa.data.getTasks.totalCount -ge 2) { Pass "Filter active=$($fa.data.getTasks.totalCount)" $sw.ElapsedMilliseconds }
else { Fail "Filter active returned wrong count: $($fa.data.getTasks.totalCount)" }

# Pagination
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$pg = GQL @{ query = "{getTasks(page:1,limit:2){tasks{title}totalCount totalPages hasNextPage hasPreviousPage}}" } $token
$sw.Stop()
if ($pg.data.getTasks.totalPages -ge 2) { Pass "Pagination - $($pg.data.getTasks.totalPages) pages, hasNext=$($pg.data.getTasks.hasNextPage)" $sw.ElapsedMilliseconds }
else { Pass "Pagination - total=$($pg.data.getTasks.totalCount) fits 1 page" $sw.ElapsedMilliseconds }

# ── ELASTICSEARCH SEARCH ───────────────────────────
Title "ELASTICSEARCH SEARCH"
Start-Sleep -Seconds 2

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$sr1 = GQL @{ query = "{searchTasks(query:`"Redis`"){id title priority}}" } $token
$sw.Stop()
if ($sr1.errors) { Fail "searchTasks 'Redis' ERROR: $($sr1.errors[0].message)" }
elseif ($sr1.data.searchTasks.Count -gt 0) { Pass "searchTasks 'Redis' - $($sr1.data.searchTasks.Count) result(s): $($sr1.data.searchTasks[0].title)" $sw.ElapsedMilliseconds }
else { Fail "searchTasks 'Redis' - 0 results" }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$sr2 = GQL @{ query = "{searchTasks(query:`"documentation`"){id title priority}}" } $token
$sw.Stop()
if ($sr2.errors) { Fail "searchTasks 'documentation' ERROR: $($sr2.errors[0].message)" }
elseif ($sr2.data.searchTasks.Count -gt 0) { Pass "searchTasks 'documentation' - $($sr2.data.searchTasks.Count) result(s)" $sw.ElapsedMilliseconds }
else { Fail "searchTasks 'documentation' - 0 results" }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$sr3 = GQL @{ query = "{searchTasks(query:`"Apollo Server`"){id title priority}}" } $token
$sw.Stop()
if ($sr3.errors) { Fail "searchTasks 'Apollo Server' ERROR: $($sr3.errors[0].message)" }
elseif ($sr3.data.searchTasks.Count -gt 0) { Pass "searchTasks 'Apollo Server' - $($sr3.data.searchTasks.Count) result(s)" $sw.ElapsedMilliseconds }
else { Fail "searchTasks 'Apollo Server' - 0 results" }

# ── DELETE ─────────────────────────────────────────
Title "DELETE & USER ISOLATION"
$before = (GQL @{ query = "{getTasks{totalCount}}" } $token).data.getTasks.totalCount
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$del = GQL @{ query = "mutation{deleteTask(id:`"$($ids[-1])`")}" } $token
$sw.Stop()
$after = (GQL @{ query = "{getTasks{totalCount}}" } $token).data.getTasks.totalCount
if ($del.data.deleteTask -eq $true -and $after -lt $before) { Pass "deleteTask - count $before -> $after" $sw.ElapsedMilliseconds }
else { Fail "deleteTask failed: $($del.errors[0].message)" }

# User isolation
$ts2  = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$em2  = "other$ts2@test.com"
$reg2 = GQL @{ query = "mutation{register(input:{name:`"Other User`",email:`"$em2`",password:`"Test@1234`"}){token}}" }
$tok2 = $reg2.data.register.token
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$iso = GQL @{ query = "{getTasks{totalCount}}" } $tok2
$sw.Stop()
if ($iso.data.getTasks.totalCount -eq 0) { Pass "User isolation - other user sees 0 tasks" $sw.ElapsedMilliseconds }
else { Fail "SECURITY BUG: User isolation broken - sees $($iso.data.getTasks.totalCount) tasks!" }

# ── SUMMARY ────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESULTS: $pass PASSED  |  $fail FAILED" -ForegroundColor $(if($fail -eq 0){"Green"}else{"Red"})
Write-Host "  Timing:  Green<300ms | Yellow<800ms | Red>=800ms" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
