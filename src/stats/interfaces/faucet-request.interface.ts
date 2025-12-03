export interface FaucetRequest {
  id: string;
  nodeAddress?: string;
  username: string;
  userAddress: string;
  amount: number;
  txHash?: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
  error?: string;
}
