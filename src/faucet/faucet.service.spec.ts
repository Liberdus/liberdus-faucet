import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import { FaucetService } from './faucet.service';
import { FaucetRequestDto } from '../common/dto/faucet-request.dto';

describe('FaucetService network configuration', () => {
  let readFileSyncMock: jest.SpyInstance;
  const validNetworkConfig = (): Record<string, string> => ({
    protocols: 'http',
    host: 'localhost:9001',
    faucetAddress: 'faucet-address',
    faucetPrivateKey: 'faucet-private-key',
    archiverUrl: 'http://archiver.example',
    monitorUrl: 'http://monitor.example',
  });

  beforeEach(() => {
    readFileSyncMock = jest.spyOn(require('fs'), 'readFileSync');
  });

  afterEach(() => {
    readFileSyncMock.mockRestore();
  });

  it.each([
    'protocols',
    'host',
    'faucetAddress',
    'faucetPrivateKey',
    'archiverUrl',
    'monitorUrl',
  ])('rejects a network missing required %s', (missingField) => {
    const networkConfig = validNetworkConfig();
    delete networkConfig[missingField];
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ testnet: networkConfig }),
    );

    expect(() => new FaucetService({} as any, {} as any)).toThrow(
      `Network 'testnet' is missing required configuration: ${missingField}`,
    );
  });

  it.each([
    'protocols',
    'host',
    'faucetAddress',
    'faucetPrivateKey',
    'archiverUrl',
    'monitorUrl',
  ])('rejects an empty required %s', (emptyField) => {
    const networkConfig = validNetworkConfig();
    networkConfig[emptyField] = ' ';
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ testnet: networkConfig }),
    );

    expect(() => new FaucetService({} as any, {} as any)).toThrow(
      `Network 'testnet' is missing required configuration: ${emptyField}`,
    );
  });

  it.each(['privateFaucetAddress', 'privateFaucetPrivateKey'])(
    'rejects partial private faucet configuration containing only %s',
    (privateField) => {
      const networkConfig = validNetworkConfig();
      networkConfig[privateField] = 'private-value';
      readFileSyncMock.mockReturnValue(
        JSON.stringify({ testnet: networkConfig }),
      );

      expect(() => new FaucetService({} as any, {} as any)).toThrow(
        `Network 'testnet' must configure privateFaucetAddress and privateFaucetPrivateKey together`,
      );
    },
  );

  it.each(['privateFaucetAddress', 'privateFaucetPrivateKey'])(
    'rejects an empty private faucet field %s',
    (privateField) => {
      const networkConfig = {
        ...validNetworkConfig(),
        privateFaucetAddress: 'private-address',
        privateFaucetPrivateKey: 'private-key',
        [privateField]: ' ',
      };
      readFileSyncMock.mockReturnValue(
        JSON.stringify({ testnet: networkConfig }),
      );

      expect(() => new FaucetService({} as any, {} as any)).toThrow(
        `Network 'testnet' must configure privateFaucetAddress and privateFaucetPrivateKey together`,
      );
    },
  );

  it('loads a complete network configuration', () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ testnet: validNetworkConfig() }),
    );

    expect(() => new FaucetService({} as any, {} as any)).not.toThrow();
  });

  it('loads the network configuration from NETWORKS_CONFIG_PATH', () => {
    const previousConfigPath = process.env.NETWORKS_CONFIG_PATH;
    process.env.NETWORKS_CONFIG_PATH = 'networks.example.json';
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        testnet: validNetworkConfig(),
      }),
    );

    try {
      new FaucetService({} as any, {} as any);

      expect(readFileSyncMock).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'networks.example.json'),
        'utf-8',
      );
    } finally {
      if (previousConfigPath === undefined) {
        delete process.env.NETWORKS_CONFIG_PATH;
      } else {
        process.env.NETWORKS_CONFIG_PATH = previousConfigPath;
      }
    }
  });
});

