import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';
import { rm } from 'fs/promises';
import { WorkspaceClient, type SyncOptions } from '../utils/workspaceClient.js';

// Task types
type WorkspaceSyncTaskType = 'sync' | 'delete';

interface BaseTask {
  id: string;
  type: WorkspaceSyncTaskType;
  userId: string;
  createdAt: number;
  retryCount: number;
}

interface SyncTask extends BaseTask {
  type: 'sync';
  token: string;
  src: string;
  dest: string;
  options?: SyncOptions;
}

interface DeleteTask extends BaseTask {
  type: 'delete';
  localPath: string;
}

export type WorkspaceSyncTask = SyncTask | DeleteTask;

// Configuration
interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 3,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
};

// In-memory state
const userTaskCounts = new Map<string, number>();
const pendingTasks = new Map<string, WorkspaceSyncTask>();

// Queue instance (singleton)
let queue: queueAsPromised<WorkspaceSyncTask> | null = null;
let config = DEFAULT_CONFIG;

// Increment user task count
function incrementUserCount(userId: string): void {
  const current = userTaskCounts.get(userId) || 0;
  userTaskCounts.set(userId, current + 1);
}

// Decrement user task count
function decrementUserCount(userId: string): void {
  const current = userTaskCounts.get(userId) || 0;
  if (current > 1) {
    userTaskCounts.set(userId, current - 1);
  } else {
    userTaskCounts.delete(userId);
  }
}

// Calculate retry delay with exponential backoff and jitter
function calculateRetryDelay(retryCount: number): number {
  const delay = Math.min(
    config.baseRetryDelayMs * Math.pow(2, retryCount),
    config.maxRetryDelayMs
  );
  // Add jitter (0-20%)
  const jitter = delay * 0.2 * Math.random();
  return Math.floor(delay + jitter);
}

// Get Databricks host from environment
const getDatabricksHost = (): string => {
  const host = process.env.DATABRICKS_HOST;
  if (!host) {
    throw new Error('DATABRICKS_HOST environment variable is not set');
  }
  return host;
};

// Worker function that processes tasks
async function processTask(task: WorkspaceSyncTask): Promise<void> {
  try {
    switch (task.type) {
      case 'sync': {
        const client = new WorkspaceClient({
          host: getDatabricksHost(),
          getToken: async () => task.token,
        });
        await client.sync(task.src, task.dest, task.options);
        break;
      }
      case 'delete':
        await rm(task.localPath, { recursive: true, force: true });
        console.log(
          `[WorkspaceQueue] Deleted local directory: ${task.localPath}`
        );
        break;
    }

    // Success: cleanup
    pendingTasks.delete(task.id);
    decrementUserCount(task.userId);
    console.log(
      `[WorkspaceQueue] Task ${task.id} (${task.type}) completed successfully`
    );
  } catch (error: any) {
    console.error(
      `[WorkspaceQueue] Task ${task.id} (${task.type}) failed: ${error.message}`
    );

    if (task.retryCount < config.maxRetries) {
      // Retry with exponential backoff
      const delay = calculateRetryDelay(task.retryCount);
      console.log(
        `[WorkspaceQueue] Retrying task ${task.id} in ${delay}ms (attempt ${task.retryCount + 1}/${config.maxRetries})`
      );

      setTimeout(() => {
        const retryTask = { ...task, retryCount: task.retryCount + 1 };
        pendingTasks.set(retryTask.id, retryTask);
        queue?.push(retryTask).catch((err) => {
          console.error(
            `[WorkspaceQueue] Failed to enqueue retry for ${task.id}: ${err.message}`
          );
        });
      }, delay);
    } else {
      // Final failure: cleanup
      pendingTasks.delete(task.id);
      decrementUserCount(task.userId);
      console.error(
        `[WorkspaceQueue] Task ${task.id} (${task.type}) failed after ${config.maxRetries} retries`
      );
    }
  }
}

// Ensure queue is initialized
function ensureQueueInitialized(): void {
  if (!queue) {
    initQueue();
  }
}

// Enqueue a task
function enqueueTask(task: WorkspaceSyncTask): void {
  pendingTasks.set(task.id, task);
  incrementUserCount(task.userId);
  queue!.push(task).catch((err) => {
    console.error(
      `[WorkspaceQueue] Failed to enqueue task ${task.id}: ${err.message}`
    );
  });
  console.log(
    `[WorkspaceQueue] Enqueued task ${task.id} (${task.type}) for user ${task.userId}`
  );
}

// Initialize queue
export function initQueue(customConfig?: Partial<QueueConfig>): void {
  if (queue) return; // Already initialized

  config = { ...DEFAULT_CONFIG, ...customConfig };
  queue = fastq.promise(processTask, config.concurrency);
  console.log(
    `[WorkspaceQueue] Initialized with concurrency=${config.concurrency}`
  );
}

// Enqueue sync task (direction auto-detected by WorkspaceClient based on path prefixes)
export function enqueueSync(params: {
  userId: string;
  token: string;
  src: string;
  dest: string;
  options?: SyncOptions;
}): string {
  ensureQueueInitialized();
  const task: SyncTask = {
    id: crypto.randomUUID(),
    type: 'sync',
    userId: params.userId,
    token: params.token,
    src: params.src,
    dest: params.dest,
    options: params.options,
    createdAt: Date.now(),
    retryCount: 0,
  };
  enqueueTask(task);
  return task.id;
}

// Enqueue delete task
export function enqueueDelete(params: {
  userId: string;
  localPath: string;
}): string {
  ensureQueueInitialized();
  const task: DeleteTask = {
    id: crypto.randomUUID(),
    type: 'delete',
    userId: params.userId,
    localPath: params.localPath,
    createdAt: Date.now(),
    retryCount: 0,
  };
  enqueueTask(task);
  return task.id;
}

// Get user's pending task count
export function getUserPendingCount(userId: string): number {
  return userTaskCounts.get(userId) ?? 0;
}

// Get user's pending tasks
export function getUserPendingTasks(userId: string): WorkspaceSyncTask[] {
  return Array.from(pendingTasks.values()).filter((t) => t.userId === userId);
}

// Get total pending count
export function getTotalPendingCount(): number {
  return pendingTasks.size;
}

// Get queue statistics
export function getQueueStats(): { pending: number; idle: boolean } {
  return {
    pending: queue?.length() ?? 0,
    idle: queue?.idle() ?? true,
  };
}

// Drain queue (wait for all tasks to complete)
export async function drainQueue(): Promise<void> {
  if (queue) {
    await queue.drained();
  }
}

// Kill queue (stop processing)
export function killQueue(): void {
  if (queue) {
    queue.kill();
    queue = null;
    pendingTasks.clear();
    userTaskCounts.clear();
    console.log('[WorkspaceQueue] Queue killed and cleared');
  }
}
