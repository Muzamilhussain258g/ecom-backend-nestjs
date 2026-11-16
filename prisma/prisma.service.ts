import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "generated/prisma/client";
import { Pool } from "pg";

@Injectable()
export class PrismaService extends PrismaClient<{
  adapter: PrismaPg;
  // log: (Prisma.LogLevel | Prisma.LogDefinition)[];
  transactionOptions?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  };
}>
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const databaseUrl =
      configService.getOrThrow<string>("DATABASE_URL");
    // const queryLoggingEnabled =
    //   configService.getOrThrow<string>("PRISMA_QUERY_LOGGING") === "true";

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });

    super({
      adapter: new PrismaPg(pool),
      // log: queryLoggingEnabled ? [{ emit: "event", level: "query" }] : [],
      transactionOptions: {
        maxWait: 10_000,
        timeout: 20_000,
      },
    });

    this.pool = pool;

    // if (queryLoggingEnabled) {
    //   this.$on("query", (event) => {
    //     // Parameters are deliberately excluded because they can contain user data.
    //     const statement = event.query.replace(/\s+/g, " ").trim();
    //     this.logger.log(`Prisma query completed in ${event.duration}ms: ${statement}`);
    //   });
    // }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
