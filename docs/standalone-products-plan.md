# Plan: har product alag se chale, website optional

Status: faisle manjoor (26 Nov 2026). **P1 se P7 tak poore.** P8 (aakhri jaanch) baaki.

## 1. Lakshya

1. Signup par ek dropdown: koi ek product, ya **All products**.
2. Company ko sirf wahi product dikhe aur chale, aur akela poora chale.
3. Website optional: jiski website pehle se hai, use sirf software mile.
4. Purani companies par koi asar nahi (unke paas sab products rahenge).

## 2. Aaj ki sthiti (code dekh kar)

| Baat | Aaj kya hai | Asar |
|---|---|---|
| Plan | Seed plans (Free, Starter, Growth, Business, Enterprise) me `modules: "all"` | Product ke hisaab se kuch lock nahi hota |
| Plan lock, API aur form submit | `src/proxy.ts` ka `planGate` rokta hai | Theek hai |
| Plan lock, page dekhna | `requireModule` sirf Product Registry dekhta hai, plan nahi | **Gap:** jo product plan me nahi, uske pages khul sakte hain |
| Menu, launcher, dashboard | Registry se list banti hai, company ke products se nahi | Sab products dikhte hain |
| Onboarding "Choose products" | `company.enabledModules` save hota hai, par bahut kam jagah padha jata hai. `lpms` hamesha jud jata hai | Chunne ka poora asar nahi |
| Hamesha on | CommandOS, Command Center, Huddle | |
| Website | Har nayi company ke liye starter + AI website banti hai | Optional nahi |
| Product aapas me | Kai products dusre product ka code aur data use karte hain (section 5) | Akela chalane ke liye kaam chahiye |

## 3. Faisle (manjoor)

| # | Faisla |
|---|---|
| D1 | Huddle har product ke saath free, aur dropdown me akela bhi |
| D2 | Har plan ke do daam: **Single product** aur **All products**, dono Console se set hon |
| D3 | Free plan me koi ek product. Purane Free users ke paas sab rahe |
| D4 | Billing se aur product jod sakte hain. Signup par ek ya All, andar kitne bhi |
| D5 | Employee, client, vendor jaisi basic list sab products me shared. Poora dusra product free nahi |
| D6 | **ClientOS sirf All products me.** Warna nahi milega |
| D7 | Bina website wali company: marketing website band; careers, lead form, payment link, certificate verify, signing ke public pages chalte rahein, apni website me lagane ke liye link/embed |
| D8 | **CommandOS aur ClientOS dropdown me nahi.** CommandOS har company ko milta hai |
| D9 | **SiteCraft AI aur Sites ek product.** Isliye website sirf SiteCraft ya All products ke saath. "Website chahiye?" sirf All products par poocha jayega |

Dropdown: All products, TalentOS, SprintOS, DealFlow, CashFlow, SpendIQ, Cohort AI, Huddle, EvalIQ, Playbook, ContractFlow, CyberVault, SiteCraft AI & Sites, RankMax, ViralPulse, AgentOS.

ResolveIQ (help desk) CommandOS ki tarah sabko milta hai.

**D10 (26 Nov):** ContractFlow ke saath **Playbook** milta hai, kyunki document wahin likhe jate hain. Playbook akela bhi bikta hai.

**D11 (26 Nov):** **DataBrain akela nahi bikta** (uske paas apna data nahi). All products me, ya kisi data wale product (CashFlow, TalentOS, SprintOS, DealFlow, SpendIQ) ke saath joda ja sakta hai. Signup dropdown me nahi.

**D12 (26 Nov):** ClientOS ke wo pages jinse kisi product ke log sign in karte hain, us product ke saath khulte hain: **EvalIQ → tests aur exam**, **Cohort AI → training wale pages** (dono ke saath account pages). Baaki ClientOS sirf All products me.

**D16 (26 Nov, D1, D6, D9, D11 aur upar wali dropdown list ki jagah):**

