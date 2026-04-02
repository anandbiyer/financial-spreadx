import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const FIXTURES_DIR = path.join(PROJECT_ROOT, '__tests__/fixtures');

describe('Phase 0 — Project Setup Verification', () => {
  // T0.4: Verify .env.local variables are defined
  it('T0.4 — DEMO_API_KEY is set in .env.local', () => {
    const envPath = path.join(PROJECT_ROOT, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    expect(envContent).toContain('DEMO_API_KEY=demo-spreadx-2025');
  });

  // T0.5: Verify DIGITAL test PDF is readable
  it('T0.5 — DIGITAL fixture (Aspect Capital) is readable and non-empty', () => {
    const pdfPath = path.join(FIXTURES_DIR, 'Aspect_Capital_Limited_2023.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);
    const stats = fs.statSync(pdfPath);
    expect(stats.size).toBeGreaterThan(0);
    // ~369 KB
    expect(stats.size).toBeGreaterThan(300_000);
  });

  // T0.6: Verify SCANNED test PDF is readable
  it('T0.6 — SCANNED fixture (Sun Hung Kai) is readable and > 3MB', () => {
    const pdfPath = path.join(FIXTURES_DIR, 'Sun_Hung_Kai_Co_Limited_AR_2024.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);
    const stats = fs.statSync(pdfPath);
    expect(stats.size).toBeGreaterThan(3_000_000);
  });

  // Verify all 19 demo docs are in place
  it('All 19 demo PDFs exist in demo-docs/', () => {
    const demoDocs = path.join(PROJECT_ROOT, 'demo-docs');
    const files = fs.readdirSync(demoDocs).filter(f => f.endsWith('.pdf'));
    expect(files.length).toBe(19);
  });

  // Verify key config files exist
  it('next.config.ts exists with serverExternalPackages', () => {
    const configPath = path.join(PROJECT_ROOT, 'next.config.ts');
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('serverExternalPackages');
    expect(content).toContain('pdf-parse');
  });

  it('drizzle.config.ts exists', () => {
    const configPath = path.join(PROJECT_ROOT, 'drizzle.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('vercel.json exists with 300s timeout', () => {
    const configPath = path.join(PROJECT_ROOT, 'vercel.json');
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('"maxDuration": 300');
  });

  // Verify shadcn/ui components exist
  it('shadcn/ui components are installed', () => {
    const componentsDir = path.join(PROJECT_ROOT, 'components/ui');
    const expected = ['button.tsx', 'input.tsx', 'select.tsx', 'badge.tsx', 'table.tsx', 'card.tsx'];
    for (const file of expected) {
      expect(fs.existsSync(path.join(componentsDir, file))).toBe(true);
    }
  });
});
