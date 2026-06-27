/* ==========================================================================
   analyzer-engine.js
   --------------------------------------------------------------------------
   Client-side rule-based risk scoring engine for the static version of
   DeepShield. This is a faithful JavaScript port of the original Python
   analyzer.py engine -- same rules, same weights, same reasons -- so the
   site can run entirely in the browser with no backend server required.
   ========================================================================== */

const URL_SHORTENERS = [
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
  "cutt.ly", "rebrand.ly", "shorte.st", "adf.ly", "lnkd.in", "rb.gy",
  "shorturl.at", "tiny.cc", "soo.gd", "bl.ink", "v.gd",
];

const SUSPICIOUS_TLDS = [
  ".xyz", ".top", ".club", ".work", ".click", ".loan", ".men", ".gq",
  ".tk", ".ml", ".cf", ".info", ".biz", ".pw", ".live", ".rest", ".icu",
  ".cam", ".cyou", ".buzz", ".support",
];

const SUSPICIOUS_URL_KEYWORDS = [
  "login", "verify", "secure", "account", "update", "confirm",
  "billing", "suspended", "unlock", "signin", "password", "validate",
  "security-alert", "reactivate", "limited", "webscr",
];

const DANGEROUS_EXTENSIONS = [".exe", ".apk", ".scr", ".bat", ".msi", ".jar", ".vbs", ".cmd"];

// brand keyword -> list of domains that are the REAL, legitimate home of that brand
const BRAND_DOMAINS = {
  paypal: ["paypal.com"],
  amazon: ["amazon.com", "amazon.in", "amazon.co.uk"],
  google: ["google.com", "accounts.google.com"],
  microsoft: ["microsoft.com", "live.com", "outlook.com", "office.com"],
  apple: ["apple.com", "icloud.com"],
  netflix: ["netflix.com"],
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  whatsapp: ["whatsapp.com"],
  flipkart: ["flipkart.com"],
  sbi: ["sbi.co.in", "onlinesbi.sbi"],
  icici: ["icicibank.com"],
  hdfc: ["hdfcbank.com"],
  irs: ["irs.gov"],
  indiapost: ["indiapost.gov.in"],
  linkedin: ["linkedin.com"],
  dhl: ["dhl.com"],
  fedex: ["fedex.com"],
};

const URGENCY_PHRASES = [
  "act now", "act immediately", "urgent action", "within 24 hours",
  "final notice", "act fast", "immediate action required",
  "your account will be suspended", "expires today", "limited time",
  "verify within", "failure to respond",
];

const SENSITIVE_INFO_KEYWORDS = [
  "otp", "one time password", "cvv", "pin number", "card number",
  "social security", "ssn", "bank details", "login credentials",
  "username and password", "aadhar", "aadhaar", "passport number",
];

const PRIZE_KEYWORDS = [
  "you have won", "you've won", "congratulations you", "claim your prize",
  "lucky winner", "lottery", "free gift", "cash reward", "selected winner",
  "you are a winner",
];

const PAYMENT_RED_FLAGS = [
  "gift card", "google play card", "itunes card", "bitcoin", "crypto wallet",
  "western union", "wire transfer", "moneygram", "send payment via",
];

const THREAT_KEYWORDS = [
  "legal action", "account suspended", "you will be arrested", "penalty",
  "account has been locked", "police complaint", "court notice",
  "outstanding warrant", "tax fraud detected",
];

const GENERIC_GREETINGS = ["dear customer", "dear user", "dear valued customer", "dear account holder"];

const EMBEDDED_URL_REGEX = /(https?:\/\/[^\s,]+|www\.[^\s,]+)/gi;

