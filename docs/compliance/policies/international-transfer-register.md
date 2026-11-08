# International transfer register

**Status: template. The owner must fill the region and ground columns from each provider's actual configuration.**

| Provider | Data | Region (to confirm) | Ground (to confirm with counsel) | Safeguards |
| --- | --- | --- | --- | --- |
| MongoDB Atlas | All application data | Cluster region chosen in Atlas | Permitted unless the country is restricted (DPDP Act s. 16) | Encryption in transit and at rest, DPA |
| Vercel | Application traffic | Edge and function region setting | Permitted unless the country is restricted (DPDP Act s. 16) | DPA |
| Resend | Email address, message | Provider region | Permitted unless the country is restricted (DPDP Act s. 16) | DPA |
| Razorpay | Payer details for the payment | India | Contract; no card data on our systems | PCI DSS level 1 provider |
| OpenAI | Prompts and outputs sent by users | Provider region | Permitted unless the country is restricted (DPDP Act s. 16) | DPA, no training on API data per provider terms |
| GitHub | App identity for builds | Provider region | Permitted unless the country is restricted (DPDP Act s. 16) | DPA |

Rule: the Digital Personal Data Protection Act, 2023 (s. 16) permits transfer except to countries the Central Government restricts by notification; any stricter sector law (RBI, SEBI, health) still applies. Check the notified list at each review.
