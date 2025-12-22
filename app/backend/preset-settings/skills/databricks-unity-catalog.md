---
name: databricks-unity-catalog
description: |
  Unity Catalog metadata inspection, data exploration, and permission management skill. Uses SQL (MCP) to explore catalogs, schemas, tables, volumes, and functions. Essential for troubleshooting table not found errors, permission issues, data lineage, and data quality investigations.
  Trigger examples: list catalogs, show tables, describe table, check permissions, grant access, table not found, access denied, explore schema, data lineage, table history.
version: 0.0.1
---

# Databricks Unity Catalog

## Overview

Skill for Unity Catalog metadata inspection, data exploration, and permission management.

**Primary tool**: SQL via `mcp__databricks__run_sql`
**Fallback**: Databricks CLI (when SQL is insufficient)

## Catalogs

```sql
-- List all catalogs
SHOW CATALOGS;

-- List catalogs matching a pattern
SHOW CATALOGS LIKE 'prod*';

-- Show catalog metadata (name, comment, owner)
DESCRIBE CATALOG <catalog_name>;

-- Show extended catalog properties
DESCRIBE CATALOG EXTENDED <catalog_name>;

-- Show current catalog
SELECT current_catalog();
```

## Schemas

```sql
-- List all schemas in a catalog
SHOW SCHEMAS IN <catalog_name>;

-- List schemas matching a pattern
SHOW SCHEMAS IN <catalog_name> LIKE 'sales*';

-- Describe schema (name, description, location)
DESCRIBE SCHEMA <catalog_name>.<schema_name>;

-- Describe schema with extended properties
DESCRIBE SCHEMA EXTENDED <catalog_name>.<schema_name>;

-- Show current schema
SELECT current_schema();

-- Set current catalog and schema
USE CATALOG <catalog_name>;
USE SCHEMA <schema_name>;
-- Or combined:
USE <catalog_name>.<schema_name>;
```

## Tables

### Listing Tables

```sql
-- List all tables in a schema
SHOW TABLES IN <catalog_name>.<schema_name>;

-- List tables matching a pattern
SHOW TABLES IN <catalog_name>.<schema_name> LIKE 'customer*';

-- Show extended table information
SHOW TABLE EXTENDED IN <catalog_name>.<schema_name> LIKE '<table_name>';
```

### Describing Tables

```sql
-- Show column definitions
DESCRIBE TABLE <catalog_name>.<schema_name>.<table_name>;

-- Show extended metadata (owner, created time, location, etc.)
DESCRIBE TABLE EXTENDED <catalog_name>.<schema_name>.<table_name>;

-- Show Delta table details (size, partitions, files, etc.)
DESCRIBE DETAIL <catalog_name>.<schema_name>.<table_name>;

-- Show table history (operations, timestamps, versions)
-- History is retained for 30 days
DESCRIBE HISTORY <catalog_name>.<schema_name>.<table_name>;

-- Show table properties
SHOW TBLPROPERTIES <catalog_name>.<schema_name>.<table_name>;

-- Show create statement
SHOW CREATE TABLE <catalog_name>.<schema_name>.<table_name>;
```

### Table Statistics and Sampling

```sql
-- Get row count
SELECT COUNT(*) FROM <catalog_name>.<schema_name>.<table_name>;

-- Sample data (first N rows)
SELECT * FROM <catalog_name>.<schema_name>.<table_name> LIMIT 10;

-- Random sample (1% of data)
SELECT * FROM <catalog_name>.<schema_name>.<table_name> TABLESAMPLE (1 PERCENT);

-- Column statistics
ANALYZE TABLE <catalog_name>.<schema_name>.<table_name> COMPUTE STATISTICS FOR ALL COLUMNS;
```

## Views

```sql
-- List all views in a schema
SHOW VIEWS IN <catalog_name>.<schema_name>;

-- List views matching a pattern
SHOW VIEWS IN <catalog_name>.<schema_name> LIKE 'v_*';

-- Show view definition
SHOW CREATE TABLE <catalog_name>.<schema_name>.<view_name>;
```

## Volumes

```sql
-- List all volumes in a schema
SHOW VOLUMES IN <catalog_name>.<schema_name>;

-- Describe volume details
DESCRIBE VOLUME <catalog_name>.<schema_name>.<volume_name>;

-- List files in a volume (using Python/SQL function)
-- Note: Direct file listing requires Databricks CLI or notebooks
```

### Volume Operations via CLI

```bash
# List volumes
databricks volumes list --catalog-name <catalog> --schema-name <schema> -o json

# Read volume details
databricks volumes read <catalog>.<schema>.<volume> -o json

# List files in volume
databricks fs ls /Volumes/<catalog>/<schema>/<volume>/ -o json
```

## Functions

