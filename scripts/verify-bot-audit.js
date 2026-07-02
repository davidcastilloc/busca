import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportPath = path.join(__dirname, '../telegram_audit_report.md');

const handlers = [
  'alerta.ts',
  'broadcast.ts',
  'census.ts',
  'found.ts',
  'location.ts',
  'login.ts',
  'media.ts',
  'peligro.ts',
  'report.ts',
  'search.ts',
  'shelter.ts',
  'sos.ts'
];

try {
  if (!fs.existsSync(reportPath)) {
    console.error(`Error: Report file not found at ${reportPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(reportPath, 'utf8');

  let missing = [];
  for (const handler of handlers) {
    if (!content.includes(handler)) {
      missing.push(handler);
    }
  }

  if (missing.length > 0) {
    console.error(`Error: Report is missing mention of the following handlers: ${missing.join(', ')}`);
    process.exit(2);
  }

  console.log("Success: All expected handlers are mentioned in telegram_audit_report.md");
  process.exit(0);
} catch (error) {
  console.error("An error occurred during verification:", error);
  process.exit(3);
}
