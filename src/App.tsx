import { useState, useCallback, useMemo } from "react";
import { Account, Profile, Assumptions, IncomeStream, LifeEvent } from "./types";
import {
  DEFAULT_PROFILE,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_INCOME_STREAMS,
} from "./utils/constants";
import { useRetirementCalc } from "./hooks/useRetirementCalc";
import { useLocalStorage, useDarkMode } from "./hooks/useLocalStorage";
import { CountryProvider, useCountry } from "./contexts/CountryContext";
import { getCountryConfig, type CountryCode } from "./countries";
import { getDefaultWithdrawalAge } from "./utils/withdrawalDefaults";
import { Layout } from "./components/Layout";
import { AccountList } from "./components/AccountList";
import { ProfileForm } from "./components/ProfileForm";
import { AssumptionsForm } from "./components/AssumptionsForm";
import { IncomeStreamList } from "./components/IncomeStreamList";
import { LifeEventList } from "./components/LifeEventList";
import { SummaryCards } from "./components/SummaryCards";
import { ChartAccumulation } from "./components/ChartAccumulation";
import { ChartDrawdown } from "./components/ChartDrawdown";
import { ChartIncome } from "./components/ChartIncome";
import { ChartTax } from "./components/ChartTax";
import { ChartComposition } from "./components/ChartComposition";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { FirePanel } from "./components/FirePanel";
import {
  exportBackup,
  exportProjectionsCsv,
  parseBackup,
} from "./utils/dataTransfer";
import { DataTableAccumulation } from "./components/DataTableAccumulation";
import { DataTableWithdrawal } from "./components/DataTableWithdrawal";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { ChartPlan } from "./components/ChartPlan";
import { ChartTimeline } from "./components/ChartTimeline";
import { ScenarioComparison } from "./components/ScenarioComparison";
import { MathDebugPanel } from "./components/MathDebugPanel";
import { ChartMonteCarlo } from "./components/ChartMonteCarlo";
import { useMonteCarlo } from "./hooks/useMonteCarlo";
import type { MonteCarloConfig } from "./types";
import { deriveMilestones } from "./utils/milestones";
import { calculateFire, calculateEarlyAccess } from "./utils/fire";
import { useScenarios } from "./hooks/useScenarios";
import { v4 as uuidv4 } from "uuid";

// Default accounts for US
const createUSDefaultAccounts = (): Account[] => [
  {
    id: uuidv4(),
    name: "Company 401(k)",
    type: "traditional_401k",
    balance: 150000,
    annualContribution: 15000,
    contributionGrowthRate: 0.03,
    returnRate: 0.07,
    employerMatchPercent: 0.5,
    employerMatchLimit: 3000,
  },
  {
    id: uuidv4(),
    name: "Roth IRA",
    type: "roth_ira",
    balance: 40000,
    annualContribution: 7000,
    contributionGrowthRate: 0,
    returnRate: 0.07,
  },
];

// Default accounts for Canada
const createCADefaultAccounts = (): Account[] => [
  {
    id: uuidv4(),
    name: "Employer RRSP",
    type: "employer_rrsp",
    balance: 150000,
    annualContribution: 15000,
    contributionGrowthRate: 0.03,
    returnRate: 0.07,
    employerMatchPercent: 0.5,
    employerMatchLimit: 3000,
  },
  {
    id: uuidv4(),
    name: "TFSA",
    type: "tfsa",
    balance: 40000,
    annualContribution: 7000,
    contributionGrowthRate: 0,
    returnRate: 0.07,
  },
];

// Get default accounts based on country
const createDefaultAccounts = (country: CountryCode = "US"): Account[] => {
  return country === "CA"
    ? createCADefaultAccounts()
    : createUSDefaultAccounts();
};

/**
 * Normalize accounts loaded from localStorage to add withdrawal rules if missing
 * This ensures backwards compatibility with accounts saved before withdrawal rules were added
 */
function normalizeAccount(account: Account, profile: Profile): Account {
  // If account already has withdrawal rules, return as-is
  if (account.withdrawalRules) {
    return account;
  }

  // Apply default withdrawal age based on account type and country config
  const countryConfig = getCountryConfig(profile.country);
  const defaultAge = getDefaultWithdrawalAge(
    account,
    profile.retirementAge,
    countryConfig,
  );

  return {
    ...account,
    withdrawalRules: { startAge: defaultAge },
  };
}

