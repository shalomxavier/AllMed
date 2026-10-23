import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { ROLE_IDS } from './definitions';

export interface UseRoleResult {
  roleId: string | null;
  roleName: string | null;
  isDirector: boolean;
  isHR: boolean;
  isOperationsManager: boolean;
  isBranchManager: boolean;
  isWhatsAppMessager: boolean;
}

export function normalizeRoleId(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'director' || normalized === ROLE_IDS.DIRECTOR) return ROLE_IDS.DIRECTOR;
  if (normalized === 'hr' || normalized === ROLE_IDS.HR) return ROLE_IDS.HR;
  if (normalized === 'operations manager' || normalized === ROLE_IDS.OPERATIONS_MANAGER) return ROLE_IDS.OPERATIONS_MANAGER;
  if (normalized === 'branch manager' || normalized === ROLE_IDS.BRANCH_MANAGER) return ROLE_IDS.BRANCH_MANAGER;
  if (normalized === 'whatsapp messager' || normalized === ROLE_IDS.WHATSAPP_MESSAGER) return ROLE_IDS.WHATSAPP_MESSAGER;
  return value;
}

export function useRole(): UseRoleResult {
  const { userData, role } = useAuthContext();

  return useMemo(() => {
    const roleId = role?.id || normalizeRoleId(userData?.roleId) || normalizeRoleId(userData?.designation) || null;
    const roleName = role?.name || userData?.designation || null;

    return {
      roleId,
      roleName,
      isDirector: roleId === ROLE_IDS.DIRECTOR,
      isHR: roleId === ROLE_IDS.HR,
      isOperationsManager: roleId === ROLE_IDS.OPERATIONS_MANAGER,
      isBranchManager: roleId === ROLE_IDS.BRANCH_MANAGER,
      isWhatsAppMessager: roleId === ROLE_IDS.WHATSAPP_MESSAGER,
    };
  }, [role, userData?.roleId, userData?.designation]);
}
