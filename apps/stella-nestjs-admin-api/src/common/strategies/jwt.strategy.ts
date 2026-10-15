import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import jwksClient from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';

export interface JwtPayload {
  sub: string; // Logto user ID
  iss: string; // Issuer (Logto domain)
  aud: string; // Audience
  exp: number;
  iat: number;
  email?: string;
  name?: string;
  custom_data?: {
    externalUserId?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private jwksClients: Map<string, jwksClient.JwksClient> = new Map();

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (
        request: Request,
        rawJwtToken: any,
        done: any,
      ) => {
        this.getPublicKey(rawJwtToken, done);
      },
      passReqToCallback: false,
    });

    const logtoDomain = this.configService.get<string>('auth.logtoDomain');
    if (logtoDomain) {
      this.jwksClients.set(
        logtoDomain,
        jwksClient({
          jwksUri: `${logtoDomain}/oidc/jwks`,
          cache: true,
          cacheMaxAge: 600000, // 10 minutes
        }),
      );
      this.logger.log(`JWKS client initialized for: ${logtoDomain}`);
    }

    if (this.jwksClients.size === 0) {
      this.logger.warn(
        'No Logto domain configured — set LOGTO_DOMAIN in .env',
      );
    }
  }

  private async getPublicKey(
    token: string,
    done: (err: any, key?: string) => void,
  ) {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded?.header?.kid) {
        return done(new UnauthorizedException('Invalid token format'));
      }

      const payload = decoded.payload as JwtPayload;
      const tokenIssuer = payload?.iss;

      // Match issuer to a configured JWKS client
      let clientToUse: jwksClient.JwksClient | undefined;

      if (tokenIssuer) {
        const issuerDomain = tokenIssuer.replace('/oidc', '');
        for (const [domain, client] of this.jwksClients.entries()) {
          if (
            issuerDomain === domain ||
            tokenIssuer.startsWith(domain)
          ) {
            clientToUse = client;
            break;
          }
        }
      }

      // Fallback: try the first configured client
      if (!clientToUse && this.jwksClients.size > 0) {
        clientToUse = Array.from(this.jwksClients.values())[0];
      }

      if (!clientToUse) {
        return done(
          new UnauthorizedException('No JWKS client configured'),
        );
      }

      const key = await clientToUse.getSigningKey(decoded.header.kid);
      done(null, key.getPublicKey());
    } catch (error: any) {
      this.logger.error(`JWKS key retrieval failed: ${error.message}`);
      done(new UnauthorizedException('Token verification failed'));
    }
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
