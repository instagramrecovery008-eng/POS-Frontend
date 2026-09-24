import { useState, useCallback } from 'react';
import { onboardingApi } from '../../api/onboarding.api';

export function usePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPlans = useCallback(async () => {
    if (plans.length > 0) return plans;
    
    setLoading(true);
    setError(null);
    try {
      const result = await onboardingApi.getPlans();
      if (result.success && result.data) {
        setPlans(result.data);
        return result.data;
      } else {
        setError(result.message || 'Failed to load plans');
        return [];
      }
    } catch (e) {
      setError(e.message || 'Failed to load plans');
      return [];
    } finally {
      setLoading(false);
    }
  }, [plans.length]);

  return { plans, loading, error, loadPlans };
}
