// Country code
export type CountryCode = 'US' | 'CA';

// US Account Types
export type USAccountType =
  | 'traditional_401k'
  | 'roth_401k'
  | 'traditional_ira'
  | 'roth_ira'
  | 'taxable'
  | 'hsa';

// Canadian Account Types
export type CAAccountType =
  | 'rrsp'
  | 'tfsa'
  | 'rrif'
  | 'lira'
  | 'lif'
  | 'fhsa'
  | 'non_registered'
  | 'employer_rrsp';

// Combined account type (union of all countries)
export type AccountType = USAccountType | CAAccountType;

export type FilingStatus = 'single' | 'married_filing_jointly';

export type TaxTreatment = 'pretax' | 'roth' | 'taxable' | 'hsa';

export type IncomeTaxTreatment = 'social_security' | 'fully_taxable' | 'other_income' | 'tax_free';

export interface IncomeStream {
  id: string;
  name: string;
  monthlyAmount: number;      // in today's dollars
  startAge: number;
  endAge?: number;            // optional: last age income is received
  taxTreatment: IncomeTaxTreatment;
}

export type LifeEventType = 'expense' | 'income' | 'lump_sum';

export interface LifeEvent {
  id: string;
  name: string;
  type: LifeEventType;
  amount: number;          // today's dollars; annual for expense/income, one-time for lump_sum
  startAge: number;
  endAge?: number;         // omit for lump_sum and permanent changes
  inflationAdjust: boolean;
  affectsIrsMaxAccounts?: boolean; // default false — when true, expense also reduces IRS-maxed contributions
}

export interface AccountWithdrawalRules {
  startAge: number;  // Age when withdrawals can begin
}

export interface EarlyWithdrawalPenalty {
  amount: number;      // Penalty amount in dollars
  accountId: string;   // Which account triggered it
  accountName: string; // For display purposes
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  annualContribution: number;
  contributionGrowthRate: number; // as decimal, e.g., 0.03
  returnRate: number; // as decimal
  // Employer match (401k / employer RRSP)
  employerMatchPercent?: number;     // match rate as decimal, e.g. 0.5 = 50¢ per $1
  employerMatchLimit?: number;       // dollar cap on employer contribution (legacy)
  employerMatchLimitType?: 'dollar' | 'salary_percent'; // how the cap is expressed
  employerMatchLimitPercent?: number; // cap as % of salary, e.g. 0.05 = 5% of salary
  annualSalary?: number;             // gross salary; used for salary_percent match cap
  // IRS / CRA contribution limits
  useIrsMaxContribution?: boolean;   // replace annualContribution with inflation-adjusted IRS max each year
  withdrawalRules?: AccountWithdrawalRules;  // Optional for backwards compatibility
}

export interface Profile {
  country: CountryCode;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  region: string; // State code (US) or Province code (CA)
  filingStatus?: FilingStatus; // US only
  stateTaxRate?: number; // US only (as decimal), CA uses province
  annualIncome?: number; // For CA RRSP contribution room calculation
  socialSecurityBenefit?: number; // Canada CPP only; US uses income streams (annual)
  socialSecurityStartAge?: number; // Canada CPP start age; US uses income streams
  secondaryBenefitStartAge?: number; // OAS for CA
  secondaryBenefitAmount?: number; // OAS amount for CA
}

export interface Assumptions {
  inflationRate: number; // as decimal
  safeWithdrawalRate: number; // as decimal
  retirementReturnRate: number; // as decimal
  annualSpendingGoal?: number; // desired annual retirement spending, today's dollars (drives FIRE numbers)
  baristaAnnualIncome?: number; // expected part-time income for Barista FIRE, today's dollars
  leanMultiplier?: number; // fraction of spending for Lean FIRE, e.g. 0.7
  fatMultiplier?: number;  // fraction of spending for Fat FIRE, e.g. 1.6
  adjustTaxBracketsForInflation?: boolean; // default true — bracket thresholds grow with inflation
  spendingMode?: 'swr' | 'goal'; // default 'swr' — how retirement spending target is set
}

// ---- FIRE (Financial Independence / Retire Early) ----

