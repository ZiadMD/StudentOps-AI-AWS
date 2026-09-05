import React from 'react';
import { UserProfile } from '../types';

type ProtectedRouteProps = {
  user: UserProfile | null;
  allowedRoles: UserProfile['role'][];
  isInitializing?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  user,
  allowedRoles,
  isInitializing = false,
  children,
  fallback = null,
}) => {
  if (isInitializing || !user || !allowedRoles.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
};
