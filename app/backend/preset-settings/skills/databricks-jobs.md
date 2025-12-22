---
name: databricks-jobs
description: |
  Databricks job status monitoring, run history investigation, and debugging skill. Use CLI for real-time status and system tables for historical analysis.
  Trigger examples: list jobs, job status, run history, failure cause, debug job, task error, run job, cancel job, repair run.
version: 0.0.1
---

# Databricks Jobs

## Overview

Skill for Databricks job status monitoring and debugging.

**Real-time operations**: Databricks CLI (`databricks jobs`)
**Historical analysis**: System Tables (`system.lakeflow.*`) via `mcp__databricks__run_sql`

## CLI Reference

Common commands are documented below. For advanced options (pagination, filtering, output formats):
→ [Databricks Jobs CLI Reference](https://docs.databricks.com/aws/en/dev-tools/cli/reference/jobs-commands)

## Authentication

Assumes environment variables `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are set.

## Databricks CLI

### List and Get Jobs

```bash
# List all jobs
databricks jobs list -o json

# Search jobs by name
databricks jobs list -o json | jq '.jobs[] | select(.settings.name | contains("<keyword>"))'

# Get job details
databricks jobs get <job_id> -o json
```

### Check Run Status

```bash
# List runs for a specific job
databricks jobs list-runs --job-id <job_id> -o json

# Get run details (state, start/end time, parameters, etc.)
databricks jobs get-run <run_id> -o json

# List active runs
databricks jobs list-runs --job-id <job_id> --active-only -o json

# List completed runs (recent)
databricks jobs list-runs --job-id <job_id> --completed-only -o json
```

### Get Run Output and Logs

```bash
# Get task output (notebook results, error messages, etc.)
databricks jobs get-run-output <run_id> -o json

# Extract error message from output
databricks jobs get-run-output <run_id> -o json | jq '.error, .error_trace'

# Get notebook output
databricks jobs get-run-output <run_id> -o json | jq '.notebook_output'
```

### Run, Cancel, and Repair Jobs

```bash
# Run job immediately
databricks jobs run-now <job_id> -o json

# Run with parameters
databricks jobs run-now <job_id> --notebook-params '{"param1": "value1"}' -o json

# Cancel a run
databricks jobs cancel-run <run_id>

# Repair failed tasks (re-run)
databricks jobs repair-run <run_id> --rerun-all-failed-tasks -o json

# Repair specific tasks only
databricks jobs repair-run <run_id> --rerun-tasks '["task_key1", "task_key2"]' -o json
```

### Multi-task Job Task Inspection

```bash
# Get task list from job definition
databricks jobs get <job_id> -o json | jq '.settings.tasks[] | {task_key, description}'

# Check task states in a run
databricks jobs get-run <run_id> -o json | jq '.tasks[] | {task_key, state, start_time, end_time}'

# Extract failed tasks only
databricks jobs get-run <run_id> -o json | jq '.tasks[] | select(.state.result_state == "FAILED")'
```

## System Tables (Historical Analysis)

System tables are used for analyzing historical run data. Less real-time than CLI but effective for long-term trend analysis.

### Table Reference

| Table                                   | Purpose           | Key Columns                                                       |
| --------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `system.lakeflow.jobs`                  | Job definitions   | `job_id`, `name`, `creator_user_name`, `settings`                 |
| `system.lakeflow.job_run_timeline`      | Run history       | `job_id`, `run_id`, `result_state`, `period_start_time`           |
| `system.lakeflow.job_task_run_timeline` | Task run details  | `job_id`, `run_id`, `task_key`, `compute_ids`, `termination_code` |

### Query Job Definitions

```sql
-- List all jobs
SELECT job_id, name, creator_user_name, run_as_user_name
FROM system.lakeflow.jobs
ORDER BY job_id DESC;

-- Search jobs by name
SELECT job_id, name, creator_user_name
FROM system.lakeflow.jobs
WHERE name LIKE '%<keyword>%';

-- Get specific job details
SELECT *
FROM system.lakeflow.jobs
WHERE job_id = <job_id>;
```

### Analyze Run History

```sql
-- Recent run history (with job name)
SELECT
  j.name AS job_name,
  r.run_id,
  r.result_state,
  r.period_start_time,
  r.period_end_time
FROM system.lakeflow.job_run_timeline r
JOIN system.lakeflow.jobs j USING (job_id)
WHERE r.period_start_time >= CURRENT_DATE - INTERVAL 1 DAY
ORDER BY r.period_start_time DESC
LIMIT 50;

-- Run history for a specific job
SELECT
  run_id,
  result_state,
  period_start_time,
  period_end_time,
  TIMESTAMPDIFF(MINUTE, period_start_time, period_end_time) AS duration_minutes
FROM system.lakeflow.job_run_timeline
WHERE job_id = <job_id>
ORDER BY period_start_time DESC
LIMIT 20;
```

### Investigate Failed Jobs

```sql
-- Failed jobs in the last 24 hours
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
```

### Task-Level Investigation

```sql
-- Task details for a specific run
SELECT
  task_key,
  result_state,
  termination_code,
  period_start_time,
  period_end_time,
  compute_ids
FROM system.lakeflow.job_task_run_timeline
WHERE run_id = <run_id>
ORDER BY period_start_time;

-- Failed task details
SELECT
  j.name AS job_name,
  t.run_id,
  t.task_key,
  t.termination_code,
  t.period_start_time
FROM system.lakeflow.job_task_run_timeline t
JOIN system.lakeflow.jobs j USING (job_id)
WHERE t.result_state = 'FAILED'
  AND t.period_start_time >= CURRENT_DATE - INTERVAL 1 DAY
ORDER BY t.period_start_time DESC;
```

### Duration Analysis

```sql
-- Average run duration by job (last 7 days)
SELECT
  j.name AS job_name,
  r.job_id,
  COUNT(DISTINCT r.run_id) AS run_count,
  AVG(TIMESTAMPDIFF(MINUTE, r.period_start_time, r.period_end_time)) AS avg_duration_minutes,
  MAX(TIMESTAMPDIFF(MINUTE, r.period_start_time, r.period_end_time)) AS max_duration_minutes
FROM system.lakeflow.job_run_timeline r
JOIN system.lakeflow.jobs j USING (job_id)
WHERE r.result_state = 'SUCCESS'
  AND r.period_start_time >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY j.name, r.job_id
ORDER BY avg_duration_minutes DESC;

-- Identify long-running jobs (over 1 hour)
SELECT
  j.name AS job_name,
  r.run_id,
  r.period_start_time,
  TIMESTAMPDIFF(MINUTE, r.period_start_time, r.period_end_time) AS duration_minutes
FROM system.lakeflow.job_run_timeline r
JOIN system.lakeflow.jobs j USING (job_id)
WHERE TIMESTAMPDIFF(MINUTE, r.period_start_time, r.period_end_time) > 60
  AND r.period_start_time >= CURRENT_DATE - INTERVAL 7 DAYS
ORDER BY duration_minutes DESC;
```

### Cost Analysis Integration

```sql
-- DBU consumption by job (join with billing table)
SELECT
  j.name AS job_name,
  u.usage_metadata.job_id,
  SUM(u.usage_quantity) AS total_dbu
FROM system.billing.usage u
JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_metadata.job_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY j.name, u.usage_metadata.job_id
ORDER BY total_dbu DESC;
```

## Troubleshooting

### 1. Job Failed

```bash
# 1. Get run details
databricks runs get <run_id> -o json

# 2. Check error output
databricks runs get-output <run_id> -o json | jq '.error, .error_trace'

# 3. Identify failed tasks
databricks runs get <run_id> -o json | jq '.tasks[] | select(.state.result_state == "FAILED") | {task_key, state}'

# 4. Repair if needed
databricks runs repair <run_id> --rerun-all-failed-tasks -o json
```

### 2. Job Hanging (Running Too Long)

```bash
# Check run state
databricks jobs get-run <run_id> -o json | jq '{state: .state, start_time, run_page_url}'

# Check task states
databricks jobs get-run <run_id> -o json | jq '.tasks[] | {task_key, state}'

# Cancel if needed
databricks jobs cancel-run <run_id>
```

### 3. Analyze Past Failure Patterns

```sql
-- Past failures for the same job
SELECT
  run_id,
  result_state,
  termination_code,
  period_start_time
FROM system.lakeflow.job_run_timeline
WHERE job_id = <job_id>
  AND result_state = 'FAILED'
ORDER BY period_start_time DESC
LIMIT 10;

-- Identify frequently failing tasks
SELECT
  task_key,
  COUNT(*) AS failure_count
FROM system.lakeflow.job_task_run_timeline
WHERE job_id = <job_id>
  AND result_state = 'FAILED'
  AND period_start_time >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY task_key
ORDER BY failure_count DESC;
```

### 4. Check Job Schedule

```bash
# Check job schedule settings
databricks jobs get <job_id> -o json | jq '.settings.schedule'

# Check trigger settings
databricks jobs get <job_id> -o json | jq '.settings.trigger'
```

## result_state Reference

| State        | Description                              |
| ------------ | ---------------------------------------- |
| `SUCCESS`    | Completed successfully                   |
| `FAILED`     | Failed                                   |
| `TIMED_OUT`  | Timed out                                |
| `CANCELED`   | Canceled by user or system               |
| `PENDING`    | Waiting to run (resource pending)        |
| `RUNNING`    | Currently running                        |
| `TERMINATING`| Terminating                              |
| `SKIPPED`    | Skipped (e.g., dependent task failed)    |

## Tips

- **Real-time status**: Use CLI (`databricks runs get`)
- **Historical analysis**: Use system tables (`system.lakeflow.*`)
- System tables are not real-time; data may be delayed by several hours
- Long-running jobs are split into multiple rows in `job_run_timeline` (hourly granularity)
- Combine `-o json` with `jq` to extract needed information
