import { useCallback } from 'react';
import { SavedScenario, ScenarioState } from '../types';
import { useLocalStorage } from './useLocalStorage';
import { v4 as uuidv4 } from 'uuid';

const MAX_SCENARIOS = 6;
const STORAGE_KEY = 'retirement-planner-scenarios';

export function useScenarios() {
  const [scenarios, setScenarios] = useLocalStorage<SavedScenario[]>(STORAGE_KEY, []);

  const saveScenario = useCallback((name: string, state: ScenarioState) => {
    const scenario: SavedScenario = {
      id: uuidv4(),
      name: name.trim() || 'Untitled Scenario',
      savedAt: Date.now(),
      state,
    };
    setScenarios(prev => [scenario, ...prev].slice(0, MAX_SCENARIOS));
    return scenario.id;
  }, [setScenarios]);

  const deleteScenario = useCallback((id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
  }, [setScenarios]);

  return { scenarios, saveScenario, deleteScenario, maxScenarios: MAX_SCENARIOS };
}
