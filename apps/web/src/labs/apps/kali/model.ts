/**
 * A fully simulated Kali Linux terminal. Nothing here touches the network: every command runs against a fictional
 * practice target, darsi-lab.test (reserved .test TLD) on a made-up 10.10.x.x network, so learners can see how
 * recon, scanning, enumeration and exploitation tools behave without attacking any real system. The parser and all
 * tool output live in this pure module so they can be unit-tested; index.tsx only draws the console.
 */

/** One line of console output. `tone` picks a colour class; default is the normal green/white terminal text. */
export type Tone = "out" | "ok" | "warn" | "err" | "info" | "dim" | "prompt";
export interface Line { text: string; tone?: Tone }
const L = (text: string, tone?: Tone): Line => ({ text, tone });

/** The result of running one command line. */
export interface ExecResult {
  lines: Line[];
  /** New working directory, if `cd` changed it. */
  cwd?: string;
  /** True for `clear`: the UI wipes the screen. */
  clear?: boolean;
  /** Mission ids this command satisfied (recon → scan → enum → weakness → fix). */
  hits: string[];
}

/** The one coherent scenario. Everything a tool reports ties back to these facts, so findings connect. */
export const TARGET = {
  domain: "darsi-lab.test",
  ip: "10.10.14.20",
  net: "10.10.14.0/24",
  gateway: "10.10.14.1",
  subdomains: {
    "www.darsi-lab.test": "10.10.14.20",
    "admin.darsi-lab.test": "10.10.14.21",
    "dev.darsi-lab.test": "10.10.14.22",
    "mail.darsi-lab.test": "10.10.14.23",
  } as Record<string, string>,
  // The weak account the learner is meant to discover.
  creds: { user: "admin", pass: "password123", service: "ssh" },
  // A password hash left in a backup file; cracks to the same weak password.
  md5: "482c811da5d5b4bc6d497ffa98491e38", // md5("password123")
};

/** Open ports on the main host, with the service banners nmap -sV reveals. */
export const PORTS = [
  { port: 22, proto: "tcp", service: "ssh", version: "OpenSSH 7.4 (protocol 2.0)", product: "OpenSSH" },
  { port: 80, proto: "tcp", service: "http", version: "Apache httpd 2.4.29 ((Ubuntu))", product: "Apache httpd" },
  { port: 3306, proto: "tcp", service: "mysql", version: "MySQL 5.7.33-0ubuntu0.16.04.1", product: "MySQL" },
  { port: 8080, proto: "tcp", service: "http-proxy", version: "Apache httpd 2.4.29", product: "Apache httpd" },
];

/** Hosts that answer on the practice network (nmap -sn / ping sweep). */
export const HOSTS = [
  { ip: "10.10.14.1", name: "gateway" },
  { ip: "10.10.14.20", name: "darsi-lab.test" },
  { ip: "10.10.14.21", name: "admin.darsi-lab.test" },
  { ip: "10.10.14.22", name: "dev.darsi-lab.test" },
  { ip: "10.10.14.23", name: "mail.darsi-lab.test" },
];

/** Web paths gobuster/dirb find on port 80. */
export const WEBDIRS = [
  { path: "/index.html", code: 200, size: 10701 },
  { path: "/login.php", code: 200, size: 2104 },
  { path: "/admin", code: 301, size: 312 },
  { path: "/uploads", code: 301, size: 318 },
  { path: "/backup", code: 301, size: 316 },
  { path: "/css", code: 301, size: 313 },
  { path: "/js", code: 301, size: 312 },
  { path: "/robots.txt", code: 200, size: 42 },
  { path: "/product.php", code: 200, size: 1876 },
];

