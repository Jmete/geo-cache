import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

describe('D1 Migrations', () => {
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  it('has migration files', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  describe('0001_create_geocode_cache.sql', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_create_geocode_cache.sql'), 'utf-8');

    it('uses CREATE TABLE IF NOT EXISTS for idempotency', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS geocode_cache');
    });

    it('uses CREATE INDEX IF NOT EXISTS for idempotency', () => {
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    });

    it('has unique constraint on input_norm_key', () => {
      expect(sql).toContain('input_norm_key TEXT NOT NULL UNIQUE');
    });

    it('has index on country_iso2', () => {
      expect(sql).toContain('idx_geocode_cache_country_iso2');
      expect(sql).toContain('ON geocode_cache(country_iso2)');
    });

    it('has required columns', () => {
      const requiredColumns = [
        'input_raw',
        'input_norm_key',
        'country_iso2',
        'country_name',
        'admin1',
        'city',
        'display_name',
        'granularity',
        'point_lat',
        'point_lon',
        'confidence',
        'flags_json',
        'provider',
        'created_at',
        'updated_at',
      ];
      requiredColumns.forEach((col) => {
        expect(sql).toContain(col);
      });
    });

    it('has granularity check constraint', () => {
      expect(sql).toContain("CHECK (granularity IN ('city', 'region', 'country', 'multi'))");
    });

    it('has confidence range constraint', () => {
      expect(sql).toContain('CHECK (confidence >= 0 AND confidence <= 1)');
    });
  });

  describe('0002_create_geocode_events.sql', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0002_create_geocode_events.sql'), 'utf-8');

    it('uses CREATE TABLE IF NOT EXISTS for idempotency', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS geocode_events');
    });

    it('uses CREATE INDEX IF NOT EXISTS for idempotency', () => {
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    });

    it('has required audit columns', () => {
      const requiredColumns = [
        'input_raw',
        'input_norm_key',
        'status',
        'provider',
        'provider_response',
        'created_at',
      ];
      requiredColumns.forEach((col) => {
        expect(sql).toContain(col);
      });
    });

    it('has status check constraint', () => {
      expect(sql).toContain("CHECK (status IN ('hit', 'miss', 'resolved', 'error', 'ambiguous'))");
    });

    it('has index on input_norm_key for debugging', () => {
      expect(sql).toContain('idx_geocode_events_norm_key');
    });

    it('has index on status for error analysis', () => {
      expect(sql).toContain('idx_geocode_events_status');
    });
  });

  describe('all migrations', () => {
    migrationFiles.forEach((file) => {
      describe(file, () => {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

        it('uses IF NOT EXISTS for idempotency', () => {
          // All CREATE statements should use IF NOT EXISTS
          const createStatements = sql.match(/CREATE\s+(TABLE|INDEX)/gi) || [];
          const ifNotExistsStatements = sql.match(/CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS/gi) || [];
          expect(ifNotExistsStatements.length).toBe(createStatements.length);
        });

        it('contains SQL statements terminated with semicolons', () => {
          // Check that file contains actual SQL (CREATE statements) with semicolons
          const createStatements = sql.match(/CREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS[^;]+;/gi) || [];
          expect(createStatements.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
