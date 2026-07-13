import { SetMetadata } from '@nestjs/common';

export const ResponseDecorator = (...args: string[]) => SetMetadata('response-decorator', args);