/** A tiny fake filesystem. Keys are absolute paths; a directory lists its children, a file holds its text. */
type Node = { dir?: string[]; file?: string };
export const FS: Record<string, Node> = {
  "/": { dir: ["root", "home", "usr", "etc", "tmp"] },
  "/root": { dir: ["notes.txt", "loot", ".bash_history"] },
  "/root/notes.txt": {
    file:
      "Engagement: darsi-lab.test (AUTHORISED practice range only).\n" +
      "Scope: 10.10.14.0/24. Do not touch anything outside this range.\n" +
      "TODO: map hosts, scan 10.10.14.20, enumerate the web app, find the weak login, write the fix.\n",
  },
  "/root/loot": { dir: ["creds.md5"] },
  "/root/loot/creds.md5": { file: "admin:" + TARGET.md5 + "\n" },
  "/root/.bash_history": { file: "nmap -sV 10.10.14.20\nhydra -l admin ssh://10.10.14.20\nclear\n" },
  "/home": { dir: ["kali"] },
  "/home/kali": { dir: ["targets.txt"] },
  "/home/kali/targets.txt": { file: TARGET.ip + "\n" },
  "/etc": { dir: ["hosts", "passwd"] },
  "/etc/hosts": { file: "127.0.0.1\tlocalhost\n" + TARGET.ip + "\t" + TARGET.domain + "\n" },
  "/etc/passwd": { file: "root:x:0:0:root:/root:/bin/bash\nkali:x:1000:1000:Kali,,,:/home/kali:/bin/bash\n" },
  "/tmp": { dir: [] },
  "/usr": { dir: ["share"] },
  "/usr/share": { dir: ["wordlists"] },
  "/usr/share/wordlists": { dir: ["rockyou-mini.txt", "dirb-common.txt"] },
  "/usr/share/wordlists/rockyou-mini.txt": {
    file: ["123456", "password", "qwerty", "letmein", "iloveyou", "admin", "welcome",
      "monkey", "dragon", "football", "password1", "password123", "root", "toor", "changeme"].join("\n") + "\n",
  },
  "/usr/share/wordlists/dirb-common.txt": {
    file: ["admin", "login", "uploads", "backup", "css", "js", "images", "config", "test", "api"].join("\n") + "\n",
  },
};

/** The mini password list hydra/john "try", in order; the weak password sits inside it. */
export const MINI_WORDLIST = (FS["/usr/share/wordlists/rockyou-mini.txt"].file || "").trim().split("\n");

/** Resolve a path argument against the current directory. Handles `.`, `..`, `~`, absolute and relative. */
export function resolvePath(cwd: string, arg: string): string {
  if (!arg || arg === "~") return "/root";
  let base = arg.startsWith("/") ? "" : cwd;
  if (arg.startsWith("~/")) { base = "/root"; arg = arg.slice(2); }
  const parts = (base + "/" + arg).split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return "/" + stack.join("/");
}

/** Short display of the cwd in the prompt: /root → ~ . */
export const shortCwd = (cwd: string) => (cwd === "/root" ? "~" : cwd.startsWith("/root/") ? "~" + cwd.slice(5) : cwd);

