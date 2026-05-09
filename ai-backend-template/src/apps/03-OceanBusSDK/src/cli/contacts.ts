import fs from 'fs';
import path from 'path';
import os from 'os';

const CONTACTS_FILE = path.join(os.homedir(), '.oceanbus', 'contacts.json');

type ContactsData = Record<string, any>;

export function loadContacts(): ContactsData {
  try {
    if (fs.existsSync(CONTACTS_FILE)) {
      return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

export function saveContact(name: string, openid: string): void {
  const dir = path.dirname(CONTACTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const contacts = loadContacts();
  contacts[name] = openid;
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

export function resolveAlias(name: string): string | null {
  const contacts = loadContacts();
  const val = contacts[name];
  return typeof val === 'string' ? val : null;
}

/** Get the myOpenId assigned to a contact. Returns null if none. */
export function getMyOpenId(name: string): string | null {
  const contacts = loadContacts();
  const meta = contacts['__myOpenId__'];
  if (meta && typeof meta === 'object' && typeof meta[name] === 'string') {
    return meta[name];
  }
  return null;
}

/** Store the myOpenId for a contact. */
export function setMyOpenId(name: string, openid: string): void {
  const dir = path.dirname(CONTACTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const contacts = loadContacts();
  if (!contacts['__myOpenId__'] || typeof contacts['__myOpenId__'] !== 'object') {
    contacts['__myOpenId__'] = {};
  }
  contacts['__myOpenId__'][name] = openid;
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

/** List all contact names (excluding internal keys) */
export function listContactNames(): string[] {
  const contacts = loadContacts();
  return Object.keys(contacts).filter(k => k !== '__myOpenId__' && typeof contacts[k] === 'string');
}