- Dropdown: All products, DealFlow, ViralPulse, SiteCraft AI & Sites, TalentOS, Cohort AI, EvalIQ, CashFlow, SprintOS, SpendIQ, Playbook, ContractFlow, CyberVault, AgentOS, Huddle
- Har workspace ke saath: **CommandOS, DataBrain, ResolveIQ**
- **SiteCraft ke saath: Sites (website), RankMax, ClientOS** (alag se nahi bikte, ginti me nahi)
- **Huddle sirf chunne par**, aur baaki products ki tarah paid
- ClientOS ka page jis product ka record dikhata hai wo product bhi chahiye: invoices → CashFlow; milestones, meetings → SprintOS; projects → SprintOS ya Cohort AI; messages → DealFlow; application, interviews → TalentOS ya DealFlow; training pages → Cohort AI; tests → EvalIQ ya Cohort AI
- **DataBrain** ab Cohort AI, EvalIQ, Playbook, ContractFlow, CyberVault (sirf naam, category, expiry), SiteCraft, RankMax, ViralPulse aur AgentOS ke data par bhi jawab deta hai; sirf us product ko poora dekhne wale log. Passwords, files, phone number, transcript aur chat kabhi nahi. Huddle akela ho to DataBrain saaf batata hai ki padhne ko kuch nahi
- Plan me product list ho to bhi Huddle aur DataBrain us list se band nahi hote

## 4. Design

**Ek hi jagah faisla.** Naya field `company.products`:

```ts
products?: { mode: "all" | "selected"; keys: ModuleKey[] };   // field nahi = all (purani companies)
website?: { mode: "platform" | "external" | "none"; externalUrl?: string };  // field nahi = platform
```

Har company ke liye ek function batayega ki product milega ya nahi:

```
milega = platform ne product on rakha hai (Registry)
       AND (core hai OR company ne khareeda hai)
       AND plan me hai
       (+ Console se company-wise unlock / lock)
```

Proxy, page layout, menu, permissions, search, AI, cron, notifications sab yahi function poochenge. Alag-alag jagah alag check nahi.

`enabledModules` ka matlab sirf "khareede hue me se company ne kya on rakha hai".

## 5. Product aapas me (sabse bada kaam)

Ye numbers sirf import ginti hai. Asli zarurat Phase 3 me har product chala kar confirm hogi.

| Product | Kispar tika hai | Akele me kya karna hoga |
|---|---|---|
| CashFlow | SpendIQ (zyada), TalentOS, SprintOS | Vendor, payroll, client wale screens: shared list ya chhupana |
| TalentOS | CashFlow (payout, bank), SprintOS shared cheezein, AgentOS | Salary payment aur bank account CashFlow ke bina bhi chale |
| SprintOS | TalentOS, CashFlow, AgentOS, Huddle | Team members employee file ke bina bhi banein |
| ContractFlow | Playbook ka editor aur document engine | Engine ko shared platform code banana |
| Playbook | ContractFlow, TalentOS | Wahi shared engine; staff list shared |
| SpendIQ | CashFlow, TalentOS | Payment aur approver ke liye fallback |
| ClientOS | Cohort AI, EvalIQ, SprintOS, CashFlow | D6 |
| DataBrain | SprintOS, TalentOS, SpendIQ, CashFlow | Sirf mile hue products ka data dikhe |
| CyberVault, EvalIQ, ViralPulse, RankMax, Cohort AI, AgentOS | Halke links | Link chhupana |
| DealFlow, SiteCraft | Shared lead code | Website ke bina lead form/embed |
| ResolveIQ, Huddle | Halke | D1 ke hisaab se |

Har link ke liye teen me se ek niyam:

1. **Shared:** basic data (people, clients, vendors, document editor) platform ka hissa bane.
2. **Optional:** dusra product na ho to wo button, tab, report dikhe hi nahi.
3. **Zaroori:** product akela bik hi nahi sakta, saaf likha ho (D6).

## 6. Kaam ke phases (ek ek karke)

