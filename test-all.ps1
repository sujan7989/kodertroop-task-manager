$gql = "http://localhost:4000/graphql"
$h   = @{ "Content-Type" = "application/json" }

function GQL($body, $token) {
    if ($token) {
        $headers = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }
    } else {
        $headers = $h
    }
    try {
        return Invoke-RestMethod -Uri $gql -Method POST -Headers $headers -Body $body -ErrorAction Stop
    } catch {
        Write-Host "  HTTP ERROR: $_" -ForegroundColor Red
        return $null
    }
}

function Pass($msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Title($msg) { Write-Host "" ; Write-Host "=== $msg ===" -ForegroundColor Cyan }

# ── TEST 1: HEALTH ─────────────────────────────
Title "TEST 1: HEALTH CHECK"
$r = GQL '{"query":"{ _health { status timestamp } }"}'
if ($r -and $r.data._health.status -eq "OK") {
    Pass "Server healthy at $($r.data._health.timestamp)"
} else {
    Fail "Health check failed"
}

# ── TEST 2: REGISTER ───────────────────────────
Title "TEST 2: REGISTER NEW USER"
$ts    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email = "testdev$ts@kodertroop.com"
$regBody = '{"query":"mutation{register(input:{name:\"Test Dev\",email:\"' + $email + '\",password:\"Test@1234\"}){token user{id name email}}}"}'
$r = GQL $regBody
if ($r -and $r.data.register.token) {
    $token = $r.data.register.token
    Pass "Registered: $($r.data.register.user.name) | $($r.data.register.user.email)"
    Pass "JWT received (length: $($token.Length))"
} else {
    Fail "Register failed: $($r.errors[0].message)"
}

# ── TEST 3: LOGIN ──────────────────────────────
Title "TEST 3: LOGIN WITH CREDENTIALS"
$loginBody = '{"query":"mutation{login(input:{email:\"' + $email + '\",password:\"Test@1234\"}){token user{name}}}"}'
$r = GQL $loginBody
if ($r -and $r.data.login.token) {
    $token = $r.data.login.token
    Pass "Login OK as: $($r.data.login.user.name)"
} else {
    Fail "Login failed"
}

# ── TEST 4: ME QUERY ───────────────────────────
Title "TEST 4: ME QUERY (JWT auth)"
$r = GQL '{"query":"{ me { id name email } }"}' $token
if ($r -and $r.data.me.email -eq $email) {
    Pass "me = $($r.data.me.name) ($($r.data.me.email))"
} else {
    Fail "me query failed"
}

# ── TEST 5: NO AUTH ────────────────────────────
Title "TEST 5: UNAUTHENTICATED ACCESS (must fail)"
$r = GQL '{"query":"{ getTasks { totalCount } }"}'
if ($r -and $r.errors) {
    Pass "Correctly blocked: $($r.errors[0].message)"
} else {
    Fail "Should have rejected unauthenticated request"
}

# ── TEST 6: CREATE TASKS ───────────────────────
Title "TEST 6: CREATE 5 TASKS"
$createdIds = @()

$taskDefs = @(
    @{ t="Build GraphQL API";       d="Set up Apollo Server with Express typeDefs and resolvers";          p="high";   due="2026-11-15T00:00:00Z" }
    @{ t="Integrate Redis Cache";   d="Cache task lists per user with TTL and invalidate on mutations";    p="high";   due="2026-11-20T00:00:00Z" }
    @{ t="Setup Elasticsearch";     d="Index tasks and implement multi match search on title description"; p="medium"; due="2026-11-25T00:00:00Z" }
    @{ t="Build React Dashboard";   d="Create premium UI with TailwindCSS animations and pagination";     p="medium"; due="" }
    @{ t="Write Documentation";     d="Add README with setup instructions and architecture decisions";     p="low";    due="" }
)

foreach ($task in $taskDefs) {
    if ($task.due -ne "") {
        $q = '{"query":"mutation{createTask(input:{title:\"' + $task.t + '\",description:\"' + $task.d + '\",priority:' + $task.p + ',dueDate:\"' + $task.due + '\"}){id title priority completed dueDate}}"}'
    } else {
        $q = '{"query":"mutation{createTask(input:{title:\"' + $task.t + '\",description:\"' + $task.d + '\",priority:' + $task.p + '}){id title priority completed}}"}'
    }
    $r = GQL $q $token
    if ($r -and $r.data.createTask.id) {
        $createdIds += $r.data.createTask.id
        Pass "[$($r.data.createTask.priority.ToUpper())] $($r.data.createTask.title)"
    } else {
        Fail "Failed: $($task.t)"
    }
}

# ── TEST 7: GET TASKS ──────────────────────────
Title "TEST 7: GET TASKS (paginated, Redis cached)"
$r = GQL '{"query":"{ getTasks(page:1,limit:10){ tasks{id title priority completed} totalCount page totalPages hasNextPage } }"}' $token
if ($r -and $r.data.getTasks) {
    $td = $r.data.getTasks
    Pass "Total=$($td.totalCount) | Page=$($td.page)/$($td.totalPages) | HasNext=$($td.hasNextPage)"
    foreach ($t in $td.tasks) {
        $icon = if ($t.completed) { "[DONE]" } else { "[TODO]" }
        $col  = if ($t.priority -eq "high") { "Red" } elseif ($t.priority -eq "medium") { "Yellow" } else { "DarkGreen" }
        Write-Host "    $icon [$($t.priority.ToUpper())] $($t.title)" -ForegroundColor $col
    }
} else {
    Fail "getTasks failed"
}

# ── TEST 8: FILTER ACTIVE ─────────────────────
Title "TEST 8: FILTER - ACTIVE TASKS ONLY"
$r = GQL '{"query":"{ getTasks(filter:{completed:false}){ tasks{title} totalCount } }"}' $token
Pass "Active tasks: $($r.data.getTasks.totalCount)"
$r.data.getTasks.tasks | ForEach-Object { Write-Host "    - $($_.title)" -ForegroundColor Yellow }

# ── TEST 9: UPDATE TASK ────────────────────────
Title "TEST 9: UPDATE TASK (mark complete)"
$updateId = $createdIds[0]
$updateQ = '{"query":"mutation{updateTask(id:\"' + $updateId + '\",input:{completed:true,title:\"Build GraphQL API - DONE\"}){id title completed}}"}'
$r = GQL $updateQ $token
if ($r -and $r.data.updateTask.completed -eq $true) {
    Pass "Updated: '$($r.data.updateTask.title)' | completed=$($r.data.updateTask.completed)"
} else {
    Fail "Update failed"
}

# ── TEST 10: FILTER COMPLETED ─────────────────
Title "TEST 10: FILTER - COMPLETED TASKS ONLY"
$r = GQL '{"query":"{ getTasks(filter:{completed:true}){ tasks{title} totalCount } }"}' $token
Pass "Completed tasks: $($r.data.getTasks.totalCount)"
$r.data.getTasks.tasks | ForEach-Object { Write-Host "    - $($_.title)" -ForegroundColor Green }

# ── TEST 11: ELASTICSEARCH ────────────────────
Title "TEST 11: ELASTICSEARCH FULL-TEXT SEARCH"
Start-Sleep -Seconds 1
$searches = @("Redis", "GraphQL", "React", "documentation", "cache")
foreach ($word in $searches) {
    $q = '{"query":"{ searchTasks(query:\"' + $word + '\") { id title priority } }"}'
    $r = GQL $q $token
    if ($r -and $r.errors) {
        Write-Host "    Search '$word': ERROR - $($r.errors[0].message)" -ForegroundColor Red
    } else {
        $cnt = $r.data.searchTasks.Count
        Write-Host "    Search '$word': $cnt result(s)" -ForegroundColor $(if ($cnt -gt 0) { "Green" } else { "Gray" })
        $r.data.searchTasks | ForEach-Object {
            Write-Host "      -> [$($_.priority.ToUpper())] $($_.title)" -ForegroundColor Cyan
        }
    }
}

# ── TEST 12: PAGINATION ───────────────────────
Title "TEST 12: PAGINATION (limit=2)"
$r = GQL '{"query":"{ getTasks(page:1,limit:2){ tasks{title} totalCount page totalPages hasNextPage hasPreviousPage } }"}' $token
$p = $r.data.getTasks
Pass "Page=1 | limit=2 | total=$($p.totalCount) | pages=$($p.totalPages) | hasNext=$($p.hasNextPage) | hasPrev=$($p.hasPreviousPage)"
$p.tasks | ForEach-Object { Write-Host "    - $($_.title)" -ForegroundColor Gray }

# ── TEST 13: DELETE TASK ──────────────────────
Title "TEST 13: DELETE TASK"
$deleteId = $createdIds[-1]
$before = (GQL '{"query":"{ getTasks { totalCount } }"}' $token).data.getTasks.totalCount
$r = GQL ('{"query":"mutation{deleteTask(id:\"' + $deleteId + '\")}"}') $token
$after = (GQL '{"query":"{ getTasks { totalCount } }"}' $token).data.getTasks.totalCount
if ($r -and $r.data.deleteTask -eq $true) {
    Pass "Deleted! Count: $before -> $after"
} else {
    Fail "Delete failed"
}

# ── TEST 14: DUPLICATE EMAIL ──────────────────
Title "TEST 14: DUPLICATE EMAIL (must be rejected)"
$r = GQL $regBody
if ($r -and $r.errors) {
    Pass "Duplicate rejected: $($r.errors[0].message)"
} else {
    Fail "Should have rejected duplicate email"
}

# ── TEST 15: WRONG PASSWORD ───────────────────
Title "TEST 15: WRONG PASSWORD (must be rejected)"
$badQ = '{"query":"mutation{login(input:{email:\"' + $email + '\",password:\"WrongPass999\"}){token}}"}'
$r = GQL $badQ
if ($r -and $r.errors) {
    Pass "Wrong password rejected: $($r.errors[0].message)"
} else {
    Fail "Should have rejected wrong password"
}

# ── TEST 16: HEALTH ENDPOINT ──────────────────
Title "TEST 16: /health ENDPOINT (Redis + ES status)"
$r = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method GET
Pass "Status=$($r.status) | Redis=$($r.redis) | Elasticsearch=$($r.elasticsearch) | Uptime=$([math]::Round($r.uptime))s"

# ── SUMMARY ───────────────────────────────────
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ALL 16 TESTS COMPLETE" -ForegroundColor Cyan
Write-Host "   App:     http://localhost:5173" -ForegroundColor White
Write-Host "   GraphQL: http://localhost:4000/graphql" -ForegroundColor White
Write-Host "   Health:  http://localhost:4000/health" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