type TabType =
  | "accumulation"
  | "retirement"
  | "fire"
  | "summary"
  | "methodology"
  | "scenarios";

// Inner app component that uses the country context
function AppContent() {
  // Country context
  const { config: countryConfig } = useCountry();

  // Load profile first (needed for account normalization)
  const [profile, setProfile, resetProfile] = useLocalStorage<Profile>(
    "retirement-planner-profile",
    DEFAULT_PROFILE,
  );

  // Use localStorage for accounts with normalization
  const [rawAccounts, setRawAccounts, resetAccounts] = useLocalStorage<
    Account[]
  >("retirement-planner-accounts", createDefaultAccounts());

  // Normalize accounts to add withdrawal rules if missing (backwards compatibility)
  const accounts = rawAccounts.map((account) =>
    normalizeAccount(account, profile),
  );

  // Wrapper for setAccounts that saves normalized accounts
  const setAccounts = useCallback(
    (value: Account[] | ((prev: Account[]) => Account[])) => {
      if (typeof value === "function") {
        setRawAccounts((prev) => {
          const updated = value(prev);
          return updated.map((account) => normalizeAccount(account, profile));
        });
      } else {
        setRawAccounts(
          value.map((account) => normalizeAccount(account, profile)),
        );
      }
    },
    [setRawAccounts, profile],
  );

  const [assumptions, setAssumptions, resetAssumptions] =
    useLocalStorage<Assumptions>(
      "retirement-planner-assumptions",
      DEFAULT_ASSUMPTIONS,
    );

  const [incomeStreams, setIncomeStreams, resetIncomeStreams] = useLocalStorage<
    IncomeStream[]
  >("retirement-planner-income-streams", DEFAULT_INCOME_STREAMS);

  const [lifeEvents, setLifeEvents, resetLifeEvents] = useLocalStorage<LifeEvent[]>(
    "retirement-planner-life-events",
    []
  );

  // Dark mode
  const [isDarkMode, toggleDarkMode] = useDarkMode();

  // Detect first-time user: no saved accounts in localStorage
  const isFirstVisit = !window.localStorage.getItem(
    "retirement-planner-accounts",
  );
  const [showOnboarding, setShowOnboarding] = useState(isFirstVisit);

  // Scenarios
  const { scenarios, saveScenario, deleteScenario } = useScenarios();

  // UI state (not persisted)
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "accounts",
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSaveScenario, setShowSaveScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState("");

  const { accumulation, retirement } = useRetirementCalc(
    accounts,
    profile,
    assumptions,
    countryConfig,
    incomeStreams,
    lifeEvents,
  );

  const milestones = useMemo(() => {
    const fire = calculateFire(accounts, profile, assumptions);
    const earlyAccess = calculateEarlyAccess(
      accounts,
      profile,
      assumptions,
      countryConfig,
      incomeStreams,
      accumulation,
    );
    return deriveMilestones(
      profile,
      accounts,
      accumulation,
      retirement,
      fire,
      earlyAccess,
      incomeStreams,
      countryConfig,
      lifeEvents,
    );
  }, [accounts, profile, assumptions, countryConfig, incomeStreams, accumulation, retirement, lifeEvents]);

  // Monte Carlo: overlay randomized returns on the deterministic withdrawal schedule
  const monteCarloConfig: MonteCarloConfig | null = useMemo(() => {
    if (accounts.length === 0 || accumulation.totalAtRetirement <= 0 || retirement.yearlyWithdrawals.length === 0) {
      return null;
    }
    return {
      startingPortfolio: accumulation.totalAtRetirement,
      withdrawalSchedule: retirement.yearlyWithdrawals.map((y) => y.totalWithdrawal),
      retirementReturnRate: assumptions.retirementReturnRate,
      volatility: assumptions.returnVolatility ?? 0.1,
      numRuns: 1000,
      startAge: profile.retirementAge,
    };
  }, [accounts.length, accumulation.totalAtRetirement, retirement.yearlyWithdrawals, assumptions.retirementReturnRate, assumptions.returnVolatility, profile.retirementAge]);

  const { result: monteCarloResult, isRunning: mcRunning } = useMonteCarlo(monteCarloConfig);

  const deterministicByAge = useMemo(() => {
    const map: Record<number, number> = {};
    for (const y of retirement.yearlyWithdrawals) {
      map[y.age] = Math.max(0, y.totalRemainingBalance);
    }
    return map;
  }, [retirement.yearlyWithdrawals]);

  const handleAddAccount = (account: Account) => {
    setAccounts((prev) => [...prev, account]);
  };

  const handleUpdateAccount = (updatedAccount: Account) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === updatedAccount.id ? updatedAccount : acc)),
    );
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts((prev) => prev.filter((acc) => acc.id !== id));
  };

  const handleAddIncomeStream = (stream: IncomeStream) => {
    setIncomeStreams((prev) => [...prev, stream]);
  };

  const handleUpdateIncomeStream = (updatedStream: IncomeStream) => {
    setIncomeStreams((prev) =>
      prev.map((s) => (s.id === updatedStream.id ? updatedStream : s)),
    );
  };

  const handleDeleteIncomeStream = (id: string) => {
    setIncomeStreams((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddLifeEvent = (event: LifeEvent) => {
    setLifeEvents((prev) => [...prev, event]);
  };

  const handleUpdateLifeEvent = (updatedEvent: LifeEvent) => {
    setLifeEvents((prev) =>
      prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)),
    );
  };

  const handleDeleteLifeEvent = (id: string) => {
    setLifeEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const handleReset = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const confirmReset = useCallback(() => {
    resetAccounts();
    resetProfile();
    resetAssumptions();
    resetIncomeStreams();
    resetLifeEvents();
    setShowResetConfirm(false);
    // Force reload to get fresh default accounts with new UUIDs
    window.location.reload();
  }, [resetAccounts, resetProfile, resetAssumptions, resetIncomeStreams, resetLifeEvents]);

  const cancelReset = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  const handleExportBackup = useCallback(() => {
    exportBackup(accounts, profile, assumptions, incomeStreams, lifeEvents);
  }, [accounts, profile, assumptions, incomeStreams, lifeEvents]);

  const handleExportCsv = useCallback(() => {
    exportProjectionsCsv(accumulation, retirement);
  }, [accumulation, retirement]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseBackup(String(reader.result ?? ""));
        localStorage.setItem("retirement-planner-country", parsed.country);
        localStorage.setItem(
          "retirement-planner-accounts",
          JSON.stringify(parsed.accounts),
        );
        localStorage.setItem(
          "retirement-planner-profile",
          JSON.stringify(parsed.profile),
        );
        localStorage.setItem(
          "retirement-planner-assumptions",
          JSON.stringify(parsed.assumptions),
        );
        localStorage.setItem(
          "retirement-planner-income-streams",
          JSON.stringify(parsed.incomeStreams),
        );
        localStorage.setItem(
          "retirement-planner-life-events",
          JSON.stringify(parsed.lifeEvents),
        );
        window.location.reload();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not import that file.",
        );
      }
    };
    reader.onerror = () => alert("Could not read that file.");
    reader.readAsText(file);
  }, []);

  const tabs: { id: TabType; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "accumulation", label: "Accumulation Phase" },
    { id: "retirement", label: "Retirement Phase" },
    { id: "fire", label: "FIRE & Advice" },
    { id: "scenarios", label: `Scenarios${scenarios.length > 0 ? ` (${scenarios.length})` : ""}` },
    { id: "methodology", label: "Methodology" },
  ];

  const handleRestoreScenario = (state: typeof scenarios[0]["state"]) => {
    if (!window.confirm("Restore this scenario? Your current inputs will be replaced.")) return;
    setAccounts(state.accounts);
    setProfile(state.profile);
    setAssumptions(state.assumptions);
    setIncomeStreams(state.incomeStreams);
    setLifeEvents(state.lifeEvents);
    setActiveTab("summary");
  };

  const handleSaveScenario = () => {
    saveScenario(scenarioName, {
      accounts,
      profile,
      assumptions,
      incomeStreams,
      lifeEvents,
    });
    setShowSaveScenario(false);
    setScenarioName("");
    setActiveTab("scenarios");
  };

  const handleOnboardingComplete = useCallback(
    (
      newProfile: Profile,
      newAccounts: Account[],
      newAssumptions: Assumptions,
      newIncomeStreams: IncomeStream[],
    ) => {
      setProfile(newProfile);
      setAccounts(newAccounts);
      setAssumptions(newAssumptions);
      setIncomeStreams(newIncomeStreams);
      setShowOnboarding(false);
    },
    [setProfile, setAccounts, setAssumptions, setIncomeStreams],
  );

  return (
    <Layout
      isDarkMode={isDarkMode}
      onToggleDarkMode={toggleDarkMode}
      onReset={handleReset}
      onExportBackup={handleExportBackup}
      onExportCsv={handleExportCsv}
      onImport={handleImport}
    >
      {/* Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingWizard
          isDarkMode={isDarkMode}
          onComplete={handleOnboardingComplete}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Reset All Data?
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This will clear all your saved accounts, profile settings, and
              assumptions. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelReset}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Inputs */}
        <div className="lg:col-span-1 space-y-4">
          {/* Accounts Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggleSection("accounts")}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                Investment Accounts
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                  expandedSection === "accounts" ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {expandedSection === "accounts" && (
              <div className="px-4 pb-4">
                <AccountList
                  accounts={accounts}
                  profile={profile}
                  countryConfig={countryConfig}
                  onAdd={handleAddAccount}
                  onUpdate={handleUpdateAccount}
                  onDelete={handleDeleteAccount}
                />
              </div>
            )}
          </div>

          {/* Profile Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggleSection("profile")}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                Personal Profile
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                  expandedSection === "profile" ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {expandedSection === "profile" && (
              <div className="px-4 pb-4">
                <ProfileForm profile={profile} onChange={setProfile} />
              </div>
            )}
          </div>

          {/* Income Streams Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggleSection("incomeStreams")}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                Income Streams
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                  expandedSection === "incomeStreams" ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {expandedSection === "incomeStreams" && (
              <div className="px-4 pb-4">
                <IncomeStreamList
                  incomeStreams={incomeStreams}
                  onAdd={handleAddIncomeStream}
                  onUpdate={handleUpdateIncomeStream}
                  onDelete={handleDeleteIncomeStream}
                />
              </div>
            )}
          </div>

          {/* Life Events Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggleSection("lifeEvents")}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                Life Events
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                  expandedSection === "lifeEvents" ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {expandedSection === "lifeEvents" && (
              <div className="px-4 pb-4">
                <LifeEventList
                  lifeEvents={lifeEvents}
                  profile={profile}
                  onAdd={handleAddLifeEvent}
                  onUpdate={handleUpdateLifeEvent}
                  onDelete={handleDeleteLifeEvent}
                />
              </div>
            )}
          </div>

          {/* Assumptions Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggleSection("assumptions")}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                Economic Assumptions
              </span>
              <svg
                className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                  expandedSection === "assumptions" ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {expandedSection === "assumptions" && (
              <div className="px-4 pb-4">
                <AssumptionsForm
                  assumptions={assumptions}
                  onChange={setAssumptions}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Charts and Results */}
        <div className="lg:col-span-2 space-y-6">
          {accounts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
              <svg
                className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Accounts Added
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Add investment accounts to see your retirement projections.
              </p>
            </div>
          ) : (
            <>
              {/* Tab Navigation + Save Scenario */}
              <div className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-end justify-between gap-4">
                  <nav className="flex space-x-8 overflow-x-auto scrollbar-hide">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                          activeTab === tab.id
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>

                  {/* Save Scenario */}
                  <div className="flex-shrink-0 pb-2">
                    {showSaveScenario ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={scenarioName}
                          onChange={(e) => setScenarioName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveScenario();
                            if (e.key === "Escape") { setShowSaveScenario(false); setScenarioName(""); }
                          }}
                          placeholder="Scenario name…"
                          className="w-44 px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          onClick={handleSaveScenario}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setShowSaveScenario(false); setScenarioName(""); }}
                          className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setShowSaveScenario(true); setScenarioName(""); }}
                        disabled={scenarios.length >= 6}
                        title={scenarios.length >= 6 ? "Maximum 6 scenarios saved" : "Save current plan as a named scenario"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        Save Scenario
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Tab */}
              {activeTab === "summary" && (
                <div className="space-y-6">
                  <SummaryCards
                    profile={profile}
                    assumptions={assumptions}
                    accumulationResult={accumulation}
                    retirementResult={retirement}
                  />

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Plan Overview
                    </h3>
                    <ChartPlan
                      accumulation={accumulation}
                      retirement={retirement}
                      profile={profile}
                      milestones={milestones}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                      Milestone Timeline
                    </h3>
                    <ChartTimeline
                      milestones={milestones}
                      startAge={profile.currentAge}
                      endAge={profile.lifeExpectancy}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Portfolio Composition at Retirement
                    </h3>
                    <ChartComposition
                      accounts={accounts}
                      result={accumulation}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <MathDebugPanel
                    accounts={accounts}
                    profile={profile}
                    assumptions={assumptions}
                    incomeStreams={incomeStreams}
                    accumulation={accumulation}
                    retirement={retirement}
                    countryConfig={countryConfig}
                  />
                </div>
              )}

              {/* Accumulation Tab */}
              {activeTab === "accumulation" && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Account Growth (Age {profile.currentAge} to{" "}
                      {profile.retirementAge})
                    </h3>
                    <ChartAccumulation
                      accounts={accounts}
                      result={accumulation}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <DataTableAccumulation
                    accounts={accounts}
                    result={accumulation}
                  />

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Portfolio Composition at Retirement
                    </h3>
                    <ChartComposition
                      accounts={accounts}
                      result={accumulation}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                </div>
              )}

              {/* Retirement Tab */}
              {activeTab === "retirement" && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Monte Carlo Risk Analysis
                      </h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        1,000 randomized return sequences
                      </span>
                    </div>
                    {monteCarloResult ? (
                      <ChartMonteCarlo
                        result={monteCarloResult}
                        isRunning={mcRunning}
                        deterministicByAge={deterministicByAge}
                        lifeExpectancy={profile.lifeExpectancy}
                        isDarkMode={isDarkMode}
                      />
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                        {mcRunning ? "Running simulation…" : "Add accounts to run the simulation."}
                      </p>
                    )}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Portfolio Drawdown (Age {profile.retirementAge} to{" "}
                      {profile.lifeExpectancy})
                    </h3>
                    <ChartDrawdown
                      accounts={accounts}
                      result={retirement}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Annual Retirement Income
                    </h3>
                    <ChartIncome
                      result={retirement}
                      incomeStreams={incomeStreams}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Tax Burden Over Time
                    </h3>
                    <ChartTax result={retirement} isDarkMode={isDarkMode} />
                  </div>

                  <DataTableWithdrawal
                    accounts={accounts}
                    result={retirement}
                    incomeStreams={incomeStreams}
                  />
                </div>
              )}

              {/* FIRE & Advice Tab */}
              {activeTab === "fire" && (
                <FirePanel
                  accounts={accounts}
                  profile={profile}
                  assumptions={assumptions}
                  countryConfig={countryConfig}
                  accumulation={accumulation}
                  retirement={retirement}
                  incomeStreams={incomeStreams}
                  onAssumptionsChange={setAssumptions}
                  isDarkMode={isDarkMode}
                />
              )}

              {/* Scenarios Tab */}
              {activeTab === "scenarios" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Saved Scenarios</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Compare up to 6 saved plans side-by-side
                      </p>
                    </div>
                    {scenarios.length < 6 && (
                      <button
                        onClick={() => { setShowSaveScenario(true); setScenarioName(""); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        Save Current Plan
                      </button>
                    )}
                  </div>
                  <ScenarioComparison
                    scenarios={scenarios}
                    onDelete={deleteScenario}
                    onRestore={handleRestoreScenario}
                  />
                </div>
              )}

              {/* Methodology Tab */}
              {activeTab === "methodology" && (
                <MethodologyPanel profile={profile} assumptions={assumptions} />
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function App() {
  const handleCountryChange = useCallback((newCountry: CountryCode) => {
    const countryConfig = getCountryConfig(newCountry);
    const defaultProfile = countryConfig.getDefaultProfile();

    localStorage.setItem(
      "retirement-planner-accounts",
      JSON.stringify(createDefaultAccounts(newCountry)),
    );
    localStorage.setItem(
      "retirement-planner-profile",
      JSON.stringify({
        ...DEFAULT_PROFILE,
        ...defaultProfile,
      }),
    );

    localStorage.setItem(
      "retirement-planner-income-streams",
      JSON.stringify(newCountry === "US" ? DEFAULT_INCOME_STREAMS : []),
    );

    window.location.reload();
  }, []);

  return (
    <CountryProvider initialCountry="US" onCountryChange={handleCountryChange}>
      <AppContent />
    </CountryProvider>
  );
}

export default App;
