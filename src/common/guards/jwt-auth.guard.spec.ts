import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const createContext = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authorization ? { authorization } : {},
        }),
      }),
    }) as ExecutionContext;

  it('allows requests without an authorization header', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('rejects malformed authorization headers when provided', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(() => guard.canActivate(createContext('Basic token'))).toThrow(
      UnauthorizedException,
    );
  });
});
