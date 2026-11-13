import { useQuery } from '@tanstack/react-query';
import client from '@/shared/api/client';
import { useState, useEffect } from 'react';

// Permissions are simple string codes returned by GET /rbac/permissions
type PermissionCode = string;

interface PermissionsResponse {
  data: PermissionCode[];
}

export const usePermissions = () => {
  const { data, error, isLoading } = useQuery<PermissionsResponse>(['permissions'], async () => {
    const res = await client.get('/rbac/permissions');
    return res.data;
  }, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  const can = (code: PermissionCode): boolean => {
    if (!data) return false;
    return data.data.includes(code);
  };

  return { can, permissions: data?.data ?? [], isLoading, error };
};

