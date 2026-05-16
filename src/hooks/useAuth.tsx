import { useAccessActions, useAccessAuth } from "./useAccess";

export function useAuth() {
  const { user, authLoading, isAuthReady } = useAccessAuth();
  const { signOut } = useAccessActions();

  return {
    user,
    loading: authLoading,
    signOut,
    isAuthReady,
  };
}
