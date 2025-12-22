---
name: databricks-billing
description: |
  Databricks billing data analysis and cost calculation. Analyze DBU usage, SKU costs, workspace/job/warehouse expenses using system.billing tables.
  Trigger examples: cost analysis, billing report, DBU usage, SKU costs, monthly expenses, job costs, warehouse costs, spending breakdown
version: 0.0.1
---

## Overview

Analyze Databricks billing data using the `system.billing` schema tables. Execute SQL queries via `mcp__databricks__run_sql` to calculate costs, track usage, and generate billing reports.

**Primary tables:**

- `system.billing.usage` - DBU consumption records
- `system.billing.list_prices` - SKU pricing information

## Table Schemas

### system.billing.usage

| Column | Type | Description |
|--------|------|-------------|
| `record_id` | STRING | Unique record identifier |
| `account_id` | STRING | Databricks account ID |
| `workspace_id` | STRING | Workspace ID |
| `sku_name` | STRING | SKU identifier (e.g., `JOBS_COMPUTE`, `SQL_COMPUTE`) |
| `cloud` | STRING | Cloud provider (`AWS`, `AZURE`, `GCP`) |
| `usage_start_time` | TIMESTAMP | Usage period start |
| `usage_end_time` | TIMESTAMP | Usage period end |
| `usage_date` | DATE | Usage date (for daily aggregation) |
| `usage_unit` | STRING | Unit of measure (typically `DBU`) |
| `usage_quantity` | DECIMAL | Amount consumed |
| `record_type` | STRING | `ORIGINAL`, `RETRACTION`, or `RESTATEMENT` |
| `ingestion_date` | DATE | When record was ingested |
| `billing_origin_product` | STRING | Product category |
| `usage_metadata` | STRUCT | Detailed usage context (see below) |

**usage_metadata fields:**

| Field | Description |
|-------|-------------|
| `workspace_id` | Workspace where usage occurred |
| `cluster_id` | Cluster ID (for compute usage) |
| `warehouse_id` | SQL Warehouse ID |
| `instance_pool_id` | Instance pool ID |
| `node_type` | Node type used |
| `job_id` | Job ID |
| `job_run_id` | Job run ID |
| `job_name` | Job name |
| `notebook_id` | Notebook ID |
| `dlt_pipeline_id` | DLT pipeline ID |
| `dlt_update_id` | DLT update ID |
| `run_name` | Run name |
| `endpoint_name` | Model serving endpoint name |
| `endpoint_id` | Model serving endpoint ID |
| `central_clean_room_id` | Clean room ID |

### system.billing.list_prices

| Column | Type | Description |
|--------|------|-------------|
| `sku_name` | STRING | SKU identifier |
| `cloud` | STRING | Cloud provider |
| `currency_code` | STRING | Currency (e.g., `USD`, `JPY`) |
| `usage_unit` | STRING | Unit of measure |
| `pricing` | STRUCT | Price details |
| `pricing.default` | DECIMAL | Default price per unit |
| `price_start_time` | TIMESTAMP | Price effective start |
| `price_end_time` | TIMESTAMP | Price effective end (NULL if current) |

## Cost Calculation Fundamentals

### Price Table with BROADCAST JOIN

Use a CTE to prepare the price table with `COALESCE` for `price_end_time`, then apply `BROADCAST` hint for efficient join:

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_date,
  u.sku_name,
  u.usage_quantity AS dbu,
  p.pricing.default AS unit_price,
  u.usage_quantity * p.pricing.default AS cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
```

### Handling Correction Records

Billing data may contain corrections:

- `ORIGINAL` - Initial usage record
- `RETRACTION` - Cancels a previous record (negative quantity)
- `RESTATEMENT` - Corrected record replacing retracted one

For accurate totals, include all record types and filter zero-sum corrections:

```sql
SELECT
  sku_name,
  SUM(usage_quantity) AS net_dbu
FROM system.billing.usage
WHERE usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY sku_name
HAVING SUM(usage_quantity) != 0
```

## Query Patterns

### Monthly Cost by SKU

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  DATE_TRUNC('month', u.usage_date) AS month,
  u.sku_name,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL 3 MONTHS
GROUP BY ALL
HAVING SUM(u.usage_quantity) != 0
ORDER BY month DESC, total_cost DESC
```

### Daily Cost Trend

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_date,
  SUM(u.usage_quantity) AS daily_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS daily_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY u.usage_date
ORDER BY u.usage_date
```

### Workspace Cost Breakdown

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.workspace_id,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY u.workspace_id
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
```

### Job Cost Analysis

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_metadata.job_id,
  u.usage_metadata.job_name,
  u.sku_name,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_metadata.job_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY ALL
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
LIMIT 20
```

### SQL Warehouse Cost Analysis

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_metadata.warehouse_id,
  w.name AS warehouse_name,
  u.sku_name,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
LEFT JOIN system.compute.warehouses w
  ON u.usage_metadata.warehouse_id = w.warehouse_id
WHERE u.usage_metadata.warehouse_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY ALL
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
```

### Cluster Cost Analysis

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_metadata.cluster_id,
  c.cluster_name,
  u.sku_name,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
LEFT JOIN system.compute.clusters c
  ON u.usage_metadata.cluster_id = c.cluster_id
