import { render, screen, waitFor } from "@testing-library/react";

// /super/people's search (admin/data.ts usePeople): an exact email or username through Auth (findAccount), and names
// that start with the text as typed or with a capital first letter. Firestore and the callable are fakes.
const m = vi.hoisted(() => ({
  users: [] as Array<{ uid: string; name: string; email: string; summary?: unknown }>,
  accounts: {} as Record<string, string>,
  logins: [] as string[],
  prefixes: [] as string[],
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
  query: (c: unknown, ...cs: Array<{ where?: [string, string, unknown] }>) => ({ c, cs }),
  getDocs: async (q: { cs: Array<{ where?: [string, string, string] }> }) => {
    const from = q.cs.find((x) => x.where?.[1] === ">=")?.where?.[2];
    if (from !== undefined) m.prefixes.push(from);
    const rows = from === undefined ? m.users : m.users.filter((u) => u.name.startsWith(from));
    return { docs: rows.map((u) => ({ id: u.uid, data: () => u })) };
  },
  getDoc: async (ref: { path: string }) => { const u = m.users.find((x) => `users/${x.uid}` === ref.path); return { id: u?.uid, exists: () => !!u, data: () => u }; },
}));

const { usePeople } = await import("../src/admin/data");
function People({ q }: { q: string }) {
  const r = usePeople(q);
  return <ul>{r.data?.map((p) => <li key={p.uid}>{p.name}</li>)}{r.data && <li>done</li>}</ul>;
}

beforeEach(() => {
  m.users = [
    { uid: "u1", name: "Amina Bello", email: "amina@school.org", summary: { lessonsDone: 3 } },
    { uid: "u2", name: "Rana K", email: "rana.k@users.darsi.app" },
    { uid: "u3", name: "amira (typed in lower case)", email: "x@y.z" },
  ];
  m.accounts = { "amina@school.org": "u1", "rana.k@users.darsi.app": "u2" };
  m.logins = []; m.prefixes = [];
});

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
    await waitFor(() => expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Rana K", "rana.k is a name too", "done"]));
  });
});
