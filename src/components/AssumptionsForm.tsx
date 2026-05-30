import { Assumptions } from "../types";
import { NumberInput } from "./NumberInput";
import { Tooltip } from "./Tooltip";
import {
  ASSUMPTION_PRESETS,
  getActivePreset,
} from "../utils/assumptionPresets";

interface AssumptionsFormProps {
  assumptions: Assumptions;
  onChange: (assumptions: Assumptions) => void;
}

const inputClassName =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

export function AssumptionsForm({
  assumptions,
  onChange,
}: AssumptionsFormProps) {
  const handleChange = (field: keyof Assumptions, value: number) => {
    onChange({
      ...assumptions,
      [field]: value,
    });
  };

  const activePreset = getActivePreset(assumptions);
  const activePresetObj = ASSUMPTION_PRESETS.find((p) => p.id === activePreset);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 pb-2">
        Economic Assumptions
      </h3>

      {/* Preset strip */}
      <div>
        <div className="flex gap-2">
          {ASSUMPTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ ...assumptions, ...preset.values })}
              className={
                "flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors " +
                (activePreset === preset.id
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500")
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {activePresetObj ? activePresetObj.description : "Custom"}
        </p>
      </div>

      {/* Spending mode toggle */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Retirement Spending Mode</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...assumptions, spendingMode: 'swr' })}
            className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors ${
              (assumptions.spendingMode ?? 'swr') === 'swr'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-500'
            }`}
          >
            <div className="font-semibold">What can I spend?</div>
            <div className="text-xs mt-0.5 opacity-75">Portfolio × withdrawal rate</div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...assumptions, spendingMode: 'goal' })}
            className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors ${
              assumptions.spendingMode === 'goal'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-500'
            }`}
          >
            <div className="font-semibold">Can I afford my goal?</div>
            <div className="text-xs mt-0.5 opacity-75">Spend goal · show if it lasts</div>
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
          {(assumptions.spendingMode ?? 'swr') === 'swr'
            ? 'Retirement spending is set by your portfolio size × withdrawal rate. Use the Annual Spending Goal below for FIRE targets only.'
            : 'Retirement spending is driven by your Annual Spending Goal. The chart shows whether your portfolio survives to life expectancy at that spend level.'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Inflation Rate (%)
            <Tooltip text="Expected annual inflation rate" />
          </label>
          <NumberInput
            value={assumptions.inflationRate}
            onChange={(val) => handleChange("inflationRate", val)}
            min={0}
            max={10}
            isPercentage
            decimals={1}
            defaultValue={0.03}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Historical average: ~3%
          </p>
          <label className="flex items-start gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={assumptions.adjustTaxBracketsForInflation !== false}
              onChange={(e) => onChange({ ...assumptions, adjustTaxBracketsForInflation: e.target.checked })}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Adjust tax brackets for inflation
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Bracket thresholds grow with inflation each year, preventing bracket creep from overstating future taxes (recommended)
              </p>
            </div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Safe Withdrawal Rate (%)
            <Tooltip text="Percentage of portfolio to withdraw annually in retirement" />
          </label>
          <NumberInput
            value={assumptions.safeWithdrawalRate}
            onChange={(val) => handleChange("safeWithdrawalRate", val)}
            min={1}
            max={10}
            isPercentage
            decimals={1}
            defaultValue={0.04}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Traditional rule: 4%
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Retirement Return Rate (%)
            <Tooltip text="Expected annual return during retirement (typically more conservative)" />
          </label>
          <NumberInput
            value={assumptions.retirementReturnRate}
            onChange={(val) => handleChange("retirementReturnRate", val)}
            min={0}
            max={15}
            isPercentage
            decimals={1}
            defaultValue={0.05}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Conservative assumption: 5%
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Return Volatility (%)
            <Tooltip text="Annual standard deviation of returns, used by the Monte Carlo simulation. Higher = more market swings. A balanced retirement portfolio is typically 8–12%." />
          </label>
          <NumberInput
            value={assumptions.returnVolatility ?? 0.1}
            onChange={(val) => handleChange("returnVolatility", val)}
            min={0}
            max={40}
            isPercentage
            decimals={1}
            defaultValue={0.1}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Balanced portfolio: ~10%. Drives Monte Carlo risk analysis.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Annual Spending Goal ($)
            <Tooltip text="Desired annual spending in retirement, in today's dollars. Drives all FIRE targets." />
          </label>
          <NumberInput
            value={assumptions.annualSpendingGoal ?? 60000}
            onChange={(val) => handleChange("annualSpendingGoal", val)}
            min={0}
            defaultValue={60000}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {assumptions.spendingMode === 'goal'
              ? "Today's dollars · drives the retirement simulation"
              : "Today's dollars · used for FIRE targets (switch mode above to use for simulation)"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Barista (Part-Time) Income ($)
            <Tooltip text="Annual part-time income you'd earn in semi-retirement, in today's dollars. Used for Barista FIRE." />
          </label>
          <NumberInput
            value={assumptions.baristaAnnualIncome ?? 20000}
            onChange={(val) => handleChange("baristaAnnualIncome", val)}
            min={0}
            defaultValue={20000}
            className={inputClassName}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Today's dollars; used for Barista FIRE
          </p>
        </div>
      </div>
    </div>
  );
}