Signup dropdown **aakhri** hissa hai, taaki adhoora product koi khareed na sake.

| Phase | Kaam | Poora tab jab |
|---|---|---|
| P1. Neev ✅ | `products` aur `website` field, ek resolver, plan/override ke saath jodna | Resolver ke tests; purani company me koi badlav nahi |
| P2. Taala ✅ | Pages, API, server actions, cron, public routes, AI tools sab resolver se; page wala gap band | Har product ke liye test: apna khule, baaki band |
| P3. Chhupana ✅ | Launcher, sidebar, dashboard, search, People & Access permissions, Setup progress, Integrations, Product settings, onboarding, notifications, emails | Ek product wali company me kisi aur product ka naam ya link na dikhe |
| P4. Akele chalna ✅ | Section 5, ek product ek baar me: CashFlow, TalentOS, SprintOS, ContractFlow+Playbook, SpendIQ, DataBrain, phir baaki | Har product khaali nayi company me shuru se ant tak chale |
| P5. Website optional ✅ | Signup choice, provisioning me website skip, site domain ka behaviour, kaam ke public pages, embed, Settings se baad me on/off | Bina website wali company me website ke steps na dikhein, public links chalein |
| P6. Billing ✅ | Single/All daam, Billing se product jodna/hatana, invoice, Console me company ke products badalna | Upgrade, downgrade, renewal ke tests |
| P7. Signup ✅ | Dropdown, website sawaal, approval queue, pricing aur product pages se preselect (`/signup?product=talentos`), welcome email, pehla landing us product par | Har dropdown option se signup chalta ho |
| P8. Aakhri jaanch | Har option ka matrix test, mobile, white-label, docs, deploy guide | Checklist poori |

## 7. Suraksha

- Production database par sirf read-only jaanch. Field na hone ka matlab "sab", isliye migration zaroori nahi.
- Test sirf local throwaway database par.
- Product hatane par data **delete nahi** hota, sirf access band; wapas lene par data milta hai.
- Har phase ke baad type check aur tests; commit aapke kehne par.
- Next.js code likhne se pehle `node_modules/next/dist/docs/` ki guide padhni hai.

## 8. Jokhim

- P4 sabse lamba aur sabse zyada chhupi samasya wala hai. Asli browser me har product chala kar dekhna padega.
- Kuch purane test pehle se outdated hain (jaise `test-enforcement` ke seat checks). P1 me theek karne honge.
- Abhi bahut saare badlav uncommitted hain. Ye kaam shuru karne se pehle unka commit karna behtar hai, taaki wapas jana aasan ho.

## 9. Progress

### P1. Neev (poora)

- Rules: `src/lib/platform/products/selection.ts`
- Likhne ka ek hi raasta, audit ke saath: `src/lib/platform/products/company-products.ts`
- `entitlementsFor`: plan AND khareede hue product, phir Console overrides; naya `sites` flag
- Tests: `npm run test:product-selection` (57), enforcement (22, purane checks theek kiye), subscriptions (131), coupons (61), platform roles (99); type check clean
- Abhi kisi company par `products` set nahi hota, isliye live behaviour nahi badla
- P2 tak API aur form submit hi band hote hain; pages aur public website ka taala P2 aur P5 me

### P2. Taala (poora)

- Kis URL ko kaunsa product chahiye: `src/lib/platform/products/routes.ts` (saajha screens "inme se koi ek")
- Company par kaun se product band: `src/lib/platform/products/availability.ts`; `unavailablePanelKeys` isi ko jodta hai, isliye launcher, analytics, integrations, PWA aur AI assistant ko bhi yahi list milti hai
- Proxy: staff page → `/commandos/upgrade`, bahar wale ka page → "not available", API aur form submit → 403 (bina sign-in wale ko 401)
- `requireModule` doosra taala; signing link, notification sweeps aur product ke scheduled jobs bhi
- Khule rehte hain: `/verify` (jari certificate aur signed document), payment webhooks, cron aur callback
- Tests: `npm run test:product-gating`

