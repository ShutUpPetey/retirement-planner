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

export function LifeEventForm({ lifeEvent, profile, onSave, onCancel }: LifeEventFormProps) {
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

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = <K extends keyof Omit<LifeEvent, 'id'>>(field: K, value: Omit<LifeEvent, 'id'>[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    }
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
    ? 'One-Time Amount (today\'s dollars)'
    : 'Annual Amount (today\'s dollars)';

  const startAgeExceedsLifeExpectancy = formData.startAge > profile.lifeExpectancy;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="e.g., 22"
              className={errors.endAge ? inputErrorClassName : inputClassName}
            />
            {errors.endAge && <p className="text-red-500 text-xs mt-1">{errors.endAge}</p>}
          </div>
        )}
      </div>

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
          {lifeEvent ? 'Update' : 'Add Life Event'}
        </button>
      </div>
    </form>
  );
}
