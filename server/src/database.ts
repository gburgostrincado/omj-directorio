import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DatabaseService extends Pool implements OnModuleInit {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL.');
    super({ connectionString: process.env.DATABASE_URL, max: process.env.VERCEL ? 1 : 10 });
  }

  async onModuleInit() {
    await this.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(140) NOT NULL,
        president VARCHAR(120),
        secretary VARCHAR(120),
        treasurer VARCHAR(120),
        email VARCHAR(254),
        rut VARCHAR(20),
        valid_until DATE,
        legacy_migrated BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS rut VARCHAR(20);
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS valid_until DATE;
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS legacy_migrated BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS organization_directors (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        role VARCHAR(80) NOT NULL,
        name VARCHAR(120) NOT NULL,
        address VARCHAR(240),
        email VARCHAR(254),
        phone VARCHAR(32),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      WITH legacy AS (
        UPDATE organizations SET legacy_migrated = TRUE WHERE legacy_migrated = FALSE
        RETURNING id, president, secretary, treasurer
      )
      INSERT INTO organization_directors (organization_id, role, name)
      SELECT id, 'Presidente/a', president FROM legacy WHERE NULLIF(TRIM(president), '') IS NOT NULL
      UNION ALL
      SELECT id, 'Secretario/a', secretary FROM legacy WHERE NULLIF(TRIM(secretary), '') IS NOT NULL
      UNION ALL
      SELECT id, 'Tesorero/a', treasurer FROM legacy WHERE NULLIF(TRIM(treasurer), '') IS NOT NULL;
    `);

    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password || password.length < 12) {
      throw new Error('Configura ADMIN_USERNAME y ADMIN_PASSWORD (mínimo 12 caracteres).');
    }
    const { rowCount } = await this.query('SELECT 1 FROM admin_users LIMIT 1');
    if (!rowCount) {
      await this.query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        username,
        await bcrypt.hash(password, 12),
      ]);
    }
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
