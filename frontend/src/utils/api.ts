// Use relative URL in dev to leverage Vite proxy, full URL in production
const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');

export interface VaultsResponse {
  created: any[];
  signerIn: any[];
  public: any[];
  all: any[];
}

export async function fetchVaults(userAddress?: string): Promise<VaultsResponse> {
  const headers: HeadersInit = {};
  if (userAddress) {
    headers['x-user-address'] = userAddress;
  }

  const response = await fetch(`${API_BASE_URL}/vaults`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch vaults');
  }
  return response.json();
}

export async function fetchVault(id: string, userAddress?: string): Promise<any> {
  const headers: HeadersInit = {};
  if (userAddress) {
    headers['x-user-address'] = userAddress;
  }

  const response = await fetch(`${API_BASE_URL}/vaults/${id}`, { headers });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Access denied: This vault is private');
    }
    throw new Error('Failed to fetch vault');
  }
  return response.json();
}

export async function createVault(data: any, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create vault');
  }
  return response.json();
}

export async function fetchProposals(vaultId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/proposals`);
  if (!response.ok) {
    throw new Error('Failed to fetch proposals');
  }
  return response.json();
}

export async function createProposal(
  vaultId: string,
  data: any,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/proposals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create proposal');
  }
  return response.json();
}

export async function approveProposal(
  proposalId: string,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/proposals/${proposalId}/approve`, {
    method: 'POST',
    headers: {
      'x-user-address': userAddress,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to approve proposal');
  }
  return response.json();
}

export async function addSigner(
  vaultId: string,
  signerAddress: string,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/signers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify({ signerAddress }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to add signer' }));
    throw new Error(error.error || 'Failed to add signer');
  }
  return response.json();
}

export async function broadcastTransaction(
  txHex: string,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<{ txid: string; success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/proposals/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ txHex, ...metadata }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to broadcast transaction' }));
    throw new Error(error.error || 'Failed to broadcast transaction');
  }
  return response.json();
}

export async function getDepositInfo(vaultId: string, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/deposit`, {
    method: 'GET',
    headers: {
      'x-user-address': userAddress,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get deposit info' }));
    throw new Error(error.error || 'Failed to get deposit info');
  }
  return response.json();
}

export async function updateVaultBalance(
  vaultId: string,
  txid: string,
  amount: number,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/update-balance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify({ txid, amount }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update vault balance' }));
    throw new Error(error.error || 'Failed to update vault balance');
  }
  return response.json();
}

