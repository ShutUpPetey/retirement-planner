import { useState, useMemo } from 'react';
import { Account, AccountType, Profile, getAccountTypeLabel, is401k } from '../types';
import { NumberInput } from './NumberInput';
import { Tooltip } from './Tooltip';
import { v4 as uuidv4 } from 'uuid';
import { useCountry } from '../contexts/CountryContext';
import { getDefaultWithdrawalAge, getMaxWithdrawalAge } from '../utils/withdrawalDefaults';
import { getCountryConfig } from '../countries';

interface AccountFormProps {
  account?: Account;
  profile: Profile;
  onSave: (account: Account) => void;
  onCancel: () => void;
}

const defaultAccount: Omit<Account, 'id'> = {
  name: '',
  type: 'traditional_401k',
  balance: 0,
  annualContribution: 0,
  contributionGrowthRate: 0.03,
  returnRate: 0.07,
};

const inputClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white";
const inputErrorClassName = "w-full px-3 py-2 border border-red-500 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white";

export function AccountForm({ account, profile, onSave, onCancel }: AccountFormProps) {
  const { config: countryConfig } = useCountry();

  // Initialize form data from account prop (component is re-mounted with key when account changes)
  const [formData, setFormData] = useState<Omit<Account, 'id'>>(() => {
    if (account) {
      const { id: _id, ...rest } = account;
      void _id; // Explicitly mark as intentionally unused
      return rest;
    }
    // Use first account type from country config as default
    const defaultType = countryConfig.accountTypes[0]?.type || 'traditional_401k';
    return { ...defaultAccount, type: defaultType as AccountType };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get country config for penalty info and defaults
  const fullCountryConfig = getCountryConfig(profile.country);
  const penaltyInfo = fullCountryConfig.getPenaltyInfo(formData.type);

  // Calculate min/max withdrawal ages
  const minWithdrawalAge = profile.currentAge;
  const maxWithdrawalAge = getMaxWithdrawalAge(
    { ...formData, id: account?.id || '' },
    profile.lifeExpectancy,
    fullCountryConfig
  );

  // Get current withdrawal age (or default)
  const currentWithdrawalAge = formData.withdrawalRules?.startAge ??
    getDefaultWithdrawalAge(
      { ...formData, id: account?.id || '' },
      profile.retirementAge,
      fullCountryConfig
    );

  // Derive warning state instead of storing in state
  const showPenaltyWarning = penaltyInfo.appliesToAccountType && currentWithdrawalAge < penaltyInfo.penaltyAge;

  const handleChange = (field: keyof Omit<Account, 'id'>, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when field is modified
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (formData.balance < 0) {
      newErrors.balance = 'Balance cannot be negative';
    }

    if (formData.annualContribution < 0) {
      newErrors.annualContribution = 'Contribution cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onSave({
      id: account?.id || uuidv4(),
      ...formData,
    });
  };

  // Get account types from country config
  const accountTypes: AccountType[] = countryConfig.accountTypes.map(
    (config) => config.type as AccountType
  );

  // Show employer match fields for 401k or employer RRSP
  const showEmployerMatchFields = is401k(formData.type) || formData.type === 'employer_rrsp';

  // IRS / CRA contribution limit for the current account type (numeric only)
  const irsLimit = useMemo(() => {
    const limits = fullCountryConfig.getContributionLimits();
    const raw = limits[formData.type];
    if (!raw) return 0;
    if (typeof raw === 'number') return raw;
    return raw.annual ?? raw.max ?? 0;
  }, [fullCountryConfig, formData.type]);

  const irsLimitLabel = profile.country === 'CA' ? 'CRA limit' : 'IRS limit';

  // Live employer match preview
  const matchPreview = useMemo(() => {
    if (!formData.employerMatchPercent) return 0;
    const effectiveContrib = formData.useIrsMaxContribution && irsLimit > 0
      ? irsLimit
      : formData.annualContribution;
    if (formData.employerMatchLimitType === 'salary_percent') {
      if (!formData.annualSalary || !formData.employerMatchLimitPercent) return 0;
      const salaryMatchCap = formData.annualSalary * formData.employerMatchLimitPercent;
      return Math.min(effectiveContrib, salaryMatchCap) * formData.employerMatchPercent;
    }
    if (!formData.employerMatchLimit) return 0;
    return Math.min(effectiveContrib * formData.employerMatchPercent, formData.employerMatchLimit);
  }, [formData, irsLimit]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Account Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Company 401(k)"
          className={errors.name ? inputErrorClassName : inputClassName}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Account Type
        </label>
        <select
          value={formData.type}
          onChange={(e) => handleChange('type', e.target.value as AccountType)}
          className={inputClassName}
        >
          {accountTypes.map(type => (
            <option key={type} value={type}>
              {getAccountTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Current Balance ($)
          </label>
          <NumberInput
            value={formData.balance}
            onChange={(val) => handleChange('balance', val)}
            min={0}
            defaultValue={0}
            className={errors.balance ? inputErrorClassName : inputClassName}
          />
          {errors.balance && <p className="text-red-500 text-xs mt-1">{errors.balance}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Annual Contribution ($)
            </label>
            {irsLimit > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!formData.useIrsMaxContribution}
                  onChange={(e) => setFormData(prev => ({ ...prev, useIrsMaxContribution: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  Max out ({irsLimitLabel}: ${irsLimit.toLocaleString()}/yr)
                </span>
              </label>
            )}
          </div>
          {formData.useIrsMaxContribution && irsLimit > 0 ? (
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-800 dark:text-blue-300">
              ${irsLimit.toLocaleString()}/yr · grows with inflation each year to match {irsLimitLabel} adjustments
            </div>
          ) : (
            <NumberInput
              value={formData.annualContribution}
              onChange={(val) => handleChange('annualContribution', val)}
              min={0}
              defaultValue={0}
              className={errors.annualContribution ? inputErrorClassName : inputClassName}
            />
          )}
          {errors.annualContribution && (
            <p className="text-red-500 text-xs mt-1">{errors.annualContribution}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Contribution Growth Rate (%)
            <Tooltip text="Annual increase in contributions (e.g., salary raises)" />
          </label>
          <NumberInput
            value={formData.contributionGrowthRate}
            onChange={(val) => handleChange('contributionGrowthRate', val)}
            min={0}
            max={20}
            isPercentage
            decimals={1}
            defaultValue={0.03}
            className={inputClassName}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Expected Return (%)
          </label>
          <NumberInput
            value={formData.returnRate}
            onChange={(val) => handleChange('returnRate', val)}
            min={0}
            max={20}
            isPercentage
            decimals={1}
            defaultValue={0.07}
            className={inputClassName}
          />
        </div>
      </div>

      {showEmployerMatchFields && (
        <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
            {is401k(formData.type) ? '401(k) Employer Match' : 'Employer Match'}
          </h4>

          {/* Match rate */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Match Rate (%)
              <Tooltip text="Rate the employer matches your contributions — e.g. 100% = dollar-for-dollar, 50% = 50¢ per $1 you contribute" />
            </label>
            <NumberInput
              value={formData.employerMatchPercent || 0}
              onChange={(val) => handleChange('employerMatchPercent', val)}
              min={0}
              max={200}
              isPercentage
              decimals={0}
              defaultValue={0}
              className={inputClassName}
            />
          </div>

          {/* Match cap toggle */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Match Cap
              <Tooltip text="The employer only matches up to this limit. '% of salary' grows as your salary grows." />
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, employerMatchLimitType: 'dollar' }))}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  (formData.employerMatchLimitType ?? 'dollar') === 'dollar'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300'
                }`}
              >
                $ Dollar amount
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, employerMatchLimitType: 'salary_percent' }))}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  formData.employerMatchLimitType === 'salary_percent'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300'
                }`}
              >
                % of salary
              </button>
            </div>

            {formData.employerMatchLimitType === 'salary_percent' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Cap (% of salary)
                  </label>
                  <NumberInput
                    value={formData.employerMatchLimitPercent || 0}
                    onChange={(val) => setFormData(prev => ({ ...prev, employerMatchLimitPercent: val }))}
                    min={0}
                    max={100}
                    isPercentage
                    decimals={1}
                    defaultValue={0}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Your Annual Salary ($)
                  </label>
                  <NumberInput
                    value={formData.annualSalary || 0}
                    onChange={(val) => setFormData(prev => ({ ...prev, annualSalary: val }))}
                    min={0}
                    defaultValue={0}
                    className={inputClassName}
                  />
                </div>
              </div>
            ) : (
              <NumberInput
                value={formData.employerMatchLimit || 0}
                onChange={(val) => handleChange('employerMatchLimit', val)}
                min={0}
                defaultValue={0}
                className={inputClassName}
              />
            )}
          </div>

          {/* Live match preview */}
          {formData.employerMatchPercent && formData.employerMatchPercent > 0 && matchPreview > 0 && (
            <div className="mt-1 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md text-sm text-green-800 dark:text-green-300">
              💰 Employer adds <strong>${matchPreview.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr</strong>
              {formData.employerMatchLimitType === 'salary_percent' && formData.annualSalary && formData.employerMatchLimitPercent && (
                <span className="text-green-600 dark:text-green-400 text-xs ml-1">
                  (cap: ${(formData.annualSalary * formData.employerMatchLimitPercent).toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </span>
              )}
            </div>
          )}
          {formData.employerMatchPercent && formData.employerMatchPercent > 0 && matchPreview === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Enter a match cap {formData.employerMatchLimitType === 'salary_percent' ? 'percentage and salary' : 'dollar amount'} to see your employer match.
            </p>
          )}
        </div>
      )}

      {/* Withdrawal Settings */}
      <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4">
        <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
          Withdrawal Settings
        </h4>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Start Withdrawal Age
            <Tooltip text="Age when you plan to start withdrawing from this account. Cannot be later than RMD age if applicable." />
          </label>
          <NumberInput
            value={currentWithdrawalAge}
            onChange={(val) => {
              setFormData(prev => ({
                ...prev,
                withdrawalRules: { startAge: val }
              }));
            }}
            min={minWithdrawalAge}
            max={maxWithdrawalAge}
            defaultValue={currentWithdrawalAge}
            className={inputClassName}
          />
          {showPenaltyWarning && (
            <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-500">
              Warning: Withdrawing before age {Math.ceil(penaltyInfo.penaltyAge)} incurs a {(penaltyInfo.penaltyRate * 100).toFixed(0)}% penalty
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Default: {getDefaultWithdrawalAge(
              { ...formData, id: account?.id || '' },
              profile.retirementAge,
              fullCountryConfig
            )}
            {maxWithdrawalAge < profile.lifeExpectancy && ` (Max: ${maxWithdrawalAge} due to RMD)`}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {account ? 'Update Account' : 'Add Account'}
        </button>
      </div>
    </form>
  );
}
