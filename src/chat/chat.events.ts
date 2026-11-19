import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/** Local transport boundary; replace alongside the adapter for multi-instance deployments. */
@Injectable()
export class ChatEvents extends EventEmitter {}
