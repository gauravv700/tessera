import { EntityManager } from 'typeorm';

/** TypeORM returns [rows, rowCount] for UPDATE ... RETURNING on postgres; normalise to rows. */
export async function exec(m: EntityManager, sql: string, params: unknown[] = []): Promise<any[]> {
  const r: any = await m.query(sql, params);
  return Array.isArray(r) && r.length === 2 && Array.isArray(r[0]) && typeof r[1] === 'number' ? r[0] : r;
}

/** Atomically move funds available -> locked. Returns false if balance is insufficient. */
export async function lockFunds(m: EntityManager, userId: string, asset: string, amount: bigint): Promise<boolean> {
  const rows = await exec(
    m,
    `UPDATE wallets SET available = available - $1::bigint, locked = locked + $1::bigint
     WHERE user_id = $2 AND asset = $3 AND available >= $1::bigint RETURNING id`,
    [amount.toString(), userId, asset],
  );
  return rows.length > 0;
}

/** locked -= lockedDelta ; available += availableDelta */
export async function adjust(m: EntityManager, userId: string, asset: string, lockedDelta: bigint, availableDelta: bigint) {
  await exec(
    m,
    `UPDATE wallets SET locked = locked - $1::bigint, available = available + $2::bigint WHERE user_id = $3 AND asset = $4`,
    [lockedDelta.toString(), availableDelta.toString(), userId, asset],
  );
}