### Public website (P5 me)

Marketing website, website chat aur offers ka taala P5 me, kyunki careers, lead form jaise pages chalte rehne hain.

### P3. Chhupana (poora)

- Ek hi list (`products/visible.ts`) aur do pure helpers: `hrefAvailable`, `onlyAvailable`
- CommandOS menu aur cards (saajha screens "inme se koi ek" par dikhte hain), dashboard ka attendance button, login page ke product naam
- Setup progress: band product ke steps list me hi nahi
- People & access: sirf apne products; doosre product ka saved access waise hi rehta hai (bulk badlav me bhi)
- Integrations cards, Notification center, Scheduled jobs, Documents & PDFs, AI prompts, AI assistant ka guide
- Tests: `npm run test:product-visibility`

### P4 ke liye bacha

- Product ke **andar** ke screens se doosre product ke link aur data (CashFlow → SpendIQ / TalentOS / SprintOS, waghera)
- ResolveIQ ke help articles aur kuch lambe description text me doosre product ka naam ho sakta hai
- Browser me ek-product company se aankhon se jaanch

### P4. Akele chalna (poora)

| Product | Haal |
|---|---|
| CashFlow, TalentOS, SprintOS, ContractFlow + Playbook, SpendIQ, DataBrain, CyberVault, EvalIQ, ViralPulse, RankMax, Cohort AI, AgentOS, DealFlow, Huddle | ✅ |
| SiteCraft AI & Sites, website | P5 me |

**CashFlow akela**

- Vendor, vendor bill (entry, file, approve, delete) aur customer: SpendIQ / SprintOS na ho to CashFlow me hi. Likhne ka logic dono jagah ek (`vendor-write.ts`, `bill-write.ts`, `client-write.ts`). Wo product ho to pehle jaisa: sirf wahin manage
- Dusre product ke bina band: payroll runs, salary payments (TalentOS); employee claims, reimbursements, assets, budget report (SpendIQ); project profitability (SprintOS)
- Unke link `ProductLink` / `localHref` se: apne screen par, ya sirf text
- My work, month close, health checks, getting started, approvals, dashboard unhe chhod dete hain
- Rule file me naya `also`: "is screen ko doosra product bhi chahiye"
- Raste me do purani kami theek: SpendIQ me bill ki attached file khulti nahi thi; locked month me bill approve karne par "ho gaya" dikhta tha
- Test: `npm run test:cashflow-standalone`
- Baaki: AI assistant ke kuch CashFlow reports (budget, assets) khaali data dikha sakte hain; browser me jaanch

**TalentOS akela**

- DealFlow na ho to candidates yahin: add (resume ke saath), sabki list, status badalna; usse Pipeline, Ready to convert aur Offer chalte hain. Nayi application ki soochna HR ko jati hai
- AI call buttons aur summaries (AgentOS), Assessments tab (EvalIQ), signed documents (ContractFlow) us product ke bina nahi
- Salary: bank account CommandOS → Payments se, payment code bhi wahin; CashFlow zaroori nahi
- Sabhi products ke liye: jo product company ke paas nahi, uski in-app/push/email suchna bheji hi nahi jati
- Test: `npm run test:talentos-standalone`
- Baaki: job openings ki list abhi website (SiteCraft) ke jobs se banti hai; bina website wali company ke liye openings aur public careers page **P5** me. AI assistant aur browser jaanch

**SprintOS akela**

- Team ke liye TalentOS zaroori nahi: People & access se joda gaya har insaan apne aap employee record pata hai aur project me lag sakta hai
- AI call buttons, summaries aur "do not contact" (AgentOS) uske bina nahi; costing me "CashFlow Ledger" wala card CashFlow ke bina nahi; baaki costing apne timesheets se
- Team member wali screen ke shabd ab TalentOS ka naam nahi lete; team chhoti ho to "Add a person" link
- Test: `npm run test:sprintos-standalone` (client → project → task → timesheet → approval → costing)

