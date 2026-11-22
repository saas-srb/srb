# Hosting cost comparison: Vercel vs GoDaddy vs AWS

SelfRun Business ko market-ready production par chalane ka **poora kharcha**, teen options mein: **Vercel**, **GoDaddy**, **AWS**.
Related guides: [deploy-vercel.md](deploy-vercel.md), [deploy-aws.md](deploy-aws.md), [migrate-vercel-account.md](migrate-vercel-account.md).

> [!IMPORTANT]
> - Prices **2026-11-21** ko web se check kiye gaye. Provider kabhi bhi badal sakte hain. **Kharidne se pehle har provider ka official pricing page dekho** (links neeche Sources mein).
> - Exchange rate maana gaya: **1 USD = ₹88** (apna rate lagakar dobara nikalo).
> - Sab figures **GST ke bina** hain. Indian vendors (GoDaddy India, AWS India) **18% GST** alag lagate hain. GST-registered ho to input credit mil sakta hai.
> - Jo figure mujhe official source se confirm nahi hua, usko **(unverified)** likha hai.
> - Ye **andaaze (estimates)** hain, quote nahi. Asli bill traffic, data size aur AI usage par depend karta hai.

---

## 1. Pehle ye samjho: aapko kya chahiye

Aapke product ki zaruratein ([vercel.json](../vercel.json), [deploy-aws.md](deploy-aws.md) se):

| Zarurat | Detail |
| --- | --- |
| Web app | Next.js (Node server) |
| Wildcard subdomain | `*.selfrunbusiness.com`, har company ka apna address |
| Customer ka apna domain | jaise `www.yashorbit.com`, HTTPS ke saath |
| Database | MongoDB (abhi Atlas par) |
| File storage | Resumes, documents (abhi Vercel Blob) |
| Scheduled jobs | 17 daily cron jobs |
| Email | Verification, notifications |
| Backup | Daily, off-server copy ke saath |
| Payments | Razorpay |
| Region | India (customers Indian hain) |

Har option mein ye saare pieces kahin se aane padte hain. Isliye **sirf hosting ka rate mat dekho, total dekho**.

---

## 2. Option 1: Vercel (+ MongoDB Atlas + Vercel Blob)

### 2.1 Kya-kya bill hota hai

| Item | Price (USD) | Note |
| --- | --- | --- |
| **Pro platform fee** | **$20/month** | 1 deploying seat aur **$20 ka usage credit** shamil. |
| Extra seats (Owner/Member) | $20/month har ek | Docs ke hisaab se. Ek purana docs page "har user $20, pehla bhi" kehta hai; ye purana lagta hai. Apne account mein check karo. |
| Viewer seats | Free (third-party source, unverified) | |
| Routed requests | 50K/month included, uske baad **$2 per 1M** | |
| Active CPU | ~$0.128/hour (unverified, third-party) | |
| Bandwidth | 1 TB/month included, uske baad **~$0.15/GB** (unverified, third-party) | |
| **MongoDB Atlas Flex** | **$8–30/month** (cap $30) | 5 GB storage, 100 ops/sec tak. Chhote launch ke liye. |
| **MongoDB Atlas M10** | **~$57/month** ($0.08/hr) | Dedicated, 2 GB RAM. Official page "$56.94 se shuru" kehta hai. |
| **MongoDB Atlas M20** | **~$146/month** ($0.20/hr, mera hisaab) | 4 GB RAM, 2 vCPU. |
| Vercel Blob | Usage ke hisaab se, chhote data par kuch dollars | Resumes jaisi files ke liye. |
| Email (Resend/SES) | Free tier se shuru, phir cents per 1000 | |

### 2.2 Zaroori sach

- **Hobby plan commercial use ke liye allowed nahi hai.** Aap abhi Hobby par ho. Market-ready ke liye **Pro lena hi padega**.
- Hobby par aapko 12-function limit aur cron limit pehle hi mili thi. Pro mein ye khul jata hai.
- Bill **traffic ke saath badhta hai**, fixed nahi hai. Ek viral din ya bot traffic bill badha sakta hai. Vercel ka **Spend Management** (limit lagana) zaroor on rakho.
- Server, patch, SSL, scaling: **sab Vercel sambhalta hai**. Domain sync ka code aapke paas already chal raha hai.
- Function ka region Mumbai (`bom1`) set karo, warna latency badhegi (Pro mein available hai, apne plan mein confirm karo).

### 2.3 Mahine ka andaaza

