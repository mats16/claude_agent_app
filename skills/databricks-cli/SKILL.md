---
name: databricks-cli
description: Basic Usage of the Databricks CLI
version: 0.0.1
---

# Overview

The Databricks CLI is a command-line tool for managing Databricks resources.

## Authentication

The environment variables DATABRICKS_HOST and DATABRICKS_TOKEN are already set.

## Best practices

- Use the `-o json` option to format output in JSON format.

## catalog command

Commands used to manage the Unity Catalog.

### Catalog Management

```bash
# Display Catalog List
databricks catalogs list -o json

# Get Catalog Details
databricks catalogs get <catalog-name> -o json

# Catalog creation
databricks catalogs create <catalog-name> -o json

# Deletion of the catalog
databricks catalogs delete <catalog-name> -o json
```

### Schema Management

```bash
# Display Schema List
databricks schemas list --catalog-name <catalog-name> -o json

# Creating Schemas
databricks schemas create <schema-name> --catalog-name <catalog-name> -o json

# Retrieve schema details
databricks schemas get <catalog-name>.<schema-name> -o json
```

### Table Management

```bash
# Table List Display
databricks tables list --catalog-name <catalog-name> --schema-name <schema-name> -o json

# Retrieve table details
databricks tables get <catalog-name>.<schema-name>.<table-name> -o json
```

### Volume Management

```bash
# Volume List Display
databricks volumes list --catalog-name <catalog-name> --schema-name <schema-name> -o json

# Creating a Volume
databricks volumes create <volume-name> \
  --catalog-name <catalog-name> \
  --schema-name <schema-name> \
  --volume-type MANAGED \
  -o json
```

## Tips

- `--help` You can display detailed help for each command using the options.

## Related Commands

- `databricks fs` - Volumes File の操作
- `databricks jobs` - Job Management
- `databricks clusters` - Cluster Management
