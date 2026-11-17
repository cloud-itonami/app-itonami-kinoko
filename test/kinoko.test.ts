import { describe, it, beforeEach } from "node:test";
import { expect } from "./expect.mjs";
import { LocalStore } from "../dist/local-store.js";
import { recordFlow, checkFlowThreshold, formBlock, getBlock, verifyChain } from "../dist/domain/index.js";

describe("kinoko PoNF blocks", () => {
  let e: any;
  beforeEach(() => { e = new LocalStore({ did: "did:web:kinoko.itonami.cloud" }); });

  it("validates flows and is idempotent on flowId", async () => {
    expect((await recordFlow(e, { flowId: "f1", contributor: "kabi", amount: 3 })).status).toBe("recorded");
    expect((await recordFlow(e, { flowId: "f1", contributor: "kabi", amount: 3 })).status).toBe("alreadyExists");
    expect((await recordFlow(e, { flowId: "f2", contributor: "kabi", amount: 0 })).error).toBe("amountMustBePositive");
    expect((await recordFlow(e, { flowId: "", contributor: "kabi", amount: 1 })).error).toBe("missingRequiredFields");
  });

  it("forms a block only once pending flow reaches the threshold", async () => {
    await recordFlow(e, { flowId: "f1", contributor: "a", amount: 3 });
    expect((await checkFlowThreshold(e, { threshold: 5 })).reached).toBe(false);
    expect((await formBlock(e, { blockId: "b0", threshold: 5 })).status).toBe("belowThreshold");
    await recordFlow(e, { flowId: "f2", contributor: "b", amount: 2 });
    const formed = await formBlock(e, { blockId: "b0", threshold: 5 });
    expect(formed.status).toBe("formed");
    expect(formed.height).toBe(0);
    expect(formed.total).toBe(5);
    // flows are sealed: nothing pending any more
    expect((await checkFlowThreshold(e, { threshold: 1 })).pendingCount).toBe(0);
  });

  it("chains blocks by hash and detects tampering", async () => {
    await recordFlow(e, { flowId: "f1", contributor: "a", amount: 5 });
    await formBlock(e, { blockId: "b0", threshold: 5 });
    await recordFlow(e, { flowId: "f2", contributor: "a", amount: 7 });
    const b1 = await formBlock(e, { blockId: "b1", threshold: 5 });
    expect(b1.height).toBe(1);
    const got = await getBlock(e, { blockId: "b1" });
    expect(got.block.prevHash).toBe((await getBlock(e, { height: 0 })).block.hash);
    expect((await getBlock(e)).block.blockId).toBe("b1");
    expect((await formBlock(e, { blockId: "b1", threshold: 0.5 })).status).toBe("belowThreshold");
    expect((await verifyChain(e)).ok).toBe(true);
    // tamper: change a sealed flow's amount
    const rec = (await e.read({ collection: "cloud.itonami.apps.kinoko.flow", rkey: "flow-f1" })).records[0].value;
    await e.write({ collection: "cloud.itonami.apps.kinoko.flow", rkey: "flow-f1", record: { ...rec, amount: 50 } });
    const v = await verifyChain(e);
    expect(v.ok).toBe(false);
    expect(v.brokenAtHeight).toBe(0);
  });

  it("reports a missing block", async () => {
    expect((await getBlock(e, { blockId: "zz" })).status).toBe("notFound");
  });
});
