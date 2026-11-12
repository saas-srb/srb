import { MongoClient } from "mongodb";
import { deriveKek, healFromPassphrase, rewrapDoc, type KeyringDoc, type PassphraseWrap } from "../src/lib/platform/keyring/core";

/**
 * `npm run key:rewrap`: after the MongoDB credentials (MONGODB_URI) were rotated, the keyring in the database can no longer be opened.
 * Run with OLD_MONGODB_URI (the URI the keyring was last wrapped with) and MONGODB_URI (the new one) set, and SAAS_HOSTS (and
 * OLD_SAAS_HOSTS if that changed). It re-wraps every key version and changes nothing else. Add --dry to only check.
 */
const oldUri = process.env.OLD_MONGODB_URI;
const newUri = process.env.MONGODB_URI;
const passphrase = process.env.KEY_PASSPHRASE;
if (!newUri || (!oldUri && !passphrase)) {
  console.error("Set MONGODB_URI (and SAAS_HOSTS) plus either OLD_MONGODB_URI, or KEY_PASSPHRASE (the recovery passphrase saved in Console, Health).");
  process.exit(2);
}
(async () => {
  const client = await new MongoClient(newUri).connect();
  const col = client.db().collection<KeyringDoc>("platform_settings");
  const doc = await col.findOne({ _id: "keyring" });
  if (!doc) {
    console.error("There is no keyring in this database.");
    process.exit(1);
  }
  let re: KeyringDoc | null = null;
  if (oldUri) re = rewrapDoc(doc, deriveKek(oldUri, process.env.OLD_SAAS_HOSTS ?? process.env.SAAS_HOSTS), deriveKek(newUri, process.env.SAAS_HOSTS));
  if (!re && passphrase) {
    // The old URI is gone: heal from the extra copy sealed with the recovery passphrase.
    const meta = await client.db().collection<{ _id: string; passphrase?: PassphraseWrap }>("platform_settings").findOne({ _id: "keyring_meta" });
    if (meta?.passphrase) re = healFromPassphrase(meta.passphrase, passphrase, deriveKek(newUri, process.env.SAAS_HOSTS));
  }
  if (!re) {
    console.error("The OLD_MONGODB_URI / OLD_SAAS_HOSTS do not open the keyring. Nothing was changed.");
    process.exit(1);
  }
  if (process.argv.includes("--dry")) console.log(`OK: ${re.keys.length} key version(s) can be re-wrapped. (dry run, nothing written)`);
  else {
    const res = await col.replaceOne({ _id: "keyring", updatedAt: doc.updatedAt }, re);
    console.log(res.matchedCount ? `Re-wrapped ${re.keys.length} key version(s).` : "The keyring changed while running; run it again.");
  }
  await client.close();
})();
