import { useQuery } from '@tanstack/react-query';
import client from '@/shared/api/client';

type PermissionCode = string;

interface PermissionsResponse {
  data: PermissionCode[];
}

export const usePermissions = () => {
  const { data, error, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await client.get('/rbac/permissions');
      return res.data as PermissionsResponse;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const can = (code: PermissionCode): boolean => {
    if (!data) return false;
    return data.data.includes(code);
  };

  return { can, permissions: data?.data ?? [], isLoading, error };
};
