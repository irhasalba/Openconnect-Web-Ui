import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DB = path.join(import.meta.dir, 'test_portals.db');
const TEST_URL = 'http://localhost:5001';

let testServer: any;

// Set test environment before importing
process.env.NODE_ENV = 'test';

describe('GP Connect Portal API (Bun)', () => {
  beforeAll(async () => {
    // Clean up
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    
    // Import server
    const server = await import('./server.ts');
    testServer = server.default;
    
    // Start server on port 5001 for testing
    Bun.serve({
      port: 5001,
      fetch: testServer.fetch,
    });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('should list empty portals initially', async () => {
    const res = await fetch(`${TEST_URL}/api/portals`);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.portals).toEqual([]);
  });

  it('should create and retrieve a portal', async () => {
    const createRes = await fetch(`${TEST_URL}/api/portals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Corporate VPN', url: 'https://vpn.example.com/' }),
    });
    const createData = await createRes.json() as any;
    
    expect(createData.success).toBe(true);
    expect(createData.portal.url).toBe('vpn.example.com');
    expect(createData.portal.name).toBe('Corporate VPN');

    const getRes = await fetch(`${TEST_URL}/api/portals`);
    const getData = await getRes.json() as any;
    expect(getData.success).toBe(true);
    expect(getData.portals.length).toBe(1);
    expect(getData.portals[0].url).toBe('vpn.example.com');
  });

  it('should reject blank URLs', async () => {
    const res = await fetch(`${TEST_URL}/api/portals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blank', url: '   ' }),
    });
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it('should reject duplicate URLs', async () => {
    await fetch(`${TEST_URL}/api/portals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First', url: 'dup.example.com' }),
    });

    const res = await fetch(`${TEST_URL}/api/portals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second', url: 'https://dup.example.com/' }),
    });
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(res.status).toBe(409);
  });

  it('should use URL as name when name is empty', async () => {
    const res = await fetch(`${TEST_URL}/api/portals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'noname.example.com' }),
    });
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.portal.name).toBe('noname.example.com');
  });
});