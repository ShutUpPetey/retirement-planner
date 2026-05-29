import { useState, useEffect, useCallback } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  /** If true, treats value as a decimal (0.05) but displays as percentage (5) */
  isPercentage?: boolean;
  /** Number of decimal places to show */
  decimals?: number;
  /** Default value when input is empty or invalid */
  defaultValue?: number;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className,
  placeholder,
  isPercentage = false,
  decimals = 0,
  defaultValue = 0,
}: NumberInputProps) {
  // Convert the actual value to display value
  const toDisplayValue = useCallback((val: number): string => {
    const displayVal = isPercentage ? val * 100 : val;
    return decimals > 0 ? displayVal.toFixed(decimals) : String(Math.round(displayVal));
  }, [isPercentage, decimals]);

  // Convert display value back to actual value
  const toActualValue = useCallback((displayVal: string): number => {
    const parsed = parseFloat(displayVal);
    if (isNaN(parsed)) return defaultValue;
    return isPercentage ? parsed / 100 : parsed;
  }, [isPercentage, defaultValue]);

  // Local string state for the input
  const [localValue, setLocalValue] = useState(() => toDisplayValue(value));

  // Sync local value when prop changes (e.g., reset)
  useEffect(() => {
    setLocalValue(toDisplayValue(value));
  }, [value, toDisplayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow any input while typing (including empty, partial numbers, etc.)
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    // On blur, parse and commit the value
    let actualValue = toActualValue(localValue);

    // Round to nearest integer when no decimals requested (for age inputs, etc.)
    if (decimals === 0 && !isPercentage) {
      actualValue = Math.round(actualValue);
    }

    // Apply min/max constraints
    let constrainedValue = actualValue;
    if (min !== undefined && constrainedValue < (isPercentage ? min / 100 : min)) {
      constrainedValue = isPercentage ? min / 100 : min;
    }
    if (max !== undefined && constrainedValue > (isPercentage ? max / 100 : max)) {
      constrainedValue = isPercentage ? max / 100 : max;
    }

    // Update parent with constrained value
    onChange(constrainedValue);

    // Update local display to show the final formatted value
    setLocalValue(toDisplayValue(constrainedValue));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      min={min}
      max={max}
      step={step}
    />
  );
}
