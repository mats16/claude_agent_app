---
name: databricks-unity-catalog
version: 1.0.0
description: |
  Unity Catalog metadata inspection, data exploration, and permission management.
  Triggers: list catalogs, show tables, describe table, check permissions, grant access, table not found, access denied, explore schema, data lineage, table history, data quality.
  Uses mcp__databricks__run_sql for SQL queries. CLI fallback for operations SQL cannot perform.
---

# Databricks Unity Catalog

## Quick Reference

| Operation | Command |
|-----------|---------|
| List catalogs | `SHOW CATALOGS` |
| List schemas | `SHOW SCHEMAS IN <catalog>` |
| List tables | `SHOW TABLES IN <catalog>.<schema>` |
| Describe table | `DESCRIBE TABLE EXTENDED <catalog>.<schema>.<table>` |
| Table details | `DESCRIBE DETAIL <catalog>.<schema>.<table>` |
| Table history | `DESCRIBE HISTORY <catalog>.<schema>.<table>` |
| Check grants | `SHOW GRANTS ON TABLE <catalog>.<schema>.<table>` |
| Grant access | `GRANT SELECT ON TABLE <catalog>.<schema>.<table> TO \`user@example.com\`` |

**Primary tool**: `mcp__databricks__run_sql`
**Fallback**: Databricks CLI (for API-only operations)

## Catalogs and Schemas

```sql
-- List catalogs
SHOW CATALOGS;
SHOW CATALOGS LIKE 'prod*';

-- Describe catalog
DESCRIBE CATALOG EXTENDED <catalog_name>;

-- List schemas
SHOW SCHEMAS IN <catalog_name>;
SHOW SCHEMAS IN <catalog_name> LIKE 'sales*';

-- Describe schema
DESCRIBE SCHEMA EXTENDED <catalog_name>.<schema_name>;

-- Current context
SELECT current_catalog(), current_schema();

-- Set context
USE CATALOG <catalog_name>;
USE SCHEMA <schema_name>;
```

## Tables and Views

### Listing and Describing

```sql
-- List tables
SHOW TABLES IN <catalog>.<schema>;
SHOW TABLES IN <catalog>.<schema> LIKE 'customer*';

-- Column definitions
DESCRIBE TABLE <catalog>.<schema>.<table>;

-- Full metadata (owner, location, properties)
DESCRIBE TABLE EXTENDED <catalog>.<schema>.<table>;

-- Delta details (size, partitions, files)
DESCRIBE DETAIL <catalog>.<schema>.<table>;

-- Table history (30-day retention)
DESCRIBE HISTORY <catalog>.<schema>.<table>;

-- Table properties and DDL
SHOW TBLPROPERTIES <catalog>.<schema>.<table>;
SHOW CREATE TABLE <catalog>.<schema>.<table>;

-- List views
SHOW VIEWS IN <catalog>.<schema>;
```

### Table Statistics

```sql
-- Row count
SELECT COUNT(*) FROM <catalog>.<schema>.<table>;

-- Sample data
SELECT * FROM <catalog>.<schema>.<table> LIMIT 10;

-- Random sample (1%)
SELECT * FROM <catalog>.<schema>.<table> TABLESAMPLE (1 PERCENT);

-- Compute statistics
ANALYZE TABLE <catalog>.<schema>.<table> COMPUTE STATISTICS FOR ALL COLUMNS;
```

## Volumes and Functions

```sql
-- List volumes
SHOW VOLUMES IN <catalog>.<schema>;

-- Describe volume
DESCRIBE VOLUME <catalog>.<schema>.<volume>;

-- List functions
SHOW USER FUNCTIONS IN <catalog>.<schema>;

-- Describe function
DESCRIBE FUNCTION EXTENDED <catalog>.<schema>.<function>;
```

### Volume CLI Commands

```bash
# List files in volume
databricks fs ls /Volumes/<catalog>/<schema>/<volume>/ -o json

# Volume details
databricks volumes read <catalog>.<schema>.<volume> -o json
```

## Permissions

### Permission Hierarchy

```
CATALOG (USE CATALOG, CREATE SCHEMA)
  └── SCHEMA (USE SCHEMA, CREATE TABLE/FUNCTION/VOLUME)
        ├── TABLE (SELECT, MODIFY, ALL PRIVILEGES)
        ├── VIEW (SELECT)
        ├── VOLUME (READ VOLUME, WRITE VOLUME)
        └── FUNCTION (EXECUTE)
```

