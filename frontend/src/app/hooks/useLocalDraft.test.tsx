import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { useLocalDraft, useLocalDraftCollection } from "./useLocalDraft";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});

type Draft = { summary: string };
let draftApi: ReturnType<typeof useLocalDraft<Draft>>;
let collectionApi: ReturnType<typeof useLocalDraftCollection<Draft>>;
const validate = (value: unknown): value is Draft => typeof value === "object" && value !== null && typeof (value as Draft).summary === "string";

function Probe({ userId, branchId }: { userId: string; branchId: string }) {
  draftApi = useLocalDraft({ userId, branchId, form: "incident" }, validate);
  return null;
}

function CollectionProbe({ userId, branchId }: { userId: string; branchId: string }) {
  collectionApi = useLocalDraftCollection({ userId, branchId, form: "incident" }, validate);
  return null;
}

describe("local draft recovery", () => {
  beforeEach(() => values.clear());

  it("isolates drafts by user and branch, restores valid data, and clears it", () => {
    let renderer = create(createElement(Probe, { userId: "user-a", branchId: "branch-a" }));
    act(() => draftApi.save({ summary: "Unsubmitted incident" }));
    expect(draftApi.read()).toEqual({ summary: "Unsubmitted incident" });

    act(() => renderer.update(createElement(Probe, { userId: "user-a", branchId: "branch-b" })));
    expect(draftApi.read()).toBeNull();
    act(() => renderer.update(createElement(Probe, { userId: "user-b", branchId: "branch-a" })));
    expect(draftApi.read()).toBeNull();
    act(() => renderer.update(createElement(Probe, { userId: "user-a", branchId: "branch-a" })));
    expect(draftApi.read()).toEqual({ summary: "Unsubmitted incident" });
    act(() => draftApi.clear());
    expect(draftApi.read()).toBeNull();
    renderer.unmount();
  });

  it("discards expired or invalid draft envelopes", () => {
    create(createElement(Probe, { userId: "user-a", branchId: "branch-a" }));
    values.set(draftApi.key, JSON.stringify({ version: 1, savedAt: 0, value: { summary: "Old" } }));
    expect(draftApi.read()).toBeNull();
    values.set(draftApi.key, JSON.stringify({ version: 1, savedAt: Date.now(), value: { unexpected: true } }));
    expect(draftApi.read()).toBeNull();
  });
});

describe("local draft collections",()=>{
  beforeEach(()=>values.clear());

  it("stores multiple drafts newest-first and isolates users and branches",()=>{
    let renderer=create(createElement(CollectionProbe,{userId:"user-a",branchId:"branch-a"}));
    let first="";let second="";
    act(()=>{first=collectionApi.save({summary:"First"});});
    act(()=>{second=collectionApi.save({summary:"Second"});});
    expect(collectionApi.list().map((draft)=>draft.value.summary)).toEqual(["Second","First"]);
    act(()=>{collectionApi.save({summary:"First updated"},first);});
    expect(collectionApi.list()).toHaveLength(2);
    expect(collectionApi.read(first)?.value.summary).toBe("First updated");
    act(()=>renderer.update(createElement(CollectionProbe,{userId:"user-a",branchId:"branch-b"})));
    expect(collectionApi.list()).toEqual([]);
    act(()=>renderer.update(createElement(CollectionProbe,{userId:"user-b",branchId:"branch-a"})));
    expect(collectionApi.list()).toEqual([]);
    act(()=>renderer.update(createElement(CollectionProbe,{userId:"user-a",branchId:"branch-a"})));
    act(()=>collectionApi.remove(second));
    expect(collectionApi.list().map((draft)=>draft.id)).toEqual([first]);
    renderer.unmount();
  });

  it("removes corrupted, invalid, and expired collection entries",()=>{
    create(createElement(CollectionProbe,{userId:"user-a",branchId:"branch-a"}));
    values.set(collectionApi.key,"not-json");
    expect(collectionApi.list()).toEqual([]);
    values.set(collectionApi.key,JSON.stringify({version:1,drafts:[
      {id:"valid",savedAt:Date.now(),value:{summary:"Valid"}},
      {id:"expired",savedAt:0,value:{summary:"Expired"}},
      {id:"invalid",savedAt:Date.now(),value:{wrong:true}},
    ]}));
    expect(collectionApi.list().map((draft)=>draft.id)).toEqual(["valid"]);
  });
});
