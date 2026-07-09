import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';

const crypto = require('@shardus/crypto-utils');
const stringify = require('fast-stable-stringify');
const { Utils } = require('@shardus/types');

dotenv.config();

const DEFAULT_MONITOR_URL = 'https://api.mon-test.liberdus.com';

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc');
crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify');

interface TransactionData {
  type: string;
  from: string;
  to: string;
  amount: bigint;
  chatId: string;
  memo: string | null;
  timestamp: number;
  networkId?: string;
  sign?: {
    owner: string;
    sig: string;
  };
}

interface StandbyNode {
  ip: string;
  port: number;
  publicKey: string;
}

interface TransactionResponse {
  success: boolean;
  reason?: string;
}

interface User {
  address: string;
  secretKey: string;
}

export interface NetworkConfig {
  networkId: string;
  protocols: string;
  host: string;
  faucetAddress: string;
  faucetPrivateKey: string;
  privateFaucetAddress?: string;
  privateFaucetPrivateKey?: string;
  archiverUrl: string;
  monitorReportUrl?: string;
  monitorUrl?: string;
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);

  constructor() {
    // Crypto is already initialized globally
    this.logger.log(
      'BlockchainService initialized with Shardus crypto utilities',
    );
  }

  async transferFunds(
    targetAddress: string,
    amount: number,
    networkConfig: NetworkConfig,
    memo?: string,
    usePrivateFaucet: boolean = false,
  ): Promise<any> {
    try {
      const resolvedAddress = await this.getAddress(targetAddress, networkConfig);
      const amountInWei = this.libToWei(amount);

      this.logger.log(`Sending ${amountInWei} to ${resolvedAddress}`);

      const faucetAddress = usePrivateFaucet
        ? networkConfig.privateFaucetAddress
        : networkConfig.faucetAddress;
      const faucetPrivateKey = usePrivateFaucet
        ? networkConfig.privateFaucetPrivateKey
        : networkConfig.faucetPrivateKey;

      if (!faucetAddress || !faucetPrivateKey) {
        throw new Error(
          `Faucet credentials missing for ${usePrivateFaucet ? 'private' : 'public'} faucet`,
        );
      }

      const tx: TransactionData = {
        type: 'transfer',
        from: faucetAddress,
        to: resolvedAddress,
        amount: amountInWei,
        chatId: this.calculateChatId(resolvedAddress, faucetAddress),
        memo: memo || null,
        timestamp: Date.now(),
      };

      this.signEthereumTx(
        tx,
        { secretKey: faucetPrivateKey },
        networkConfig,
        faucetAddress,
      );
      this.logger.log('Transaction data before injection:', tx);
      const result = await this.injectTx(tx, networkConfig);
      if (!result || !result.success) {
        this.logger.error('Transaction injection failed:', result);
        throw new Error(
          result?.reason || 'Transaction injection failed without reason',
        );
      }
      this.logger.log('Transaction injected successfully:', result);
      return result;
    } catch (error) {
      this.logger.error('Error transferring funds:', error);
      throw error;
    }
  }

  async getStandbyNodelist(networkConfig: NetworkConfig): Promise<StandbyNode[]> {
    try {
      const response = await axios.get(
        `${networkConfig.archiverUrl}/full-nodelist?standbyOnly=true`,
      );
      const { nodeList } = response.data;

      if (nodeList == null || !Array.isArray(nodeList)) {
        this.logger.error('Error fetching standby nodes:');
        throw new Error('Invalid standby node response format');
      }

      return nodeList.map((node: any) => ({
        ip: node.ip,
        port: node.port,
        publicKey: node.publicKey,
      }));
    } catch (error) {
      this.logger.error('Error fetching standby nodes:', error);
      throw error;
    }
  }

  verifyEthereumTx(obj: any) {
    try {
      if (typeof obj !== 'object') {
        throw new TypeError('Input must be an object.');
      }
      if (!obj.sign || !obj.sign.owner || !obj.sign.sig) {
        throw new Error(
          'Object must contain a sign field with the following data: { owner, sig }',
        );
      }
      if (typeof obj.sign.owner !== 'string') {
        throw new TypeError(
          'Owner must be a public key represented as a hex string.',
        );
      }
      if (typeof obj.sign.sig !== 'string') {
        throw new TypeError(
          'Signature must be a valid signature represented as a hex string.',
        );
      }
      const { owner, sig } = obj.sign;
      const dataWithoutSign = Object.assign({}, obj);
      delete dataWithoutSign.sign;
      const message = crypto.hashObj(dataWithoutSign);

      const recoveredAddress = ethers.verifyMessage(message, sig);
      const recoveredShardusAddress = this.toShardusAddress(recoveredAddress);
      const isValid =
        recoveredShardusAddress.toLowerCase() === owner.toLowerCase();

      const requestType = obj.nodeAddress
        ? 'node faucet request'
        : 'user faucet request';
      this.logger.log(
        `Signed request context: type=${requestType}, username=${obj.username ?? 'unknown'}, userAddress=${obj.userAddress ?? 'unknown'}, nodeAddress=${obj.nodeAddress ?? 'not provided (user faucet request)'}, networkId=${obj.networkId ?? 'unknown'}`,
      );
      this.logger.log(
        `Signature verification result: isValid=${isValid}, message=${message}, ownerAddress=${obj.sign.owner}, recoveredAddress=${recoveredAddress}, recoveredShardusAddress=${recoveredShardusAddress}`,
      );
      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Ethereum transaction:', error);
      return false;
    }
  }

  async isValidStandbyNode(address: string, networkConfig: NetworkConfig): Promise<boolean> {
    const normalizedAddress = address.toLowerCase();

    try {
      const standbyNodes = await this.getStandbyNodelist(networkConfig);
      const isStandbyNode = standbyNodes.some(
        (node) => node.publicKey.toLowerCase() === normalizedAddress,
      );

      if (isStandbyNode) {
        return true;
      }
    } catch (error: any) {
      this.logger.error('Error validating standby node:', error);
    }

    return this.isValidJoiningNode(address, networkConfig);
  }

  async isValidJoiningNode(address: string, networkConfig: NetworkConfig): Promise<boolean> {
    const monitorReportUrl = this.getMonitorReportUrl(networkConfig);
    if (!monitorReportUrl) {
      return false;
    }

    try {
      const response = await axios.get(monitorReportUrl);
      const joiningNodes = response.data?.nodes?.joining;
      if (joiningNodes == null || typeof joiningNodes !== 'object') {
        this.logger.warn('Monitor report does not include nodes.joining');
        return false;
      }

      const normalizedAddress = address.toLowerCase();
      return Object.keys(joiningNodes).some(
        (nodeId) => nodeId.toLowerCase() === normalizedAddress,
      );
    } catch (error: any) {
      this.logger.error('Error validating joining node:', error);
      return false;
    }
  }

  private getMonitorReportUrl(networkConfig: NetworkConfig): string | undefined {
    if (networkConfig.monitorReportUrl) {
      return networkConfig.monitorReportUrl;
    }

    if (process.env.MONITOR_REPORT_URL) {
      return process.env.MONITOR_REPORT_URL;
    }

    const monitorUrl = networkConfig.monitorUrl || process.env.MONITOR_URL;
    if (monitorUrl) {
      return `${monitorUrl.replace(/\/$/, '')}/api/report`;
    }

    return `${DEFAULT_MONITOR_URL}/api/report`;
  }

  async getAccount(address: string, networkConfig: NetworkConfig): Promise<any> {
    try {
      const response = await axios.get(
        `${networkConfig.protocols}://${networkConfig.host}/account/${address}`,
      );
      const { account } = response.data;

      if (account == null) {
        this.logger.error('Account not found for address:', address);
        throw new Error(`Account not found for address: ${address}`);
      }
      return account;
    } catch (error) {
      this.logger.error('Error fetching account:', error);
      return null;
    }
  }

  async getAddress(handle: string, networkConfig: NetworkConfig): Promise<string> {
    // If it's already a 64-character address, return as is
    if (handle.length === 64) {
      return handle;
    }

    try {
      const hashedHandle = crypto.hash(handle);
      const response = await axios.get(
        `${networkConfig.protocols}://${networkConfig.host}/address/${hashedHandle}`,
      );
      const { address, error } = response.data;

      if (error) {
        this.logger.error('Error resolving address:', error);
        throw new Error(error);
      }

      return address;
    } catch (error) {
      this.logger.error('Error fetching address:', error);
      throw error;
    }
  }

  libToWei(lib: number): bigint {
    return BigInt(lib * 10 ** 18);
  }

  private calculateChatId(to: string, from: string): string {
    return crypto.hash([from, to].sort((a, b) => a.localeCompare(b)).join(''));
  }

  private signEthereumTx(
    tx: TransactionData,
    keys: { secretKey: string },
    networkConfig: NetworkConfig,
    ownerAddress: string,
  ): void {
    if (!keys) {
      throw new Error('Keys are required for signing');
    }

    tx.networkId = networkConfig.networkId;

    // Create a copy of the tx without any existing sign field
    const dataToSign = Object.assign({}, tx);
    delete dataToSign.sign;

    // Convert the object to a string with BigInt support
    const message = crypto.hashObj(dataToSign);

    try {
      // Create wallet from private key
      const wallet = new ethers.Wallet(keys.secretKey);

      // Sign the message
      const signature = wallet.signMessageSync(message);

      // Add signature to transaction
      tx.sign = {
        owner: ownerAddress,
        sig: signature,
      };
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  }

  private toShardusAddress(ethAddress: string): string {
    return ethAddress.slice(2).toLowerCase() + '0'.repeat(24);
  }

  private async injectTx(tx: TransactionData, networkConfig: NetworkConfig): Promise<TransactionResponse> {
    const data = Utils.safeStringify(tx);
    this.logger.log('Tx data:', data);

    try {
      const response = await axios.post(
        `${networkConfig.protocols}://${networkConfig.host}/inject`,
        {
          tx: data,
        },
      );
      return response.data.result;
    } catch (error) {
      this.logger.error('Error injecting tx:', error.message);
      throw error;
    }
  }
}
