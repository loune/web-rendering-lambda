import got from 'got';
import { createRemoteJWKSet, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose';
import { URL } from 'url';

let globalJWKS: JWTVerifyGetKey | undefined;

export async function getAuthorisedToken(
  authorizationHeader: string | undefined,
  issuerUrl: string,
  audience: string | undefined,
  tokenScopeCheck?: (token: JWTPayload) => boolean
): Promise<JWTPayload | undefined> {
  if (authorizationHeader === undefined || !authorizationHeader.startsWith('Bearer ')) {
    return undefined;
  }
  try {
    const jwt = authorizationHeader.split(' ')[1];

    if (!globalJWKS) {
      try {
        issuerUrl = issuerUrl[issuerUrl.length - 1] === '/' ? issuerUrl.substring(0, issuerUrl.length - 1) : issuerUrl;
        const configUrl = `${issuerUrl}/.well-known/openid-configuration`;
        const openIdConfigResponse = await got(configUrl);
        if (openIdConfigResponse.statusCode < 200 && openIdConfigResponse.statusCode >= 300) {
          console.error(
            `Unable to get openid configuration from ${configUrl} (HTTP ${openIdConfigResponse.statusCode})`
          );
          return undefined;
        }

        const config = JSON.parse(openIdConfigResponse.body);

        globalJWKS = createRemoteJWKSet(new URL(config.jwks_uri));
      } catch (error) {
        console.error('Error getting JWKS', error);
        return undefined;
      }
    }

    const { payload } = await jwtVerify(jwt, globalJWKS, {
      issuer: issuerUrl,
      audience,
    });

    // check scope
    if (tokenScopeCheck && !tokenScopeCheck(payload)) {
      console.error(`Token scope check failed`);
      return undefined;
    }

    return payload;
  } catch (error) {
    console.error('Error verifying JWT', error);
    return undefined;
  }
}
