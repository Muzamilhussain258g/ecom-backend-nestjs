import { HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class ChatRateService {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();
  consume(userId: number, action: 'message' | 'upload' | 'typing') {
    const now = Date.now();
    for (const [key, value] of this.windows)
      if (value.until <= now) this.windows.delete(key);
    const key = `${userId}:${action}`;
    const limit = action === 'message' ? 30 : action === 'upload' ? 10 : 2;
    const duration = action === 'typing' ? 1000 : 60_000;
    const entry = this.windows.get(key) ?? { count: 0, until: now + duration };
    if (entry.count >= limit)
      throw new HttpException('Chat rate limit exceeded', 429);
    entry.count++;
    this.windows.set(key, entry);
  }
}