| Stage | Kya maana | USD/month | INR/month |
| --- | --- | --- | --- |
| **Launch** (1 se 10 companies) | 1 seat, Atlas Flex, thoda usage | **~$30–60** | **~₹2,600–5,300** |
| **Growth** (10 se 100 companies) | 3 seats ($60), Atlas M10 ($57), usage overage $20–60, Blob $5–15 | **~$150–200** | **~₹13,000–17,600** |
| **Scale** (100+ companies) | 5 seats ($100), Atlas M20 ($146), overage $100–300 | **~$350–600+** | **~₹30,800–52,800+** |

---

## 3. Option 2: GoDaddy

GoDaddy ke 3 alag roles hain. Alag-alag samjho.

### 3.1 GoDaddy shared hosting / cPanel

**Mat lo.** Ye PHP/WordPress ke liye bana hai. Aapka app Node server, cron, wildcard domain aur Docker/Caddy maangta hai. Ye yahan chalega nahi.

### 3.2 GoDaddy VPS

| Item | Price | Note |
| --- | --- | --- |
| Entry VPS (2 GB RAM, 40 GB) | **~₹649/month** | **Multi-year term ka effective rate, poora upfront.** Source: Aug 2026 comparison. |
| 4 core, 16 GB, 200 GB | ~₹3,299/month | Wahi source, wahi upfront shart. |
| Purane plan figures | ₹1,279 / ₹1,879 / ₹2,349 / ₹3,019 per month | Purani press khabar, aaj ke nahi ho sakte. |
| Managed VPS (India listing) | **$98.99/month** (1 vCPU, 2 GB) se **$154.99/month** (8 vCPU, 16 GB) tak | USD list price. |

Dhyan do:
- **Sasta headline rate upfront multi-year payment par milta hai.** Mahine-mahine lene par rate zyada hota hai. Renewal par bhi price badhta hai.
- Multi-year plan mein paisa kai saal ke liye ek saath fas jata hai. Beech mein AWS ya Vercel par jaana ho to wo refund nahi hota.
- VPS par **aapko hi server sambhalna hai** (jaise AWS par), par snapshots, S3 backup, SES jaisi sahulatein nahi milti.

### 3.3 GoDaddy domain aur DNS

| Item | Note |
| --- | --- |
| Domain registration / renewal | `.com` ka pehla saal sasta, **renewal mehenga** hota hai. Apne domains ka renewal rate checkout par dekho. |
| **DNS API** | **Chhote accounts ke liye restricted hai** (unverified, apne account mein check karo). Wildcard HTTPS automatic lene ke liye DNS API chahiye. Isliye DNS **Route 53 ya Cloudflare** par rakho, GoDaddy par nahi. |
| Wildcard SSL | GoDaddy paid bechta hai. Let's Encrypt (Caddy ke saath) **free** hai. |

### 3.4 GoDaddy ka asli hisaab

GoDaddy VPS par bhi **wahi code badlav** karne padenge jo AWS guide mein hain (Blob ko disk par laana, cron ko app ke andar chalana, Caddy lagana). Yani mehnat AWS jitni hai, par ye sab milta hai:

| Kya chahiye | GoDaddy VPS par |
| --- | --- |
| MongoDB | Khud install karo ya Atlas lo (Atlas $8–57/month alag) |
| Backup | Khud banao. Off-server copy ke liye alag storage |
| Email | Alag service |
| Snapshots / monitoring | Basic |

### 3.5 Mahine ka andaaza

| Stage | Kya maana | INR/month |
| --- | --- | --- |
| **Launch** | Entry VPS (multi-year effective) + Atlas Flex ($8–30) ya Mongo khud | **~₹1,400–3,300** (upfront multi-year paid) |
| **Growth** | 4 GB+ VPS ~₹1,500–2,500 + Atlas M10 ya self Mongo | **~₹3,000–7,500** |
| **Scale** | 16 GB VPS ~₹3,300 + managed DB | **~₹7,000–15,000** |

Ye figures **kam bharosemand** hain (plan ki specs aur renewal rate confirm nahi). Seedha GoDaddy India ka page dekho.

**Nateeja:** GoDaddy VPS kagaz par sasta lagta hai, par AWS se behtar kuch nahi deta aur multi-year lock-in aata hai. **Sirf domain registrar ke roop mein rakho (ya Cloudflare/Route 53 par move karo).**

---

## 4. Option 3: AWS (ek EC2 server, Docker)

