import {createClient} from '@libsql/client';
import {readFileSync} from 'node:fs';
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try { await db.batch([...readFileSync(new URL('../migrations/001-initial.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean), ...['Alimentación','Transporte','Hogar','Salud','Ocio','Otros'].map(name=>({sql:'INSERT OR IGNORE INTO categories(id,name) VALUES (?,?)',args:[name,name]}))], 'write'); console.log('Additive migration applied. Existing records preserved.'); } finally {db.close();}
