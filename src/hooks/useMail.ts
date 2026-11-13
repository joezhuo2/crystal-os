import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectMailAccount, fetchMailDigest, fetchMailStatus, saveMailAi, type MailAccount, type MailDigest } from "@/lib/mail";

export function useMailStatus(enabled = true) {
  return useQuery({ queryKey: ["mail", "status"], queryFn: fetchMailStatus, enabled });
}

const digestKey = (accounts: MailAccount[]) => ["mail", "digest", accounts.map((a) => a.id).join()];

export function useMailDigest(accounts: MailAccount[] = []) {
  return useQuery({
    queryKey: digestKey(accounts),
    queryFn: () => fetchMailDigest(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    enabled: accounts.length > 0,
  });
}

export function useRefreshMailDigest(accounts: MailAccount[] = []) {
  const queryClient = useQueryClient();
  return useMutation<MailDigest, Error>({
    mutationFn: () => fetchMailDigest(true),
    onSuccess: (digest) => queryClient.setQueryData(digestKey(accounts), digest),
  });
}

export function useSaveMailAi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveMailAi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mail"] }),
  });
}

export function useDisconnectMail() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: disconnectMailAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mail"] }),
  });
}
