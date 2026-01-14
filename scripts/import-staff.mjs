import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const defaultEnvFile = path.resolve('.env.local');

const parseEnvFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const env = {};
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
      const [key, ...rest] = trimmed.split('=');
      env[key.trim()] = rest.join('=').trim();
    });
    return env;
  } catch {
    return {};
  }
};

const parseCsvLine = (line, delimiter) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
};

const parseBoolean = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'si'].includes(normalized);
};

const resolveEnv = async () => {
  const fileEnv = await parseEnvFile(defaultEnvFile);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || fileEnv.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || fileEnv.ADMIN_PASSWORD;
  const adminAccessToken = process.env.ADMIN_ACCESS_TOKEN || fileEnv.ADMIN_ACCESS_TOKEN;
  return { supabaseUrl, supabaseAnonKey, adminEmail, adminPassword, adminAccessToken };
};

const loadCsv = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const header = parseCsvLine(lines[0], delimiter).map((col) => col.trim().toLowerCase());
  const emailIndex = header.indexOf('email');
  const nameIndex = header.indexOf('name');
  const roleIndex = header.indexOf('role');
  const adminIndex = header.indexOf('is_admin');
  if (emailIndex === -1 || nameIndex === -1 || roleIndex === -1) {
    throw new Error('CSV header must include: email,name,role (optional: is_admin).');
  }
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i], delimiter);
    const email = values[emailIndex]?.trim();
    const name = values[nameIndex]?.trim();
    const role = values[roleIndex]?.trim();
    if (!email || !name || !role) continue;
    const isAdmin = adminIndex >= 0 ? parseBoolean(values[adminIndex]) : false;
    rows.push({ email, name, role, is_admin: isAdmin });
  }
  return rows;
};

const main = async () => {
  const [, , fileArg] = process.argv;
  if (!fileArg) {
    console.error('Usage: node scripts/import-staff.mjs staff.csv');
    process.exit(1);
  }
  const { supabaseUrl, supabaseAnonKey, adminEmail, adminPassword, adminAccessToken } = await resolveEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase URL/anon key. Set SUPABASE_URL and SUPABASE_ANON_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  let accessToken = adminAccessToken;
  if (!accessToken) {
    if (!adminEmail || !adminPassword) {
      console.error('Missing ADMIN_EMAIL/ADMIN_PASSWORD or ADMIN_ACCESS_TOKEN.');
      process.exit(1);
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    if (error || !data?.session?.access_token) {
      console.error('Admin login failed:', error?.message || 'No access token.');
      process.exit(1);
    }
    accessToken = data.session.access_token;
  }

  const rows = await loadCsv(fileArg);
  if (rows.length === 0) {
    console.error('No valid rows found in CSV.');
    process.exit(1);
  }

  let success = 0;
  let failed = 0;
  for (const row of rows) {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      console.error(`Failed: ${row.email} -> ${data?.error || response.statusText}`);
      failed += 1;
      continue;
    }
    success += 1;
    console.log(`Created: ${row.email}`);
  }

  console.log(`Done. Created ${success}, failed ${failed}.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