**ContractFlow aur Playbook**

- ContractFlow chunne par Playbook apne aap milta hai (`INCLUDED_WITH`)
- Client, vendor, candidate: jis company ke paas unhe rakhne wala koi product nahi, wo naam haath se likhti hai; employee People & access se
- Playbook akela: "Send to ContractFlow" (button, page aur server dono), In ContractFlow / Signed tabs aur dashboard ke signature wale hisse nahi
- SOP ke "product link" me sirf apne products
- Test: `npm run test:documents-standalone`
- Baaki: Playbook ke variables me client, vendor, project ki value tabhi aati hai jab wo record ho (warna haath se bharni hai). `/contractflow-ai/new/[type]` link ka page pehle se maujood nahi hai (purana "maker" flow)

**SpendIQ aur DataBrain**

- SpendIQ pehle se swatantra: departments CommandOS se, log People & access se, payment apne aap record. Sirf SprintOS ke "Project" fields aur project budget level ab SprintOS ke bina nahi
- DataBrain: `NEEDS_ONE_OF` (companion product); sirf company ke paas wale products ka data padhta hai
- Test: `npm run test:spendiq-standalone`

**CyberVault, EvalIQ, ViralPulse, RankMax**

- CyberVault: SprintOS ke bina client vault se hi client add hota hai
- EvalIQ: assign karte waqt sirf wahi group jinke log company ke paas hain (Applicants ke liye TalentOS/DealFlow, Students ke liye Cohort AI); product ke naam wale shabd hataye. D12 ke pages
- ViralPulse: Client field tabhi jab client hon; DealFlow ke bina ad-platform data wala hissa nahi
- RankMax: koi badlav nahi chahiye tha
- Test: `npm run test:light-standalone`
- Baaki: EvalIQ akele me bahar ke applicant tabhi aate hain jab TalentOS ya DealFlow ho; warna sirf apne staff ke test

**Cohort AI, AgentOS, DealFlow, Huddle**

- AI call ke button, history aur AI Voice Calls screen AgentOS ke bina kahin nahi (DealFlow, TalentOS, SprintOS sab me); meeting me AI agents wala hissa bhi
- DealFlow: ClientOS ke bina naye applicant / lead ko portal login, redirect ya portal link nahi jata; Assessments (EvalIQ), TalentOS links, student link (Cohort AI), client link (SprintOS) usi product ke saath
- Cohort AI: Tests card EvalIQ ke saath; student login uske apne
- AgentOS: call se record ka link tabhi jab wo product ho
- Huddle: badlav nahi chahiye tha
- Test: `npm run test:final-standalone`
- Baaki: ClientOS ke bina DealFlow ka "portal chat" lead tak nahi pahunchta (email / WhatsApp se baat hoti hai); DealFlow ke lead form P5 me

### P5. Website optional (poora)

- Company banate waqt `products` / `website`: website na ho to starter aur AI website banti hi nahi
- Site address par: marketing pages ki jagah company ki apni website (diya ho to) ya `/forms`; payment, verify, signing, portal sign-in chalte rehte hain; purane `/careers`, `/contact` link naye form par jate hain
- Hosted forms: `/forms/careers`, `/forms/enquiry` (website ke bina bhi); company sirf apni website me embed kar sakti hai
- CommandOS → Branding & domains → **Website & public forms**: website on/off, form links aur embed code, bina website wali company ke liye job openings
- Test: `npm run test:website-optional`
- Baaki: browser me embed ki jaanch; website chat widget aur offers sirf website wali company ke liye (apni website me chat widget lagane ka raasta nahi bana); signup me sawaal P7 me

### P6. Billing (poora)

**D13 (26 Nov):** daam = Single × products ki ginti, All ke daam se zyada nahi (Huddle aur ContractFlow wala Playbook ginti me nahi). Beech me joda product turant milta hai, naya daam agle renewal se, aur wo kam se kam ek bill ke baad hi hatta hai. Hataya product paid period ke ant tak rehta hai.

