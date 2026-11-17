/**
 * kinoko (きのこ, fruiting body) — PoNF (proof of nutrient flow) layer, local
 * domain (AWAI-3079).
 *
 * Designed from the former Worker's method list (checkFlowThreshold /
 * formBlock / getBlock); the original ran a timer-driven BPMN on a remote
 * LangServer that is not in this repository.
 *
 *   flow   : a nutrient-flow contribution (contributor + positive amount).
 *            Flows not yet in a block are "pending".
 *   check  : whether the pending flows reach a threshold.
 *   block  : a fruiting body. Forming one seals every pending flow into a block
 *            whose hash covers the previous block's hash, its height, threshold
 *            and the sorted flow ids/amounts — a local hash chain.
 *   verify : recompute every block hash in height order.
 */
import type { LocalStore } from "../local-store.js";
import { getOne, idSlug, isNonEmpty, listAll, nowISO, put } from "./records.js";

export const FLOW = "cloud.itonami.apps.kinoko.flow";
export const BLOCK = "cloud.itonami.apps.kinoko.block";

export interface Flow { flowId: string; contributor: string; amount: number; recordedAt: string; blockId?: string }
export interface Block { blockId: string; height: number; prevHash: string; hash: string; threshold: number; total: number; flowIds: string[]; formedAt: string }

export interface RecordFlowInput { flowId: string; contributor: string; amount: number }
export interface CheckFlowThresholdInput { threshold: number }
export interface FormBlockInput { blockId: string; threshold: number }
export interface GetBlockInput { blockId?: string; height?: number }

const flowKey = (id: string) => `flow-${idSlug(id)}`;
const blockKey = (height: number) => `block-${String(height).padStart(8, "0")}`;

async function sha256Hex(text: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The hash preimage: fixed key order, flows sorted by id. */
export function blockPreimage(b: Pick<Block, "blockId" | "height" | "prevHash" | "threshold">, flows: Array<Pick<Flow, "flowId" | "amount">>): string {
  const sorted = [...flows].sort((x, y) => (x.flowId < y.flowId ? -1 : x.flowId > y.flowId ? 1 : 0)).map((f) => [f.flowId, f.amount]);
  return JSON.stringify([b.blockId, b.height, b.prevHash, b.threshold, sorted]);
}

async function pendingFlows(e: LocalStore): Promise<Flow[]> {
  return (await listAll<Flow>(e, FLOW)).map((r) => r.value).filter((f) => !f.blockId);
}

async function blocks(e: LocalStore): Promise<Block[]> {
  return (await listAll<Block>(e, BLOCK)).map((r) => r.value).sort((a, b) => a.height - b.height);
}

export async function recordFlow(e: LocalStore, input: RecordFlowInput) {
  if (!isNonEmpty(input.flowId) || !isNonEmpty(input.contributor)) return { status: "rejected", error: "missingRequiredFields" };
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) return { status: "rejected", error: "amountMustBePositive" };
  if (await getOne<Flow>(e, FLOW, flowKey(input.flowId))) return { status: "alreadyExists" };
  const flow: Flow = { flowId: input.flowId, contributor: input.contributor, amount: input.amount, recordedAt: nowISO() };
  return { status: "recorded", flowUri: await put(e, FLOW, flowKey(input.flowId), flow) };
}

export async function checkFlowThreshold(e: LocalStore, input: CheckFlowThresholdInput) {
  if (typeof input.threshold !== "number" || !(input.threshold > 0)) return { status: "rejected", error: "thresholdMustBePositive" };
  const pending = await pendingFlows(e);
  const total = pending.reduce((s, f) => s + f.amount, 0);
  return { status: "ok", reached: total >= input.threshold, pendingTotal: total, pendingCount: pending.length, threshold: input.threshold };
}

export async function formBlock(e: LocalStore, input: FormBlockInput) {
  if (!isNonEmpty(input.blockId)) return { status: "rejected", error: "missingRequiredFields" };
  const check = await checkFlowThreshold(e, { threshold: input.threshold });
  if (check.status !== "ok") return check;
  if (!check.reached) return { status: "belowThreshold", pendingTotal: check.pendingTotal, threshold: input.threshold };
  const chain = await blocks(e);
  if (chain.some((b) => b.blockId === input.blockId)) return { status: "rejected", error: "blockIdExists" };
  const prev = chain[chain.length - 1];
  const pending = await pendingFlows(e);
  const head = { blockId: input.blockId, height: prev ? prev.height + 1 : 0, prevHash: prev ? prev.hash : "", threshold: input.threshold };
  const hash = await sha256Hex(blockPreimage(head, pending));
  const block: Block = { ...head, hash, total: check.pendingTotal, flowIds: pending.map((f) => f.flowId).sort(), formedAt: nowISO() };
  const blockUri = await put(e, BLOCK, blockKey(block.height), block);
  for (const f of pending) await put(e, FLOW, flowKey(f.flowId), { ...f, blockId: block.blockId });
  return { status: "formed", blockUri, height: block.height, hash, total: block.total, flowCount: pending.length };
}

export async function getBlock(e: LocalStore, input: GetBlockInput = {}) {
  const chain = await blocks(e);
  const block = input.blockId ? chain.find((b) => b.blockId === input.blockId)
    : typeof input.height === "number" ? chain.find((b) => b.height === input.height)
    : chain[chain.length - 1];
  if (!block) return { status: "notFound" };
  return { status: "ok", block };
}

export async function verifyChain(e: LocalStore) {
  const chain = await blocks(e);
  const flows = new Map((await listAll<Flow>(e, FLOW)).map((r) => [r.value.flowId, r.value]));
  let prevHash = "";
  for (const [i, b] of chain.entries()) {
    const members = b.flowIds.map((id) => flows.get(id)).filter((f): f is Flow => !!f);
    const recomputed = await sha256Hex(blockPreimage({ ...b, prevHash }, members));
    if (b.height !== i || b.prevHash !== prevHash || members.length !== b.flowIds.length || recomputed !== b.hash) {
      return { status: "broken", ok: false, brokenAtHeight: b.height, length: chain.length };
    }
    prevHash = b.hash;
  }
  return { status: "ok", ok: true, length: chain.length, head: prevHash };
}
