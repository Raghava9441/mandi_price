'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isUnit, type Unit } from '@/lib/format';

/**
 * The chosen price unit, shared across the whole page.
 *
 * This is a context rather than local state in the price list because the headline figure
 * and the list below it must never disagree. When the unit lived only in the list, the
 * hero read "₹1,600 per quintal" while the row directly beneath it read "₹800 per 50 kg
 * bag" - the same price, two units, on one screen.
 */

const STORAGE_KEY = 'mandi:unit';

interface UnitContextValue {
  unit: Unit;
  setUnit: (unit: Unit) => void;
}

const UnitContext = createContext<UnitContextValue>({ unit: 'quintal', setUnit: () => {} });

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<Unit>('quintal');

  // Read the stored preference after mount, not during render: the server cannot see
  // localStorage, and reading it during render would mismatch the streamed HTML.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isUnit(stored ?? undefined)) setUnitState(stored as Unit);
    } catch {
      // Private mode or blocked storage - the default unit is perfectly usable.
    }
  }, []);

  const setUnit = useCallback((next: Unit) => {
    setUnitState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference just will not persist; nothing else breaks.
    }
  }, []);

  const value = useMemo(() => ({ unit, setUnit }), [unit, setUnit]);
  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit() {
  return useContext(UnitContext);
}

/** The label for the currently selected unit, e.g. "per 50 kg bag". */
export function useUnitSuffix(labels: { perQuintal: string; perKg: string; perBag: string }) {
  const { unit } = useUnit();
  return unit === 'kg' ? labels.perKg : unit === 'bag' ? labels.perBag : labels.perQuintal;
}