describe('FaucetService IP cooldown', () => {
  let service: FaucetService;
  let blockchainService: any;
  let statsService: any;

  const faucetRequest: FaucetRequestDto = {
    username: 'alice',
    userAddress:
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    networkId: 'testnet',
    sign: {
      owner: '1234567890abcdef1234567890abcdef12345678000000000000000000000000',
      sig: '0xsignature',
    },
  };

  beforeEach(() => {
    blockchainService = {
      verifyEthereumTx: jest.fn().mockReturnValue(true),
      isEligibleNode: jest.fn().mockResolvedValue(false),
      getAccount: jest
        .fn()
        .mockResolvedValue({ data: { balance: { value: '0' } } }),
      transferFunds: jest
        .fn()
        .mockResolvedValue({ success: true, txHash: 'tx-1' }),
      libToWei: jest.fn((amount: number) => BigInt(amount * 10 ** 18)),
    };

    statsService = {
      createRequest: jest.fn().mockReturnValue({ id: 'req-1' }),
      updateRequestStatus: jest.fn(),
      getStats: jest.fn(),
      getRequest: jest.fn(),
    };

    service = Object.create(FaucetService.prototype) as FaucetService;
    Object.assign(service, {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      blockchainService,
      statsService,
      processingUsers: new Set<string>(),
      ipCooldowns: new Map<string, number>(),
      IP_COOLDOWN_MS: 24 * 60 * 60 * 1000,
      FAUCET_AMOUNT: 10,
      USER_FAUCET_AMOUNT: 100,
      USER_MAX_BALANCE: 100,
      networks: {
        testnet: {
          networkId: 'testnet',
          protocols: 'http',
          host: 'localhost:9001',
          faucetAddress: 'faucet-address',
          faucetPrivateKey: 'faucet-private-key',
          archiverUrl: 'http://localhost:4000',
          monitorUrl: 'http://localhost:3000',
        },
      },
    });
  });

  it('rejects a second successful request from the same IP within 24 hours', async () => {
    await service.processFaucetRequest(faucetRequest, '203.0.113.10');

    await expect(
      service.processFaucetRequest(
        {
          ...faucetRequest,
          userAddress:
            'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
        '203.0.113.10',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the same IP again after 24 hours', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    await service.processFaucetRequest(faucetRequest, '203.0.113.11');

    nowSpy.mockReturnValue(1_000 + 24 * 60 * 60 * 1000 + 1);

    await expect(
      service.processFaucetRequest(
        {
          ...faucetRequest,
          userAddress:
            'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        },
        '203.0.113.11',
      ),
    ).resolves.toMatchObject({ success: true });

    nowSpy.mockRestore();
  });

  it('allows a node faucet request from the same IP after a user faucet request', async () => {
    const nodeAddress =
      '9c267a6ba0efdfd189f945fa95387226ec66b12e67d43ca466a2aaee8ad4b2bb';
    const nodeFaucetRequest: FaucetRequestDto = {
      ...faucetRequest,
      userAddress:
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      nodeAddress,
    };

    blockchainService.isEligibleNode.mockResolvedValue(true);
    blockchainService.getAccount.mockImplementation((address: string) => {
      if (address === nodeAddress) {
        return Promise.resolve({
          stakeLock: { value: '0' },
          data: { balance: { value: '0' } },
        });
      }

      return Promise.resolve({
        data: { balance: { value: '0' } },
      });
    });

    await service.processFaucetRequest(faucetRequest, '203.0.113.12');

    await expect(
      service.processFaucetRequest(nodeFaucetRequest, '203.0.113.12'),
    ).resolves.toMatchObject({
      success: true,
      txHash: 'tx-1',
      message: `Successfully sent 10 tokens to ${nodeFaucetRequest.userAddress}`,
    });
  });

  it('rejects a second node faucet request from the same IP within 24 hours', async () => {
    const firstNodeRequest: FaucetRequestDto = {
      ...faucetRequest,
      nodeAddress:
        '9c267a6ba0efdfd189f945fa95387226ec66b12e67d43ca466a2aaee8ad4b2bb',
    };
    const secondNodeRequest: FaucetRequestDto = {
      ...firstNodeRequest,
      userAddress:
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    };
    blockchainService.isEligibleNode.mockResolvedValue(true);
    blockchainService.getAccount.mockResolvedValue({
      stakeLock: { value: '0' },
      data: { balance: { value: '0' } },
    });

    await service.processFaucetRequest(firstNodeRequest, '203.0.113.13');

    await expect(
      service.processFaucetRequest(secondNodeRequest, '203.0.113.13'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('processes a node faucet request when the node is standby or joining eligible', async () => {
    const nodeAddress =
      '9c267a6ba0efdfd189f945fa95387226ec66b12e67d43ca466a2aaee8ad4b2bb';
    const nodeFaucetRequest: FaucetRequestDto = {
      ...faucetRequest,
      nodeAddress,
    };

    blockchainService.isEligibleNode.mockResolvedValue(true);
    blockchainService.getAccount.mockImplementation((address: string) => {
      if (address === nodeAddress) {
        return Promise.resolve({
          stakeLock: { value: '0' },
          data: { balance: { value: '0' } },
        });
      }

      return Promise.resolve({
        data: { balance: { value: '0' } },
      });
    });

    await expect(
      service.processFaucetRequest(nodeFaucetRequest, '203.0.113.20'),
    ).resolves.toMatchObject({
      success: true,
      txHash: 'tx-1',
      message: `Successfully sent 10 tokens to ${faucetRequest.userAddress}`,
    });

    expect(blockchainService.isEligibleNode).toHaveBeenCalledWith(
      nodeAddress,
      expect.objectContaining({ networkId: 'testnet' }),
    );
    expect(blockchainService.transferFunds).toHaveBeenCalledWith(
      faucetRequest.userAddress,
      10,
      expect.objectContaining({ networkId: 'testnet' }),
      undefined,
      false,
    );
  });

  it('rejects a node faucet request when the node is not standby or joining eligible', async () => {
    const nodeFaucetRequest: FaucetRequestDto = {
      ...faucetRequest,
      userAddress:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      nodeAddress:
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };

    blockchainService.isEligibleNode.mockResolvedValue(false);

    await expect(
      service.processFaucetRequest(nodeFaucetRequest, '203.0.113.21'),
    ).rejects.toMatchObject({
      response: {
        message: 'Node address is not a valid standby or joining node',
      },
    });

    expect(blockchainService.transferFunds).not.toHaveBeenCalled();
    expect(statsService.createRequest).not.toHaveBeenCalled();
  });
});