```sql
-- List all functions in a schema
SHOW FUNCTIONS IN <catalog_name>.<schema_name>;

-- List user-defined functions only
SHOW USER FUNCTIONS IN <catalog_name>.<schema_name>;

-- Describe function
DESCRIBE FUNCTION <catalog_name>.<schema_name>.<function_name>;

-- Describe function with extended details
DESCRIBE FUNCTION EXTENDED <catalog_name>.<schema_name>.<function_name>;
```

## Permissions and Grants

### Viewing Permissions

```sql
-- Show grants on a catalog
SHOW GRANTS ON CATALOG <catalog_name>;

-- Show grants on a schema
SHOW GRANTS ON SCHEMA <catalog_name>.<schema_name>;

-- Show grants on a table
SHOW GRANTS ON TABLE <catalog_name>.<schema_name>.<table_name>;

-- Show grants on a view
SHOW GRANTS ON VIEW <catalog_name>.<schema_name>.<view_name>;

-- Show grants on a volume
SHOW GRANTS ON VOLUME <catalog_name>.<schema_name>.<volume_name>;

-- Show grants on a function
SHOW GRANTS ON FUNCTION <catalog_name>.<schema_name>.<function_name>;

-- Show grants to a specific principal
SHOW GRANTS TO `user@example.com`;
SHOW GRANTS TO `group_name`;
```

### Granting Permissions

```sql
-- Grant catalog-level permissions
GRANT USE CATALOG ON CATALOG <catalog_name> TO `user@example.com`;
GRANT CREATE SCHEMA ON CATALOG <catalog_name> TO `user@example.com`;

-- Grant schema-level permissions
GRANT USE SCHEMA ON SCHEMA <catalog_name>.<schema_name> TO `user@example.com`;
GRANT CREATE TABLE ON SCHEMA <catalog_name>.<schema_name> TO `user@example.com`;

-- Grant table-level permissions
GRANT SELECT ON TABLE <catalog_name>.<schema_name>.<table_name> TO `user@example.com`;
GRANT MODIFY ON TABLE <catalog_name>.<schema_name>.<table_name> TO `user@example.com`;

-- Grant all privileges
GRANT ALL PRIVILEGES ON TABLE <catalog_name>.<schema_name>.<table_name> TO `user@example.com`;

-- Grant to a group
GRANT SELECT ON TABLE <catalog_name>.<schema_name>.<table_name> TO `data_analysts`;
```

### Revoking Permissions

```sql
-- Revoke permissions
REVOKE SELECT ON TABLE <catalog_name>.<schema_name>.<table_name> FROM `user@example.com`;

-- Revoke all privileges
REVOKE ALL PRIVILEGES ON TABLE <catalog_name>.<schema_name>.<table_name> FROM `user@example.com`;
```

### Permission Hierarchy

```
CATALOG (USE CATALOG, CREATE SCHEMA)
  └── SCHEMA (USE SCHEMA, CREATE TABLE, CREATE FUNCTION, CREATE VOLUME)
        ├── TABLE (SELECT, MODIFY, ALL PRIVILEGES)
        ├── VIEW (SELECT)
        ├── VOLUME (READ VOLUME, WRITE VOLUME)
        └── FUNCTION (EXECUTE)
```

**Note**: To access a table, users need:

1. `USE CATALOG` on the catalog
2. `USE SCHEMA` on the schema
3. `SELECT` (or other) on the table

## Ownership

```sql
-- Show owner of a table
DESCRIBE TABLE EXTENDED <catalog_name>.<schema_name>.<table_name>;
-- Look for "Owner" in the output

-- Transfer ownership
ALTER TABLE <catalog_name>.<schema_name>.<table_name> SET OWNER TO `new_owner@example.com`;
ALTER SCHEMA <catalog_name>.<schema_name> SET OWNER TO `new_owner@example.com`;
ALTER CATALOG <catalog_name> SET OWNER TO `new_owner@example.com`;
```

## Delta Table Operations

### Time Travel

```sql
-- Query a specific version
SELECT * FROM <catalog_name>.<schema_name>.<table_name> VERSION AS OF 5;

-- Query at a specific timestamp
SELECT * FROM <catalog_name>.<schema_name>.<table_name> TIMESTAMP AS OF '2024-01-15 10:00:00';

-- Compare two versions
SELECT * FROM <catalog_name>.<schema_name>.<table_name> VERSION AS OF 5
EXCEPT
SELECT * FROM <catalog_name>.<schema_name>.<table_name> VERSION AS OF 4;
```

### Table Maintenance

```sql
-- Optimize table (compact small files)
OPTIMIZE <catalog_name>.<schema_name>.<table_name>;

-- Optimize with Z-ordering
OPTIMIZE <catalog_name>.<schema_name>.<table_name> ZORDER BY (column1, column2);

-- Vacuum old files (default 7 days retention)
VACUUM <catalog_name>.<schema_name>.<table_name>;

-- Vacuum with custom retention (hours)
VACUUM <catalog_name>.<schema_name>.<table_name> RETAIN 168 HOURS;

-- Analyze table for statistics
ANALYZE TABLE <catalog_name>.<schema_name>.<table_name> COMPUTE STATISTICS;
```

