# Unity Catalog Lineage

Data lineage tracking, change analysis, and impact investigation.

## Table of Contents

- [Lineage System Tables](#lineage-system-tables)
- [Column Lineage](#column-lineage)
- [Table Dependencies](#table-dependencies)
- [Impact Analysis](#impact-analysis)
- [Lineage via CLI/API](#lineage-via-cliapi)

## Lineage System Tables

Unity Catalog tracks lineage in system tables (requires Unity Catalog with lineage enabled):

| Table | Description |
|-------|-------------|
| `system.access.table_lineage` | Table-level lineage |
| `system.access.column_lineage` | Column-level lineage |

### Table Lineage Query

```sql
-- Upstream tables (sources)
SELECT
  source_table_full_name,
  target_table_full_name,
  event_time
FROM system.access.table_lineage
WHERE target_table_full_name = '<catalog>.<schema>.<table>'
ORDER BY event_time DESC
LIMIT 50;

-- Downstream tables (consumers)
SELECT
  source_table_full_name,
  target_table_full_name,
  event_time
FROM system.access.table_lineage
WHERE source_table_full_name = '<catalog>.<schema>.<table>'
ORDER BY event_time DESC
LIMIT 50;
```

## Column Lineage

Track data flow at the column level:

```sql
-- Source columns for a target column
SELECT
  source_table_full_name,
  source_column_name,
  target_table_full_name,
  target_column_name,
  event_time
FROM system.access.column_lineage
WHERE target_table_full_name = '<catalog>.<schema>.<table>'
  AND target_column_name = '<column_name>'
ORDER BY event_time DESC;

-- All columns flowing into a table
SELECT DISTINCT
  source_table_full_name,
  source_column_name,
  target_column_name
FROM system.access.column_lineage
WHERE target_table_full_name = '<catalog>.<schema>.<table>'
ORDER BY target_column_name, source_table_full_name;
```

## Table Dependencies

### Find All Dependencies

```sql
-- All tables this table depends on (recursive CTE)
WITH RECURSIVE deps AS (
  -- Direct dependencies
  SELECT DISTINCT
    source_table_full_name AS table_name,
    1 AS depth
  FROM system.access.table_lineage
  WHERE target_table_full_name = '<catalog>.<schema>.<table>'

  UNION ALL

  -- Indirect dependencies
  SELECT DISTINCT
    l.source_table_full_name,
    d.depth + 1
  FROM system.access.table_lineage l
  JOIN deps d ON l.target_table_full_name = d.table_name
  WHERE d.depth < 5  -- Limit depth
)
SELECT DISTINCT table_name, MIN(depth) AS min_depth
FROM deps
GROUP BY table_name
ORDER BY min_depth, table_name;
```

### View Dependencies

```sql
-- Get view definition to identify dependencies
SHOW CREATE TABLE <catalog>.<schema>.<view_name>;

-- Extract referenced tables from view
-- (Manual inspection of view SQL required)
```

## Impact Analysis

### Tables Affected by Changes

```sql
-- Find all tables that would be affected if source table changes
WITH RECURSIVE impact AS (
  -- Direct dependents
  SELECT DISTINCT
    target_table_full_name AS table_name,
    1 AS depth
  FROM system.access.table_lineage
  WHERE source_table_full_name = '<catalog>.<schema>.<table>'

  UNION ALL

  -- Indirect dependents
  SELECT DISTINCT
    l.target_table_full_name,
    i.depth + 1
  FROM system.access.table_lineage l
  JOIN impact i ON l.source_table_full_name = i.table_name
  WHERE i.depth < 5
)
SELECT DISTINCT table_name, MIN(depth) AS min_depth
FROM impact
GROUP BY table_name
ORDER BY min_depth, table_name;
```

### Column Impact

```sql
-- Find all columns affected by a source column change
SELECT DISTINCT
  target_table_full_name,
  target_column_name
FROM system.access.column_lineage
WHERE source_table_full_name = '<catalog>.<schema>.<table>'
  AND source_column_name = '<column_name>'
ORDER BY target_table_full_name;
```

## Lineage via CLI/API

For programmatic lineage access when system tables are unavailable:

### Table Lineage API

```bash
# Get table lineage (upstream and downstream)
curl -X GET "${DATABRICKS_HOST}/api/2.1/unity-catalog/lineage/table-lineage" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "<catalog>.<schema>.<table>",
    "include_entity_lineage": true
  }'
```

### Column Lineage API

```bash
# Get column lineage
curl -X GET "${DATABRICKS_HOST}/api/2.1/unity-catalog/lineage/column-lineage" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "<catalog>.<schema>.<table>",
    "column_name": "<column_name>"
  }'
```

### CLI Alternative

```bash
# List tables (includes lineage metadata)
databricks tables get <catalog>.<schema>.<table> -o json

# The response includes table properties that may contain lineage hints
```

## Change Data Feed

Track row-level changes (if enabled on table):

```sql
-- Enable change data feed
ALTER TABLE <catalog>.<schema>.<table> SET TBLPROPERTIES (delta.enableChangeDataFeed = true);

-- Read changes between versions
SELECT *
FROM table_changes('<catalog>.<schema>.<table>', <start_version>, <end_version>);

-- Read changes since timestamp
SELECT *
FROM table_changes('<catalog>.<schema>.<table>', '<start_timestamp>', '<end_timestamp>');

-- Change types: insert, update_preimage, update_postimage, delete
SELECT _change_type, COUNT(*)
FROM table_changes('<catalog>.<schema>.<table>', <start_version>)
GROUP BY _change_type;
```

## Data Freshness Tracking

```sql
-- Table modification history
SELECT
  version,
  timestamp,
  operation,
  operationMetrics.numOutputRows AS rows_affected
FROM (DESCRIBE HISTORY <catalog>.<schema>.<table>)
ORDER BY version DESC
LIMIT 10;

-- Last update time
SELECT MAX(timestamp) AS last_modified
FROM (DESCRIBE HISTORY <catalog>.<schema>.<table>)
WHERE operation IN ('WRITE', 'MERGE', 'UPDATE', 'DELETE');
```
