import got from 'got';
import { createRemoteJWKSet, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose';
import { URL } from 'url';

let globalJWKS: JWTVerifyGetKey | undefined;

export async function getAuthorisedToken(
  authorizationHeader: string | undefined,
  issuerUrl: string,
  audience: string | undefined,
  scope: string | undefined
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
        if (openIdConfigResponse.statusCode < 200 && openIdConfigResponse.statusCode >= 400) {
          console.error(`Unable to get openid configuration from ${configUrl}`);
        }

        const config = JSON.parse(openIdConfigResponse.body);

        globalJWKS = createRemoteJWKSet(new URL(config.jwks_uri));
      } catch (error) {
        console.error('Error getting JWKS', error);
        return undefined;
      }
    }

    const { payload, protectedHeader } = await jwtVerify(jwt, globalJWKS, {
      issuer: issuerUrl,
      audience,
    });

    // check scope
    if (scope && (!payload.scp || !(payload.scp as string[]).includes(scope))) {
      // invalid scope
      console.error(`Scope ${scope} is not found in token`);
      return undefined;
    }

    return payload;
  } catch (error) {
    console.error('Error getting JWKS', error);
    return undefined;
  }
}