## Troubleshooting

### Table Not Found

```sql
-- 1. Check if catalog exists
SHOW CATALOGS LIKE '<catalog_name>';

-- 2. Check if schema exists
SHOW SCHEMAS IN <catalog_name> LIKE '<schema_name>';

-- 3. Check if table exists
SHOW TABLES IN <catalog_name>.<schema_name> LIKE '<table_name>';

-- 4. Check for typos (search with pattern)
SHOW TABLES IN <catalog_name>.<schema_name> LIKE '%<partial_name>%';

-- 5. Check current catalog/schema context
SELECT current_catalog(), current_schema();
```

### Access Denied / Permission Errors

```sql
-- 1. Check your current user
SELECT current_user();

-- 2. Check grants on the object
SHOW GRANTS ON TABLE <catalog_name>.<schema_name>.<table_name>;

-- 3. Check if you have catalog access
SHOW GRANTS ON CATALOG <catalog_name>;

-- 4. Check if you have schema access
SHOW GRANTS ON SCHEMA <catalog_name>.<schema_name>;

-- 5. Check grants to your user specifically
SHOW GRANTS TO `your_email@example.com`;

-- Required permissions for SELECT:
-- - USE CATALOG on catalog
-- - USE SCHEMA on schema
-- - SELECT on table
```

### Data Quality Investigation

```sql
-- Check for NULL values in key columns
SELECT
  COUNT(*) AS total_rows,
  COUNT(column_name) AS non_null_count,
  COUNT(*) - COUNT(column_name) AS null_count
FROM <catalog_name>.<schema_name>.<table_name>;

-- Check for duplicates
SELECT column_name, COUNT(*) as cnt
FROM <catalog_name>.<schema_name>.<table_name>
GROUP BY column_name
HAVING COUNT(*) > 1;

-- Get distinct value counts
SELECT COUNT(DISTINCT column_name) AS distinct_count
FROM <catalog_name>.<schema_name>.<table_name>;

-- Value distribution
SELECT column_name, COUNT(*) AS cnt
FROM <catalog_name>.<schema_name>.<table_name>
GROUP BY column_name
ORDER BY cnt DESC
LIMIT 20;

-- Min/Max/Avg for numeric columns
SELECT
  MIN(numeric_column) AS min_val,
  MAX(numeric_column) AS max_val,
  AVG(numeric_column) AS avg_val
FROM <catalog_name>.<schema_name>.<table_name>;
```

### Recent Changes Investigation

```sql
-- Check table history for recent operations
DESCRIBE HISTORY <catalog_name>.<schema_name>.<table_name>;

-- Check who modified the table recently (from history)
SELECT
  version,
  timestamp,
  userId,
  userName,
  operation,
  operationParameters
FROM (DESCRIBE HISTORY <catalog_name>.<schema_name>.<table_name>)
ORDER BY version DESC
LIMIT 10;
```

## Information Schema Queries

```sql
-- List all tables with metadata
SELECT *
FROM <catalog_name>.information_schema.tables
WHERE table_schema = '<schema_name>';

-- List all columns for a table
SELECT *
FROM <catalog_name>.information_schema.columns
WHERE table_schema = '<schema_name>'
  AND table_name = '<table_name>'
ORDER BY ordinal_position;

-- Find tables containing a specific column name
SELECT table_catalog, table_schema, table_name, column_name
FROM <catalog_name>.information_schema.columns
WHERE column_name LIKE '%customer%';

-- List all table constraints
SELECT *
FROM <catalog_name>.information_schema.table_constraints
WHERE table_schema = '<schema_name>';
```

## Cross-Catalog Queries

```sql
-- Query tables from different catalogs
SELECT a.*, b.*
FROM catalog1.schema1.table1 a
JOIN catalog2.schema2.table2 b
  ON a.id = b.id;

-- Create view spanning multiple catalogs
CREATE VIEW my_catalog.my_schema.combined_view AS
SELECT * FROM catalog1.schema1.table1
UNION ALL
SELECT * FROM catalog2.schema2.table2;
```

## Databricks CLI Fallback

Use CLI when SQL cannot perform the operation:

```bash
# Get detailed table info as JSON
databricks tables get <catalog>.<schema>.<table> -o json

# List table with all metadata
databricks tables list --catalog-name <catalog> --schema-name <schema> -o json

# Get lineage information (API)
curl -X GET "${DATABRICKS_HOST}/api/2.1/unity-catalog/lineage/table-lineage" \
  -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  -d '{"table_name": "<catalog>.<schema>.<table>"}'
```

## Tips

- Always use fully qualified names: `<catalog>.<schema>.<table>`
- Use `LIKE` patterns for fuzzy searching: `'%pattern%'`
- Check permission hierarchy when debugging access issues
- Use `DESCRIBE HISTORY` to investigate recent data changes
- For complex permission issues, check grants at all levels (catalog → schema → table)