function dsClamp(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function dsNormalizeUrl(url) {
  url = url.trim();
  if (!/^[a-zA-Z]+:\/\//.test(url)) {
    url = "http://" + url;
  }
  return url;
}

function dsSafeParseUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* URL analysis                                                             */
/* ------------------------------------------------------------------------ */

function analyzeUrl(rawUrl) {
  const reasons = [];
  let score = 0;

  if (!rawUrl || !rawUrl.trim()) {
    return { score: 0, reasons: ["No link was provided."] };
  }

  const normalized = dsNormalizeUrl(rawUrl.trim());
  const parsed = dsSafeParseUrl(normalized);

  if (!parsed) {
    return {
      score: 30,
      reasons: ["The link could not be parsed as a valid web address — treat with caution."],
    };
  }

  const host = parsed.hostname.toLowerCase();
  const fullLower = normalized.toLowerCase();

  // 1. No HTTPS
  if (parsed.protocol === "http:") {
    score += 10;
    reasons.push("Connection is not encrypted (uses HTTP instead of HTTPS).");
  }

  // 2. Raw IP address as host
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    score += 25;
    reasons.push("Uses a raw numeric IP address instead of a real domain name.");
  }

  // 3. '@' symbol hides true destination (credentials-style trick)
  if (normalized.includes("@") && normalized.indexOf("@") < normalized.indexOf(host)) {
    score += 20;
    reasons.push("Contains an '@' symbol, a common trick to hide the real destination.");
  }

  // 4. Known URL shortener
  if (URL_SHORTENERS.some((s) => host === s || host.endsWith("." + s))) {
    score += 15;
    reasons.push("Uses a link-shortening service, which can hide the true destination.");
  }

  // 5. Suspicious TLD
  if (SUSPICIOUS_TLDS.some((tld) => host.endsWith(tld))) {
    score += 15;
    const tldFound = "." + host.split(".").pop();
    reasons.push(`Uses a top-level domain (${tldFound}) frequently abused for scam sites.`);
  }

  // 6. Excessive subdomains
  if (host.split(".").length - 1 >= 4) {
    score += 10;
    reasons.push("Domain has an unusually high number of subdomains, often used to disguise the real site.");
  }

  // 7. Multiple hyphens (brand-mimicking pattern, e.g. paypal-secure-login.com)
  if (host.split("-").length - 1 >= 2) {
    score += 8;
    reasons.push("Domain contains multiple hyphens, a pattern often used to imitate legitimate brand names.");
  }

  // 8. Very long domain
  if (host.length > 40) {
    score += 8;
    reasons.push("Domain name is unusually long, which can be used to bury suspicious words.");
  }

  // 9. Suspicious keywords anywhere in the URL
  const matchedKeywords = SUSPICIOUS_URL_KEYWORDS.filter((k) => fullLower.includes(k));
  if (matchedKeywords.length) {
    score += 12;
    reasons.push(
      `Contains sensitive-action keywords (${matchedKeywords.slice(0, 3).sort().join(", ")}) typically used in phishing links.`
    );
  }

  // 10. Brand impersonation
  for (const [brand, domains] of Object.entries(BRAND_DOMAINS)) {
    if (fullLower.includes(brand) && !domains.some((d) => host === d || host.endsWith("." + d))) {
      score += 30;
      const brandTitle = brand.charAt(0).toUpperCase() + brand.slice(1);
      reasons.push(
        `Mentions the brand '${brandTitle}' but is not hosted on ${brand}'s official domain — a classic brand-impersonation tactic.`
      );
      break;
    }
  }

  // 11. Punycode / homoglyph domains
  if (host.includes("xn--")) {
    score += 20;
    reasons.push("Uses internationalized (punycode) domain encoding, often used to spoof look-alike characters.");
  }

  // 12. Direct link to an executable/compressed file
  const pathLower = parsed.pathname.toLowerCase();
  if (DANGEROUS_EXTENSIONS.some((ext) => pathLower.endsWith(ext))) {
    score += 20;
    reasons.push("Link points directly to an executable or installer file.");
  }

  // 13. Unusual port number
  if (parsed.port && !["80", "443", ""].includes(parsed.port)) {
    score += 10;
    reasons.push(`Connects over a non-standard port (${parsed.port}), unusual for a normal website.`);
  }

  // 14. Heavily encoded query string
  if ((parsed.search.match(/%/g) || []).length > 5) {
    score += 6;
    reasons.push("Web address contains heavy character-encoding, sometimes used to obscure parameters.");
  }

  // 15. Excessive overall length
  if (normalized.length > 100) {
    score += 5;
    reasons.push("Overall link is unusually long, which can be used to hide its real target.");
  }

  if (!reasons.length) {
    reasons.push("No common phishing or scam patterns were detected in this link.");
  }

  return { score: dsClamp(score), reasons };
}

/* ------------------------------------------------------------------------ */
/* Text / Email / SMS analysis                                             */
/* ------------------------------------------------------------------------ */

