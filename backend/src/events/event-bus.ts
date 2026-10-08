import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { cfg } from '../config';
import { Side } from '../matching/order-book';

export const EVENT_BUS = 'EVENT_BUS';
export const TOPIC_COMMANDS = 'orders.commands'; // place / cancel requests, keyed by symbol
export const TOPIC_EVENTS = 'matching.events'; // trades + cancels, keyed by symbol (event log)

export type Command =
  | { type: 'place'; orderId: string; userId: string; symbol: string; side: Side; price: number; qty: number }
  | { type: 'cancel'; orderId: string; symbol: string };

export type MatchingEvent =
  | {
      type: 'trade'; id: string; symbol: string; price: number; qty: number; takerSide: Side;
      buyOrderId: string; sellOrderId: string; buyerId: string; sellerId: string; buyLimit: number; ts: number;
    }
  | { type: 'cancel'; symbol: string; orderId: string; reason: 'USER' | 'STP'; ts: number };

export type Handler<T> = (msg: T) => Promise<void>;

export interface EventBus {
  publish(topic: string, key: string, value: unknown): Promise<void>;
  subscribe<T>(topic: string, group: string, handler: Handler<T>): Promise<void>;
}

/** Single-process bus for local dev without Kafka. Per-subscription queue keeps ordering. */
@Injectable()
export class InMemoryBus implements EventBus {
  private readonly log = new Logger('InMemoryBus');
  private ee = new EventEmitter().setMaxListeners(100);

  async publish(topic: string, _key: string, value: unknown): Promise<void> {
    this.ee.emit(topic, JSON.parse(JSON.stringify(value)));
  }

  async subscribe<T>(topic: string, group: string, handler: Handler<T>): Promise<void> {
    let chain: Promise<void> = Promise.resolve();
    this.ee.on(topic, (msg: T) => {
      chain = chain.then(() => handler(msg)).catch((e) => this.log.error(`${group}/${topic}: ${e?.message}`));
    });
  }
}

/** Kafka bus. Messages are keyed by symbol => one partition per symbol => strict per-symbol ordering. */
@Injectable()
export class KafkaBus implements EventBus {
  private readonly log = new Logger('KafkaBus');
  private kafka = new Kafka({
    clientId: `trading-${process.env.HOSTNAME ?? 'local'}`,
    brokers: cfg.kafkaBrokers,
    logLevel: logLevel.WARN,
    retry: { retries: 12, initialRetryTime: 300 },
  });
  private producer: Producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1 });

  async init(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: [TOPIC_COMMANDS, TOPIC_EVENTS].map((topic) => ({ topic, numPartitions: cfg.kafkaPartitions, replicationFactor: 1 })),
    });
    await admin.disconnect();
    await this.producer.connect();
    this.log.log(`connected to ${cfg.kafkaBrokers.join(',')}`);
  }

  async publish(topic: string, key: string, value: unknown): Promise<void> {
    await this.producer.send({ topic, acks: -1, messages: [{ key, value: JSON.stringify(value) }] });
  }

  async subscribe<T>(topic: string, group: string, handler: Handler<T>): Promise<void> {
    const consumer = this.kafka.consumer({ groupId: group });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    // Throwing inside eachMessage => offset not committed => redelivery (at-least-once; handlers are idempotent).
    await consumer.run({ eachMessage: async ({ message }) => handler(JSON.parse(message.value!.toString())) });
  }
}

export const eventBusProvider = {
  provide: EVENT_BUS,
  useFactory: async (): Promise<EventBus> => {
    if (cfg.kafkaBrokers.length === 0) {
      new Logger('EventBus').warn('KAFKA_BROKERS not set -> using in-memory bus (single process only)');
      return new InMemoryBus();
    }
    const bus = new KafkaBus();
    await bus.init();
    return bus;
  },
};