**To access a table, users need**: `USE CATALOG` → `USE SCHEMA` → `SELECT`

### View Grants

```sql
-- On objects
SHOW GRANTS ON CATALOG <catalog>;
SHOW GRANTS ON SCHEMA <catalog>.<schema>;
SHOW GRANTS ON TABLE <catalog>.<schema>.<table>;
SHOW GRANTS ON VOLUME <catalog>.<schema>.<volume>;

-- To principal
SHOW GRANTS TO `user@example.com`;
SHOW GRANTS TO `group_name`;
```

### Grant Permissions

```sql
-- Catalog access
GRANT USE CATALOG ON CATALOG <catalog> TO `user@example.com`;
GRANT CREATE SCHEMA ON CATALOG <catalog> TO `user@example.com`;

-- Schema access
GRANT USE SCHEMA ON SCHEMA <catalog>.<schema> TO `user@example.com`;
GRANT CREATE TABLE ON SCHEMA <catalog>.<schema> TO `user@example.com`;

-- Table access
GRANT SELECT ON TABLE <catalog>.<schema>.<table> TO `user@example.com`;
GRANT MODIFY ON TABLE <catalog>.<schema>.<table> TO `user@example.com`;
GRANT ALL PRIVILEGES ON TABLE <catalog>.<schema>.<table> TO `data_team`;

-- Revoke
REVOKE SELECT ON TABLE <catalog>.<schema>.<table> FROM `user@example.com`;
```

### Ownership

```sql
-- Transfer ownership
ALTER TABLE <catalog>.<schema>.<table> SET OWNER TO `new_owner@example.com`;
ALTER SCHEMA <catalog>.<schema> SET OWNER TO `new_owner@example.com`;
ALTER CATALOG <catalog> SET OWNER TO `new_owner@example.com`;
```

## Delta Time Travel

```sql
-- Query specific version
SELECT * FROM <catalog>.<schema>.<table> VERSION AS OF 5;

-- Query at timestamp
SELECT * FROM <catalog>.<schema>.<table> TIMESTAMP AS OF '2024-01-15 10:00:00';

-- Compare versions
SELECT * FROM <catalog>.<schema>.<table> VERSION AS OF 5
EXCEPT
SELECT * FROM <catalog>.<schema>.<table> VERSION AS OF 4;
```

## Table Maintenance

```sql
-- Optimize (compact small files)
OPTIMIZE <catalog>.<schema>.<table>;

-- Optimize with Z-ordering
OPTIMIZE <catalog>.<schema>.<table> ZORDER BY (col1, col2);

-- Vacuum old files (default 7 days)
VACUUM <catalog>.<schema>.<table>;
VACUUM <catalog>.<schema>.<table> RETAIN 168 HOURS;
```

## Information Schema

```sql
-- Tables metadata
SELECT table_name, table_type, created
FROM <catalog>.information_schema.tables
WHERE table_schema = '<schema>';

-- Column details
SELECT column_name, data_type, is_nullable
FROM <catalog>.information_schema.columns
WHERE table_schema = '<schema>' AND table_name = '<table>'
ORDER BY ordinal_position;

-- Find tables by column name
SELECT table_catalog, table_schema, table_name, column_name
FROM <catalog>.information_schema.columns
WHERE column_name LIKE '%customer%';
```

## Cross-Catalog Queries

```sql
-- Join across catalogs
SELECT a.*, b.*
FROM catalog1.schema1.table1 a
JOIN catalog2.schema2.table2 b ON a.id = b.id;

-- Create view spanning catalogs
CREATE VIEW my_catalog.my_schema.combined AS
SELECT * FROM catalog1.schema.table
UNION ALL
SELECT * FROM catalog2.schema.table;
```

## Tips

- Always use fully qualified names: `<catalog>.<schema>.<table>`
- Use `LIKE '%pattern%'` for fuzzy searching
- Check permissions at all levels when debugging access issues
- Use `DESCRIBE HISTORY` to investigate recent changes

## References

- [Troubleshooting](references/troubleshooting.md): Permission errors, table not found, debugging
- [Lineage](references/lineage.md): Data lineage, change tracking, impact analysis
