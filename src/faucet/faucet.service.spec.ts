import { BadRequestException } from '@nestjs/common';
import { FaucetService } from './faucet.service';
import { FaucetRequestDto } from '../common/dto/faucet-request.dto';

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
      getAccount: jest.fn().mockResolvedValue({ data: { balance: { value: '0' } } }),
      transferFunds: jest.fn().mockResolvedValue({ success: true, txHash: 'tx-1' }),
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
});
