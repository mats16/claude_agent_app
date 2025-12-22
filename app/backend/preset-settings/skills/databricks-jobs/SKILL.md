---
name: databricks-jobs
description: |
  Databricks job status monitoring, run history investigation, and debugging skill. Use CLI for real-time status and system tables for historical analysis.
  Trigger examples: list jobs, job status, run history, failure cause, debug job, task error, run job, cancel job, repair run.
version: 0.0.1
---

# Databricks Jobs Skill

## Overview

Skill for Databricks job status monitoring and debugging.

- **Real-time operations**: Databricks CLI (`databricks jobs`)
- **Historical analysis**: System Tables (`system.lakeflow.*`) via SQL

## Extracting IDs from URLs

Databricks Jobs URL formats:
```
https://<databricks_host>/jobs/<job_id>
https://<databricks_host>/jobs/<job_id>/runs/<run_id>
```

**Example**: `https://e2-demo-tokyo.cloud.databricks.com/jobs/987402714328091/runs/304618225028273`
- `job_id`: 987402714328091 (job definition)
- `run_id`: 304618225028273 (execution instance)

## Investigation Flow (Failed Jobs)

### Step 1: Check Run Status

```bash
databricks jobs get-run <run_id> -o json
```

Key fields to check:
- `state.result_state` - Result (`SUCCESS`, `FAILED`, `TIMED_OUT`, `CANCELED`)
- `state.state_message` - Error message
- `tasks[]` - Status of each task

### Step 2: Identify Failed Tasks

```bash
databricks jobs get-run <run_id> -o json | jq '.tasks[] | select(.state.result_state == "FAILED") | {task_key, state}'
```

### Step 3: Get Error Details

```bash
databricks jobs get-run-output <run_id> -o json | jq '.error, .error_trace'
```

### Step 4: Check Job Definition (if needed)

```bash
databricks jobs get <job_id> -o json
```

### Step 5: Repair Run (if needed)

```bash
databricks jobs repair-run <run_id> --rerun-all-failed-tasks -o json
```

## CLI Command Reference

### Command Syntax

| Command | Argument Type | Example |
|---------|---------------|---------|
| `jobs get` | Positional | `databricks jobs get 123` |
| `jobs get-run` | Positional | `databricks jobs get-run 456` |
| `jobs get-run-output` | Positional | `databricks jobs get-run-output 456` |
| `jobs list-runs` | **Flag required** | `databricks jobs list-runs --job-id 123` |
| `jobs run-now` | Positional | `databricks jobs run-now 123` |
| `jobs cancel-run` | Positional | `databricks jobs cancel-run 456` |
| `jobs repair-run` | Positional | `databricks jobs repair-run 456 --rerun-all-failed-tasks` |

### Common Mistakes

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `databricks jobs get --job-id 123` | `databricks jobs get 123` |
| `databricks jobs get-run --run-id 456` | `databricks jobs get-run 456` |
| `databricks jobs list-runs 123` | `databricks jobs list-runs --job-id 123` |

### List and Search Jobs

```bash
# List all jobs
databricks jobs list -o json

# Search by name
databricks jobs list -o json | jq '.jobs[] | select(.settings.name | contains("keyword"))'

# Get job details
databricks jobs get <job_id> -o json
```

### Run Operations

```bash
# List runs for a specific job
databricks jobs list-runs --job-id <job_id> -o json

# Active runs only
databricks jobs list-runs --job-id <job_id> --active-only -o json

# Get run details
databricks jobs get-run <run_id> -o json

# Get run output/errors
databricks jobs get-run-output <run_id> -o json
```

### Execute, Cancel, and Repair Jobs

```bash
# Run immediately
databricks jobs run-now <job_id> -o json

# Run with parameters
databricks jobs run-now <job_id> --notebook-params '{"param1": "value1"}' -o json

# Cancel a run
databricks jobs cancel-run <run_id>

# Rerun all failed tasks
databricks jobs repair-run <run_id> --rerun-all-failed-tasks -o json

# Rerun specific tasks only
databricks jobs repair-run <run_id> --rerun-tasks '["task_key1", "task_key2"]' -o json
```

### Multi-task Job Investigation

