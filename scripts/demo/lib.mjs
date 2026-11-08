// Shared helpers for the demo seeders: deterministic RNG, dates, id + hashing helpers, name pools.
import { randomBytes, scryptSync } from "node:crypto";

// Deterministic PRNG (mulberry32) so every run produces the same demo data set.
export function makeRng(seed = 20260920) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = makeRng();
export const rint = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const chance = (p) => rng() < p;
export function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAY = 86400000;
export const NOW = Date.now();
/** A Date `days` ago (fractional ok), at a plausible working hour. */
export function ago(days, hour = null) {
  const d = new Date(NOW - days * DAY);
  d.setHours(hour ?? rint(8, 20), rint(0, 59), rint(0, 59), 0);
  return d;
}
export const fromNow = (days, hour = null) => ago(-days, hour);
export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
export const dayAgo = (n) => isoDay(NOW - n * DAY);
export const dayAhead = (n) => isoDay(NOW + n * DAY);

export const audit = (createdAt = ago(rint(30, 200)), by = null) => ({ createdAt, updatedAt: createdAt, createdBy: by, updatedBy: by, deletedAt: null });

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir", "Ananya", "Diya", "Saanvi", "Aadhya", "Kavya", "Myra", "Anika", "Riya", "Priya", "Neha", "Rahul", "Amit", "Vikram", "Karan", "Nikhil", "Pooja", "Sneha", "Meera", "Shreya", "Anjali", "Divya", "Nisha", "Tanvi", "Harsh", "Mohit", "Simran", "Aman", "Ritika", "Varun", "Isha", "Devansh", "Tara", "Zoya", "Farhan", "Imran", "Lakshmi", "Gautam", "Bhavna", "Sahil"];
const LAST = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Rao", "Nair", "Iyer", "Mehta", "Shah", "Joshi", "Chopra", "Malhotra", "Kapoor", "Bansal", "Agarwal", "Saxena", "Tiwari", "Khan", "Das", "Bose", "Menon", "Pillai", "Desai", "Chauhan", "Yadav", "Mishra", "Pandey"];
let nameCounter = 0;
export function personName() {
  nameCounter++;
  return `${FIRST[(nameCounter * 7 + rint(0, 9)) % FIRST.length]} ${LAST[(nameCounter * 11 + rint(0, 9)) % LAST.length]}`;
}
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
export const phone = () => `+91 ${rint(70000, 99999)}${rint(10000, 99999)}`;

export const COLLEGES = ["IIT Delhi", "NIT Trichy", "BITS Pilani", "VIT Vellore", "SRM University", "Amity University", "Manipal Institute", "DTU Delhi", "IIIT Hyderabad", "Anna University", "Jadavpur University", "Pune Institute of Computer Technology", "KIIT Bhubaneswar", "Christ University"];
export const BRANCHES = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Data Science", "AI & ML", "Electrical"];
export const COMPANIES = ["Acme Labs", "Quantum Retail", "Nimbus Cloud", "Zenith Health", "Orbital Logistics", "Bluepeak Finance", "Nova EdTech", "Helio Energy", "Pixel Studio", "Vertex Motors", "Lumen Analytics", "Cedar Foods", "Atlas Realty", "Kite Travel", "Fable Media", "Ridge Insurance", "Sable Fashion", "Ember Games", "Tidal Marine", "Aurora Pharma", "Monsoon Coffee", "Zephyr Airlines", "Crest Legal", "Pinecone Toys"];
export const INDUSTRIES = ["FinTech", "HealthTech", "E-Commerce", "SaaS", "Logistics", "EdTech", "Retail", "Manufacturing", "Media", "Travel"];
export const CITIES = ["Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Pune", "Chennai", "Ahmedabad", "Kolkata", "Jaipur", "Kochi"];

export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export async function insertAll(col, docs) {
  if (!docs.length) return 0;
  for (const part of chunk(docs, 1000)) await col.insertMany(part, { ordered: false });
  return docs.length;
}
