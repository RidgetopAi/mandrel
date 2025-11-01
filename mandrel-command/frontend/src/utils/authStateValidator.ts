/**
 * Authentication State Validator
 * Prevents and detects corrupted auth states
 */

export interface AuthState {
  isAuthenticated: boolean;
  user: any;
  token: string | null;
}

/**
 * Validates that authentication state is consistent
 */
export function validateAuthState(state: AuthState): {
  isValid: boolean;
  issues: string[];
  shouldLogout: boolean;
} {
  const issues: string[] = [];
  let shouldLogout = false;

  // Rule 1: If authenticated, must have user and token
  if (state.isAuthenticated && (!state.user || !state.token)) {
    issues.push('Authenticated state without valid user/token data');
    shouldLogout = true;
  }

  // Rule 2: If not authenticated, should not have user or token
  if (!state.isAuthenticated && (state.user || state.token)) {
    issues.push('Unauthenticated state with lingering user/token data');
    shouldLogout = true;
  }

  // Rule 3: Check localStorage consistency
  const localToken = localStorage.getItem('aidis_token');
  const localUser = localStorage.getItem('aidis_user');

  if (state.isAuthenticated && (!localToken || !localUser)) {
    issues.push('Authenticated state but missing localStorage credentials');
    shouldLogout = true;
  }

  if (!state.isAuthenticated && (localToken || localUser)) {
    issues.push('Unauthenticated state but localStorage has credentials');
    // This might be okay during logout process, so don't force logout
  }

  return {
    isValid: issues.length === 0,
    issues,
    shouldLogout
  };
}

/**
 * Auto-corrects corrupted authentication state
 */
export function autoCorrectAuthState(authStore: any): boolean {
  const currentState = {
    isAuthenticated: authStore.isAuthenticated,
    user: authStore.user,
    token: authStore.token
  };

  const validation = validateAuthState(currentState);

  if (!validation.isValid) {
    console.warn('🔧 Auth state corruption detected:', validation.issues);
    
    if (validation.shouldLogout) {
      console.warn('🔧 Auto-correcting by logging out...');
      authStore.logout();
      return true; // State was corrected
    }
  }

  return false; // No correction needed
}