- Console → Plans: har cycle ka All daam aur **one product** daam (khaali = All wala), aur "most products" (Free = 1)
- Settings → Billing → **Your products**: chunna, daam dekhna, badalna. UPI autopay me naya approval maanga jata hai
- Console → Company → **Products and website**: reason ke saath badlav; access turant, billing agle renewal se
- Tests: `npm run test:product-billing`

**Aapko Console me karna hai (live data par maine kuch nahi badla):** har paid plan ka "one product" daam bharna, aur Free plan me "most products = 1". Jab tak nahi bharoge, ek product wala bhi All ka daam dega aur Free me limit nahi lagegi.

Baaki: browser me checkout jaanch (public plan cards me one product ka daam P7 me aaya)

### P7. Signup (poora)

**D14 (26 Nov):** signup me "All products" bina paid plan chune ho to sabse saste paid plan ka free trial (card nahi); ek product ho to Free plan.

- `/signup`: **What do you want to use?** multi-select (All products akela, ya ek se zyada products; DataBrain kisi data wale product ke saath; CommandOS aur ClientOS nahi). Website sawaal sirf All par: hamari website / apni (address) / nahi
- Chune hue products me SiteCraft ho to website banti hai, warna website step aata hi nahi
- Ek se zyada paid product = paid plan ka free trial (D14); pehli screen CommandOS
- Signup ke baad pehli screen chuna hua product; welcome email aur approval queue me products dikhte hain; band product se signup nahi
- `/signup?product=<slug>` preselect; product pages ke signup button yahi link dete hain
- Plan cards aur pricing page par one product ka daam (jab Console me bhara ho) aur Free = "One product"
- Public website, FAQ, docs, llms.txt, SEO data aur Terms ke purane "har plan me har product" wale daave sahi kiye
- Fix (purana bug): AI na chalne par bani starter website ke service pages publish nahi hote the
- Tests: `npm run test:signup-products`, `test:signup-plan`, `test:email-verification`
- Baaki: browser me signup form ki jaanch; Terms ki badli line ek baar khud padh lein

**D15 (26 Nov): domain.** Website hamare yahan ho to do address (`naam.domain` website, `naam-app.domain` app). Website na ho to **ek hi** address `naam.domain`, aur poora app usi par; `-app` banta hi nahi.

- Apna custom domain: ek address wali company me app seedha us domain par (`app.<domain>` ke DNS record nahi mangte)
- Hosting (Vercel) par bhi sirf zaroori domain jodte hain; email, invoice, signup ke link sahi address par
- Website baad me jodne / hatane par address badalta hai: purane `-app` link naye par forward hote hain, aur sabko dobara sign in karna padta hai
- Purani companies me kuch nahi badla (do address)
- Console se sirf override dekar SiteCraft kholne par doosra address nahi banta; Console ke **Products and website** se product jodiye
- Baaki: live domain / Vercel aur installed app par browser jaanch

**Apna subdomain (26 Nov).** Jis company ki website pehle se chal rahi hai wo naya domain liye bina apne domain ka subdomain (`app.company.co.in`) jod sakti hai.

- Settings → Domains: address kis liye hai: *website aur team sign-in*, ya *sirf team sign-in* (website hamare yahan na ho to hamesha yahi)
- Sirf apne do DNS record (TXT, CNAME); baaki website aur email waise hi
- Unki bahar chal rahi website wala address (root / www) add hi nahi hota; website na batane wali company se root domain par pehle poochha jata hai
- Doosri company ka address koi nahi le sakta; ek address hatane se doosra nahi tootta
- `.co.in` jaise domain par ab sahi DNS record (pehle galat tha)
- Tests: `npm run test:subdomains`. Baaki: asli domain aur Vercel par browser jaanch

## 10. Aage ke liye note

- `enabledModules()` abhi bhi `lpms` apne aap jodta hai; entitlements ise rok dete hain, isliye asar nahi
