import * as path from 'path';

process.env.NETWORKS_CONFIG_PATH ??= path.resolve(
  __dirname,
  '..',
  'networks.example.json',
);
