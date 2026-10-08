import { Inject, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server, Socket } from "socket.io";
import { REDIS } from "../common/redis";
import { wsConnections } from "../common/metrics";
import { cfg } from "../config";
import { SYMBOLS } from "../common/units";

/**
 * Socket.io gateway. The Redis adapter makes rooms cluster-wide: any node (API replica, matching worker,
 * market-data worker) can emit and every connected client on every API replica receives it.
 */
@WebSocketGateway({
  cors: { origin: cfg.corsOrigin.split(","), credentials: true },
})
export class MarketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly log = new Logger(MarketGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    @Inject(REDIS) private redis: Redis,
    private jwt: JwtService,
  ) {}

  afterInit(server: Server) {
    const pub = this.redis.duplicate();
    const sub = this.redis.duplicate();
    server.adapter(createAdapter(pub, sub));
    this.log.log("socket.io redis adapter enabled");
  }

  async handleConnection(client: Socket) {
    wsConnections.inc();
    const token = client.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const p = await this.jwt.verifyAsync(token);
        if (p.typ === "access") client.join(`user:${p.sub}`);
      } catch {
        /* anonymous market-data access is allowed; private channel simply isn't joined */
      }
    }
  }

  handleDisconnect() {
    wsConnections.dec();
  }

  @SubscribeMessage("subscribe")
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { symbol: string },
  ) {
    if (!SYMBOLS[body?.symbol]) return;
    for (const room of [...client.rooms]) {
      if (room.startsWith("sym:")) client.leave(room);
    }
    client.join(`sym:${body.symbol}`);
    const [depth, price] = await Promise.all([
      this.redis.get(`depth:${body.symbol}`),
      this.redis.get(`price:${body.symbol}`),
    ]);
    if (depth) client.emit("depth", JSON.parse(depth));
    if (price) {
      client.emit("tick", {
        symbol: body.symbol,
        price: Number(price),
        ts: Date.now(),
      });
    }
  }

  emitTick(symbol: string, price: number, ts: number) {
    this.server?.to(`sym:${symbol}`).emit("tick", { symbol, price, ts });
  }
  emitDepth(symbol: string, snapshot: unknown) {
    this.server?.to(`sym:${symbol}`).emit("depth", snapshot);
  }
  emitTrade(symbol: string, trade: unknown) {
    this.server
      ?.to(`sym:${symbol}`)
      .emit("trade", { symbol, ...(trade as object) });
  }
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
