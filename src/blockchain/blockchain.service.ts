import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';

const crypto = require('@shardus/crypto-utils');
const stringify = require('fast-stable-stringify');
const { Utils } = require('@shardus/types');

dotenv.config();

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

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly PROTOCOL = process.env.BLOCKCHAIN_PROTOCOL || 'http';
  private readonly HOST = process.env.BLOCKCHAIN_HOST || 'localhost:9001';
  private readonly ARCHIVER_HOST =
    process.env.ARCHIVER_HOST || 'localhost:4000';
  private readonly ARCHIVER_PROTOCOL = process.env.ARCHIVER_PROTOCOL || 'http';
  private readonly networkId = process.env.NETWORK_ID || '1';

  // Mock user - in production this should be loaded from secure config
  private readonly FAUCET_ACCOUNT: User = {
    address: process.env.FAUCET_ADDRESS || '0x' + '1'.repeat(64),
    secretKey: process.env.FAUCET_PRIVATE_KEY || '0x' + '1'.repeat(64),
  };

  constructor() {
    // Crypto is already initialized globally
    this.logger.log(
      'BlockchainService initialized with Shardus crypto utilities',
    );
  }

  async transferFunds(
    targetAddress: string,
    amount: number,
    memo?: string,
  ): Promise<any> {
    try {
      const resolvedAddress = await this.getAddress(targetAddress);
      const amountInWei = this.libToWei(amount);

      this.logger.log(`Sending ${amountInWei} to ${resolvedAddress}`);

      const tx: TransactionData = {
        type: 'transfer',
        from: this.FAUCET_ACCOUNT.address,
        to: resolvedAddress,
        amount: amountInWei,
        chatId: this.calculateChatId(
          resolvedAddress,
          this.FAUCET_ACCOUNT.address,
        ),
        memo: memo || null,
        timestamp: Date.now(),
      };

      this.signEthereumTx(tx, { secretKey: this.FAUCET_ACCOUNT.secretKey });
      this.logger.log('Transaction data before injection:', tx);
      const result = await this.injectTx(tx);
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

  async getStandbyNodelist(): Promise<StandbyNode[]> {
    try {
      const response = await axios.get(
        `${this.ARCHIVER_PROTOCOL}://${this.ARCHIVER_HOST}/full-nodelist?standbyOnly=true`,
      );
      const { nodeList } = response.data;

      if (
        nodeList == null ||
        !Array.isArray(nodeList) ||
        nodeList.length === 0
      ) {
        this.logger.error('Error fetching standby nodes:');
        throw new Error('No standby nodes found or invalid response format');
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

      console.log('Signed Obj', obj);
      console.log('Signature verification result:');
      console.log('Is Valid:', isValid);
      console.log('message', message);
      console.log('Owner Address:', obj.sign.owner);
      console.log('Recovered Address:', recoveredAddress);
      console.log('Recovered Shardus Address:', recoveredShardusAddress);
      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Ethereum transaction:', error);
      return false;
    }
  }

  async isValidStandbyNode(address: string): Promise<boolean> {
    try {
      const standbyNodes = await this.getStandbyNodelist();
      return standbyNodes.some(
        (node) => node.publicKey.toLowerCase() === address.toLowerCase(),
      );
    } catch (error: any) {
      this.logger.error('Error validating standby node:', error);
      return false; // If there's an error fetching nodes, assume it's not valid
    }
  }

  async getAccount(address: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.PROTOCOL}://${this.HOST}/account/${address}`,
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

  async getAddress(handle: string): Promise<string> {
    // If it's already a 64-character address, return as is
    if (handle.length === 64) {
      return handle;
    }

    try {
      const hashedHandle = crypto.hash(handle);
      const response = await axios.get(
        `${this.PROTOCOL}://${this.HOST}/address/${hashedHandle}`,
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
  ): void {
    if (!keys) {
      throw new Error('Keys are required for signing');
    }

    tx.networkId = this.networkId;

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
        owner: this.FAUCET_ACCOUNT.address,
        sig: signature,
      };
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  }

  private toShardusAddress(ethAddress: string): string {
    return ethAddress.slice(2).toLowerCase() + '0'.repeat(24);
  }

  private async injectTx(tx: TransactionData): Promise<TransactionResponse> {
    const data = Utils.safeStringify(tx);
    this.logger.log('Tx data:', data);

    try {
      const response = await axios.post(
        `${this.PROTOCOL}://${this.HOST}/inject`,
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
