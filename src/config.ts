import { JWTPayload } from 'jose';

export interface Config {
  fontsURL?: string[];
  oauthIssuer?: string;
  oauthRequiredAudience?: string;
  oauthTokenScopeCheck?: (token: JWTPayload) => boolean;
  localPort: number;
}

const config: Config = {
  fontsURL: [
    'https://raw.githack.com/googlei18n/noto-emoji/aa34092a723d0493f3049060c91f653588829db4/fonts/NotoColorEmoji.ttf',
    'https://raw.githack.com/googlefonts/noto-cjk/6d4400c1165860bed3732faa4db61687b8f216cb/Sans/OTC/NotoSansCJK-Regular.ttc',
  ],
  localPort: 8008,
  // oauthIssuer: 'https://',
  // oauthRequiredScope: 'rendering',
};

export default (): Config => config;
