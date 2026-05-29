import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Profile,
  Account,
  Assumptions,
  IncomeStream,
  CountryCode,
  FilingStatus,
} from '../types';

// ── Types ────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: (
    profile: Profile,
    accounts: Account[],
    assumptions: Assumptions,
    incomeStreams: IncomeStream[]
  ) => void;
  onSkip: () => void;
  isDarkMode?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SAVINGS_BANDS = [
  { label: '$0',   midpoint: 0 },
  { label: '$50K', midpoint: 25_000 },
  { label: '$200K', midpoint: 125_000 },
  { label: '$500K', midpoint: 350_000 },
  { label: '$1M',  midpoint: 750_000 },
  { label: '$2M+', midpoint: 1_500_000 },
];

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'IL', name: 'Illinois' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'OH', name: 'Ohio' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'TX', name: 'Texas' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'OTHER', name: 'Other' },
];

const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

// ── Wizard state ──────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1 — Ages
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  filingStatus: FilingStatus;
  // Step 2 — Savings & Income
  savingsBand: number; // 0–5 index
  annualContribution: number;
  annualSpendingGoal: number;
  monthlySSBenefit: number;
  // Step 3 — Country & Region
  country: CountryCode;
  region: string;
}

const defaultState: WizardState = {
  currentAge: 35,
  retirementAge: 65,
  lifeExpectancy: 90,
  filingStatus: 'single',
  savingsBand: 2,
  annualContribution: 15_000,
  annualSpendingGoal: 60_000,
  monthlySSBenefit: 2_000,
  country: 'US',
  region: 'TX',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function buildResult(state: WizardState): {
  profile: Profile;
  accounts: Account[];
  assumptions: Assumptions;
  incomeStreams: IncomeStream[];
} {
  const { country, savingsBand, annualContribution, annualSpendingGoal } = state;
  const totalSavings = SAVINGS_BANDS[savingsBand].midpoint;
  const isUS = country === 'US';
  const withdrawalStartAge = isUS ? 60 : 55;

  // Accounts
  const primaryBalance = Math.round(totalSavings * 0.7);
  const secondaryBalance = totalSavings - primaryBalance;
  const primaryContrib = Math.round(annualContribution * 0.7);
  const secondaryContrib = annualContribution - primaryContrib;

  const accounts: Account[] = [
    {
      id: uuidv4(),
      name: isUS ? 'Company 401(k)' : 'Employer RRSP',
      type: isUS ? 'traditional_401k' : 'employer_rrsp',
      balance: primaryBalance,
      annualContribution: primaryContrib,
      contributionGrowthRate: 0.03,
      returnRate: 0.07,
      employerMatchPercent: 0.5,
      employerMatchLimit: Math.round(annualContribution * 0.03),
      withdrawalRules: { startAge: withdrawalStartAge },
    },
    {
      id: uuidv4(),
      name: isUS ? 'Roth IRA' : 'TFSA',
      type: isUS ? 'roth_ira' : 'tfsa',
      balance: secondaryBalance,
      annualContribution: secondaryContrib,
      contributionGrowthRate: 0.03,
      returnRate: 0.07,
      withdrawalRules: { startAge: withdrawalStartAge },
    },
  ];

  // Profile
  const profile: Profile = {
    country,
    currentAge: state.currentAge,
    retirementAge: state.retirementAge,
    lifeExpectancy: state.lifeExpectancy,
    region: state.region,
    ...(isUS && { filingStatus: state.filingStatus }),
  };

  // Assumptions
  const assumptions: Assumptions = {
    inflationRate: 0.03,
    safeWithdrawalRate: 0.04,
    retirementReturnRate: 0.05,
    annualSpendingGoal,
  };

  // Income streams
  const incomeStreams: IncomeStream[] = isUS
    ? [
        {
          id: uuidv4(),
          name: 'Social Security',
          monthlyAmount: state.monthlySSBenefit,
          startAge: 67,
          taxTreatment: 'social_security',
        },
      ]
    : [];

  return { profile, accounts, assumptions, incomeStreams };
}

// ── Shared style tokens ───────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
  'bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm';

const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

// ── Step components ───────────────────────────────────────────────────────────

function StepAges({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const isUS = state.country === 'US';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Let's start with your timeline
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          These ages shape all the projections.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Current age */}
        <div>
          <label className={labelCls}>Current age</label>
          <input
            type="number"
            className={inputCls}
            value={state.currentAge}
            min={18}
            max={80}
            onChange={(e) => {
              const val = clamp(parseInt(e.target.value) || 18, 18, 80);
              const retirementAge = Math.max(state.retirementAge, val + 1);
              const lifeExpectancy = Math.max(state.lifeExpectancy, retirementAge + 1);
              onChange({ currentAge: val, retirementAge, lifeExpectancy });
            }}
          />
        </div>

        {/* Retirement age */}
        <div>
          <label className={labelCls}>Retirement age</label>
          <input
            type="number"
            className={inputCls}
            value={state.retirementAge}
            min={state.currentAge + 1}
            max={80}
            onChange={(e) => {
              const val = clamp(parseInt(e.target.value) || state.currentAge + 1, state.currentAge + 1, 80);
              const lifeExpectancy = Math.max(state.lifeExpectancy, val + 1);
              onChange({ retirementAge: val, lifeExpectancy });
            }}
          />
        </div>

        {/* Life expectancy */}
        <div>
          <label className={labelCls}>Life expectancy</label>
          <input
            type="number"
            className={inputCls}
            value={state.lifeExpectancy}
            min={state.retirementAge + 1}
            max={100}
            onChange={(e) => {
              const val = clamp(parseInt(e.target.value) || 90, state.retirementAge + 1, 100);
              onChange({ lifeExpectancy: val });
            }}
          />
        </div>
      </div>

      {/* Filing status — US only */}
      {isUS && (
        <div>
          <label className={labelCls}>Filing status</label>
          <div className="flex gap-3 mt-1">
            {(['single', 'married_filing_jointly'] as FilingStatus[]).map((status) => {
              const label = status === 'single' ? 'Single' : 'Married filing jointly';
              const active = state.filingStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onChange({ filingStatus: status })}
                  className={
                    'flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600')
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StepSavings({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const isUS = state.country === 'US';
  const bandIndex = state.savingsBand;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Savings & income
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Rough numbers are fine — you can refine everything later.
        </p>
      </div>

      {/* Savings slider */}
      <div>
        <label className={labelCls}>
          Rough total savings today
          <span className="ml-2 font-semibold text-blue-600 dark:text-blue-400">
            {SAVINGS_BANDS[bandIndex].label}
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={bandIndex}
          onChange={(e) => onChange({ savingsBand: parseInt(e.target.value) })}
          className="w-full h-2 accent-blue-600 cursor-pointer"
        />
        {/* Band labels */}
        <div className="flex justify-between mt-1">
          {SAVINGS_BANDS.map((band, i) => (
            <span
              key={i}
              onClick={() => onChange({ savingsBand: i })}
              className={
                'text-xs cursor-pointer transition-colors ' +
                (i === bandIndex
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300')
              }
            >
              {band.label}
            </span>
          ))}
        </div>
      </div>

      {/* Annual contribution */}
      <div>
        <label className={labelCls}>Annual contribution (today's $)</label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400 text-sm pointer-events-none">
            $
          </span>
          <input
            type="number"
            className={inputCls + ' pl-6'}
            value={state.annualContribution}
            min={0}
            step={500}
            onChange={(e) =>
              onChange({ annualContribution: Math.max(0, parseInt(e.target.value) || 0) })
            }
          />
        </div>
      </div>

      {/* Annual spending goal */}
      <div>
        <label className={labelCls}>Annual spending goal in retirement (today's $)</label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400 text-sm pointer-events-none">
            $
          </span>
          <input
            type="number"
            className={inputCls + ' pl-6'}
            value={state.annualSpendingGoal}
            min={0}
            step={1000}
            onChange={(e) =>
              onChange({ annualSpendingGoal: Math.max(0, parseInt(e.target.value) || 0) })
            }
          />
        </div>
      </div>

      {/* Monthly SS benefit — US only */}
      {isUS && (
        <div>
          <label className={labelCls}>
            Estimated monthly Social Security benefit (today's $)
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400 text-sm pointer-events-none">
              $
            </span>
            <input
              type="number"
              className={inputCls + ' pl-6'}
              value={state.monthlySSBenefit}
              min={0}
              step={100}
              onChange={(e) =>
                onChange({ monthlySSBenefit: Math.max(0, parseInt(e.target.value) || 0) })
              }
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Check your estimate at ssa.gov. We'll set the start age to 67.
          </p>
        </div>
      )}
    </div>
  );
}

function StepCountry({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const isUS = state.country === 'US';
  const regions = isUS ? US_STATES : CA_PROVINCES;

  const handleCountryChange = (country: CountryCode) => {
    const defaultRegion = country === 'US' ? 'TX' : 'ON';
    onChange({ country, region: defaultRegion });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Where are you located?
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This sets your tax rules and account types.
        </p>
      </div>

      {/* Country toggle */}
      <div>
        <label className={labelCls}>Country</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {(['US', 'CA'] as CountryCode[]).map((code) => {
            const flag = code === 'US' ? '🇺🇸' : '🇨🇦';
            const name = code === 'US' ? 'United States' : 'Canada';
            const active = state.country === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => handleCountryChange(code)}
                className={
                  'flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600')
                }
              >
                <span className="text-lg">{flag}</span>
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* State / Province */}
      <div>
        <label className={labelCls}>{isUS ? 'State' : 'Province'}</label>
        <select
          className={inputCls}
          value={state.region}
          onChange={(e) => onChange({ region: e.target.value })}
        >
          {regions.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Reassurance note */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-3">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <span className="font-medium">Good news:</span> you can change everything after
          setup — accounts, contributions, tax rates, and more.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state, setState] = useState<WizardState>(defaultState);

  const patch = (update: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...update }));

  const handleBack = () => {
    if (step > 1) setStep((prev) => (prev - 1) as 1 | 2 | 3);
  };

  const handleNext = () => {
    if (step < 3) {
      setStep((prev) => (prev + 1) as 1 | 2 | 3);
    } else {
      const { profile, accounts, assumptions, incomeStreams } = buildResult(state);
      onComplete(profile, accounts, assumptions, incomeStreams);
    }
  };

  const isLastStep = step === 3;

  return (
    // Overlay
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header bar */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Step {step} of 3
            </span>
            {/* Dot indicator */}
            <div className="flex gap-1.5">
              {([1, 2, 3] as const).map((n) => (
                <span
                  key={n}
                  className={
                    'w-2 h-2 rounded-full transition-colors ' +
                    (n === step
                      ? 'bg-blue-500'
                      : n < step
                      ? 'bg-blue-300 dark:bg-blue-700'
                      : 'bg-gray-200 dark:bg-gray-600')
                  }
                />
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Step body */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(100vh-260px)]">
          {step === 1 && <StepAges state={state} onChange={patch} />}
          {step === 2 && <StepSavings state={state} onChange={patch} />}
          {step === 3 && <StepCountry state={state} onChange={patch} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-3">
          {/* Nav buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className={
                'flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors ' +
                (step === 1
                  ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed bg-transparent'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600')
              }
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
            >
              {isLastStep ? 'Get Started →' : 'Next'}
            </button>
          </div>

          {/* Skip link */}
          <div className="text-center">
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Skip setup →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
