import { useAccess } from "./useAccess";

export function useAuth() {
  const { user, authLoading, signOut, isAuthReady } = useAccess();

  return {
    user,
    loading: authLoading,
    signOut,
    isAuthReady,
  };
}