export interface FireProjectionPoint {
  age: number;
  balance: number;
  contributing: boolean;
}

export type FireTargetId = 'full' | 'lean' | 'fat' | 'coast' | 'barista';

export interface FireTarget {
  id: FireTargetId;
  label: string;
  description: string;
  targetNumber: number;        // portfolio needed today (today's dollars)
  achieved: boolean;           // is current invested >= targetNumber?
  surplusOrShortfall: number;  // currentInvested - targetNumber (negative = shortfall)
  achieveAge: number | null;   // projected age this target is reached on current trajectory
}

export interface FireResult {
  currentInvested: number;     // sum of all account balances today
  annualSpending: number;      // spending goal used (today's dollars)
  nominalReturnRate: number;   // balance-weighted pre-retirement return
  realReturnRate: number;      // inflation-adjusted return used for coast math
  yearsToRetirement: number;
  coastAchieveAge: number | null; // age you'd hit the full number with NO further contributions
  targets: FireTarget[];
  projection: FireProjectionPoint[];
}

// ---- Advisor analyses (early access, Social Security, SWR) ----

export interface EarlyAccessAnalysis {
  relevant: boolean;            // only when retiring before the penalty-free age
  penaltyFreeAge: number;       // age locked accounts open without penalty (e.g. 60 US)
  retirementAge: number;
  yearsToBridge: number;        // penaltyFreeAge - retirementAge
  accessibleBalance: number;    // balances reachable at retirement without penalty
  lockedBalance: number;        // balances locked until penaltyFreeAge
  bridgeNeed: number;           // spending (net of income streams) across the gap years
  shortfall: number;            // bridgeNeed - accessibleBalance (positive = cash-constrained)
  accessibleLabels: string[];   // account-type labels that are reachable early
  lockedLabels: string[];       // account-type labels that are locked
}

export interface SocialSecurityCoverage {
  available: boolean;           // false if no SS/benefit income is modeled
  annualBenefit: number;        // total annual SS/government benefit, today's dollars
  startAge: number | null;      // age the (full) benefit begins
  spending: number;             // annual spending goal, today's dollars
  coveragePct: number;          // annualBenefit / spending
  residualDraw: number;         // spending - annualBenefit (>= 0)
  residualPortfolio: number;    // residualDraw / SWR (portfolio needed once SS is on)
}

export type SwrLevel = 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';

export interface SwrAssessment {
  swr: number;                  // the user's chosen rate (decimal)
  level: SwrLevel;
  retirementLengthYears: number;
  recommendedMax: number;       // suggested ceiling given retirement length (decimal)
  flagged: boolean;             // swr exceeds recommendedMax
  message: string;
}

// ---- Roth vs Traditional advice ----

export interface RothAdvice {
  available: boolean;          // false if current income not provided
  recommendation: 'roth' | 'traditional' | 'mixed';
  currentMarginalRate: number; // combined marginal rate today (decimal)
  retirementMarginalRate: number; // estimated combined marginal rate in retirement (decimal)
  currentTaxableIncome: number;
  retirementTaxableIncome: number;
  headline: string;
  reasoning: string[];
  caveats: string[];
}

export interface YearlyAccountBalance {
  age: number;
  year: number;
  balances: Record<string, number>;        // accountId -> end-of-year balance
  totalBalance: number;
  contributions: Record<string, number>;   // accountId -> employee contribution actually used this year
  employerContributions: Record<string, number>; // accountId -> employer match actually applied this year
  netLifeEventCost: number; // true extra cash needed from income: (expenses − income) − contributionReduction
  contributionReductionFromEvents: number; // retirement savings redirected to cover life event expenses
}

export interface AccumulationResult {
  yearlyBalances: YearlyAccountBalance[];
  finalBalances: Record<string, number>;
  totalAtRetirement: number;
  breakdownByGroup: Record<string, number>; // Flexible groupings defined by country
}