Design [deploy-aws.md](deploy-aws.md) mein hai: **ek EC2 par Caddy + app + MongoDB + backup job**.

### 4.1 Kya-kya bill hota hai (Mumbai, `ap-south-1`)

| Item | Price | Note |
| --- | --- | --- |
| EC2 `t3.small` (2 GB RAM) | **$0.0224/hr, ~$16.35/month** | Bahut chhota. Next.js + Mongo ke liye tight hai. |
| EC2 `t3.medium` (4 GB RAM) | **$0.0448/hr, ~$32.70/month** | **Shuru ke liye ye lo** (guide bhi yahi kehta hai). |
| 1-year Savings Plan | `t3.small` par ~$0.0162/hr (~28% sasta) | `t3.medium` ka rate nahi mila. Rate chunne se pehle commit mat karo. |
| Spot instance | ~$0.007–0.02/hr | **Production DB ke liye mat lo** (kabhi bhi band ho sakta hai). |
| Disk (EBS gp3) 60 GB | ~$5–6/month (andaaza, unverified) | Files badhne par badhta hai. |
| Daily snapshots (7 rakhe) | ~$2–3/month | |
| Public IPv4 / Elastic IP | ~$3.65/month (andaaza, $0.005/hr) | AWS ab IPv4 ka paisa leta hai. |
| Route 53 | ~$0.50/month + queries | Wildcard certificate ke liye. |
| S3 backups | ~$1/month | Sirf DB dumps. |
| SES email | ~$0.10 per 1000 emails | |
| Data transfer out | Pehle 100 GB/month free, uske baad ~$0.11/GB (andaaza) | |
| MongoDB | **Free** (container mein, isi server par) | Atlas ka kharcha nahi. |
| Blob / file storage | **Free** (server ki disk par) | |
| Cron | **Free** (app ke andar scheduler) | |
| HTTPS (customer domains) | **Free** (Caddy + Let's Encrypt) | |

### 4.2 Zaroori sach

- **Aap sysadmin ho.** Security patch, firewall, SSH keys, monitoring, restore test: sab aapki zimmedari.
- **Ek hi server = single point of failure.** Server mara to site band. Daily snapshot + S3 backup **zaroori** hain, aur ek baar **restore karke test** karo.
- Traffic badhe to server upgrade karna padta hai (chhoti downtime ke saath), ya DB alag server par le jao.
- Migration mein **~2 din** lagte hain ([deploy-aws.md](deploy-aws.md) ke hisaab se).
- AWS India account **AISPL** se bill hota hai, **18% GST** ke saath.
- **Billing alarm** zaroor lagao (budget alert), warna galti se mehenga resource chalta rahega.

### 4.3 Mahine ka andaaza

| Stage | Kya maana | USD/month | INR/month |
| --- | --- | --- | --- |
| **Launch** | `t3.medium` $32.70 + disk, snapshot, IP, Route 53, S3 (~$13) | **~$45** | **~₹4,000** |
| **Launch (sabse sasta)** | `t3.small` + chhota disk (risky, RAM kam) | ~$29 | ~₹2,550 |
| **Growth** | `t3.large` (~$65, andaaza), 100 GB disk, snapshots, transfer | **~$85–110** | **~₹7,500–9,700** |
| **Scale** | Alag DB server + replica, bada app server, load balancer ($20+) | **~$250–450** | **~₹22,000–39,600** |

---

## 5. Teeno ek saath

### 5.1 Mahine ka kharcha (infra only, GST ke bina)

| Stage | Vercel + Atlas | GoDaddy VPS | AWS EC2 |
| --- | --- | --- | --- |
| **Launch** | ~₹2,600–5,300 | ~₹1,400–3,300 | ~₹2,550–4,000 |
| **Growth** | ~₹13,000–17,600 | ~₹3,000–7,500 | ~₹7,500–9,700 |
| **Scale** | ~₹30,800–52,800+ | ~₹7,000–15,000 | ~₹22,000–39,600 |

Vercel **launch par sasta** hai (kyunki Atlas Flex sasta hai) par **growth par sabse mehenga** ho jata hai. AWS ka kharcha **sabse predictable** hai.

### 5.2 Jo paisa nahi hai par kharcha hai

| Cheez | Vercel | GoDaddy VPS | AWS |
| --- | --- | --- | --- |
| Server sambhalne ka samay | Lagbhag zero | **Zyada** | **Zyada** |
| Migration ki mehnat | Kam (ab bhi Vercel par ho) | ~2 din + code badlav | ~2 din + code badlav |
| Downtime ka risk | Kam | Medium | Medium (single server) |
| Auto-scaling | Haan | Nahi | Nahi (khud upgrade) |
| Backup | Atlas ka | **Khud banao** | **Khud banao** (guide mein hai) |
| Bill ka darr | Traffic par badhta hai | Fixed | Fixed (transfer ko chhodkar) |
| Lock-in | Medium | **Multi-year upfront** | Kam |
| Support | Pro mein email | Phone/chat (India) | Paid plan alag |

### 5.3 Teeno mein same lagne wale kharche

Ye hosting ke faisle se alag hain par budget mein dalo:

| Kharcha | Andaaza |
| --- | --- |
| **AI aur voice APIs** | **Sabse bada kharcha ho sakta hai.** Per-company usage limit aur billing rakho. |
| Razorpay | ~2% per transaction + GST (customer ke paise se) |
| Email (Resend/SES) | Free tier ya cents per 1000 |
| Domain renewals | `selfrunbusiness.com` + customer domains |
| Push notifications, search, calls | Jo bhi third-party service lagi ho |
| Monitoring | UptimeRobot (free), Sentry free tier |
| Desktop/mobile app build | Apple Developer $99/saal, Google Play $25 ek baar (agar publish karna ho) |
| Legal / CA / compliance | Alag |

---

## 6. Salah

| Aapki halat | Kya lo |
| --- | --- |
| Koi Linux sambhal sakta hai aur kharcha kam chahiye | **AWS `t3.medium`, Mumbai** (~₹4,000/month) |
| Koi server nahi sambhalega, jaldi launch chahiye | **Vercel Pro + Atlas Flex** (~₹2,600–5,300/month) |
| GoDaddy par hosting | **Nahi.** Sirf domain ke liye, aur DNS Route 53/Cloudflare par |

**Practical raasta:**
1. **Abhi Vercel Pro + Atlas Flex** par launch karo (kam risk, sirf Hobby se upgrade).
2. Jab bill **~₹10,000/month** paar kare ya paying companies badhein, tab [deploy-aws.md](deploy-aws.md) ke hisaab se **AWS par move** karo.

### Migration se pehle ek blocker

Production ka `PLATFORM_ENCRYPTION_KEY` Vercel ka **sensitive variable** hai aur wapas padha nahi ja sakta. Ye key nahi mili to 2FA secrets aur saved keys nahi khulengi. **Kisi bhi shift (Vercel account ya AWS) se pehle ye key nikalo.** Detail [migrate-vercel-account.md](migrate-vercel-account.md) mein hai.

---

## 7. Kharidne se pehle checklist

- [ ] Vercel Pro ka seat rule aur included usage apne account mein dekho
- [ ] Atlas Flex ki 100 ops/sec limit apne traffic ke liye kaafi hai ya nahi
- [ ] AWS Pricing Calculator mein Mumbai region ka hisaab banao
- [ ] AWS Budget alarm lagao
- [ ] GoDaddy VPS lena ho to **monthly vs multi-year** aur **renewal rate** dono dekho
- [ ] DNS provider tay karo (Route 53 ya Cloudflare)
- [ ] Backup ka **restore test** ek baar karo
- [ ] AI/voice ka per-company usage limit set karo
- [ ] Encryption key ka backup rakho

---

## Sources

- [Vercel Pro plan docs](https://vercel.com/docs/plans/pro-plan)
- [Vercel pricing](https://vercel.com/pricing)
- [Vercel pricing 2026 (third-party, DEV Community)](https://dev.to/nayankyada/vercel-pricing-2026-what-you-actually-pay-for-a-real-nextjs-project-33md)
- [MongoDB Atlas pricing](https://www.mongodb.com/pricing)
- [MongoDB Atlas Flex costs](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/)
- [EC2 t3.small, ap-south-1 (DoiT)](https://www.doit.com/compute/spot/ap-south-1/t3.small)
- [EC2 t3.medium, ap-south-1 (DoiT)](https://www.doit.com/compute/spot/ap-south-1/t3.medium)
- [EC2 t3.small, ap-south-1 (Holori)](https://calculator.holori.com/aws/ec2/t3.small/ap-south-1)
- [GoDaddy India VPS](https://www.godaddy.com/en-in/hosting/vps-hosting.md)
- [VPS price India 2026 (third-party comparison)](https://zoutons.com/news/vps-hosting-price-hostinger-vs-godaddy-india-2026)
