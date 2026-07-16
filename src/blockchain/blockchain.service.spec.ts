import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { BlockchainService } from './blockchain.service';

describe('BlockchainService', () => {
  let service: BlockchainService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlockchainService],
    }).compile();
    service = module.get<BlockchainService>(BlockchainService);
  });

  it('should validate a correct Ethereum transaction signature', async () => {
    const tx = {
      alias: 'faucettester',
      aliasHash:
        '0528034ba9cb7f3e3be8ed83e8e2d578d9141171c6b7f34e8e3d25b9bc3a012a',
      from: 'e1367badb9f6d271f06bc60e273de23cd21464a8000000000000000000000000',
      networkId:
        '52d545708708f41ed7162ff641626de0568b2bd098e5640233ce4a387d9c5aa8',
      pqPublicKey:
        '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',
      publicKey:
        '0468b7b9c4850e056883d71828fdff4079664be0246792eeaf47b1ba9fea00baf50895a19d447dae2b8a7ca73960ba25f3225b0d26157c96427ed797029283e285',
      sign: {
        owner:
          'e1367badb9f6d271f06bc60e273de23cd21464a8000000000000000000000000',
        sig: '0xc7733bfcf537820ba7852bdae6ad0095043dc07af7abad10ec12c7e5afba94852ccbc3ab891a570e5b0492b300e99faaeef930bdd1a79c80aa8b605c419617051c',
      },
      timestamp: 1755159379378,
      type: 'register',
    };
    const result = await service.verifyEthereumTx(tx);
    expect(result).toBe(true);
  });

  describe('node eligibility', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('accepts a node from the monitor joining list when it is not in archiver standby', async () => {
      const nodeAddress =
        '9c267a6ba0efdfd189f945fa95387226ec66b12e67d43ca466a2aaee8ad4b2bb';
      jest.spyOn(axios, 'get').mockImplementation((url: any) => {
        const requestUrl = String(url);
        if (requestUrl.includes('/full-nodelist?standbyOnly=true')) {
          return Promise.resolve({ data: { nodeList: [] } } as any);
        }

        if (requestUrl === 'http://monitor.example/api/report') {
          return Promise.resolve({
            data: {
              nodes: {
                joining: {
                  [nodeAddress]: {
                    nodeIpInfo: {
                      externalIp: '66.187.75.34',
                      externalPort: 9070,
                    },
                  },
                },
              },
            },
          } as any);
        }

        return Promise.reject(new Error(`Unexpected URL: ${requestUrl}`));
      });

      await expect(
        service.isValidStandbyNode(nodeAddress.toUpperCase(), {
          networkId: 'testnet',
          protocols: 'http',
          host: 'localhost:9001',
          faucetAddress: 'faucet-address',
          faucetPrivateKey: 'faucet-private-key',
          archiverUrl: 'http://archiver.example',
          monitorUrl: 'http://monitor.example',
        }),
      ).resolves.toBe(true);
    });

    it('rejects a node missing from both archiver standby and monitor joining lists', async () => {
      jest.spyOn(axios, 'get').mockImplementation((url: any) => {
        const requestUrl = String(url);
        if (requestUrl.includes('/full-nodelist?standbyOnly=true')) {
          return Promise.resolve({ data: { nodeList: [] } } as any);
        }

        if (requestUrl === 'http://monitor.example/api/report') {
          return Promise.resolve({
            data: {
              nodes: {
                joining: {
                  '9c267a6ba0efdfd189f945fa95387226ec66b12e67d43ca466a2aaee8ad4b2bb':
                    {},
                },
              },
            },
          } as any);
        }

        return Promise.reject(new Error(`Unexpected URL: ${requestUrl}`));
      });

      await expect(
        service.isValidStandbyNode(
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          {
            networkId: 'testnet',
            protocols: 'http',
            host: 'localhost:9001',
            faucetAddress: 'faucet-address',
            faucetPrivateKey: 'faucet-private-key',
            archiverUrl: 'http://archiver.example',
            monitorUrl: 'http://monitor.example/',
          },
        ),
      ).resolves.toBe(false);
    });
  });
});
