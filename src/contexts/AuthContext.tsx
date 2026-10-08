import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import {
  type Role,
  type UserPermissions,
  type UserRoleData,
} from '@/permissions';

export interface UserData extends UserRoleData {}

export interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: UserData | null;
  role: Role | null;
  permissions: UserPermissions | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

const getAuthErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use a stronger password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/missing-email':
      return 'Please enter your email address.';
    case 'auth/invalid-continue-uri':
      return 'Invalid continue URL. Please contact support.';
    case 'auth/unauthorized-continue-uri':
      return 'Unauthorized continue URL. Please contact support.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [role] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let userUnsubscribe: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      userUnsubscribe?.();
      userUnsubscribe = undefined;

      if (!user) {
        setUserData(null);
        setPermissions(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      userUnsubscribe = onSnapshot(
        doc(db, 'users', user.uid),
        (userDoc) => {
          const data = userDoc.exists() ? ({ id: userDoc.id, ...userDoc.data() } as UserData) : null;
          setUserData(data);
          setPermissions(data?.permissions ?? null);
          setLoading(false);
        },
        (err) => {
          console.error('Error loading user data:', err);
          setUserData(null);
          setPermissions(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      userUnsubscribe?.();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const errorCode = (error as { code?: string }).code || 'auth/unknown';
      const message = getAuthErrorMessage(errorCode);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await signOut(auth);
    } catch (error) {
      const errorCode = (error as { code?: string }).code || 'auth/unknown';
      const message = getAuthErrorMessage(errorCode);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      const errorCode = (error as { code?: string }).code || 'auth/unknown';
      const message = getAuthErrorMessage(errorCode);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    currentUser,
    userData,
    role,
    permissions,
    loading,
    login,
    logout,
    resetPassword,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
