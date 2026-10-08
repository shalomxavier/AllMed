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
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_IDS,
  type Role,
  type RolePermissions,
  type UserRoleData,
} from '@/permissions';

export interface UserData extends UserRoleData {}

export interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: UserData | null;
  role: Role | null;
  permissions: RolePermissions | null;
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

/**
 * Fallback mapping from legacy designation string to RBAC permissions.
 * Used only during migration while users do not yet have a roleId.
 */
const getLegacyPermissions = (designation: string): RolePermissions => {
  switch (designation) {
    case 'Director':
      return DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.DIRECTOR];
    case 'HR':
      return DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.HR];
    case 'Operations Manager':
      return DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.OPERATIONS_MANAGER];
    case 'Branch Manager':
      return DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.BRANCH_MANAGER];
    case 'WhatsApp Messager':
      return DEFAULT_ROLE_PERMISSIONS[ROLE_IDS.WHATSAPP_MESSAGER];
    default:
      // Unknown designations must not receive full access.
      return {};
  }
};

const getRoleIdFromDesignation = (designation: string): string => {
  switch (designation) {
    case 'Director':
      return ROLE_IDS.DIRECTOR;
    case 'HR':
      return ROLE_IDS.HR;
    case 'Operations Manager':
      return ROLE_IDS.OPERATIONS_MANAGER;
    case 'Branch Manager':
      return ROLE_IDS.BRANCH_MANAGER;
    case 'WhatsApp Messager':
      return ROLE_IDS.WHATSAPP_MESSAGER;
    default:
      return '';
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let userUnsubscribe: (() => void) | undefined;
    let roleUnsubscribe: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = undefined;
      }
      if (roleUnsubscribe) {
        roleUnsubscribe();
        roleUnsubscribe = undefined;
      }

      if (!user) {
        setUserData(null);
        setRole(null);
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

          if (!data) {
            setRole(null);
            setPermissions(null);
            setLoading(false);
            return;
          }

          const roleId = data.roleId || getRoleIdFromDesignation(data.designation);

          if (roleId) {
            if (roleUnsubscribe) roleUnsubscribe();
            roleUnsubscribe = onSnapshot(
              doc(db, 'roles', roleId),
              (roleDoc) => {
                if (roleDoc.exists()) {
                  const roleData = { id: roleDoc.id, ...roleDoc.data() } as Role;
                  setRole(roleData);
                  setPermissions(roleData.permissions || {});
                } else {
                  // roleId present but role document missing: fall back to designation
                  setRole(null);
                  setPermissions(getLegacyPermissions(data.designation));
                }
                setLoading(false);
              },
              (err) => {
                console.error('Error loading role:', err);
                setRole(null);
                setPermissions(getLegacyPermissions(data.designation));
                setLoading(false);
              }
            );
          } else {
            // No roleId and no recognized designation: no permissions
            setRole(null);
            setPermissions({});
            setLoading(false);
          }
        },
        (err) => {
          console.error('Error loading user data:', err);
          setUserData(null);
          setRole(null);
          setPermissions(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (userUnsubscribe) userUnsubscribe();
      if (roleUnsubscribe) roleUnsubscribe();
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