function analyzeText(rawText) {
  const reasons = [];
  let score = 0;

  if (!rawText || !rawText.trim()) {
    return { score: 0, reasons: ["No message text was provided."] };
  }

  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (URGENCY_PHRASES.some((p) => lower.includes(p))) {
    score += 15;
    reasons.push("Uses urgency or time-pressure language designed to rush you into acting.");
  }
  if (SENSITIVE_INFO_KEYWORDS.some((k) => lower.includes(k))) {
    score += 25;
    reasons.push("Directly asks for sensitive personal or financial information (e.g. OTP, PIN, card details).");
  }
  if (PRIZE_KEYWORDS.some((p) => lower.includes(p))) {
    score += 20;
    reasons.push("Offers a prize, lottery win, or reward that is unsolicited — a common scam hook.");
  }
  if (PAYMENT_RED_FLAGS.some((p) => lower.includes(p))) {
    score += 20;
    reasons.push("Requests payment through an untraceable method (gift cards, crypto, or wire transfer).");
  }
  if (THREAT_KEYWORDS.some((p) => lower.includes(p))) {
    score += 15;
    reasons.push("Uses threatening language (legal action, arrest, account suspension) to pressure a response.");
  }
  if (GENERIC_GREETINGS.some((g) => lower.includes(g))) {
    score += 8;
    reasons.push("Uses a generic greeting instead of your actual name, typical of mass-sent scam messages.");
  }

  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 3) {
    score += 6;
    reasons.push("Excessive use of exclamation marks, a common trait of scam messaging.");
  }

  const capsWords = text.match(/\b[A-Z]{4,}\b/g) || [];
  if (capsWords.length >= 2) {
    score += 6;
    reasons.push("Contains multiple ALL-CAPS words used to create alarm.");
  }

  // Any embedded link gets analyzed too, contributing half its own score
  const embeddedLinks = text.match(EMBEDDED_URL_REGEX) || [];
  if (embeddedLinks.length) {
    const linkScores = [];
    embeddedLinks.slice(0, 3).forEach((link) => {
      const sub = analyzeUrl(link);
      linkScores.push(sub.score);
      if (sub.score >= 30) {
        reasons.push(`Contains an embedded link with its own red flags: ${link}`);
      }
    });
    if (linkScores.length) {
      score += Math.max(...linkScores) * 0.5;
    }
  }

  if (!reasons.length) {
    reasons.push("No common scam or phishing language patterns were detected in this message.");
  }

  return { score: dsClamp(score), reasons };
}

/* ------------------------------------------------------------------------ */
/* QR analysis -- the decoded text is run through the URL or text engine    */
/* ------------------------------------------------------------------------ */

function analyzeQr(decodedData) {
  if (!decodedData || !decodedData.trim()) {
    return { score: 0, reasons: ["No QR code could be detected in the uploaded image."], decoded: "" };
  }

  const data = decodedData.trim();
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(data);

  const result = looksLikeUrl ? analyzeUrl(data) : analyzeText(data);
  const reasons = [...result.reasons];
  let score = result.score;

  reasons.push("QR codes hide their destination until scanned — always confirm the source of a QR code before using it.");
  score += 5;

  return { score: dsClamp(score), reasons, decoded: data };
}

/* ------------------------------------------------------------------------ */
/* Risk level + advice                                                      */
/* ------------------------------------------------------------------------ */

function getRiskLevel(score) {
  if (score >= 75) return { label: "Critical Risk", key: "critical" };
  if (score >= 50) return { label: "High Risk", key: "high" };
  if (score >= 25) return { label: "Moderate Risk", key: "moderate" };
  return { label: "Low Risk", key: "low" };
}

function getAdvice(levelKey, scanType) {
  const advice = [];

  if (levelKey === "low") {
    advice.push("No major red flags were detected, but always stay cautious online.");
    advice.push("Verify the sender or source independently before sharing any personal information.");
  } else if (levelKey === "moderate") {
    advice.push("Treat this with caution — do not click links or download anything until you verify the source.");
    advice.push("Contact the organization directly using contact details from their official website, not from this message.");
    advice.push("Do not enter login details or OTPs based on this alone.");
  } else if (levelKey === "high") {
    advice.push("Do not click any links, reply, or share any personal or financial information.");
    advice.push("Block the sender and report the message as spam/phishing on your email or messaging platform.");
    advice.push("If you already shared any details, change those passwords immediately and enable two-factor authentication.");
  } else {
    advice.push("Do NOT click, reply, download, or enter any information — this shows strong signs of a scam.");
    advice.push("If you already provided personal or financial information, contact your bank immediately and freeze/monitor your accounts.");
    advice.push("Report this to your local cybercrime authority (e.g. cybercrime.gov.in in India, or IC3.gov in the US).");
    advice.push("Block and delete the sender/source after reporting.");
  }

  if (scanType === "qr") {
    advice.push("Only scan QR codes from sources you can independently verify — avoid QR codes on unsolicited flyers, stickers, or messages.");
  }

  return advice;
}

/* ------------------------------------------------------------------------ */
/* Orchestrator used directly by analyzer-page.js                           */
/* ------------------------------------------------------------------------ */

function runAnalysis(scanType, content) {
  let result;
  let displayInput;

  if (scanType === "url") {
    result = analyzeUrl(content);
    displayInput = content;
  } else if (scanType === "text") {
    result = analyzeText(content);
    displayInput = content;
  } else if (scanType === "qr") {
    result = analyzeQr(content);
    displayInput = result.decoded || content;
  } else {
    throw new Error("Unknown scan_type: " + scanType);
  }

  const score = result.score;
  const { label, key } = getRiskLevel(score);
  const advice = getAdvice(key, scanType);

  return {
    scan_type: scanType,
    input: displayInput,
    risk_score: score,
    risk_level: label,
    risk_level_key: key,
    reasons: result.reasons,
    advice,
  };
}
