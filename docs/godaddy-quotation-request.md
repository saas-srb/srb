# GoDaddy requirement message (copy, fill the [brackets], send)

Is message mein sirf **requirement** hai. Plan aur price GoDaddy khud suggest karega aur quotation bhejega.
Pehle `[...]` bharo. Traffic ke numbers apne andaaze se likho.

---

**Subject: Hosting requirement for a multi-tenant SaaS (India): please recommend a plan and share a written quotation**

Hello GoDaddy Team,

I am launching a production SaaS web application for customers in India. Below is my requirement. Please **recommend the most suitable plan(s)** and send me a **written, itemised quotation in INR (GST shown separately)**.

**What the application is**
- A Next.js (Node.js) web app, run in Docker containers, with a MongoDB database on the same server.
- Many companies (tenants) use it. Each company gets its own address like `company.selfrunbusiness.com`, and some use **their own domain** (for example `www.theirname.com`) pointed to our server. All must work on **HTTPS**.
- The app runs background jobs (about 17 per day), stores uploaded files (documents, resumes) on disk, and takes a nightly backup.
- Employees of the customer companies use it from browsers, and from desktop/mobile apps through the same API.
- It holds business, payroll and tax data, so **security, backups and uptime matter**.

**What I need**
1. A server with **full root access**, Ubuntu LTS, where I can install **Docker**, MongoDB and run long-running processes.
2. **Data-centre in India** (Mumbai or nearby), if available.
3. **Dedicated** CPU/RAM (not heavily shared), SSD/NVMe storage that I can **upgrade later without losing data or changing the IP**.
4. A **static public IP**, ports 80/443 open, and control over the firewall.
5. **HTTPS for a wildcard** (`*.selfrunbusiness.com`) and for **many customer domains added over time** (I use Let's Encrypt). If you prefer a GoDaddy certificate, please quote it for unlimited subdomains.
6. **DNS with API access**, so I can create TXT records automatically for wildcard certificates. If the GoDaddy DNS API is not available for my account, please tell me what is needed (plan, minimum domains, Premium DNS).
7. **Daily automatic backups/snapshots** and a clear restore process.
8. **DDoS protection** and an **uptime SLA**.
9. **Support in India** (phone/chat) and the option of a **managed** service, if I want it.
10. Domain `selfrunbusiness.com` [registered with GoDaddy / registered elsewhere]: please quote registration or **transfer-in** and the **renewal** price.
11. Email for `@selfrunbusiness.com`: [number] mailboxes (optional). I send application emails through a separate service.

**Expected size**
- Companies: [about 10-50] in the first 6 months, [about 100-300] in 12 months.
- Users: [about 200-1000]; peak concurrent users: [about 50-200].
- Data: database about [5] GB, files about [20-50] GB now, growing about [10] GB per month.
- Traffic: about [100-500] GB per month.

**Please include in the quotation**
- The plan you recommend for the size above, **and the next plan up** for growth, with a short reason.
- Price for **monthly** billing and for **1, 2 and 3-year** terms.
- The **renewal price** after the first term, setup fees, GST and any other charges.
- Cancellation and refund policy.
- Anything in my requirement that you **cannot** provide.
- How long the quotation is valid.

Thank you.

---

## Before you send

- Fill every `[bracket]`; delete the lines that do not apply.
- Ask for the quote **by email**, so it is in writing.
- Never share server passwords, API keys or the encryption key with support.

## When the quote arrives, check these

| Check | Why |
| --- | --- |
| Is the price monthly or a multi-year upfront rate? | The cheap headline rate usually needs a multi-year payment |
| Renewal price | Often higher than the first term |
| Dedicated vs shared CPU | Shared plans slow down under steady load |
| India data-centre | Speed, and Indian payroll/GST data |
| DNS API available? | Needed for automatic wildcard HTTPS |
| Docker/MongoDB allowed, ports open | The design in [deploy-aws.md](deploy-aws.md) depends on these |
| Backup and restore time | A single server is a single point of failure |
| Upgrade without losing IP | Customers' domains point to this IP |

Compare the final numbers with [hosting-cost-comparison.md](hosting-cost-comparison.md).
