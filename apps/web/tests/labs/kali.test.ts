import { complete, exec, inScope, MINI_WORDLIST, MISSIONS, pacing, resolvePath, TARGET, tokenize } from "../../src/labs/apps/kali/model";

const text = (input: string, cwd = "/root") => exec(input, cwd).lines.map((l) => l.text).join("\n");

describe("kali terminal: parsing", () => {
  it("tokenises, respecting quotes", () => {
    expect(tokenize('sqlmap -u "http://x/p.php?id=1" --batch')).toEqual(["sqlmap", "-u", "http://x/p.php?id=1", "--batch"]);
  });
  it("resolves paths with . .. ~ and absolute/relative", () => {
    expect(resolvePath("/root", "loot")).toBe("/root/loot");
    expect(resolvePath("/root/loot", "..")).toBe("/root");
    expect(resolvePath("/root", "~/notes.txt")).toBe("/root/notes.txt");
    expect(resolvePath("/root", "/usr/share")).toBe("/usr/share");
    expect(resolvePath("/usr/share/wordlists", "../..")).toBe("/usr");
  });
  it("knows what is in scope and what is not", () => {
    expect(inScope("darsi-lab.test")).toBe(true);
    expect(inScope("admin.darsi-lab.test")).toBe(true);
    expect(inScope("10.10.14.20")).toBe(true);
    expect(inScope("http://10.10.14.20/product.php?id=1")).toBe(true);
    expect(inScope("google.com")).toBe(false);
    expect(inScope("8.8.8.8")).toBe(false);
    expect(inScope("192.168.1.1")).toBe(false);
  });
});

describe("kali terminal: safety", () => {
  it("never contacts anything outside the lab, and says so", () => {
    for (const cmd of ["ping google.com", "nmap -sV 8.8.8.8", "curl http://example.com", "hydra -l admin ssh://192.168.1.1", "dig microsoft.com"]) {
      const out = text(cmd);
      expect(out.toLowerCase()).toContain("outside the lab scope");
      expect(out).toMatch(/only .*can be reached|nothing real is ever contacted/i);
      // A one-line legal reminder is repeated on every out-of-scope attempt.
      expect(out.toLowerCase()).toContain("illegal in most countries");
      // No fabricated success for off-scope targets.
      expect(exec(cmd).hits).toEqual([]);
    }
  });
});

describe("kali terminal: filesystem", () => {
  it("lists, cats and cds the fake filesystem", () => {
    expect(text("ls /usr/share/wordlists")).toContain("rockyou-mini.txt");
    expect(text("cat /root/notes.txt")).toMatch(/AUTHORISED practice range/);
    expect(exec("cd /usr/share", "/root").cwd).toBe("/usr/share");
    expect(text("cat /nope")).toMatch(/No such file/);
    expect(text("cat /root/loot")).toMatch(/Is a directory/);
  });
  it("ships the mini wordlist with the weak password in it", () => {
    expect(MINI_WORDLIST).toContain(TARGET.creds.pass);
  });
});