export interface YearlyWithdrawal {
  age: number;
  year: number;
  withdrawals: Record<string, number>; // accountId -> withdrawal
  remainingBalances: Record<string, number>; // accountId -> remaining balance
  totalWithdrawal: number;
  governmentBenefitIncome: number;  // was socialSecurityIncome — Canada CPP/OAS only
  incomeStreamIncome: number;       // user-defined income streams (SS, pensions, etc.)
  grossIncome: number;
  federalTax: number;
  stateTax: number;
  totalTax: number;
  afterTaxIncome: number;
  targetSpending: number;
  rmdAmount: number;
  totalRemainingBalance: number;
  earlyWithdrawalPenalties: EarlyWithdrawalPenalty[];
  totalPenalties: number;
}

export interface RetirementResult {
  yearlyWithdrawals: YearlyWithdrawal[];
  portfolioDepletionAge: number | null; // null if never depletes
  lifetimeTaxesPaid: number;
  sustainableMonthlyWithdrawal: number;
  sustainableAnnualWithdrawal: number;
  accountDepletionAges: Record<string, number | null>; // accountId -> age when depleted
}

// ---- Milestone timeline ----

export type MilestoneCategory = 'work' | 'retirement' | 'benefits' | 'portfolio' | 'tax' | 'life_event';

export interface Milestone {
  age: number;
  label: string;
  category: MilestoneCategory;
  /** Optional secondary detail shown on hover */
  detail?: string;
  /** Warning-level milestone (e.g. portfolio depletion) */
  isWarning?: boolean;
}

export interface AppState {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  lifeEvents: LifeEvent[];
}

// ---- Saved scenarios ----

export interface ScenarioState {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  incomeStreams: IncomeStream[];
  lifeEvents: LifeEvent[];
}

export interface SavedScenario {
  id: string;
  name: string;
  savedAt: number; // unix timestamp ms
  state: ScenarioState;
}

// Tax bracket structure
export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
}

// RMD table entry
export interface RMDEntry {
  age: number;
  divisor: number;
}

// Helper function type for getting tax treatment
export function getTaxTreatment(accountType: AccountType): TaxTreatment {
  switch (accountType) {
    // US accounts
    case 'traditional_401k':
    case 'traditional_ira':
      return 'pretax';
    case 'roth_401k':
    case 'roth_ira':
      return 'roth';
    case 'taxable':
      return 'taxable';
    case 'hsa':
      return 'hsa';
    // Canadian accounts
    case 'rrsp':
    case 'rrif':
    case 'lira':
    case 'lif':
    case 'fhsa':
    case 'employer_rrsp':
      return 'pretax';
    case 'tfsa':
      return 'roth';
    case 'non_registered':
      return 'taxable';
    default:
      return 'taxable';
  }
}

export function getAccountTypeLabel(type: AccountType): string {
  switch (type) {
    // US accounts
    case 'traditional_401k':
      return 'Traditional 401(k)';
    case 'roth_401k':
      return 'Roth 401(k)';
    case 'traditional_ira':
      return 'Traditional IRA';
    case 'roth_ira':
      return 'Roth IRA';
    case 'taxable':
      return 'Taxable Brokerage';
    case 'hsa':
      return 'HSA';
    // Canadian accounts
    case 'rrsp':
      return 'RRSP';
    case 'tfsa':
      return 'TFSA';
    case 'rrif':
      return 'RRIF';
    case 'lira':
      return 'LIRA';
    case 'lif':
      return 'LIF';
    case 'fhsa':
      return 'FHSA';
    case 'non_registered':
      return 'Non-Registered';
    case 'employer_rrsp':
      return 'Employer RRSP';
    default:
      return type;
  }
}

export function is401k(type: AccountType): boolean {
  return type === 'traditional_401k' || type === 'roth_401k';
}

export function isTraditional(type: string): boolean {
  return type === 'traditional_401k' || type === 'traditional_ira';
}

export function getIncomeTaxTreatmentLabel(treatment: IncomeTaxTreatment): string {
  switch (treatment) {
    case 'social_security':
      return 'Social Security';
    case 'fully_taxable':
      return 'Fully Taxable';
    case 'other_income':
      return 'Other Income';
    case 'tax_free':
      return 'Tax-Free';
    default:
      return treatment;
  }
}
