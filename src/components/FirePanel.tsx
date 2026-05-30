import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Account,
  Profile,
  Assumptions,
  AccumulationResult,
  RetirementResult,
  FireTarget,
  IncomeStream,
  ConversionYear,
  ACAYear,
} from "../types";
import type { CountryConfig } from "../countries";
import {
  calculateFire,
  generateFireAdvice,
  calculateEarlyAccess,
  calculateSocialSecurityCoverage,
  assessSwr,
} from "../utils/fire";
import { getRothVsTraditionalAdvice } from "../utils/rothVsTraditional";
import { calculateRothConversionLadder } from "../utils/rothConversion";
import { calculateACA } from "../utils/aca";
import { FIRE_STRATEGY_INFO } from "../utils/fireStrategyInfo";
import { NumberInput } from "./NumberInput";
import { Tooltip } from "./Tooltip";

interface FirePanelProps {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  countryConfig: CountryConfig;
  accumulation: AccumulationResult;
  retirement: RetirementResult;
  incomeStreams: IncomeStream[];
  onAssumptionsChange: (assumptions: Assumptions) => void;
  isDarkMode?: boolean;
}

const inputClassName =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

const TARGET_COLORS: Record<string, string> = {
  full: "#2563eb",
  lean: "#d97706",
  fat: "#7c3aed",
  barista: "#059669",
};