```bash
# List task definitions
databricks jobs get <job_id> -o json | jq '.settings.tasks[] | {task_key, description}'

# Check task states in a run
databricks jobs get-run <run_id> -o json | jq '.tasks[] | {task_key, state, start_time, end_time}'

# Extract failed tasks only
databricks jobs get-run <run_id> -o json | jq '.tasks[] | select(.state.result_state == "FAILED")'
```

### Check Schedule and Triggers

```bash
# Schedule settings
databricks jobs get <job_id> -o json | jq '.settings.schedule'

# Trigger settings
databricks jobs get <job_id> -o json | jq '.settings.trigger'
```

## System Tables (Historical Analysis)

Less real-time than CLI but effective for long-term trend analysis. Data may be delayed by several hours.

### Table Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `system.lakeflow.jobs` | Job definitions | `job_id`, `name`, `creator_user_name` |
| `system.lakeflow.job_run_timeline` | Run history | `job_id`, `run_id`, `result_state`, `period_start_time` |
| `system.lakeflow.job_task_run_timeline` | Task run details | `run_id`, `task_key`, `termination_code` |

### Investigate Failed Runs

```sql
-- Failed runs in the last 24 hours
SELECT
  j.name AS job_name,
  r.job_id,
  r.run_id,
  r.result_state,
  r.termination_code,
  r.period_start_time
FROM system.lakeflow.job_run_timeline r
JOIN system.lakeflow.jobs j USING (job_id)
WHERE r.result_state IN ('FAILED', 'TIMED_OUT', 'CANCELED')
  AND r.period_start_time >= CURRENT_DATE - INTERVAL 1 DAY
ORDER BY r.period_start_time DESC;
```

### Run History for a Specific Job

```sql
SELECT
  run_id,
  result_state,
  period_start_time,
  period_end_time,
  TIMESTAMPDIFF(MINUTE, period_start_time, period_end_time) AS duration_minutes
FROM system.lakeflow.job_run_timeline
WHERE job_id = 
ORDER BY period_start_time DESC
LIMIT 20;
```

### Failure Pattern Analysis

```sql
-- Failure count by job (last 7 days)
SELECT
  j.name AS job_name,
  r.job_id,
  COUNT(DISTINCT r.run_id) AS failure_count
FROM system.lakeflow.job_run_timeline r
JOIN system.lakeflow.jobs j USING (job_id)
WHERE r.result_state = 'FAILED'
  AND r.period_start_time >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY j.name, r.job_id
ORDER BY failure_count DESC;

-- Frequently failing tasks
SELECT
  task_key,
  COUNT(*) AS failure_count
FROM system.lakeflow.job_task_run_timeline
WHERE job_id = 
  AND result_state = 'FAILED'
  AND period_start_time >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY task_key
ORDER BY failure_count DESC;
```

### Task Details

```sql
SELECT
  task_key,
  result_state,
  termination_code,
  period_start_time,
  period_end_time,
  compute_ids
FROM system.lakeflow.job_task_run_timeline
WHERE run_id = 
ORDER BY period_start_time;
```

### Duration Analysis

```sql
-- Average run duration by job (last 7 days, successful only)
SELECT
  j.name AS job_name,
  COUNT(DISTINCT r.run_id) AS run_count,
  AVG(TIMESTAMPDIFF(MINUTE, r.period_start_time, r.period_end_time)) AS avg_minutes,
  MAX(TIMESTAMPDIFF(MINUTE, r.period_start_time, r.period_end_time)) AS max_minutes
FROM system.lakeflow.job_run_timeline r
JOIN system.lakeflow.jobs j USING (job_id)
WHERE r.result_state = 'SUCCESS'
  AND r.period_start_time >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY j.name
ORDER BY avg_minutes DESC;
```

## result_state Reference

| State | Description |
|-------|-------------|
| `SUCCESS` | Completed successfully |
| `FAILED` | Failed |
| `TIMED_OUT` | Timed out |
| `CANCELED` | Canceled by user or system |
| `RUNNING` | Currently running |
| `PENDING` | Waiting to run |
| `SKIPPED` | Skipped (e.g., dependent task failed) |

## Tips

- **Real-time status**: Use CLI (`databricks jobs get-run`)
- **Historical analysis**: Use System Tables (data may be delayed by several hours)
- Combine `-o json` with `jq` to extract needed information
- Long-running jobs are split into multiple rows in `job_run_timeline` (hourly granularity)
