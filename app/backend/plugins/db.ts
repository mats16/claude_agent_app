import fp from 'fastify-plugin';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';

// Fastify 型定義拡張
declare module 'fastify' {
	interface FastifyInstance {
		db: PostgresJsDatabase<typeof schema>;
	}
}

export default fp(
	async (fastify) => {
		// Postgres クライアント作成
		const client = postgres(fastify.config.DATABASE_URL);

		// Drizzle インスタンス作成（v1.0+ 構文）
		const db = drizzle({ client, schema });

		// Fastify インスタンスに decorator 追加
		fastify.decorate('db', db);

		// Graceful shutdown 処理
		fastify.addHook('onClose', async () => {
			fastify.log.info('Closing database connection...');
			await client.end();
			fastify.log.info('Database connection closed');
		});
	},
	{
		name: 'db',
		dependencies: ['config'], // config plugin must load first
	}
);