WHERE u.usage_metadata.cluster_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY ALL
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
LIMIT 20
```

### Model Serving Cost

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_metadata.endpoint_name,
  u.usage_metadata.endpoint_id,
  u.sku_name,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_metadata.endpoint_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY ALL
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
```

### DLT Pipeline Cost

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_metadata.dlt_pipeline_id,
  SUM(u.usage_quantity) AS total_dbu,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_metadata.dlt_pipeline_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY u.usage_metadata.dlt_pipeline_id
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
```

## Advanced Analysis

### Month-over-Month Comparison

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
),
monthly AS (
  SELECT
    DATE_TRUNC('month', u.usage_date) AS month,
    SUM(u.usage_quantity * p.pricing.default) AS total_cost
  FROM system.billing.usage u
  LEFT JOIN prices p /*+ BROADCAST(p) */
    ON u.sku_name = p.sku_name
    AND u.usage_unit = p.usage_unit
    AND u.usage_date >= p.price_start_date
    AND u.usage_date < p.price_end_date
  WHERE u.usage_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL 2 MONTHS
  GROUP BY month
)
SELECT
  month,
  total_cost,
  LAG(total_cost) OVER (ORDER BY month) AS prev_month_cost,
  total_cost - LAG(total_cost) OVER (ORDER BY month) AS cost_change,
  ROUND((total_cost - LAG(total_cost) OVER (ORDER BY month))
    / LAG(total_cost) OVER (ORDER BY month) * 100, 2) AS pct_change
FROM monthly
ORDER BY month
```

### Top Cost Contributors (Jobs)

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
)
SELECT
  u.usage_metadata.job_id,
  u.usage_metadata.job_name,
  SUM(u.usage_quantity * p.pricing.default) AS total_cost,
  ROUND(SUM(u.usage_quantity * p.pricing.default) * 100.0 /
    SUM(SUM(u.usage_quantity * p.pricing.default)) OVER (), 2) AS pct_of_total
FROM system.billing.usage u
LEFT JOIN prices p /*+ BROADCAST(p) */
  ON u.sku_name = p.sku_name
  AND u.usage_unit = p.usage_unit
  AND u.usage_date >= p.price_start_date
  AND u.usage_date < p.price_end_date
WHERE u.usage_metadata.job_id IS NOT NULL
  AND u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY ALL
HAVING SUM(u.usage_quantity) != 0
ORDER BY total_cost DESC
LIMIT 10
```

### Cost Anomaly Detection (Daily Spike)

```sql
WITH prices AS (
  SELECT
    sku_name,
    usage_unit,
    pricing,
    DATE(price_start_time) AS price_start_date,
    DATE(COALESCE(price_end_time, '9999-12-31')) AS price_end_date
  FROM system.billing.list_prices
),
daily_costs AS (
  SELECT
    u.usage_date,
    SUM(u.usage_quantity * p.pricing.default) AS daily_cost
  FROM system.billing.usage u
  LEFT JOIN prices p /*+ BROADCAST(p) */
    ON u.sku_name = p.sku_name
    AND u.usage_unit = p.usage_unit
    AND u.usage_date >= p.price_start_date
    AND u.usage_date < p.price_end_date
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  GROUP BY u.usage_date
),
stats AS (
  SELECT
    AVG(daily_cost) AS avg_cost,
    STDDEV(daily_cost) AS stddev_cost
  FROM daily_costs
)
SELECT
  d.usage_date,
  d.daily_cost,
  s.avg_cost,
  ROUND((d.daily_cost - s.avg_cost) / s.stddev_cost, 2) AS z_score
FROM daily_costs d
CROSS JOIN stats s
WHERE ABS((d.daily_cost - s.avg_cost) / s.stddev_cost) > 2
ORDER BY d.usage_date DESC
```

### SKU Price History

```sql
SELECT
  sku_name,
  usage_unit,
  pricing.default AS price,
  price_start_time,
  price_end_time,
  currency_code
FROM system.billing.list_prices
ORDER BY sku_name, price_start_time DESC
```

## Notes & Limitations

1. **Data Latency**: Billing data is not real-time. Records are updated throughout the day with some delay.

2. **Price Changes**: SKU prices can change over time. Always use time-aware joins to get accurate cost calculations.

3. **Correction Records**: `RETRACTION` and `RESTATEMENT` records handle billing corrections. Use `HAVING SUM(usage_quantity) != 0` to filter zero-sum corrections.

4. **Interactive Cluster Attribution**: When multiple workloads share an interactive cluster, usage cannot be accurately attributed to individual users/notebooks.

5. **Cross-Region Data**: Most billing tables are regional. You can only see usage from workspaces in the same region.

6. **Currency**: Prices are in the account's billing currency. Check `currency_code` in `list_prices`.

## Permissions

Access to `system.billing` requires:

```sql
GRANT USE CATALOG ON CATALOG system TO <principal>;
GRANT USE SCHEMA ON SCHEMA system.billing TO <principal>;
GRANT SELECT ON SCHEMA system.billing TO <principal>;
```

## Schema Discovery

To explore available columns:

```sql
DESCRIBE EXTENDED system.billing.usage;
DESCRIBE EXTENDED system.billing.list_prices;
```
