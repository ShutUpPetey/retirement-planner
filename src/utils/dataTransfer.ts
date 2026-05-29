import {
  Account,
  Profile,
  Assumptions,
  IncomeStream,
  AccumulationResult,
  RetirementResult,
} from '../types';

const BACKUP_VERSION = 1;
const BACKUP_KIND = 'retirement-planner-backup';

export interface BackupPayload {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  country: string;
  data: {
    accounts: Account[];
    profile: Profile;
    assumptions: Assumptions;
    incomeStreams: IncomeStream[];
  };
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Export a re-importable JSON backup of all user inputs. */
export function exportBackup(
  accounts: Account[],
  profile: Profile,
  assumptions: Assumptions,
  incomeStreams: IncomeStream[]
): void {
  const payload: BackupPayload = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    country: profile.country ?? 'US',
    data: { accounts, profile, assumptions, incomeStreams },
  };
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `retirement-planner-backup-${stamp()}.json`,
    'application/json'
  );
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export year-by-year projections (accumulation + retirement) as CSV. */
export function exportProjectionsCsv(
  accumulation: AccumulationResult,
  retirement: RetirementResult
): void {
  const headers = [
    'phase',
    'age',
    'year',
    'portfolio_balance',
    'annual_contribution_or_withdrawal',
    'gross_income',
    'total_tax',
    'after_tax_income',
  ];
  const rows: (string | number)[][] = [];

  for (const y of accumulation.yearlyBalances) {
    const contrib = Object.values(y.contributions ?? {}).reduce((s, v) => s + v, 0);
    rows.push(['accumulation', y.age, y.year, Math.round(y.totalBalance), Math.round(contrib), '', '', '']);
  }

  for (const w of retirement.yearlyWithdrawals) {
    rows.push([
      'retirement',
      w.age,
      w.year,
      Math.round(w.totalRemainingBalance),
      Math.round(w.totalWithdrawal),
      Math.round(w.grossIncome),
      Math.round(w.totalTax),
      Math.round(w.afterTaxIncome),
    ]);
  }

  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
  triggerDownload(csv, `retirement-planner-projections-${stamp()}.csv`, 'text/csv');
}

export interface ParsedBackup {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  incomeStreams: IncomeStream[];
  country: string;
}

/** Parse and validate a backup JSON string. Throws on invalid input. */
export function parseBackup(jsonText: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const obj = parsed as Partial<BackupPayload>;
  if (!obj || obj.kind !== BACKUP_KIND || !obj.data) {
    throw new Error('That file is not a Retirement Planner backup.');
  }

  const d = obj.data;
  if (!Array.isArray(d.accounts) || !d.profile || !d.assumptions) {
    throw new Error('Backup is missing required data (accounts, profile, or assumptions).');
  }

  return {
    accounts: d.accounts,
    profile: d.profile,
    assumptions: d.assumptions,
    incomeStreams: Array.isArray(d.incomeStreams) ? d.incomeStreams : [],
    country: obj.country ?? d.profile.country ?? 'US',
  };
}