/** Is this argument the lab target (domain, a known subdomain, or an in-range IP)? */
export function inScope(arg: string): boolean {
  const a = arg.replace(/^https?:\/\//, "").replace(/\/.*$/, "").split(":")[0].toLowerCase();
  if (a === TARGET.domain) return true;
  if (a in TARGET.subdomains) return true;
  if (/^10\.10\.14\.\d{1,3}$/.test(a)) return true;
  if (a === TARGET.net || a === "10.10.14.0/24") return true;
  return false;
}

/** The out-of-scope refusal: the lab never contacts anything but the practice target. */
const outOfScope = (what: string): Line[] => [
  L(`Target "${what}" is outside the lab scope.`, "err"),
  L(`This is a safe simulator: only ${TARGET.domain} / ${TARGET.net} can be reached, and nothing real is ever contacted.`, "warn"),
  L("Reminder: scanning, accessing or attacking systems you don't own or have written permission to test is illegal in most countries.", "warn"),
];

/** Tokenise a command line (simple whitespace split, quotes respected). */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** The commands the simulator knows, for help and tab completion. */
export const COMMANDS = [
  "help", "clear", "whoami", "id", "uname", "pwd", "ls", "cd", "cat", "echo", "history", "man",
  "ping", "whois", "dig", "nslookup", "host", "nmap", "whatweb", "curl", "gobuster", "dirb",
  "nikto", "sqlmap", "hydra", "john", "hashcat", "searchsploit", "nc", "netcat", "exit",
];

/** One-line summary for `help` and `man`. */
export const MAN: Record<string, { use: string; desc: string }> = {
  whoami: { use: "whoami", desc: "Print the current user. You are root on the Kali box." },
  id: { use: "id", desc: "Show the current user and group ids." },
  uname: { use: "uname -a", desc: "Print kernel / OS information." },
  pwd: { use: "pwd", desc: "Print the working directory." },
  ls: { use: "ls [path]", desc: "List files. Try: ls /usr/share/wordlists" },
  cd: { use: "cd <path>", desc: "Change directory." },
  cat: { use: "cat <file>", desc: "Print a file. Try: cat /root/notes.txt" },
  echo: { use: "echo <text>", desc: "Print text." },
  history: { use: "history", desc: "Show the commands you have run." },
  man: { use: "man <tool>", desc: "Explain a tool. Same as <tool> --help." },
  ping: { use: "ping <host>", desc: "Check a host is up. Only lab hosts answer." },
  whois: { use: "whois <domain>", desc: "Registration details for a domain (recon)." },
  dig: { use: "dig <domain> [type]", desc: "DNS lookup. Try: dig darsi-lab.test ANY" },
  nslookup: { use: "nslookup <host>", desc: "Resolve a name to an IP." },
  host: { use: "host <name>", desc: "Resolve a name to an IP." },
  nmap: { use: "nmap [-sn|-sV|-sC|-A|-Pn|-p <ports>] <target>", desc: "Scan hosts, ports and services. Try: nmap -sV 10.10.14.20" },
  whatweb: { use: "whatweb <url>", desc: "Fingerprint the web technologies a site uses." },
  curl: { use: "curl [-I] <url>", desc: "Fetch a URL. -I shows only the HTTP headers." },
  gobuster: { use: "gobuster dir -u <url> -w <wordlist>", desc: "Brute-force hidden web directories." },
  dirb: { use: "dirb <url>", desc: "Brute-force hidden web directories (like gobuster)." },
  nikto: { use: "nikto -h <url>", desc: "Scan a web server for known issues." },
  sqlmap: { use: 'sqlmap -u "<url?param=1>" --batch', desc: "Test a URL parameter for SQL injection." },
  hydra: { use: "hydra -l <user> -P <wordlist> <service>://<host>", desc: "Try many passwords against a login (brute force)." },
  john: { use: "john --wordlist=<list> <hashfile>", desc: "Crack password hashes with a wordlist." },
  hashcat: { use: "hashcat -m 0 <hash> <wordlist>", desc: "Crack hashes on the GPU. -m 0 is raw MD5." },
  searchsploit: { use: "searchsploit <term>", desc: "Search local exploit database (Exploit-DB)." },
  nc: { use: "nc <host> <port>", desc: "Open a raw TCP connection (banner grabbing)." },
  netcat: { use: "nc <host> <port>", desc: "Open a raw TCP connection (banner grabbing)." },
};

const flagSet = (tokens: string[]) => new Set(tokens.filter((t) => t.startsWith("-")));
const firstTarget = (tokens: string[]) => tokens.slice(1).find((t) => !t.startsWith("-"));

/** Run one command line. Pure: give it the line and the current directory, get lines + any state changes back. */
export function exec(input: string, cwd = "/root"): ExecResult {
  const line = input.trim();
  const hits: string[] = [];
  if (!line) return { lines: [], hits };
  const tokens = tokenize(line);
  const cmd = tokens[0];
  const out: Line[] = [];
  const done = (l: Line[]): ExecResult => ({ lines: l, hits });

  // --help on any known command behaves like man.
  if (tokens.includes("--help") && MAN[cmd]) {
    return done([L(MAN[cmd].use, "info"), L(MAN[cmd].desc)]);
  }

  switch (cmd) {
    case "clear":
      return { lines: [], clear: true, hits };

    case "help":
      out.push(L("Simulated Kali Linux — practice lab. Commands:", "info"));
      out.push(L(COMMANDS.filter((c) => c !== "exit").join("  ")));
      out.push(L("Type `man <tool>` or `<tool> --help` for a tool. Everything runs offline against " + TARGET.domain + ".", "dim"));
      out.push(L("Only test systems you own or have written permission to test.", "warn"));
      return done(out);

    case "man": {
      const t = tokens[1];
      if (!t) return done([L("What manual page do you want? Try: man nmap", "err")]);
      if (!MAN[t]) return done([L(`No manual entry for ${t}`, "err")]);
      return done([L(t.toUpperCase() + "(1)", "info"), L("  " + MAN[t].use, "ok"), L("  " + MAN[t].desc)]);
    }

    case "whoami":
      return done([L("root")]);
    case "id":
      return done([L("uid=0(root) gid=0(root) groups=0(root)")]);
    case "uname":
      return done([L("Linux kali 6.1.0-kali9-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux")]);
    case "pwd":
      return done([L(cwd)]);
    case "echo":
      return done([L(tokens.slice(1).join(" "))]);
    case "history":
      return done([L("(see the panel; history is kept per session)", "dim")]);

    case "ls": {
      const target = firstTarget(tokens) ?? cwd;
      const path = resolvePath(cwd, target);
      const node = FS[path];
      if (!node) return done([L(`ls: cannot access '${target}': No such file or directory`, "err")]);
      if (node.file) return done([L(path.split("/").pop() || path)]);
      return done([L((node.dir || []).join("  "))]);
    }

    case "cd": {
      const target = tokens[1] ?? "~";
      const path = resolvePath(cwd, target);
      const node = FS[path];
      if (!node) return { lines: [L(`cd: ${target}: No such file or directory`, "err")], hits };
      if (node.file) return { lines: [L(`cd: ${target}: Not a directory`, "err")], hits };
      return { lines: [], cwd: path, hits };
    }

    case "cat": {
      if (!tokens[1]) return done([L("cat: missing file operand", "err")]);
      const path = resolvePath(cwd, tokens[1]);
      const node = FS[path];
      if (!node) return done([L(`cat: ${tokens[1]}: No such file or directory`, "err")]);
      if (node.dir) return done([L(`cat: ${tokens[1]}: Is a directory`, "err")]);
      return done((node.file || "").replace(/\n$/, "").split("\n").map((t) => L(t)));
    }

    case "ping": {
      const t = firstTarget(tokens);
      if (!t) return done([L("ping: usage error: Destination address required", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      const ip = TARGET.subdomains[t] || (/^10\./.test(t) ? t : TARGET.ip);
      out.push(L(`PING ${t} (${ip}) 56(84) bytes of data.`));
      for (let i = 0; i < 4; i++) out.push(L(`64 bytes from ${ip}: icmp_seq=${i + 1} ttl=64 time=${(0.3 + i * 0.1).toFixed(2)} ms`));
      out.push(L(`--- ${t} ping statistics ---`));
      out.push(L("4 packets transmitted, 4 received, 0% packet loss, time 3004ms", "ok"));
      hits.push("recon");
      return done(out);
    }

    case "whois": {
      const t = firstTarget(tokens);
      if (!t) return done([L("whois: missing domain", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      out.push(L(`Domain Name: ${TARGET.domain.toUpperCase()}`));
      out.push(L("Registrar: Darsi Practice Range (SIMULATED)"));
      out.push(L("Registrant Org: Darsi Labs (fictional)"));
      out.push(L("Name Server: NS1.DARSI-LAB.TEST"));
      out.push(L("Name Server: NS2.DARSI-LAB.TEST"));
      out.push(L("Creation Date: 2023-01-01T00:00:00Z"));
      out.push(L("Admin Email: admin@darsi-lab.test"));
      out.push(L(">>> This is a fictional record for training. <<<", "dim"));
      hits.push("recon");
      return done(out);
    }

    case "dig": {
      const t = tokens.slice(1).find((x) => !x.startsWith("-") && !/^(A|AAAA|ANY|MX|NS|TXT|CNAME)$/i.test(x));
      const type = (tokens.slice(1).find((x) => /^(A|AAAA|ANY|MX|NS|TXT|CNAME)$/i.test(x)) || "A").toUpperCase();
      if (!t) return done([L("dig: missing name", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      out.push(L(`; <<>> DiG 9.16 <<>> ${t} ${type}`, "dim"));
      out.push(L(";; ANSWER SECTION:", "info"));
      if (type === "A" || type === "ANY") out.push(L(`${t}.\t3600\tIN\tA\t${TARGET.subdomains[t] || TARGET.ip}`));
      if (type === "NS" || type === "ANY") { out.push(L(`${TARGET.domain}.\t3600\tIN\tNS\tns1.darsi-lab.test.`)); out.push(L(`${TARGET.domain}.\t3600\tIN\tNS\tns2.darsi-lab.test.`)); }
      if (type === "MX" || type === "ANY") out.push(L(`${TARGET.domain}.\t3600\tIN\tMX\t10 mail.darsi-lab.test.`));
      if (type === "TXT" || type === "ANY") out.push(L(`${TARGET.domain}.\t3600\tIN\tTXT\t"v=spf1 include:mail.darsi-lab.test -all"`));
      if (type === "ANY") { out.push(L(";; Subdomains seen in this zone (lab):", "info")); for (const [name, ip] of Object.entries(TARGET.subdomains)) out.push(L(`${name}.\t3600\tIN\tA\t${ip}`)); }
      hits.push("recon");
      return done(out);
    }

    case "nslookup":
    case "host": {
      const t = firstTarget(tokens);
      if (!t) return done([L(`${cmd}: missing name`, "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      const ip = TARGET.subdomains[t] || TARGET.ip;
      if (cmd === "host") out.push(L(`${t} has address ${ip}`));
      else { out.push(L("Server:\t\t10.10.14.1")); out.push(L("Address:\t10.10.14.1#53")); out.push(L("")); out.push(L(`Name:\t${t}`)); out.push(L(`Address: ${ip}`)); }
      hits.push("recon");
      return done(out);
    }

    case "nmap": {
      const t = tokens.slice(1).find((x) => inScope(x)) ?? firstTarget(tokens);
      const flags = flagSet(tokens);
      if (!t) return done([L("Nmap: no target specified. Try: nmap -sV 10.10.14.20", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      out.push(L("Starting Nmap 7.94 ( https://nmap.org ) [SIMULATED]", "dim"));

      // Host discovery sweep.
      if (flags.has("-sn") || t.includes("/24")) {
        for (const h of HOSTS) { out.push(L(`Nmap scan report for ${h.name} (${h.ip})`)); out.push(L("Host is up (0.00042s latency).", "ok")); }
        out.push(L(`Nmap done: 256 IP addresses (${HOSTS.length} hosts up) scanned`, "info"));
        hits.push("scan");
        return done(out);
      }

      out.push(L(`Nmap scan report for ${t}`));
      out.push(L("Host is up (0.00040s latency).", "ok"));
      out.push(L(""));

      // Which ports to show.
      let ports = PORTS;
      const pFlag = tokens.find((_, i) => tokens[i - 1] === "-p");
      const pInline = tokens.find((x) => /^-p\d/.test(x));
      const pSpec = pFlag || (pInline ? pInline.slice(2) : undefined);
      if (pSpec && pSpec !== "-") { const want = new Set(pSpec.split(",").map((n) => parseInt(n, 10))); ports = PORTS.filter((p) => want.has(p.port)); }

      const verbose = flags.has("-sV") || flags.has("-A");
      out.push(L("PORT     STATE SERVICE" + (verbose ? "    VERSION" : ""), "info"));
      for (const p of ports) out.push(L(`${(p.port + "/" + p.proto).padEnd(9)}open  ${p.service.padEnd(verbose ? 11 : 0)}${verbose ? p.version : ""}`.trimEnd()));

      if (flags.has("-sC") || flags.has("-A")) {
        out.push(L(""));
        out.push(L("| http-title: Darsi Lab — Online Shop", "dim"));
        out.push(L("| http-robots.txt: 1 disallowed entry: /admin", "dim"));
        out.push(L("|_http-server-header: Apache/2.4.29 (Ubuntu)", "dim"));
        out.push(L("| ssh-hostkey: 2048 SHA256:FAKEKEYdarsilab (RSA)", "dim"));
      }
      out.push(L(""));
      out.push(L(`Nmap done: 1 IP address (1 host up) scanned`, "info"));
      hits.push("scan");
      return done(out);
    }

    case "whatweb": {
      const t = firstTarget(tokens);
      if (!t) return done([L("whatweb: missing url", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      out.push(L(`http://${t.replace(/^https?:\/\//, "")} [200 OK] Apache[2.4.29], Country[RESERVED][ZZ], HTTPServer[Ubuntu Linux][Apache/2.4.29 (Ubuntu)], IP[${TARGET.ip}], PHP[7.2.24], Title[Darsi Lab — Online Shop], X-Powered-By[PHP/7.2.24]`));
      hits.push("enum");
      return done(out);
    }

    case "curl": {
      const t = firstTarget(tokens);
      const flags = flagSet(tokens);
      if (!t) return done([L("curl: try 'curl --help'", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      if (flags.has("-I")) {
        out.push(L("HTTP/1.1 200 OK"));
        out.push(L("Date: Mon, 01 Jan 2024 10:00:00 GMT"));
        out.push(L("Server: Apache/2.4.29 (Ubuntu)"));
        out.push(L("X-Powered-By: PHP/7.2.24"));
        out.push(L("Set-Cookie: PHPSESSID=darsilabfake; path=/"));
        out.push(L("Content-Type: text/html; charset=UTF-8"));
      } else if (/robots\.txt/.test(t)) {
        out.push(L("User-agent: *")); out.push(L("Disallow: /admin")); out.push(L("Disallow: /backup"));
      } else {
        out.push(L("<!DOCTYPE html><html><head><title>Darsi Lab — Online Shop</title></head>"));
        out.push(L("<body><h1>Welcome to the Darsi practice shop</h1>"));
        out.push(L('<a href="/login.php">Staff login</a> · <a href="/product.php?id=1">Products</a></body></html>'));
      }
      hits.push("enum");
      return done(out);
    }

    case "gobuster":
    case "dirb": {
      const t = tokens.find((x) => inScope(x)) || firstTarget(tokens);
      if (!t) return done([L(`${cmd}: a target URL is required, e.g. http://${TARGET.ip}`, "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      out.push(L(`===== ${cmd} dir scan: http://${TARGET.ip}/ =====`, "dim"));
      for (const d of WEBDIRS) {
        const tone: Tone = d.path === "/admin" || d.path === "/backup" || d.path === "/login.php" ? "ok" : "out";
        out.push(L(`${d.path.padEnd(16)} (Status: ${d.code}) [Size: ${d.size}]`, tone));
      }
      out.push(L("Finished. /admin, /backup and /login.php look interesting.", "info"));
      hits.push("enum");
      return done(out);
    }

    case "nikto": {
      const t = tokens.find((x) => inScope(x)) || firstTarget(tokens);
      if (!t) return done([L("nikto: -h <host> is required", "err")]);
      if (!inScope(t)) return done(outOfScope(t));
      out.push(L(`- Nikto v2.5.0 — target ${TARGET.ip} (SIMULATED)`, "dim"));
      out.push(L("+ Server: Apache/2.4.29 (Ubuntu)"));
      out.push(L("+ /admin/: Admin login page found.", "warn"));
      out.push(L("+ /backup/: Directory indexing enabled — db_backup.sql exposed!", "warn"));
      out.push(L("+ /product.php?id=1: parameter 'id' may be injectable.", "warn"));
      out.push(L("+ OSVDB-3233: /icons/README: Apache default file found."));
      out.push(L("+ Server leaks PHP version via X-Powered-By: PHP/7.2.24", "warn"));
      hits.push("enum");
      return done(out);
    }

    case "sqlmap": {
      const u = tokens.find((x) => inScope(x)) || tokens.find((x) => /\?.*=/.test(x));
      if (!u) return done([L('sqlmap: -u "<url>" is required, e.g. sqlmap -u "http://10.10.14.20/product.php?id=1" --batch', "err")]);
      if (!inScope(u)) return done(outOfScope(u));
      if (!/[?&]\w+=/.test(u)) return done([L("sqlmap: no testable parameter in the URL (add e.g. ?id=1)", "err")]);
      out.push(L("[*] starting @ SIMULATED", "dim"));
      out.push(L("[INFO] testing connection to the target URL"));
      out.push(L("[INFO] testing if GET parameter 'id' is dynamic"));
      out.push(L("[INFO] GET parameter 'id' appears to be injectable", "ok"));
      out.push(L("[INFO] the back-end DBMS is MySQL"));
      out.push(L("sqlmap identified the following injection point(s):", "info"));
      out.push(L("  Parameter: id (GET) — Type: boolean-based blind / UNION query", "ok"));
      out.push(L("Database: darsi_shop"));
      out.push(L("[2 tables]  products  users", "info"));
      out.push(L("Table users: admin | " + TARGET.md5 + "  (password hash)", "warn"));
      out.push(L("[!] The 'id' parameter is NOT sanitised — classic SQL injection.", "warn"));
      hits.push("weakness");
      return done(out);
    }

    case "hydra": {
      const flags = tokens.join(" ");
      const svc = tokens.find((x) => inScope(x) || /:\/\//.test(x));
      if (!svc) return done([L(`hydra: a service target is required, e.g. hydra -l admin -P /usr/share/wordlists/rockyou-mini.txt ssh://${TARGET.ip}`, "err")]);
      const host = svc.replace(/^\w+:\/\//, "").split("/")[0];
      if (!inScope(host)) return done(outOfScope(host));
      if (!/-l\s+admin|-l admin/.test(flags) && !/admin/.test(flags)) {
        out.push(L("[DATA] trying logins… no valid pair found for that user.", "warn"));
        out.push(L("Hint: the notes mention an 'admin' account. Try: -l admin", "dim"));
        return done(out);
      }
      out.push(L("Hydra v9.5 (SIMULATED) starting", "dim"));
      out.push(L(`[DATA] attacking ${svc}`));
      let found = false;
      for (const w of MINI_WORDLIST) {
        if (w === TARGET.creds.pass) { out.push(L(`[22][ssh] host: ${host}   login: admin   password: ${w}`, "ok")); found = true; break; }
        out.push(L(`[ATTEMPT] admin:${w} — failed`, "dim"));
      }
      if (found) { out.push(L("1 of 1 target successfully completed, 1 valid password found", "ok")); out.push(L("Weak, guessable password 'password123' accepted on SSH.", "warn")); hits.push("weakness"); }
      else out.push(L("0 valid passwords found (try a bigger wordlist).", "warn"));
      return done(out);
    }

    case "john": {
      const wl = tokens.find((x) => /wordlist=/.test(x));
      out.push(L("John the Ripper (SIMULATED)", "dim"));
      out.push(L("Loaded 1 password hash (raw-MD5)"));
      if (wl && !/rockyou|mini/.test(wl)) { out.push(L("No password cracked with that wordlist.", "warn")); return done(out); }
      out.push(L(`password123      (admin)`, "ok"));
      out.push(L("1 password hash cracked. The hash was a plain MD5 of a dictionary word.", "warn"));
      hits.push("weakness");
      return done(out);
    }

    case "hashcat": {
      out.push(L("hashcat (SIMULATED) — mode 0 (MD5)", "dim"));
      out.push(L(`${TARGET.md5}:password123`, "ok"));
      out.push(L("Status: Cracked. Unsalted MD5 of a wordlist word falls in milliseconds.", "warn"));
      hits.push("weakness");
      return done(out);
    }

    case "searchsploit": {
      const q = tokens.slice(1).join(" ").toLowerCase();
      if (!q) return done([L("searchsploit: a search term is required, e.g. searchsploit openssh 7.4", "err")]);
      out.push(L("--------------------------------------------- ---------------------------------", "dim"));
      out.push(L(" Exploit Title                                | Path", "info"));
      out.push(L("--------------------------------------------- ---------------------------------", "dim"));
      if (/ssh|openssh/.test(q)) out.push(L(" OpenSSH 7.4 - Username Enumeration           | linux/remote/45233.py"));
      else if (/apache/.test(q)) out.push(L(" Apache httpd 2.4.x - (several, version-dep)   | multiple/webapps/*"));
      else if (/mysql/.test(q)) out.push(L(" MySQL 5.7 - (auth / priv-esc, version-dep)    | linux/remote/*"));
      else out.push(L(" No results — try a product name and version.", "warn"));
      out.push(L("(Exploit-DB mirror, SIMULATED)", "dim"));
      return done(out);
    }

    case "nc":
    case "netcat": {
      const host = tokens.find((x) => inScope(x));
      const port = parseInt(tokens.find((x) => /^\d+$/.test(x)) || "", 10);
      if (!host) return done([L(`nc: a host is required, e.g. nc ${TARGET.ip} 22`, "err")]);
      if (!inScope(host)) return done(outOfScope(host));
      const p = PORTS.find((x) => x.port === port);
      if (!p) { out.push(L(`(UNKNOWN) [${TARGET.ip}] ${port || "?"} (?) : Connection refused`, "err")); return done(out); }
      if (p.port === 22) out.push(L("SSH-2.0-OpenSSH_7.4", "ok"));
      else if (p.service.startsWith("http")) { out.push(L("HTTP/1.1 400 Bad Request")); out.push(L("Server: Apache/2.4.29 (Ubuntu)")); }
      else if (p.port === 3306) out.push(L("5.7.33-0ubuntu0.16.04.1 (MySQL banner)", "ok"));
      out.push(L(`[banner from ${host}:${port}]`, "dim"));
      hits.push("scan");
      return done(out);
    }

    case "exit":
      return done([L("There is no escape from the lab :) type `help` to keep going.", "dim")]);

    default:
      return done([L(`${cmd}: command not found`, "err"), L("Type `help` to see the commands this lab supports.", "dim")]);
  }
}

/** The guided missions, in order. `hit` is the mission id a command reports; `cmds` are the commands that count. */
export const MISSIONS = [
  { id: "recon", cmds: ["whois", "dig", "nslookup", "host", "ping"] },
  { id: "scan", cmds: ["nmap", "nc", "netcat"] },
  { id: "enum", cmds: ["whatweb", "curl", "gobuster", "dirb", "nikto"] },
  { id: "weakness", cmds: ["sqlmap", "hydra", "john", "hashcat"] },
  { id: "fix", cmds: [] },
] as const;

export type MissionId = (typeof MISSIONS)[number]["id"];

/** Tab completion: commands when at the start, otherwise file paths for file-taking commands. */
export function complete(input: string, cwd = "/root"): string[] {
  const tokens = input.split(/\s+/);
  if (tokens.length <= 1) return COMMANDS.filter((c) => c.startsWith(tokens[0] || ""));
  // Path completion for the last token.
  const last = tokens[tokens.length - 1];
  const slash = last.lastIndexOf("/");
  const dirPart = slash >= 0 ? last.slice(0, slash + 1) : "";
  const stem = slash >= 0 ? last.slice(slash + 1) : last;
  const dirPath = resolvePath(cwd, dirPart || ".");
  const node = FS[dirPath];
  if (!node?.dir) return [];
  return node.dir.filter((n) => n.startsWith(stem)).map((n) => dirPart + n);
}

/**
 * How fast a command's output should stream in the UI. Slow, noisy tools pause, then pace slowly; trivial commands
 * print at once (initial 0 + line 0 means "instant"). `jitter` is the random spread added on top of each line delay.
 * Pure and exported so the console component and its tests share one source of truth.
 */
export const SLOW_TOOLS = new Set(["nmap", "gobuster", "dirb", "hydra", "sqlmap", "nikto", "john", "hashcat"]);
export const INSTANT_CMDS = new Set(["pwd", "whoami", "id", "uname", "echo", "ls", "cat", "history", "help", "man"]);
export interface Pacing { initial: number; line: number; jitter: number }
export function pacing(cmd: string): Pacing {
  if (SLOW_TOOLS.has(cmd)) return { initial: 500, line: 80, jitter: 60 }; // a short pause, then 80-140 ms per line
  if (INSTANT_CMDS.has(cmd)) return { initial: 0, line: 0, jitter: 0 };    // near-instant: print it all at once
  return { initial: 120, line: 20, jitter: 40 };                           // everything else: ~20-60 ms per line
}