describe("kali terminal: tools and the scenario", () => {
  it("recon reveals the ip and subdomains", () => {
    expect(text("whois darsi-lab.test")).toMatch(/DARSI-LAB\.TEST/);
    const dig = text("dig darsi-lab.test ANY");
    expect(dig).toContain(TARGET.ip);
    expect(dig).toContain("admin.darsi-lab.test");
    expect(text("host darsi-lab.test")).toContain(TARGET.ip);
  });
  it("nmap -sV shows the open ports with versions; -sn sweeps hosts", () => {
    const sv = text("nmap -sV 10.10.14.20");
    expect(sv).toMatch(/22\/tcp\s+open\s+ssh\s+OpenSSH/);
    expect(sv).toMatch(/80\/tcp\s+open\s+http\s+Apache/);
    expect(sv).toContain("MySQL");
    expect(text("nmap -sn 10.10.14.0/24")).toMatch(/hosts up/);
    expect(text("nmap -p 22 10.10.14.20")).toMatch(/22\/tcp\s+open/);
    expect(text("nmap -p 22 10.10.14.20")).not.toMatch(/3306/);
  });
  it("enumeration finds the hidden web dirs", () => {
    const g = text("gobuster dir -u http://10.10.14.20 -w /usr/share/wordlists/rockyou-mini.txt");
    expect(g).toContain("/admin");
    expect(g).toContain("/backup");
    expect(text("nikto -h http://10.10.14.20")).toMatch(/injectable|backup/i);
    expect(text("curl -I http://10.10.14.20")).toMatch(/HTTP\/1\.1 200 OK/);
  });
  it("sqlmap flags the injectable parameter, and refuses a url with no param", () => {
    expect(text('sqlmap -u "http://10.10.14.20/product.php?id=1" --batch')).toMatch(/injectable/i);
    expect(text('sqlmap -u "http://10.10.14.20/product.php" --batch')).toMatch(/no testable parameter/i);
  });
  it("hydra finds the weak ssh password with the admin user", () => {
    const h = text("hydra -l admin -P /usr/share/wordlists/rockyou-mini.txt ssh://10.10.14.20");
    expect(h).toMatch(/password:\s*password123/);
    expect(exec("hydra -l admin -P /usr/share/wordlists/rockyou-mini.txt ssh://10.10.14.20").hits).toContain("weakness");
  });
  it("john and hashcat crack the leaked md5", () => {
    expect(text("john --wordlist=/usr/share/wordlists/rockyou-mini.txt /root/loot/creds.md5")).toContain("password123");
    expect(text(`hashcat -m 0 ${TARGET.md5} /usr/share/wordlists/rockyou-mini.txt`)).toContain("password123");
  });
  it("nc grabs a banner on an open port and refuses a closed one", () => {
    expect(text("nc 10.10.14.20 22")).toMatch(/OpenSSH/);
    expect(text("nc 10.10.14.20 9999")).toMatch(/refused/i);
  });
  it("unknown commands and help behave realistically", () => {
    expect(text("frobnicate")).toMatch(/command not found/);
    expect(text("help")).toMatch(/nmap/);
    expect(text("man nmap")).toMatch(/Scan hosts/);
    expect(text("nmap --help")).toMatch(/Scan hosts/);
    expect(exec("clear").clear).toBe(true);
  });
});

describe("kali terminal: missions", () => {
  it("each tool reports the mission stage it belongs to", () => {
    expect(exec("whois darsi-lab.test").hits).toContain("recon");
    expect(exec("nmap -sV 10.10.14.20").hits).toContain("scan");
    expect(exec("gobuster dir -u http://10.10.14.20").hits).toContain("enum");
    expect(exec("sqlmap -u \"http://10.10.14.20/product.php?id=1\"").hits).toContain("weakness");
  });
  it("defines the five ordered missions", () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(["recon", "scan", "enum", "weakness", "fix"]);
  });
});

describe("kali terminal: tab completion", () => {
  it("completes commands and paths", () => {
    expect(complete("nma")).toContain("nmap");
    expect(complete("ls /usr/share/word")).toContain("/usr/share/wordlists");
    expect(complete("cat /usr/share/wordlists/rock")).toContain("/usr/share/wordlists/rockyou-mini.txt");
  });
});


describe("kali terminal: output pacing", () => {
  it("paces slow tools, keeps trivial commands instant, and uses a middle speed otherwise", () => {
    for (const t of ["nmap", "gobuster", "hydra", "sqlmap", "nikto", "john", "hashcat"]) {
      const p = pacing(t);
      expect(p.initial).toBeGreaterThan(0);        // slow tools pause first
      expect(p.line).toBeGreaterThanOrEqual(60);   // then pace slowly
    }
    for (const t of ["pwd", "whoami", "ls", "echo", "cat"]) {
      const p = pacing(t);
      expect(p.initial).toBe(0);
      expect(p.line).toBe(0);                       // trivial commands are instant (no per-line delay)
    }
    const mid = pacing("dig");
    expect(mid.line).toBeGreaterThan(0);
    expect(mid.line + mid.jitter).toBeLessThanOrEqual(60); // ~20-60 ms per line
    expect(mid.line).toBeLessThan(pacing("nmap").line);
  });
});
