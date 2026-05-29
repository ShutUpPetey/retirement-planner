import { useState } from 'react';
import { LifeEvent, LifeEventType, Profile } from '../types';
import { NumberInput } from './NumberInput';
import { v4 as uuidv4 } from 'uuid';

interface LifeEventFormProps {
  lifeEvent?: LifeEvent;
  profile: Profile;
  onSave: (event: LifeEvent) => void;
  onCancel: () => void;
}

const inputClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white";
const inputErrorClassName = "w-full px-3 py-2 border border-red-500 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white";

const TYPE_DESCRIPTIONS: Record<LifeEventType, string> = {
  expense: 'Reduces contributions during accumulation; increases spending target during retirement',
  income: 'Increases contributions during accumulation; reduces required withdrawals during retirement',
  lump_sum: 'Single-year portfolio withdrawal (expense) or deposit (income) at the start age',
};

type FormData = Omit<LifeEvent, 'id' | 'type'> & { type: LifeEventType | undefined };

// ── Templates ─────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  label: string;
  icon: string;
  hint: string;
  note?: string; // extra explanatory callout shown when selected
  apply: (startAge: number) => Partial<FormData>;
}

const TEMPLATES: Template[] = [
  {
    id: 'college',
    label: 'College',
    icon: '🎓',
    hint: '$28K/yr · 4 years',
    note: 'Defaults to 2024–25 average in-state tuition + fees + room & board ($28,000/yr). Inflation-adjusted so future years reflect rising costs.',
    apply: (startAge) => ({
      name: 'College Tuition',
      type: 'expense',
      amount: 28000,
      endAge: startAge + 3,
      inflationAdjust: true,
    }),
  },
  {
    id: 'mortgage_payoff',
    label: 'Mortgage payoff',
    icon: '🏠',
    hint: 'Frees up your payment',
    note: 'Models your mortgage being paid off. Modeled as income because removing that annual payment frees up cash — reducing how much you need to withdraw from your portfolio each year. Edit the amount to match your actual annual mortgage payment.',
    apply: () => ({
      name: 'Mortgage Payoff',
      type: 'income',
      amount: 24000,
      endAge: undefined,
      inflationAdjust: false,
    }),
  },
  {
    id: 'new_vehicle',
    label: 'New vehicle',
    icon: '🚗',
    hint: '$35K lump sum',
    note: 'One-time purchase drawn from the portfolio. Adjust to your target price.',
    apply: () => ({
      name: 'New Vehicle',
      type: 'lump_sum',
      amount: 35000,
      endAge: undefined,
      inflationAdjust: true,
    }),
  },
  {
    id: 'parent_care',
    label: 'Parent care',
    icon: '👴',
    hint: '$24K/yr · 3 years',
    note: 'Adult day care or part-time in-home care costs. Adjust duration and amount to your situation — costs vary widely from $20K (day services) to $60K+/yr (full-time in-home care).',
    apply: (startAge) => ({
      name: 'Parent Care',
      type: 'expense',
      amount: 24000,
      endAge: startAge + 2,
      inflationAdjust: true,
    }),
  },
  {
    id: 'inheritance',
    label: 'Inheritance',
    icon: '💰',
    hint: 'Lump-sum windfall',
    note: 'One-time addition to your portfolio. Adjust to your expected amount.',
    apply: () => ({
      name: 'Inheritance',
      type: 'lump_sum',
      amount: 100000,
      endAge: undefined,
      inflationAdjust: false,
    }),
  },
  {
    id: 'part_time',
    label: 'Part-time work',
    icon: '💼',
    hint: '$24K/yr · consulting',
    note: 'Side income in early retirement — consulting, freelance, or part-time. Reduces how much you need to pull from your portfolio each year. Set an end age for when you expect to stop.',
    apply: () => ({
      name: 'Part-Time Income',
      type: 'income',
      amount: 24000,
      endAge: undefined,
      inflationAdjust: false,
    }),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LifeEventForm({ lifeEvent, profile, onSave, onCancel }: LifeEventFormProps) {
  const isEditing = !!lifeEvent;

  const [formData, setFormData] = useState<FormData>(() => {
    if (lifeEvent) {
      const { id: _id, ...rest } = lifeEvent;
      void _id;
      return rest;
    }
    return {
      name: '',
      type: undefined,
      amount: 0,
      startAge: profile.currentAge,
      inflationAdjust: true,
    };
  });

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = <K extends keyof Omit<LifeEvent, 'id'>>(field: K, value: Omit<LifeEvent, 'id'>[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as string]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    }
  };

  const applyTemplate = (template: Template) => {
    const patch = template.apply(formData.startAge);
    setFormData(prev => ({ ...prev, ...patch }));
    setActiveTemplateId(template.id);
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.type) newErrors.type = 'Please select an event type';
    if (formData.amount <= 0) newErrors.amount = 'Amount must be greater than 0';
    if (formData.startAge < 1 || formData.startAge > 120) newErrors.startAge = 'Start age must be between 1 and 120';
    if (formData.endAge !== undefined && formData.endAge < formData.startAge) {
      newErrors.endAge = 'End age must be at or after start age';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !formData.type) return;
    const data = formData.type === 'lump_sum'
      ? { ...formData, type: formData.type, endAge: undefined }
      : { ...formData, type: formData.type };
    onSave({ id: lifeEvent?.id || uuidv4(), ...data });
  };

  const amountLabel = formData.type === 'lump_sum'
    ? "One-Time Amount (today's dollars)"
    : "Annual Amount (today's dollars)";

  const startAgeExceedsLifeExpectancy = formData.startAge > profile.lifeExpectancy;
  const activeTemplate = TEMPLATES.find(t => t.id === activeTemplateId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Template picker — only shown when creating a new event */}
      {!isEditing && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Quick start
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border text-center transition-colors ${
                  activeTemplateId === t.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="text-xs font-medium leading-tight">{t.label}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 leading-tight">{t.hint}</span>
              </button>
            ))}
          </div>

          {/* Template note */}
          {activeTemplate?.note && (
            <p className="mt-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
              {activeTemplate.note}
            </p>
          )}

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gray-50 dark:bg-gray-800 px-2 text-xs text-gray-400">or fill in manually</span>
            </div>
          </div>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., College Tuition, Home Purchase, Inheritance"
          className={errors.name ? inputErrorClassName : inputClassName}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Event type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Event Type *
        </label>
        <div className="space-y-2">
          {(['expense', 'income', 'lump_sum'] as LifeEventType[]).map(type => (
            <label key={type} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="eventType"
                value={type}
                checked={formData.type === type}
                onChange={() => handleChange('type', type)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                  {type === 'lump_sum' ? 'Lump Sum' : type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
                {formData.type === type && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {TYPE_DESCRIPTIONS[type]}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
        {errors.type && <p className="text-red-500 text-xs mt-1">{errors.type}</p>}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {amountLabel}
        </label>
        <NumberInput
          value={formData.amount}
          onChange={(val) => handleChange('amount', val)}
          min={0}
          defaultValue={0}
          className={errors.amount ? inputErrorClassName : inputClassName}
        />
        {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
      </div>

      {/* Ages */}
      <div className={formData.type === 'lump_sum' || !formData.type ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-2 gap-4'}>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Start Age
          </label>
          <NumberInput
            value={formData.startAge}
            onChange={(val) => handleChange('startAge', val)}
            min={1}
            max={120}
            defaultValue={profile.currentAge}
            className={errors.startAge ? inputErrorClassName : inputClassName}
          />
          {errors.startAge && <p className="text-red-500 text-xs mt-1">{errors.startAge}</p>}
          {startAgeExceedsLifeExpectancy && !errors.startAge && (
            <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
              Start age exceeds your life expectancy ({profile.lifeExpectancy}) — this event won't apply.
            </p>
          )}
        </div>

        {formData.type !== 'lump_sum' && formData.type !== undefined && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Age <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={formData.endAge ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value);
                setFormData(prev => ({ ...prev, endAge: val }));
                if (errors.endAge) {
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.endAge;
                    return next;
                  });
                }
              }}
              min={1}
              max={120}
              placeholder={formData.type === 'income' ? 'Leave blank = permanent' : 'e.g., 56'}
              className={errors.endAge ? inputErrorClassName : inputClassName}
            />
            {errors.endAge && <p className="text-red-500 text-xs mt-1">{errors.endAge}</p>}
          </div>
        )}
      </div>

      {/* Inflation checkbox */}
      <div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.inflationAdjust}
            onChange={(e) => handleChange('inflationAdjust', e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Adjust for inflation
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Amount grows at the inflation rate each year
            </p>
          </div>
        </label>
      </div>

      {/* Actions */}
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
          {lifeEvent ? 'Update Life Event' : 'Add Life Event'}
        </button>
      </div>
    </form>
  );
}
