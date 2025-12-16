import fs from 'fs';
import path from 'path';

const databricksHost = process.env.DATABRICKS_HOST;

interface WorkspaceImportResponse {
  error_code?: string;
  message?: string;
}

// Import a single file to Databricks Workspace
async function importFile(
  localFilePath: string,
  workspacePath: string,
  token: string
): Promise<void> {
  const content = fs.readFileSync(localFilePath);
  const base64Content = content.toString('base64');

  const response = await fetch(
    `https://${databricksHost}/api/2.0/workspace/import`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: workspacePath,
        content: base64Content,
        format: 'AUTO',
        overwrite: true,
      }),
    }
  );

  if (!response.ok) {
    const data = (await response.json()) as WorkspaceImportResponse;
    throw new Error(
      `Failed to import ${workspacePath}: ${data.message || response.statusText}`
    );
  }
}

// Create a directory in Databricks Workspace
async function mkdirs(workspacePath: string, token: string): Promise<void> {
  const response = await fetch(
    `https://${databricksHost}/api/2.0/workspace/mkdirs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: workspacePath,
      }),
    }
  );

  if (!response.ok) {
    const data = (await response.json()) as WorkspaceImportResponse;
    // Ignore RESOURCE_ALREADY_EXISTS error
    if (data.error_code !== 'RESOURCE_ALREADY_EXISTS') {
      throw new Error(
        `Failed to create directory ${workspacePath}: ${data.message || response.statusText}`
      );
    }
  }
}

// Recursively get all files in a directory
function getAllFiles(dirPath: string, basePath: string = dirPath): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, basePath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

// Sync a local directory to Databricks Workspace
export async function syncToWorkspace(
  localPath: string,
  workspacePath: string,
  token: string
): Promise<void> {
  if (!fs.existsSync(localPath)) {
    console.log(`Local path ${localPath} does not exist, skipping sync`);
    return;
  }

  const stat = fs.statSync(localPath);

  if (stat.isFile()) {
    // Single file sync
    await importFile(localPath, workspacePath, token);
    console.log(`Synced file: ${localPath} -> ${workspacePath}`);
    return;
  }

  // Directory sync
  // Always create the target directory first (even if empty)
  await mkdirs(workspacePath, token);

  const files = getAllFiles(localPath);

  if (files.length === 0) {
    console.log(`Created directory ${workspacePath} (no files to sync)`);
    return;
  }

  // Get unique directories to create
  const directories = new Set<string>();
  for (const file of files) {
    const relativePath = path.relative(localPath, file);
    const relativeDir = path.dirname(relativePath);
    if (relativeDir && relativeDir !== '.') {
      // Add all parent directories
      const parts = relativeDir.split(path.sep);
      let current = '';
      for (const part of parts) {
        current = current ? path.join(current, part) : part;
        directories.add(current);
      }
    }
  }

  // Create directories
  for (const dir of Array.from(directories).sort()) {
    const targetDir = path.posix.join(workspacePath, dir);
    await mkdirs(targetDir, token);
  }

  // Import files
  for (const file of files) {
    const relativePath = path.relative(localPath, file);
    const targetPath = path.posix.join(workspacePath, relativePath);
    try {
      await importFile(file, targetPath, token);
      console.log(`Synced: ${relativePath}`);
    } catch (error) {
      console.error(`Failed to sync ${relativePath}:`, error);
    }
  }

  console.log(
    `Workspace sync completed: ${files.length} files to ${workspacePath}`
  );
}
