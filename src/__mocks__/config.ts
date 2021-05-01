import { Config } from '../config';

let config: Config = { oauthRequiredAudience: 'sdf' };

export function mockSetConfig(myConfig: Config): void {
  config = myConfig;
}

const mock = jest.fn().mockImplementation(() => {
  return config;
});

export default mock;