export function FirePanel({
  accounts,
  profile,
  assumptions,
  countryConfig,
  accumulation,
  retirement,
  incomeStreams,
  onAssumptionsChange,
  isDarkMode = false,
}: FirePanelProps) {
  const fire = calculateFire(accounts, profile, assumptions);
  const advice = getRothVsTraditionalAdvice(
    profile,
    assumptions,
    countryConfig,
    retirement,
  );
  const tips = generateFireAdvice(fire, accounts, profile, assumptions);
  const earlyAccess = calculateEarlyAccess(
    accounts,
    profile,
    assumptions,
    countryConfig,
    incomeStreams,
    accumulation,
  );
  const ssCoverage = calculateSocialSecurityCoverage(
    profile,
    assumptions,
    incomeStreams,
  );
  const swr = assessSwr(profile, assumptions);
  const rothLadder = calculateRothConversionLadder(
    accounts,
    profile,
    assumptions,
    incomeStreams,
    accumulation,
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: countryConfig.currency || "USD",
      maximumFractionDigits: 0,
    }).format(Math.round(n));

  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

  const update = (field: keyof Assumptions, value: number) =>
    onAssumptionsChange({ ...assumptions, [field]: value });

  const axisColor = isDarkMode ? "#9ca3af" : "#6b7280";
  const gridColor = isDarkMode ? "#374151" : "#e5e7eb";

  const compactCurrency = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  const adviceBadge =
    advice.recommendation === "roth"
      ? {
          text: "Roth",
          cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
        }
      : advice.recommendation === "traditional"
        ? {
            text: "Traditional",
            cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
          }
        : {
            text: "Mixed",
            cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
          };

  const refTargets = fire.targets.filter((t) => t.id !== "coast");

  return (
    <div className="space-y-6">
      {/* Adjustable inputs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Adjust Your FIRE Inputs
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Tweak these to see how your targets and projection change. Changes are
          saved automatically.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Annual Spending Goal
              <Tooltip text="Desired annual spending in retirement, in today's dollars. Drives every FIRE number." />
            </label>
            <NumberInput
              value={assumptions.annualSpendingGoal ?? 60000}
              onChange={(v) => update("annualSpendingGoal", v)}
              min={0}
              defaultValue={60000}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Safe Withdrawal Rate (%)
              <Tooltip text="Percentage of portfolio you withdraw each year. The classic rule is 4%." />
            </label>
            <NumberInput
              value={assumptions.safeWithdrawalRate}
              onChange={(v) => update("safeWithdrawalRate", v)}
              min={1}
              max={10}
              isPercentage
              decimals={1}
              defaultValue={0.04}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Barista Income
              <Tooltip text="Annual part-time income in semi-retirement, today's dollars. Used for Barista FIRE." />
            </label>
            <NumberInput
              value={assumptions.baristaAnnualIncome ?? 20000}
              onChange={(v) => update("baristaAnnualIncome", v)}
              min={0}
              defaultValue={20000}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Part-Time Years (bridge)
              <Tooltip text="How many years you'll work part-time before fully retiring. The bridge model grows your portfolio to the Full FIRE number over this period, then it funds spending alone. Set 0 for indefinite part-time income." />
            </label>
            <NumberInput
              value={assumptions.baristaBridgeYears ?? 0}
              onChange={(v) => update("baristaBridgeYears", v)}
              min={0}
              max={40}
              decimals={0}
              defaultValue={10}
              className={inputClassName}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {(assumptions.baristaBridgeYears ?? 0) > 0
                ? `Part-time to ~age ${profile.retirementAge + (assumptions.baristaBridgeYears ?? 0)}, then fully retired`
                : "0 = part-time income continues indefinitely"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Lean FIRE (% of spending)
              <Tooltip text="A leaner lifestyle as a share of your spending goal. 70% is typical." />
            </label>
            <NumberInput
              value={assumptions.leanMultiplier ?? 0.7}
              onChange={(v) => update("leanMultiplier", v)}
              min={10}
              max={100}
              isPercentage
              decimals={0}
              defaultValue={0.7}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fat FIRE (% of spending)
              <Tooltip text="A more generous lifestyle as a share of your spending goal. 160% is typical." />
            </label>
            <NumberInput
              value={assumptions.fatMultiplier ?? 1.6}
              onChange={(v) => update("fatMultiplier", v)}
              min={100}
              max={500}
              isPercentage
              decimals={0}
              defaultValue={1.6}
              className={inputClassName}
            />
          </div>
        </div>
      </div>

      {/* FIRE overview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          FIRE Targets
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          All figures are in today's dollars. Based on a{" "}
          {pct(assumptions.safeWithdrawalRate)} safe withdrawal rate, a{" "}
          {fmt(fire.annualSpending)} annual spending goal, and an
          inflation-adjusted return of {pct(fire.realReturnRate)} (
          {pct(fire.nominalReturnRate)} nominal).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fire.targets.map((t) => (
            <FireCard
              key={t.id}
              target={t}
              fmt={fmt}
              pct={pct}
              currentAge={profile.currentAge}
              retirementAge={profile.retirementAge}
              annualSpending={fire.annualSpending}
              swr={assumptions.safeWithdrawalRate}
              leanMultiplier={assumptions.leanMultiplier ?? 0.7}
              fatMultiplier={assumptions.fatMultiplier ?? 1.6}
              baristaIncome={assumptions.baristaAnnualIncome ?? 0}
              baristaBridgeYears={assumptions.baristaBridgeYears ?? 0}
              realReturnRate={fire.realReturnRate}
              currentInvested={fire.currentInvested}
            />
          ))}
        </div>

        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
          <span className="font-medium">Current invested:</span>{" "}
          {fmt(fire.currentInvested)}
          {fire.coastAchieveAge !== null ? (
            <>
              {" "}
              — if you stopped contributing today, your savings alone would
              reach your Full FIRE number by{" "}
              <span className="font-medium">age {fire.coastAchieveAge}</span>.
            </>
          ) : (
            <>
              {" "}
              — current savings alone won't reach your Full FIRE number by age
              100 without further contributions.
            </>
          )}
        </div>
      </div>

      {/* Projection chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Portfolio Projection vs FIRE Targets
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Your projected portfolio in today's dollars (real growth),
          contributing until age {profile.retirementAge}. Dashed lines mark each
          FIRE number.
        </p>
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer>
            <LineChart
              data={fire.projection}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="age"
                stroke={axisColor}
                tick={{ fill: axisColor, fontSize: 12 }}
                label={{
                  value: "Age",
                  position: "insideBottom",
                  offset: -2,
                  fill: axisColor,
                  fontSize: 12,
                }}
              />
              <YAxis
                stroke={axisColor}
                tick={{ fill: axisColor, fontSize: 12 }}
                tickFormatter={compactCurrency}
                width={64}
              />
              <RTooltip
                formatter={(value) => [fmt(Number(value)), "Portfolio"]}
                labelFormatter={(label) => `Age ${label}`}
                contentStyle={{
                  backgroundColor: isDarkMode ? "#1f2937" : "#ffffff",
                  border: `1px solid ${gridColor}`,
                  borderRadius: 8,
                  color: isDarkMode ? "#f9fafb" : "#111827",
                }}
              />
              <ReferenceLine
                x={profile.retirementAge}
                stroke={axisColor}
                strokeDasharray="2 4"
                label={{
                  value: "Retire",
                  position: "top",
                  fill: axisColor,
                  fontSize: 11,
                }}
              />
              {refTargets.map((t) => (
                <ReferenceLine
                  key={t.id}
                  y={t.targetNumber}
                  stroke={TARGET_COLORS[t.id] || axisColor}
                  strokeDasharray="6 4"
                  label={{
                    value: t.label,
                    position: "right",
                    fill: TARGET_COLORS[t.id] || axisColor,
                    fontSize: 11,
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                dot={false}
                name="Portfolio"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {refTargets.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5"
                style={{ backgroundColor: TARGET_COLORS[t.id] || axisColor }}
              />
              {t.label}: {fmt(t.targetNumber)}
            </span>
          ))}
        </div>
      </div>

      {/* What-if scenarios */}
      <ScenarioPanel
        accounts={accounts}
        profile={profile}
        assumptions={assumptions}
        fmt={fmt}
      />

      {/* General advice */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Guidance For Your Plan
        </h3>
        <ul className="space-y-3">
          {tips.map((tip, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm text-gray-700 dark:text-gray-300"
            >
              <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Early-access gap */}
      {earlyAccess.relevant && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Early-Retirement Access Gap
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            You plan to retire at {earlyAccess.retirementAge}, but some accounts
            aren't penalty-free until age {earlyAccess.penaltyFreeAge}. You'll
            need to bridge {earlyAccess.yearsToBridge}{" "}
            {earlyAccess.yearsToBridge === 1 ? "year" : "years"} from accessible
            money.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Accessible at retirement
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(earlyAccess.accessibleBalance)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Locked until {earlyAccess.penaltyFreeAge}
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(earlyAccess.lockedBalance)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Needed to bridge the gap
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(earlyAccess.bridgeNeed)}
              </div>
            </div>
          </div>
          <div
            className={`rounded-md p-3 text-sm ${
              earlyAccess.shortfall > 0
                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
                : "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
            }`}
          >
            {earlyAccess.shortfall > 0 ? (
              <>
                Your accessible accounts fall about{" "}
                <span className="font-semibold">
                  {fmt(earlyAccess.shortfall)}
                </span>{" "}
                short of covering spending until age{" "}
                {earlyAccess.penaltyFreeAge}. Consider building taxable/Roth
                savings, or a Roth conversion ladder / 72(t) to reach locked
                funds penalty-free.
              </>
            ) : (
              <>
                Your accessible accounts can cover spending through the gap with
                about{" "}
                <span className="font-semibold">
                  {fmt(-earlyAccess.shortfall)}
                </span>{" "}
                to spare before locked accounts open at age{" "}
                {earlyAccess.penaltyFreeAge}.
              </>
            )}
          </div>
          {(earlyAccess.accessibleLabels.length > 0 ||
            earlyAccess.lockedLabels.length > 0) && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {earlyAccess.accessibleLabels.length > 0 && (
                <div>
                  Reachable early: {earlyAccess.accessibleLabels.join(", ")}
                </div>
              )}
              {earlyAccess.lockedLabels.length > 0 && (
                <div>
                  Locked until {earlyAccess.penaltyFreeAge}:{" "}
                  {earlyAccess.lockedLabels.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roth conversion ladder */}
      {rothLadder.relevant && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Roth Conversion Ladder
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            In your low-income years (age {rothLadder.startAge}–{rothLadder.endAge}, before
            Social Security and RMDs ramp up), converting traditional balances to Roth fills
            the cheap {rothLadder.fillBracketLabel} bracket. You pay tax now at a low rate to
            shrink future RMDs and build a tax-free balance.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total converted</div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(rothLadder.totalConverted)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Tax cost ({pct(rothLadder.blendedRate)} blended)
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(rothLadder.totalTaxCost)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Est. RMD reduction at 73
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(rothLadder.rmdReductionEstimate)}/yr
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Age</th>
                  <th className="text-right font-medium px-3 py-2">Other income</th>
                  <th className="text-right font-medium px-3 py-2">Convert</th>
                  <th className="text-right font-medium px-3 py-2">Tax cost</th>
                  <th className="text-right font-medium px-3 py-2">Cumulative</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-200">
                {rothLadder.years.map((y: ConversionYear) => (
                  <tr
                    key={y.age}
                    className="border-t border-gray-100 dark:border-gray-700/60"
                  >
                    <td className="px-3 py-2">{y.age}</td>
                    <td className="px-3 py-2 text-right">{fmt(y.baseOrdinaryIncome)}</td>
                    <td className="px-3 py-2 text-right font-medium text-purple-700 dark:text-purple-300">
                      {fmt(y.conversionAmount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(y.taxCost)}{" "}
                      <span className="text-xs text-gray-400">
                        ({pct(y.marginalRate)})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(y.cumulativeConverted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Estimates fill to the top of the {rothLadder.fillBracketLabel} bracket assuming
            your only ordinary income in these years is taxable benefits and income streams.
            Converted principal is accessible penalty-free after 5 years (the 5-year rule isn't
            separately modeled here). Educational guidance, not tax advice.
          </p>
        </div>
      )}

      {/* ACA subsidy / MAGI */}
      {aca.relevant && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            ACA Health Subsidies (Pre-Medicare)
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Before Medicare at 65, your health premiums depend on income. Your modeled
            income (MAGI) as a share of the Federal Poverty Level sets your premium tax
            credit. Keeping MAGI lower — including how much you convert to Roth — can be
            worth thousands in subsidies.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Household size · FPL
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {aca.householdSize} · {fmt(aca.fpl)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                400% FPL cliff (stay under)
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {fmt(aca.cliffMagi)}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Benchmark premium / yr
                <Tooltip text="The annual second-lowest silver plan premium for your household, used to estimate subsidy dollars. Varies a lot by age and location — edit to your area's quote." />
              </label>
              <NumberInput
                value={assumptions.acaBenchmarkPremium ?? aca.benchmarkPremium}
                onChange={(v) => update("acaBenchmarkPremium", v)}
                min={0}
                defaultValue={aca.benchmarkPremium}
                className={inputClassName}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Age</th>
                  <th className="text-right font-medium px-3 py-2">MAGI</th>
                  <th className="text-right font-medium px-3 py-2">% FPL</th>
                  <th className="text-right font-medium px-3 py-2">You pay</th>
                  <th className="text-right font-medium px-3 py-2">Est. subsidy</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-200">
                {aca.years.map((y: ACAYear) => (
                  <tr
                    key={y.age}
                    className={`border-t border-gray-100 dark:border-gray-700/60 ${
                      y.cliffRisk ? "bg-amber-50 dark:bg-amber-900/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2">{y.age}</td>
                    <td className="px-3 py-2 text-right">{fmt(y.magi)}</td>
                    <td className="px-3 py-2 text-right">
                      {Math.round(y.fplPercent * 100)}%
                      {y.cliffRisk && (
                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                          cliff
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(y.expectedContribution)}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700 dark:text-emerald-300">
                      {fmt(y.estimatedSubsidy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            MAGI here includes income streams, Social Security (counted at 100% for ACA,
            unlike income tax), and any Roth conversions above — but not Roth withdrawals.
            Subsidy math uses the ARPA-enhanced caps in effect through 2025; if those expire,
            a hard subsidy cliff returns at 400% FPL ({fmt(aca.cliffMagi)}). Amber rows are
            over that line. Educational estimate, not a quote.
          </p>
        </div>
      )}

      {/* Social Security coverage */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Social Security &amp; Benefit Coverage
        </h3>
        {ssCoverage.available ? (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {fmt(ssCoverage.annualBenefit)}/yr in benefits
              {ssCoverage.startAge
                ? ` starting at age ${ssCoverage.startAge}`
                : ""}{" "}
              covers{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {Math.round(ssCoverage.coveragePct * 100)}%
              </span>{" "}
              of your {fmt(ssCoverage.spending)} spending goal.
            </p>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3 mb-4 overflow-hidden">
              <div
                className="bg-emerald-500 h-3 rounded-full"
                style={{
                  width: `${Math.min(100, Math.round(ssCoverage.coveragePct * 100))}%`,
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Remaining annual draw from portfolio
                </div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">
                  {fmt(ssCoverage.residualDraw)}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Portfolio needed once benefits start
                </div>
                <div className="text-xl font-semibold text-gray-900 dark:text-white">
                  {fmt(ssCoverage.residualPortfolio)}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              Benefits reduce how much your portfolio must cover from their
              start age. For an accurate figure, use your personalized estimate
              at ssa.gov rather than a placeholder.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No Social Security or government benefit is modeled yet. Add one as
            an income stream (tagged Social Security) to see how much of your
            spending it covers and how much your portfolio still needs to fund.
            Your personalized estimate is at ssa.gov.
          </p>
        )}
      </div>

      {/* SWR sustainability */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Withdrawal-Rate Check
          </h3>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              swr.flagged
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
            }`}
          >
            {pct(swr.swr)} · {swr.level.replace("_", " ")}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {swr.message}
        </p>
        {swr.flagged && (
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
            For a {swr.retirementLengthYears}-year retirement, a ceiling around{" "}
            {pct(swr.recommendedMax)} leaves more margin against a bad early
            sequence of returns.
          </p>
        )}
      </div>

      {/* Roth vs Traditional advice */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Roth vs Traditional
          </h3>
          {advice.available && (
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${adviceBadge.cls}`}
            >
              {adviceBadge.text}
            </span>
          )}
        </div>
        <p className="text-gray-900 dark:text-white font-medium mb-4">
          {advice.headline}
        </p>

        {advice.available && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Current marginal rate
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {pct(advice.currentMarginalRate)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                at income {fmt(advice.currentTaxableIncome)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Est. retirement rate
              </div>
              <div className="text-xl font-semibold text-gray-900 dark:text-white">
                {pct(advice.retirementMarginalRate)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                at income {fmt(advice.retirementTaxableIncome)}
              </div>
            </div>
          </div>
        )}

        <ul className="space-y-2 mb-4">
          {advice.reasoning.map((r, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <span className="text-blue-500 mt-0.5">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        {advice.caveats.length > 0 && (
          <details className="text-sm text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-300">
              Important caveats
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              {advice.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          This is educational guidance, not financial advice. Consult a
          qualified professional for your situation.
        </p>
      </div>
    </div>
  );
}

function FireCard({
  target,
  fmt,
  pct,
  currentAge,
  retirementAge,
  annualSpending,
  swr,
  leanMultiplier,
  fatMultiplier,
  baristaIncome,
  baristaBridgeYears,
  realReturnRate,
  currentInvested,
}: {
  target: FireTarget;
  fmt: (n: number) => string;
  pct: (n: number) => string;
  currentAge: number;
  retirementAge: number;
  annualSpending: number;
  swr: number;
  leanMultiplier: number;
  fatMultiplier: number;
  baristaIncome: number;
  baristaBridgeYears: number;
  realReturnRate: number;
  currentInvested: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const achieved = target.achieved;
  const info = FIRE_STRATEGY_INFO[target.id];

  // Build a worked example of how this target number is derived, using real inputs.
  const workedExample = (() => {
    switch (target.id) {
      case "full":
        return `${fmt(annualSpending)} ÷ ${pct(swr)} = ${fmt(target.targetNumber)}`;
      case "lean":
        return `${fmt(annualSpending)} × ${pct(leanMultiplier)} ÷ ${pct(swr)} = ${fmt(target.targetNumber)}`;
      case "fat":
        return `${fmt(annualSpending)} × ${pct(fatMultiplier)} ÷ ${pct(swr)} = ${fmt(target.targetNumber)}`;
      case "barista":
        return baristaBridgeYears > 0
          ? `Start with ${fmt(target.targetNumber)}, draw ${fmt(annualSpending - baristaIncome)}/yr (spending − part-time) for ${baristaBridgeYears} ${baristaBridgeYears === 1 ? "year" : "years"} while it grows at ${pct(realReturnRate)} real, reaching your Full FIRE number (${fmt(annualSpending / swr)}) by ~age ${retirementAge + baristaBridgeYears}.`
          : `(${fmt(annualSpending)} − ${fmt(baristaIncome)} part-time) ÷ ${pct(swr)} = ${fmt(target.targetNumber)} (indefinite part-time income)`;
      case "coast":
        return `${fmt(currentInvested)} today, growing at ${pct(realReturnRate)} real, reaches your Full FIRE number by age ${retirementAge}. Coast number: ${fmt(target.targetNumber)}`;
      default:
        return "";
    }
  })();

  return (
    <div
      className={`rounded-lg border ${
        achieved
          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-900 dark:text-white">
            {target.label}
          </span>
          {achieved ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
              Achieved
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              In progress
            </span>
          )}
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {fmt(target.targetNumber)}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
          {target.description}
        </p>
        <div className="text-sm">
          {achieved ? (
            <span className="text-green-700 dark:text-green-400">
              {fmt(target.surplusOrShortfall)} over target
            </span>
          ) : (
            <span className="text-gray-600 dark:text-gray-300">
              {fmt(-target.surplusOrShortfall)} to go
              {target.achieveAge !== null ? (
                <>
                  {" "}
                  — on track by{" "}
                  <span className="font-medium">age {target.achieveAge}</span>
                </>
              ) : (
                <> — not reached by age 100 on current path</>
              )}
            </span>
          )}
        </div>
        {achieved &&
          target.achieveAge !== null &&
          target.achieveAge < currentAge + 1 && (
            <div className="text-xs text-green-700 dark:text-green-400 mt-1">
              You're already there.
            </div>
          )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          aria-expanded={expanded}
        >
          {expanded ? "Hide details" : "Learn about this strategy"}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
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
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-200/70 dark:border-gray-700/70 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {info.summary}
          </p>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              How it's calculated
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{info.formula}</p>
            {workedExample && (
              <div className="mt-1.5 text-sm font-mono bg-gray-50 dark:bg-gray-700/40 rounded-md px-3 py-2 text-gray-800 dark:text-gray-200">
                {workedExample}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1">
                Best for
              </div>
              <ul className="space-y-1">
                {info.bestFor.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-1.5 text-xs text-gray-600 dark:text-gray-300"
                  >
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                Watch out for
              </div>
              <ul className="space-y-1">
                {info.watchOut.map((w, i) => (
                  <li
                    key={i}
                    className="flex gap-1.5 text-xs text-gray-600 dark:text-gray-300"
                  >
                    <span className="text-amber-500 mt-0.5">!</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioPanel({
  accounts,
  profile,
  assumptions,
  fmt,
}: {
  accounts: Account[];
  profile: Profile;
  assumptions: Assumptions;
  fmt: (n: number) => string;
}) {
  const [retireAge, setRetireAge] = useState(profile.retirementAge);
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [barista, setBarista] = useState(assumptions.baristaAnnualIncome ?? 0);

  const scenarioAccounts: Account[] =
    extraMonthly > 0
      ? [
          ...accounts,
          {
            id: "__scenario_extra__",
            name: "Extra savings (scenario)",
            type: "taxable",
            balance: 0,
            annualContribution: extraMonthly * 12,
            contributionGrowthRate: 0,
            returnRate: 0,
          },
        ]
      : accounts;

  const scenarioProfile: Profile = { ...profile, retirementAge: retireAge };
  const scenarioAssumptions: Assumptions = {
    ...assumptions,
    baristaAnnualIncome: barista,
  };

  const result = calculateFire(
    scenarioAccounts,
    scenarioProfile,
    scenarioAssumptions,
  );
  const baseline = calculateFire(accounts, profile, assumptions);

  const ageText = (n: number | null) => (n === null ? "after 100" : `age ${n}`);
  const delta = (scen: number | null, base: number | null) => {
    if (scen === null || base === null) return null;
    return scen - base;
  };

  const rows: { id: string; label: string }[] = [
    { id: "full", label: "Full FIRE" },
    { id: "lean", label: "Lean FIRE" },
    { id: "barista", label: "Barista FIRE" },
  ];

  const sliderClass = "w-full accent-blue-600 cursor-pointer";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        What-If Scenarios
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Drag the sliders to test changes. These don't alter your saved plan —
        they only preview the effect on when you'd reach each FIRE milestone
        (today's dollars).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        <div>
          <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <span>Retire at age</span>
            <span className="text-blue-600 dark:text-blue-400">
              {retireAge}
            </span>
          </div>
          <input
            type="range"
            min={profile.currentAge + 1}
            max={Math.max(75, profile.retirementAge + 5)}
            value={retireAge}
            onChange={(e) => setRetireAge(Number(e.target.value))}
            className={sliderClass}
          />
        </div>
        <div>
          <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <span>Save extra / month</span>
            <span className="text-blue-600 dark:text-blue-400">
              {fmt(extraMonthly)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={5000}
            step={50}
            value={extraMonthly}
            onChange={(e) => setExtraMonthly(Number(e.target.value))}
            className={sliderClass}
          />
        </div>
        <div>
          <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <span>Barista income / yr</span>
            <span className="text-blue-600 dark:text-blue-400">
              {fmt(barista)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={80000}
            step={1000}
            value={barista}
            onChange={(e) => setBarista(Number(e.target.value))}
            className={sliderClass}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left font-medium px-3 py-2">Milestone</th>
              <th className="text-right font-medium px-3 py-2">Target</th>
              <th className="text-right font-medium px-3 py-2">Reached</th>
              <th className="text-right font-medium px-3 py-2">vs now</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 dark:text-gray-200">
            {rows.map((r) => {
              const t = result.targets.find((x) => x.id === r.id)!;
              const b = baseline.targets.find((x) => x.id === r.id)!;
              const d = delta(t.achieveAge, b.achieveAge);
              return (
                <tr
                  key={r.id}
                  className="border-t border-gray-100 dark:border-gray-700/60"
                >
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right">
                    {fmt(t.targetNumber)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.achieved ? "already there" : ageText(t.achieveAge)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d === null || d === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : d < 0 ? (
                      <span className="text-green-600 dark:text-green-400">
                        {d} yrs earlier
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        +{d} yrs later
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        "vs now" compares the reach age against your current saved plan.
        Retiring earlier shortens the years you contribute, so some milestones
        may move later.
      </p>
    </div>
  );
}
