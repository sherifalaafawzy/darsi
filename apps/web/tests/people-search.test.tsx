import { render, screen, waitFor } from "@testing-library/react";

// /super/people's search (admin/data.ts usePeople): an exact email or username through Auth (findAccount), and names
// that start with the text as typed or with a capital first letter. And its "Show more", like the projects', the
// certificates' and the problem reports': a cursor, so only the next rows are read. Firestore and the callable are fakes.
const m = vi.hoisted(() => ({
  users: [] as Array<{ uid: string; name: string; email: string; summary?: unknown }>,
  accounts: {} as Record<string, string>,
  logins: [] as string[],
  prefixes: [] as string[],
  // Every list query as it was asked: where it started (the id of the row it came after) and how many rows it wanted.
  reads: [] as Array<{ path: string; after: string | null; limit: number | null }>,
}));
vi.mock("../src/firebase", () => ({ db: {}, storage: vi.fn() }));
vi.mock("../src/fb", async (orig) => ({
  ...(await orig<typeof import("../src/fb")>()),
  call: (name: string) => async ({ login }: { login: string }) => {
    if (name !== "findAccount") throw new Error(name);
    m.logins.push(login);
    const u = m.users.find((x) => x.uid === m.accounts[login]);
    return u ? { account: { uid: u.uid, name: u.name, email: login, emailVerified: true, username: null, role: "student", orgId: null, teach: null, provider: "password" }, profiles: 1 } : { account: null, profiles: 0 };
  },
}));
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, ...p: string[]) => ({ path: p.join("/") }),
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join("/") }),
  where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
  orderBy: (f: string, d?: string) => ({ orderBy: [f, d] }),
  limit: (n: number) => ({ limit: n }),
  startAfter: (d: { id: string }) => ({ startAfter: d.id }),
  query: (c: unknown, ...cs: Array<{ where?: [string, string, unknown] }>) => ({ c, cs }),
  getDocs: async (q: { c: { path: string }; cs: Array<{ where?: [string, string, string]; limit?: number; startAfter?: string }> }) => {
    const from = q.cs.find((x) => x.where?.[1] === ">=")?.where?.[2];
    if (from !== undefined) m.prefixes.push(from);
    const after = q.cs.find((x) => x.startAfter !== undefined)?.startAfter ?? null, limit = q.cs.find((x) => x.limit !== undefined)?.limit ?? null;
    m.reads.push({ path: q.c.path, after, limit });
    const all = from === undefined ? m.users : m.users.filter((u) => u.name.startsWith(from));
    const rows = all.slice(after === null ? 0 : all.findIndex((u) => u.uid === after) + 1).slice(0, limit ?? undefined);
    return { docs: rows.map((u) => ({ id: u.uid, data: () => u })) };
  },
  getDoc: async (ref: { path: string }) => { const u = m.users.find((x) => `users/${x.uid}` === ref.path); return { id: u?.uid, exists: () => !!u, data: () => u }; },
}));

const { usePeople } = await import("../src/admin/data");
function People({ q, max }: { q: string; max?: number }) {
  const r = usePeople(q, max);
  return <ul>{r.data?.map((p) => <li key={p.uid}>{p.name}</li>)}{r.data && <li>done</li>}<li><button onClick={r.reload}>again</button></li></ul>;
}

beforeEach(() => {
  m.users = [
    { uid: "u1", name: "Amina Bello", email: "amina@school.org", summary: { lessonsDone: 3 } },
    { uid: "u2", name: "Rana K", email: "rana.k@users.darsi.app" },
    { uid: "u3", name: "amira (typed in lower case)", email: "x@y.z" },
  ];
  m.accounts = { "amina@school.org": "u1", "rana.k@users.darsi.app": "u2" };
  m.logins = []; m.prefixes = []; m.reads = [];
});
const shown = () => screen.getAllByRole("listitem").map((li) => li.textContent).filter((x) => x !== "done" && x !== "again");

describe("searching all users", () => {
  it("finds a name typed in lower case, as written and with a capital first letter", async () => {
    render(<People q="ami" />);
    await screen.findByText("done");
    expect(m.prefixes.sort()).toEqual(["Ami", "ami"]);
    expect(screen.getByText("Amina Bello")).toBeTruthy();
    expect(screen.getByText("amira (typed in lower case)")).toBeTruthy();
  });

  it("finds an account by its exact email, with its whole profile", async () => {
    render(<People q="amina@school.org" />);
    await screen.findByText("done");
    expect(m.logins).toEqual(["amina@school.org"]);
    expect(m.prefixes).toEqual([]); // an email is never a name
    expect(screen.getByText("Amina Bello")).toBeTruthy();
  });

  it("finds an account by its username, once, beside names that start with it", async () => {
    m.users.push({ uid: "u4", name: "rana.k is a name too", email: "r@x.y" });
    render(<People q="rana.k" />);
    await screen.findByText("done");
    expect(m.logins).toEqual(["rana.k@users.darsi.app"]);
    await waitFor(() => expect(shown()).toEqual(["Rana K", "rana.k is a name too"]));
  });
});

describe("showing more of a long list", () => {
  beforeEach(() => { m.users = Array.from({ length: 7 }, (_, i) => ({ uid: `u${i + 1}`, name: `Person ${i + 1}`, email: `p${i + 1}@x.y` })); });

  it("reads only the rows after the last one shown, and appends them", async () => {
    const page = render(<People q="" max={3} />);
    await screen.findByText("done");
    expect(shown()).toEqual(["Person 1", "Person 2", "Person 3"]);
    page.rerender(<People q="" max={6} />);
    await waitFor(() => expect(shown()).toHaveLength(6));
    expect(shown()[5]).toBe("Person 6");
    // The second read starts after the third person and asks for three: the first three are not read again.
    expect(m.reads).toEqual([{ path: "users", after: null, limit: 3 }, { path: "users", after: "u3", limit: 3 }]);
    page.rerender(<People q="" max={9} />);
    await waitFor(() => expect(shown()).toHaveLength(7));
    expect(m.reads[2]).toEqual({ path: "users", after: "u6", limit: 3 });
    // That page came back short: the list has ended, and a further "Show more" reads nothing.
    page.rerender(<People q="" max={12} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(m.reads).toHaveLength(3);
  });

  it("reads what is shown again from the top on reload, in one query", async () => {
    const page = render(<People q="" max={3} />);
    await screen.findByText("done");
    page.rerender(<People q="" max={6} />);
    await waitFor(() => expect(shown()).toHaveLength(6));
    m.users[0].name = "Person 1, renamed";
    screen.getByRole("button", { name: "again" }).click();
    await waitFor(() => expect(shown()[0]).toBe("Person 1, renamed"));
    expect(m.reads[2]).toEqual({ path: "users", after: null, limit: 6 });
    expect(shown()).toHaveLength(6);
  });
});
