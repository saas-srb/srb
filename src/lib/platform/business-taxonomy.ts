/**
 * Worldwide business classification for company registration. Built on the UN's ISIC Rev. 4 (the standard every
 * national scheme — NAICS, NACE, NIC, ANZSIC … — maps onto), regrouped into friendly categories and taken down to
 * ISIC "group" level, plus the modern industries ISIC predates (SaaS, AI, cybersecurity, fintech, e-commerce, renewable
 * energy, streaming, esports …). A company picks up to 5 categories and up to 50 sub-categories — and may type its own
 * (custom entries count toward the 5), so nothing a business does can be left out.
 *
 * Codes are stable slugs (never shown to people): `<category>` and `<category>:<sub-category>`.
 * Pure data — client-safe, no data access.
 */

export interface BusinessSub {
  code: string;
  name: string;
}

export interface BusinessCategory {
  code: string;
  name: string;
  subs: BusinessSub[];
}

const slug = (t: string) => t.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const MAX_BUSINESS_CATEGORIES = 5;
export const MAX_BUSINESS_SUBCATEGORIES = 50;
export const CUSTOM_PREFIX = "custom:";

/** Further sub-categories appended to categories above (kept apart so the base lists stay readable). */
const EXTRA: Record<string, string[]> = {
  "Information Technology & Software": [
    "Product engineering and R&D centres", "Offshore development centres", "Enterprise software and system integration", "SAP, Oracle and Microsoft partners", "CMS, WordPress and Shopify development",
    "API and microservices development", "Legacy application modernisation", "Database administration and data engineering", "Network engineering and infrastructure services", "IT hardware sales and AMC",
    "DevSecOps and site reliability", "Chatbots and conversational AI", "Voice assistants and speech technology", "Computer vision and image recognition", "CAD, CAM and engineering software",
    "GIS and geospatial software", "Open-source software and communities", "Firmware and operating-system development", "IT helpdesk and technical support", "Technical documentation and developer relations",
    "Cloud migration and FinOps", "Business intelligence and dashboards", "Digital product design and prototyping", "Bootcamps and developer training",
  ],
  "Healthcare & Life Sciences": [
    "Cardiology", "Oncology and cancer care", "Orthopaedics and sports medicine", "Paediatrics and neonatology", "Gynaecology and obstetrics", "Dermatology and cosmetic medicine", "Ophthalmology and eye care",
    "ENT (ear, nose and throat)", "Neurology and neurosurgery", "Nephrology and dialysis", "Gastroenterology", "Urology", "Psychiatry", "Radiology and imaging centres", "Pathology and blood tests",
    "Cosmetic and plastic surgery", "Nutrition and dietetics", "Optometry and opticians", "Medical tourism", "Medical coding, billing and transcription", "Health insurance TPAs and claims",
    "Clinical trials and research sites", "Hospital management and healthcare software", "Medical equipment rental and servicing", "Palliative and hospice care", "Veterinary and animal health",
    "Yoga therapy and naturopathy", "Acupuncture and alternative therapies", "Dental labs and orthodontics", "Pharmacy chains and chemists",
  ],
  "Education & Training": [
    "Montessori and early learning", "CBSE, ICSE, IB and state-board schools", "International schools", "Special education", "Engineering and medical entrance coaching", "Civil-service and competitive-exam coaching",
    "Management and MBA institutes", "Law and professional colleges", "Nursing and paramedical institutes", "Polytechnics and ITIs", "Coding bootcamps", "STEM and robotics education", "Abroad education and test prep (IELTS, GRE, GMAT)",
    "Distance and open universities", "Online tutoring marketplaces", "Hobby classes and workshops", "Cooking and culinary schools", "Aviation and pilot training", "Fashion and design institutes", "Early-childhood teacher training",
    "Libraries and learning centres", "Education content publishing", "School management software", "Scholarships and education finance",
  ],
  "Retail Trade": [
    "Kirana and neighbourhood stores", "Wholesale clubs and cash-and-carry", "Duty-free and travel retail", "Pawn shops and gold loans", "Thrift and charity shops", "Mobile phone and accessory stores",
    "Optical and eyewear stores", "Bridal and festive wear stores", "Fabric and textile shops", "Gift and novelty shops", "Pet and aquarium shops", "Garden and plant nurseries", "Paint and sanitaryware dealers",
    "Tile, marble and building-material retail", "Tyre and battery retail", "Kitchenware and utensils", "Baby and maternity stores", "Liquor and wine shops", "Organic and health-food stores", "Subscription boxes and clubs",
    "Dropshipping", "Print-on-demand", "Social commerce and live-stream selling", "Classifieds and local listings",
  ],
  "Hospitality, Travel & Food Service": [
    "Street food and food stalls", "Sweet shops and mithai", "Ice-cream and dessert parlours", "Juice bars and smoothie shops", "Tea and coffee shops", "Meal subscriptions and tiffin services", "Resort and villa operators",
    "Boutique and heritage hotels", "Bed and breakfasts and homestays", "Eco-tourism and adventure travel", "Wildlife and nature tourism", "Corporate travel management", "Visa and immigration consultancy",
    "Tour guides and travel bloggers", "Luxury and honeymoon travel", "Pilgrim and group tours", "Airline catering", "Hotel management and hospitality education", "Food courts and canteens", "Franchise restaurant chains",
  ],
  "Legal, Accounting & Consulting": [
    "Chartered accountants", "Company secretaries", "GST and indirect-tax consultants", "Immigration and visa lawyers", "Intellectual-property and trademark attorneys", "Litigation and arbitration", "Corporate and M&A law",
    "Startup and venture advisory", "Business registration and licensing", "Legaltech", "Forensic accounting and investigation", "Customs and trade-law advisory", "Insolvency and restructuring", "Financial and wealth planning advisors",
    "Career and executive coaching", "Business coaching and mentoring", "Training and facilitation consultancies",
  ],
  "Agriculture, Forestry & Fishing": [
    "Agritech platforms and marketplaces", "Farm equipment dealers and rental", "Fertilizer and pesticide retail", "Cold storage for produce", "Farmer producer companies", "Mushroom cultivation", "Sericulture and silk",
    "Floriculture and cut flowers", "Nursery and sapling supply", "Organic certification and inputs", "Agro-processing units", "Dairy farm equipment and services", "Fish feed and hatcheries", "Drone spraying and farm services",
  ],
  "Construction & Infrastructure": [
    "Cement and concrete products", "Steel, TMT and rebar supply", "Tiles, marble and granite", "Sanitaryware and bath fittings", "Doors, windows and glass", "Modular kitchens and wardrobes", "False ceiling and drywall",
    "Waterproofing and insulation", "Solar installation contractors", "Lift and escalator installation", "Fire-safety systems installation", "Structural consultants and PMC", "Quantity surveyors and estimators", "Crane and heavy-equipment rental",
  ],
  "Transport & Logistics": [
    "Auto-rickshaw and cab operators", "School and staff transport", "Tempo, mini-truck and tanker operators", "Packers and movers", "Courier franchise partners", "Driver and chauffeur services", "Ambulance and mobile clinics",
    "Bike taxis and rentals", "Inland container depots", "Freight marketplaces and brokers", "Charter flights and private aviation", "Flying schools and aerial services", "Railway services and contractors", "Cross-border and trade logistics",
  ],
  "Personal & Household Services": [
    "Astrology, numerology and tarot", "Life and relationship coaching", "Makeup artists and bridal services", "Mehendi and henna artists", "DJs and sound services", "Florists and decorators", "Personal shoppers and stylists",
    "Elder and child companions", "Tutors and home instructors", "Personal trainers and nutrition coaches", "Driving and car-care services", "Laundry and dry-cleaning chains", "Cobblers and shoe repair", "Key-makers and locksmiths", "Tailors and alteration shops",
  ],
  "Banking & Financial Services": [
    "Neo-banks and challenger banks", "Buy-now-pay-later (BNPL)", "Peer-to-peer lending", "Crowdfunding platforms", "Wealthtech and robo-advisors", "Regtech and compliance technology", "Gold loans and pawn finance",
    "Housing finance", "Vehicle and equipment finance", "Mutual-fund distribution", "Stock-broking and trading platforms", "Bill payments and utilities platforms", "Chit funds and savings schemes", "Trade finance and factoring",
  ],
};

/** Further sub-categories (rural, micro-shop and enterprise coverage) appended after `EXTRA`. */
const EXTRA_MORE: Record<string, string[]> = {
  "Retail Trade": [
    "Hypermarket", "Department store", "Shopping mall and complex management", "Exclusive brand outlet (EBO)", "Multi-brand outlet (MBO)",
    "Factory outlet and outlet mall", "Convenience-store chain", "Supermarket chain", "Cash-and-carry and B2B store", "Weekly market (haat) stall",
    "Mobile van and shop-on-wheels", "Kiosk and vending machine operator", "Franchise retail store", "Pharmacy chain", "Electronics superstore",
    "Furniture superstore", "Fashion retail chain", "Footwear retail chain", "Jewellery retail chain", "Book and stationery chain",
    "Cloth merchant (kapda dukan)", "Crockery and glassware shop", "Utensil and steel-ware shop", "Cycle and tricycle shop", "Agricultural produce retail (sabzi mandi stall)",
    "Second-hand goods market", "Used mobile and laptop resale",
  ],
  "General Stores, Grocery & Daily Needs": [
    "Village general store", "Dal and rice mill retail", "Jaggery (gud) and sugar shop", "Kerosene and diesel dealer", "Firewood, coal and charcoal depot",
    "Cow-dung cake and organic fuel seller", "Milk collection centre", "Curd, paneer and ghee seller", "Dairy cooperative outlet", "Betel leaf and areca-nut shop",
    "Tobacco and bidi wholesaler", "Cold-drink and soda shop", "Cow-feed and fodder shop", "Salt, oil and ration retailer", "Jan Aushadhi and subsidised store",
    "Utensil and plastic-ware shop", "Broom, brush and cleaning-supplies shop", "Matchbox, candle and lantern shop",
  ],
  "Farming, Dairy & Rural Businesses": [
    "Gaushala and cow shelter", "Bullock cart and animal-drawn transport", "Thresher and harvester rental", "Custom hiring centre (farm machinery)", "Grain storage and godown",
    "Village flour and oil mill", "Animal breeding and artificial-insemination service", "Fodder and silage production", "Cattle market and animal trader", "Farmer producer organisation (FPO)",
    "Farmers' cooperative society", "Mandi commission shop (arhtiya)", "Kitchen-garden and terrace-farm supplies", "Pond and fish-seed supplier", "Duck, quail and turkey farming",
    "Rabbit and pig farming", "Camel, buffalo and yak rearing", "Bio-gas and gobar-gas plant", "Solar water-pump and irrigation services", "Soil-testing and agri-advisory",
    "Crop-insurance and kisan-credit agent", "Agri-input franchise (Kisan Seva Kendra)", "Pesticide spraying and drone services", "Rural warehouse and cold-chain hub",
  ],
  "Repair, Installation & Home Services": [
    "Hand-pump and borewell mechanic", "Tractor and farm-machinery mechanic", "Cycle-rickshaw and e-rickshaw repair", "E-rickshaw and EV charging services", "Blacksmith and ironsmith (lohar)",
    "Mason and bricklayer (rajmistri)", "Thatch, tile and roofing worker", "Well-digging and pond-digging contractor", "Tent, chair and utensil rental", "Washing, ironing and dhobi service",
    "Barber and hair-cutting (nai) service", "Tailor and darzi", "Mobile-charging and SIM-recharge shop", "Inverter and battery service", "Gas-stove and cylinder repair",
    "Sewing-machine repair", "Mixer, grinder and fan repair", "Pump and motor rewinding", "Pressure-cooker and utensil repair", "Umbrella and bag repair",
    "Photo-frame and lamination service", "Interior and POP (plaster of Paris) work", "Tile and marble polishing", "Termite and borer treatment", "Chimney and boiler service",
    "Generator and transformer rental", "Scaffolding and shuttering rental", "Apartment and society maintenance",
  ],
  "Personal & Household Services": [
    "Village barber (nai)", "Washerman (dhobi)", "Priest, pandit and ritual services", "Matchmaker and marriage bureau", "Maid, cook and domestic-help agency",
    "Wet-nurse and baby-care services", "Cobbler and shoe-polish stand", "Mehendi and tattoo at fairs", "Photo studio and passport photos", "Cremation and last-rites services",
    "Water-can and tanker delivery", "Newspaper and milk delivery", "Tent and utensil on rent", "Barter and local-exchange services",
  ],
  "Crafts, Handicrafts & Artisans": [
    "Potter (kumhar) and clay products", "Blacksmith (lohar) and farm tools", "Carpenter (barhai) and wood craft", "Weaver (julaha) and handloom", "Cobbler and leather craft (mochi)",
    "Basket, mat and bamboo craft", "Jute and coir products", "Cane and wicker furniture", "Stone carving and sculpture", "Wood carving and inlay",
    "Brass, bell-metal and copper craft", "Block printing and tie-dye", "Zari and embroidery work", "Terracotta and clay toys", "Idol and pandal makers",
    "Garland, flower and puja-items makers", "Papier-mâché and lacquer work", "Bidri, filigree and metal inlay", "Tribal and folk-art products", "Khadi and gramodyog unit",
  ],
  "Medical Stores, Clinics & Local Healthcare": [
    "Rural medical practitioner (RMP) clinic", "Sub-centre and primary health centre", "Jan Aushadhi Kendra", "ASHA and community health worker", "Bone-setter and traditional healer",
    "Herbal and jadi-buti seller", "Midwife and home-delivery services", "Mobile health van", "Telemedicine kiosk", "Blood-pressure and sugar test point",
    "Eye-camp and screening organisers", "Dental technician and denture maker", "Physio and massage at home", "Animal-health worker and vaccinator",
  ],
  "Transport & Logistics": [
    "Cycle rickshaw and rickshaw puller", "E-rickshaw and e-cart operator", "Tractor-trolley transport", "Bullock-cart and camel-cart transport", "Handcart (thela) and porter services",
    "Goods carrier (tempo) owner", "Village bus and jeep service", "Shared auto and magic-van operator", "Ferry, boat and ropeway operator", "Bus stand and truck-stand services",
    "Weighbridge (dharamkanta) operator", "Warehouse and godown rental",
  ],
  "Education & Training": [
    "Village school and primary school", "Madrasa and religious school", "Gurukul and Vedic school", "Anganwadi and early-childhood centre", "Adult literacy and night school",
    "Skill-development and PMKVY centre", "Computer and digital-literacy centre", "Agricultural training and Krishi Vigyan Kendra", "Tailoring and embroidery training for women", "Vocational and trade training (ITI)",
    "Open-school and NIOS study centre", "Hostel and student mess",
  ],
  "Finance, Insurance & Agents (Local)": [
    "Kisan credit and crop-loan agent", "Self-help group (SHG) bank-linkage services", "Money lender and informal finance", "Gold-loan and jewellery-finance outlet", "Post-office savings and RD agent",
    "Customer service point (CSP) of a bank", "Micro-ATM and AEPS agent", "Gram panchayat e-service operator",
  ],
};

/** A deeper pass over every sector, from the smallest shop or village trade to the largest enterprise, appended after `EXTRA_MORE`. */
const EXTRA_DEEP: Record<string, string[]> = {
  "Agriculture, Forestry & Fishing": [
    "Sugarcane and jaggery farming", "Cotton and jute farming", "Pulses and millets farming", "Coconut, arecanut and cashew plantation", "Spices and herbs farming",
    "Medicinal and aromatic plants", "Fodder and grass cultivation", "Contract and cooperative farming", "Fish seed hatchery", "Ornamental fish breeding",
    "Shrimp and prawn farming", "Seaweed and aquatic-plant farming", "Inland fishing and ponds", "Fish drying and curing", "Bamboo and cane cultivation",
    "Lac, gum and resin collection", "Tree plantation and agroforestry", "Agricultural drone and precision farming", "Seed production and certification", "Soil and water testing lab",
    "Cattle and buffalo breeding", "Horse, camel and donkey rearing", "Emu, ostrich and turkey farming", "Apiculture and honey processing", "Vermiculture",
    "Greenhouse and polyhouse farming", "Floating and urban farming",
  ],
  "Mining & Quarrying": [
    "Sand and gravel mining", "Stone, granite and marble quarrying", "Iron and manganese ore mining", "Bauxite and aluminium ore", "Limestone and dolomite",
    "Salt production and salt pans", "Gypsum and clay", "Mica, graphite and talc", "Gold, silver and diamond mining", "Rare earth and lithium",
    "Mining equipment dealers and contractors", "Mine safety and rescue services", "Mineral testing and assay", "Dredging and riverbed mining",
  ],
  "Food, Beverage & Tobacco Manufacturing": [
    "Atta, maida and suji mills", "Dal and pulse mills", "Edible-oil refining", "Ghee and butter manufacturing", "Paneer, curd and milk-products unit",
    "Chocolate and confectionery manufacturing", "Namkeen and snack manufacturing", "Papad, pickle and chutney manufacturing", "Masala and spice grinding", "Instant mix and ready-to-eat foods",
    "Frozen and canned foods", "Fruit pulp, juice and jam", "Packaged drinking water and soda", "Tea processing and packaging", "Coffee roasting and curing",
    "Sugar and khandsari mills", "Jaggery manufacturing", "Starch and glucose", "Noodles, pasta and vermicelli", "Bread, biscuits and rusk",
    "Beedi and tobacco products", "Meat, poultry and fish processing", "Egg powder and processed eggs", "Baby food and nutrition", "Health drinks and supplements",
    "Cattle and poultry feed manufacturing", "Makhana, dry fruit and nut processing", "Rice bran and bran-oil", "Honey processing and packing", "Contract food manufacturing and co-packing",
  ],
  "Textiles, Apparel & Leather": [
    "Handloom weaving", "Powerloom weaving", "Knitting and hosiery", "Yarn spinning", "Cotton ginning",
    "Silk reeling and weaving", "Wool processing and carpets", "Dyeing and printing", "Embroidery and zari", "Readymade garment manufacturing",
    "School and corporate uniform manufacturing", "Industrial workwear and PPE garments", "Home textiles and bedsheets", "Towels and terry products", "Technical textiles and non-wovens",
    "Jute products", "Leather tanning", "Footwear manufacturing", "Leather bags and belts", "Tent and tarpaulin manufacturing",
    "Labels, buttons and trims", "Textile machinery and spares",
  ],
  "Wood, Paper & Printing": [
    "Sawmill and timber processing", "Plywood and veneer manufacturing", "Wooden furniture manufacturing", "Bamboo products", "Paper and board mills",
    "Paper cups and plates", "Corrugated boxes and cartons", "Notebooks and stationery manufacturing", "Packaging printing", "Book printing and binding",
    "Newspaper printing", "Security and ticket printing", "Label and sticker printing", "Photo-album and card printing", "Wooden pallet and crate manufacturing",
  ],
  "Chemicals, Pharmaceuticals & Plastics": [
    "Pharmaceutical formulation", "Bulk drugs and APIs", "Ayurvedic and herbal medicine manufacturing", "Nutraceuticals and supplements", "Vaccines and biologicals",
    "Paints, coatings and varnishes", "Adhesives and sealants", "Fertilizer and agrochemicals", "Soaps, detergents and cleaners", "Cosmetic and toiletry manufacturing",
    "Dyes and pigments", "Plastic pipes and fittings", "Plastic films and bags", "Plastic moulded products", "Rubber and tyre manufacturing",
    "Fibreglass and composites", "Explosives and fireworks manufacturing", "Pesticide formulation", "Candles and incense", "Water-treatment chemicals",
  ],
  "Metals, Machinery & Equipment": [
    "Iron and steel rolling mills", "Sponge iron and TMT bars", "Aluminium extrusion", "Copper and brass products", "Wire drawing and cables",
    "Forging and casting", "Fasteners, nuts and bolts", "Pumps and valves", "Compressors and blowers", "Agricultural machinery manufacturing",
    "Food-processing machinery", "Textile machinery", "Construction equipment", "Material-handling and cranes", "Lifts and escalators manufacturing",
    "HVAC and refrigeration equipment", "Tools, dies and moulds", "Bearings and gears", "Springs and stampings", "Steel fabrication and structural",
    "Containers and storage tanks", "Utensils and cookware manufacturing", "Arms and ammunition components",
  ],
  "Electronics, Computers & Optical": [
    "Printed circuit board assembly", "Consumer electronics manufacturing", "Mobile phone assembly", "LED and lighting manufacturing", "Batteries and power banks",
    "Cables and connectors", "Transformers, switchgear and products", "Meters and measuring instruments", "CCTV and security electronics", "Medical electronics",
    "Solar inverters and charge controllers", "Semiconductor and chip design", "Embedded and IoT devices", "Optical lenses and eyewear manufacturing", "Watches and clocks manufacturing",
    "Electric motors and fans", "Home-appliance manufacturing", "Drone manufacturing",
  ],
  "Automotive & Transport Equipment": [
    "Auto-component manufacturing", "Two-wheeler and three-wheeler manufacturing", "Electric-vehicle manufacturing", "Bus and truck body building", "Trailer and tipper fabrication",
    "Tractor and farm-vehicle manufacturing", "Auto electrical and lighting parts", "Tyres and tubes", "Railway wagons and coaches", "Shipbuilding and boat building",
    "Bicycle manufacturing", "Battery-swapping and EV components", "Automotive aftermarket and accessories",
  ],
  "Furniture & Other Manufacturing": [
    "Mattresses and foam", "Steel almirahs and office furniture", "Toys and games manufacturing", "Musical instruments manufacturing", "Pens and stationery",
    "Brooms, brushes and mops", "Umbrellas and luggage", "Medical and dental products manufacturing", "Signage and display manufacturing", "Funeral products",
    "Coir and mat products", "Artificial flowers and decor", "Lighters, matches and fireworks",
  ],
  "Energy & Utilities": [
    "Solar power plants and parks", "Rooftop solar EPC", "Wind-farm development", "Hydro and mini-hydro power", "Biomass and bio-CNG plants",
    "Power transmission and distribution", "Electricity retail and billing franchisee", "Gas distribution and piped gas", "LPG distribution", "Petrol-pump dealership",
    "EV charging network", "Battery storage and energy services", "Energy audit and ESCO", "Oil and gas exploration services", "Coal trading and washing",
    "Nuclear and thermal power services", "Street-light and smart-grid services",
  ],
  "Water, Waste & Environment": [
    "Water supply and tanker services", "Packaged-water plants", "Sewage and effluent treatment", "Rainwater harvesting", "Solid-waste collection and segregation",
    "E-waste recycling", "Plastic and paper recycling", "Scrap-metal recycling", "Bio-medical waste handling", "Composting and bio-gas from waste",
    "Landfill and waste-to-energy", "Environmental consulting and audits", "Pollution testing and monitoring", "Desalination and water purification", "Borewell and groundwater services",
    "Pond and lake restoration", "Carbon credits and ESG services",
  ],
  "Construction & Infrastructure": [
    "Residential building contractor", "Commercial building contractor", "Road and highway contractor", "Bridge and flyover contractor", "Railway and metro construction",
    "Irrigation, canal and dam works", "Power-line and cable laying", "Telecom tower construction", "Pipeline and plumbing contractor", "Demolition and excavation",
    "Prefab and PEB construction", "Real-estate developer and builder", "Housing society and colony developer", "Landscape and garden contractor", "Painting and POP contractor",
    "Electrical and HVAC contractor", "Steel-fixing and shuttering", "Ready-mix concrete plant", "Bricks, blocks and AAC plants", "Surveyors and land mapping",
    "Infrastructure project management", "Smart-city and PPP projects", "Government civil contractor (Class A/B/C)",
  ],
  "Wholesale Trade": [
    "Grocery and kirana wholesaler", "Dairy and egg wholesaler", "Meat and fish wholesaler", "Fruit and vegetable commission agent", "Agricultural commodity trader",
    "Cotton and yarn trader", "Wood, timber and plywood trader", "Building-material trader", "Paint and hardware wholesaler", "Electrical goods wholesaler",
    "Medical and surgical wholesaler", "Books and stationery wholesaler", "Toys and gift wholesaler", "Footwear and bag wholesaler", "Jewellery and bullion trader",
    "Auto-parts wholesaler", "Tyre and lubricant distributor", "Petroleum and lubricant dealer", "Fertilizer and pesticide wholesaler", "Cattle-feed wholesaler",
    "Liquor and beverage distributor", "Packaging-material trader", "Industrial raw-material trader", "Used machinery and equipment dealer", "Online B2B wholesale platform",
  ],
  "Motor Vehicle Sales & Services": [
    "Authorised car dealership", "Two-wheeler dealership", "Commercial-vehicle dealership", "Tractor dealership", "E-rickshaw and EV dealership",
    "Used-car and pre-owned bike dealer", "Vehicle financing and exchange", "Car servicing and detailing", "Denting, painting and body shop", "Car wash and polishing",
    "Spare-parts retail", "Tyre retail and alignment", "Vehicle inspection and valuation", "Driving test and licensing agents", "Fitness certificate and pollution check centre",
    "Vehicle scrapping and recycling", "Car and bike rental",
  ],
  "Hospitality, Travel & Food Service": [
    "Dharamshala and pilgrim stay", "Lodge and budget guest house", "Boutique and heritage hotel", "Resort and spa", "Camping, tents and glamping",
    "Houseboat and cruise", "Homestay and farm stay", "Travel agent and tour operator", "Pilgrimage and religious tour operator", "Adventure and trekking operator",
    "Visa and passport services", "Railway and bus ticketing agent", "Airline ticketing and GSA", "Hotel booking and aggregator", "Tour guide and local guide",
    "Catering and mess services", "Tiffin and dabba service", "Banquet and party hall", "Sweet and snack shop", "Bakery and cafe",
    "Dhaba and highway eatery", "Food-truck and cloud kitchen", "Bar, pub and nightclub", "Airport and railway-station food counters",
  ],
  "Information Technology & Software": [
    "Web design and development agency", "Custom software for small business", "IT consulting and staffing", "Data-entry and BPO services", "SaaS product company",
    "AR/VR and 3D studio", "UI/UX design studio", "SEO and digital marketing technology", "Cloud hosting and domain reseller", "Computer sales and service",
    "Networking and structured cabling", "Managed IT services provider", "Cybersecurity services", "Data analytics and AI consulting", "IoT and embedded solutions",
    "QA and software testing", "E-commerce platform development", "Telecom and VoIP software", "Edtech and learning platforms", "Healthtech and fintech products",
    "Open-source and developer tools", "Freelance developers and consultants",
  ],
  "Media, Publishing & Entertainment": [
    "Local cable channel and news portal", "Television channel and production", "Film production and distribution", "Cinema and single-screen theatre", "OTT and streaming platform",
    "Radio and FM station", "Music label and recording studio", "Photo and video studio", "News agency and stringers", "Book publishing and distribution",
    "Comic, animation and VFX studio", "Event and stage production", "Influencer and talent management", "Digital content and YouTube channels", "Dubbing and subtitling",
    "Outdoor media and hoardings", "Printing and pre-press", "Film-equipment rental",
  ],
  "Telecommunications": [
    "Mobile network operator", "Internet service provider (ISP)", "Local cable and broadband operator", "Mobile tower and infrastructure", "Fibre and last-mile provider",
    "Satellite and VSAT services", "SIM and recharge distributor", "Telecom equipment dealer", "Call centre and contact centre", "VoIP and cloud telephony",
    "IoT connectivity services", "Public Wi-Fi and hotspot operator", "Telecom contractor and installer",
  ],
  "Banking & Financial Services": [
    "Commercial and cooperative bank", "Small-finance and payments bank", "Non-banking finance company (NBFC)", "Microfinance institution", "Gold-loan company",
    "Stock broking and depository participant", "Mutual-fund and portfolio management", "Wealth and financial advisory", "Forex and money transfer", "Payment gateway and fintech",
    "Credit bureau and rating", "Asset reconstruction", "Pension and provident-fund services", "Chit funds and nidhi companies", "Venture capital and angel network",
    "Crowdfunding platform", "Banking correspondent and business facilitator",
  ],
  "Insurance & Pensions": [
    "Life insurance company and agent", "General insurance company and agent", "Insurance broker and POSP", "Crop and livestock insurance", "Surveyor and loss assessor",
    "Pension fund manager", "Micro-insurance provider", "Insurance claims and aggregator platform",
  ],
  "Real Estate": [
    "Property broker and dealer", "Rental and PG management", "Facility and society management", "Property valuation", "Co-working and serviced office",
    "Warehouse and industrial-shed leasing", "Farmland and agricultural-land sales", "Timeshare and holiday homes", "Real-estate investment trust (REIT)", "Land-records and documentation services",
    "Property portal and listing platform", "Vastu and interior consultants", "Housing cooperative society",
  ],
  "Legal, Accounting & Consulting": [
    "Advocate and law chamber", "Notary and oath commissioner", "Document writer and deed writer", "Chartered accountant and tax practice", "GST and ITR practitioner",
    "Company registration and compliance", "Trademark and patent agent", "Labour-law and payroll compliance", "Arbitration and mediation", "Management and HR consulting",
    "Business-plan and project-report consultant", "Loan and subsidy consultant", "Export-import and licensing consultant", "Quality and ISO certification consultants", "Environmental and safety consultancy",
    "Legal process outsourcing", "Court-fee and stamp-paper vendor", "Public-relations and corporate communications", "Startup incubator and mentor",
  ],
  "Architecture, Engineering & Design": [
    "Architect and building designer", "Mechanical and electrical consultants", "Interior designer and decorator", "Landscape architect", "Town planner and surveyor",
    "Draftsman and CAD services", "3D rendering and walkthrough", "Fashion and textile designer", "Graphic and brand designer", "Packaging designer",
    "Testing and inspection laboratory", "Quality and third-party inspection agency", "Geotechnical and soil-investigation services", "Energy-efficiency and green-building consultants", "Mining and geology consultants",
    "Drone survey and mapping",
  ],
  "Research & Development": [
    "Scientific research institute", "Contract research organisation", "Agricultural and horticultural research", "Social-science and policy research", "Market and opinion survey",
    "Clinical and bio research", "Materials and nano research", "Space and defence research", "Innovation lab and incubator", "Testing and calibration lab",
  ],
  "Advertising, Marketing & Market Research": [
    "Advertising agency", "Social-media management", "Influencer marketing", "Outdoor and hoarding advertising", "Wall painting and local advertising",
    "Print and flyer distribution", "Radio and cinema advertising", "Promotional gifts and merchandise", "Event and activation marketing", "Direct marketing and telemarketing",
    "Brand consulting and PR", "Market-research and survey agency", "Mobile and SMS marketing", "Loyalty and coupon programmes", "Sampling and in-store promotion",
    "Vehicle and bus branding", "Flex, sign-board and LED-display makers", "Affiliate and performance marketing",
  ],
  "Other Professional & Technical Services": [
    "Astrology and vastu consultancy", "Detective and investigation services", "Testing and certification", "Specialised design services", "Consulting engineers",
    "Auction and valuation services", "Handwriting and forensic experts", "Weather and geospatial data services", "Patent drafting and IP search", "Professional photo labs",
    "Notary and attestation services",
  ],
  "Staffing & Business Support": [
    "Manpower and labour contractor", "Payroll and HR outsourcing", "Security-guard and housekeeping contractor", "Data entry and transcription", "Courier and document delivery",
    "Photocopy, printing and typing", "Business-centre and virtual office", "Telemarketing and lead generation", "Debt collection and recovery", "Tender and bid-support services",
    "Packing and kitting services", "Travel desk and corporate travel", "Event staffing and promoters", "Facility and canteen management", "Gig-platform and freelancer marketplace",
    "Translation and back-office support", "Office-supplies and equipment rental", "Bill-collection and field-agent services",
  ],
  "Security & Facility Services": [
    "Armed-guard and cash-in-transit", "Bouncer and event-security services", "Fire-safety equipment and training", "Housekeeping and janitorial", "Facility-management companies",
    "Canteen and pantry services", "Lift and escalator maintenance", "Private detective and surveillance", "Cyber and physical-security consultants",
  ],
  "Government & Public Administration": [
    "Gram panchayat and local body", "Municipal corporation and council", "District and tehsil offices", "Fire and emergency services", "Courts and tribunals",
    "Public sector department", "Public-sector bank and insurer", "Public utility board", "Defence and armed forces canteens", "Election and civic bodies",
    "Government hospital", "Regulatory authority", "Embassy and consulate", "Government training institute", "Anganwadi and ICDS",
    "Employment exchange", "Cooperative department", "Tourism and culture department",
  ],
  "Social Care, NGOs & Associations": [
    "NGO and charitable trust", "Orphanage and child-care home", "Shelter and rehabilitation", "Disability support centre", "Women's empowerment organisation",
    "Community kitchen and food bank", "Blood bank and health-camp organisers", "Trade association and chamber of commerce", "Professional body and union", "Welfare society (RWA)",
    "Religious and faith-based charity", "Animal rescue and shelter", "Environment and conservation group", "Refugee and migrant support", "Counselling and helpline",
    "Foundation and CSR implementing agency",
  ],
  "Arts, Sports & Recreation": [
    "Art gallery and museum", "Theatre and drama group", "Dance and music troupe", "Folk and street performers", "Circus and magic shows",
    "Library and reading room", "Zoo, park and botanical garden", "Amusement and water park", "Gymnasium and fitness club", "Yoga and meditation retreats",
    "Lottery and gaming outlets", "Betting and fantasy sports", "Billiards, snooker and indoor games", "Adventure sports and trekking", "Fishing and angling clubs",
    "Cultural and heritage societies", "Studio and rehearsal spaces",
  ],
};

/** A deeper pass over the local-shop categories, appended after `EXTRA_MORE`. */
const EXTRA_LOCAL: Record<string, string[]> = {
  "Restaurants, Cafes & Eateries": [
    "Pav-bhaji and misal outlet", "Litti-chokha and regional-cuisine eatery", "Idli, dosa and filter-coffee shop", "Kulfi, falooda and lassi shop", "Sugarcane-juice and nariyal-pani stall",
    "Jalebi, samosa and kachori shop", "Poha, paratha and breakfast joint", "Roll, kebab and tikka outlet", "Rajasthani, Gujarati and Punjabi thali", "Bengali, Assamese and North-East cuisine",
    "Kerala and Andhra mess", "Halwai and sweet-maker", "Soup and healthy-bowl outlet", "Pet-friendly and board-game cafe", "Hostel and college canteen",
    "Railway and bus-stand canteen", "Tea-and-snacks kiosk (chai tapri)", "Home-delivery-only kitchen", "Catering contractor for offices", "Farm-to-table and organic cafe",
  ],
  "Beauty Parlours, Salons & Personal Care": [
    "Home-visit beautician", "Bridal and party makeup artist", "Men's grooming and beard studio", "Kids' salon", "Ayurvedic and herbal spa",
    "Hair-colour and rebonding studio", "Henna and mehndi art", "Eyebrow and eyelash studio", "Foot-care and pedicure", "Cosmetic-dental and smile studio",
    "Beauty-product distributor and franchise",
  ],
  "Clothing, Footwear & Fashion Shops": [
    "Cloth-and-tailoring combined shop", "Burqa, hijab and modest wear", "School and college uniform shop", "Winter, shawl and blanket seller", "Saree-falls, pico and blouse stitching",
    "Dupatta and stole shop", "Wedding lehenga and sherwani rental", "Khadi and gandhi-ashram shop", "Tribal and ethnic-wear store", "Baby and newborn clothing",
    "Socks, vests and hosiery shop", "Leather jackets and accessories", "Cap, belt and wallet shop", "Chappal and sandal shop", "Safety shoes and workwear shop",
  ],
  "Electronics, Mobile & Computer Shops": [
    "Used-mobile buy and sell", "Mobile-screen and battery replacement", "Laptop and desktop rental", "Inverter and solar-lantern dealer", "Electric-fan and cooler dealer",
    "Water-heater and geyser dealer", "Gas-stove and kitchen-appliance dealer", "Sewing-machine dealer", "Mixer-grinder and small appliances", "Speaker, DJ and PA-system dealer",
    "Walkie-talkie and two-way radio dealer", "Biometric and attendance-device dealer", "Point-of-sale and billing-machine dealer", "Fax, photocopier and office-machine dealer", "Gadget repair and chip-level service",
  ],
  "Hardware, Building Materials & Home Furnishing Shops": [
    "Tools and power-tool rental", "Welding rod and electrode dealer", "Wire, cable and switch dealer", "Water-tank and pipe dealer", "Borewell pipe and pump dealer",
    "Tarpaulin and plastic-sheet shop", "Rope, chain and net shop", "Wood and bamboo depot", "Brick and stone yard", "Marble and granite polishing",
    "Aluminium and UPVC window fabricator", "Grill, gate and shutter fabricator", "Kitchen-sink and chimney dealer", "Paint-mixing and colour centre", "Bathroom and sanitary showroom",
    "Gypsum and POP supplier", "Hardware for furniture (fittings)",
  ],
  "Tuition, Coaching & Local Education": [
    "Group tuition at home", "Math and science tutor", "Commerce and CA-foundation coaching", "Government-exam coaching (SSC, railway, police)", "Army and police physical training",
    "Nursing-entrance and paramedical coaching", "Teacher-training (D.El.Ed, B.Ed) coaching", "Handwriting and calligraphy classes", "Public-speaking and communication classes", "Stitching, knitting and craft classes",
    "Mehndi and beauty classes", "Mobile-repair and electronics training", "AC, refrigerator and electrician training", "Drone-pilot and robotics training", "Tally, GST and accounting classes",
    "Bank-PO and insurance-exam coaching", "Online live-class and recorded-course seller",
  ],
  "Hotels, Lodging, Weddings & Event Services": [
    "Pilgrim guest house near temple", "Business hotel", "Jungle lodge and eco-resort", "Hill-station cottage", "Beach shack and hut",
    "Wedding-mandap and stage maker", "Pandit and wedding-ritual services", "Wedding card and invitation designer", "Bridal jewellery and wedding-wear rental", "Mehendi-sangeet and choreography",
    "Anchor, emcee and performer booking", "Balloon and party decoration", "Birthday and baby-shower planner", "Corporate-event and conference organiser", "Exhibition-stall and trade-fair builder",
    "Crowd-barricade and generator supplier",
  ],
  "Taxis, Vehicles & Local Transport Businesses": [
    "Cab aggregator driver-partner", "Airport-transfer and outstation cabs", "Tourist-bus and tempo-traveller operator", "Sleeper-bus and travel-agency counter", "Truck-booking and transport agent",
    "Container and trailer operator", "Car-pooling and ride-sharing", "Electric-scooter and bike-sharing", "Fleet-management and GPS tracking", "School-van and pick-and-drop",
    "Garbage-truck and municipal vehicle contractor", "Ambulance and mortuary-van operator", "Petrol-pump attendant and convenience store", "Two-wheeler-taxi and delivery rider", 
  ],
  "Gyms, Sports Clubs & Recreation (Local)": [
    "Akhara and traditional wrestling", "Kabaddi and kho-kho academy", "Hockey and athletics academy", "Shooting range and archery club", "Table-tennis and carrom club",
    "Cricket-turf and box-cricket arena", "Aqua-park and swimming academy", "Kids' sports and activity camp", "Bodybuilding and powerlifting gym", "Women-only gym and fitness studio",
    "Pickleball and padel courts", "Video-game parlour and LAN cafe", "Lottery and ticket counter", "Fair, circus and mela ground", "Fishing-pond and angling spot",
  ],
  "Professional Practices & Local Offices": [
    "Typing and stamp-paper vendor", "Court-clerk and legal-documentation", "Tax-return and form-filling centre", "Vakil and tehsil-court practitioner", "Property-document and mutation agent",
    "Passport and visa agent", "Insurance-claim and TPA desk", "Engineer and contractor office", "Veterinary and livestock-consultant", "Agri-consultant and crop-doctor",
    "Astro-vastu and gem-stone consultant", "Handwriting and graphology expert", "Immigration-IELTS consultancy", "Photo-studio and album designer", "Career and counselling centre",
    "Auction, valuation and brokerage firm",
  ],
  "Specialty & Hobby Shops": [
    "Puja-samagri and pandit supplies", "Idol and murti shop", "Rudraksha and gemstone shop", "Herbs and jadi-buti shop", "Unani and tibb medicine shop",
    "Honey and natural-products store", "Sports and gym-equipment dealer", "Cycle and fitness equipment", "Crockery and gift-set store", "Aquarium and bird-cage shop",
    "Seeds and gardening-tool shop", "Home-brewing and winemaking supplies", "Camping and trekking gear shop", "Vintage and antique shop", "Cake-baking and cookie-making supplies",
    "Craft-kit and DIY store", "Fancy and artificial-jewellery shop", "Local-art and souvenir shop",
  ],
  "Community, Public & Faith Places": [
    "Temple trust and mandir committee", "Gurdwara and langar seva", "Masjid and waqf board", "Church and mission", "Dargah and shrine",
    "Jain and Buddhist temple", "Cremation and burial ground trust", "Community hall and function hall", "Village library and reading room", "Public water tank and prau",
    "Playground and park committee", "Cultural and festival committee (Ganesh, Durga, Ram-lila)", "Youth and sports club", "Mahila mandal and women's group", "Panchayat bhawan",
    "Cattle pound and goshala trust",
  ],
  "Other / Not Listed": [
    "Multiple businesses under one owner", "Seasonal or part-time business", "Business not yet started (planning stage)", "Hobby business turning commercial", "Family business, second generation",
    "Other local trade not listed",
  ],
  "Personal & Household Services": [
    "Bridal and event photographers", "Child-care and day-care at home", "Elderly care-taker and attendant", "Domestic cook and maid agency", "Gardener and mali",
    "Cleaning and sweeping contractor", "Car and bike washing at home", "Home-nurse and patient attendant", "Pet sitter and dog walker", "Personal driver and chauffeur",
    "Water-tanker and ration delivery", "Tiffin and milk delivery", "Sewage and septic cleaning", "Home tutor and caregiver",
  ],
};

/** A worldwide pass: the full ISIC Rev. 4 activity list and common trades of every region, appended after `EXTRA_LOCAL`. */
const EXTRA_WORLD: Record<string, string[]> = {
  "Agriculture, Forestry & Fishing": [
    "Growing of rice", "Growing of wheat, maize and other cereals", "Growing of vegetables and melons", "Growing of sugar cane", "Growing of tobacco",
    "Growing of fibre crops (cotton, jute, flax, hemp)", "Growing of grapes and vineyards", "Growing of tropical and subtropical fruits", "Growing of citrus fruits", "Growing of apples, pears and stone fruits",
    "Growing of berries and nuts", "Growing of oleaginous fruits (olives, palm, coconut)", "Growing of beverage crops (tea, coffee, cocoa, mate)", "Growing of spices and aromatic crops", "Growing of pharmaceutical and herbal crops",
    "Growing of roots and tubers", "Cattle and buffalo raising", "Raising of horses and equines", "Raising of camels and camelids", "Raising of sheep and goats",
    "Raising of swine", "Raising of poultry", "Raising of fur animals and rabbits", "Raising of insects and edible-insect farming", "Mixed crop and animal farming",
    "Support activities for crop production", "Support activities for animal production", "Seed processing for propagation", "Hunting, trapping and game reserves", "Silviculture and forest nurseries",
    "Logging and timber harvesting", "Gathering of wild growing non-wood products (mushrooms, berries, resins)", "Support services to forestry", "Marine aquaculture", "Freshwater aquaculture",
    "Fish and shellfish hatcheries", "Pearl and sponge cultivation", "Vineyard and wine-grape contracting", "Sheep-shearing and farm contracting services", "Rural land stewardship and conservation farming",
    "Agritourism and farm shops", "Community-supported agriculture (CSA)", "Urban rooftop and community gardens",
  ],
  "Mining & Quarrying": [
    "Hard-coal mining", "Extraction of crude petroleum", "Extraction of natural gas", "Mining of iron ores", "Mining of uranium and thorium ores",
    "Mining of copper, lead, zinc and tin ores", "Mining of precious-metal ores", "Mining of nickel, cobalt and lithium", "Quarrying of ornamental and building stone", "Quarrying of limestone, gypsum and chalk",
    "Quarrying of slate", "Mining of chemical and fertilizer minerals", "Extraction of peat", "Extraction of salt", "Gem and semi-precious-stone mining",
    "Artisanal and small-scale mining", "Oil and gas well drilling contractors", "Oilfield services and equipment", "Mining exploration and geophysical surveys", "Mine construction and shaft sinking",
    "Tailings and mine-waste reprocessing", "Offshore drilling and platform services",
  ],
  "Food, Beverage & Tobacco Manufacturing": [
    "Processing and preserving of meat", "Processing of poultry and eggs", "Processing and preserving of fish, crustaceans and molluscs", "Processing and preserving of fruit and vegetables", "Manufacture of vegetable and animal oils and fats",
    "Manufacture of dairy products", "Manufacture of grain-mill products", "Manufacture of starches and starch products", "Manufacture of bakery products", "Manufacture of sugar",
    "Manufacture of cocoa, chocolate and sugar confectionery", "Manufacture of macaroni, noodles and couscous", "Processing of tea and coffee", "Manufacture of condiments, sauces and seasonings", "Manufacture of prepared meals and dishes",
    "Manufacture of homogenised food and dietetic preparations", "Manufacture of prepared animal feeds and pet food", "Distilling, rectifying and blending of spirits", "Manufacture of wines", "Manufacture of beer and malt",
    "Manufacture of soft drinks and mineral waters", "Manufacture of cigarettes and cigars", "Manufacture of vinegar, yeast and food additives", "Artisan cheese, charcuterie and cured meats", "Craft brewery, distillery and cidery",
    "Kombucha, cold-pressed juice and functional drinks", "Plant-based and alternative-protein foods", "Insect-based and novel foods",
  ],
  "Textiles, Apparel & Leather": [
    "Preparation and spinning of textile fibres", "Weaving of textiles", "Finishing of textiles", "Manufacture of knitted and crocheted fabrics", "Manufacture of carpets and rugs",
    "Manufacture of cordage, rope, twine and netting", "Manufacture of non-wovens", "Manufacture of wearing apparel (except fur)", "Manufacture of articles of fur", "Manufacture of knitted and crocheted apparel",
    "Tanning and dressing of leather", "Manufacture of luggage, handbags and saddlery", "Manufacture of footwear", "Manufacture of made-up textile articles (curtains, linen, blankets)", "Manufacture of fishing nets and sailcloth",
    "Sustainable and recycled-fibre fashion", "Custom and made-to-measure tailoring", "Cut-make-trim (CMT) garment contractors", "Textile printing and sublimation", "Uniform and workwear suppliers",
    "Embroidery and monogram services", "Hat, cap and glove makers", "Lace and ribbon makers", "Traditional dress makers (kimono, sari, kaftan, dirndl, hanbok)",
  ],
  "Wood, Paper & Printing": [
    "Sawmilling and planing of wood", "Manufacture of veneer sheets and wood-based products", "Manufacture of builders' carpentry and joinery", "Manufacture of wooden containers and pallets", "Manufacture of cork and straw products",
    "Manufacture of pulp", "Manufacture of paper and paperboard", "Manufacture of corrugated paper and containers", "Manufacture of household and sanitary paper", "Manufacture of paper stationery",
    "Manufacture of wallpaper", "Printing of newspapers", "Other printing", "Pre-press and pre-media services", "Binding and related services",
    "Bookbinding and restoration", "Woodworking and cabinet-making shops", "Log-home and timber-frame builders",
  ],
  "Chemicals, Pharmaceuticals & Plastics": [
    "Manufacture of basic chemicals", "Manufacture of fertilizers and nitrogen compounds", "Manufacture of plastics and synthetic rubber in primary forms", "Manufacture of pesticides and agrochemical products", "Manufacture of paints, varnishes and printing ink",
    "Manufacture of soap, detergents and cleaning preparations", "Manufacture of perfumes and toilet preparations", "Manufacture of explosives", "Manufacture of essential oils", "Manufacture of photographic chemicals",
    "Manufacture of man-made fibres", "Manufacture of pharmaceutical preparations", "Manufacture of medicinal chemicals and botanical products", "Manufacture of rubber tyres and tubes", "Retreading and rebuilding of tyres",
    "Manufacture of other rubber products", "Manufacture of plastic plates, sheets, tubes and profiles", "Manufacture of plastic packing goods", "Manufacture of builders' ware of plastic", "Manufacture of glass and glass products",
    "Manufacture of refractory products", "Manufacture of clay building materials", "Manufacture of ceramics and porcelain", "Manufacture of cement, lime and plaster", "Manufacture of concrete, cement and plaster articles",
    "Cutting, shaping and finishing of stone", "Manufacture of abrasive products", "Manufacture of mineral wool and insulation", "Biodegradable and compostable plastics", "Bioplastics and green chemistry",
    "Specialty and fine chemicals", "Flavours and fragrances", "Adhesive tapes and labels", "Lubricants and greases blending", "Water-treatment and swimming-pool chemicals",
    "Industrial coatings and powder coatings",
  ],
  "Metals, Machinery & Equipment": [
    "Manufacture of basic iron and steel", "Manufacture of precious and non-ferrous metals", "Casting of iron, steel and light metals", "Manufacture of structural metal products", "Manufacture of tanks, reservoirs and containers of metal",
    "Manufacture of steam generators", "Forging, pressing, stamping and roll-forming of metal", "Treatment and coating of metals", "Machining", "Manufacture of cutlery, hand tools and general hardware",
    "Manufacture of weapons and ammunition", "Manufacture of engines and turbines", "Manufacture of fluid-power equipment", "Manufacture of other pumps, compressors, taps and valves", "Manufacture of bearings, gears and driving elements",
    "Manufacture of ovens, furnaces and burners", "Manufacture of lifting and handling equipment", "Manufacture of office machinery and equipment", "Manufacture of power-driven hand tools", "Manufacture of cooling and ventilation equipment",
    "Manufacture of agricultural and forestry machinery", "Manufacture of metal-forming machinery and machine tools", "Manufacture of machinery for metallurgy", "Manufacture of mining and construction machinery", "Manufacture of food, beverage and tobacco processing machinery",
    "Manufacture of textile, apparel and leather machinery", "Manufacture of machinery for paper and printing", "Manufacture of plastics and rubber machinery", "Manufacture of electric motors, generators and transformers", "Manufacture of electricity distribution and control apparatus",
    "Manufacture of batteries and accumulators", "Manufacture of wiring devices and fibre-optic cables", "Manufacture of electric lighting equipment", "Manufacture of domestic appliances", "Manufacture of non-electric domestic appliances",
    "Industrial 3D metal printing", "Metal recycling and secondary smelting", "Welding supplies and gases", "Precision engineering and toolmaking", "Industrial painting and galvanizing",
    "Heat treatment and plating shops",
  ],
  "Electronics, Computers & Optical": [
    "Manufacture of electronic components", "Manufacture of loaded electronic boards", "Manufacture of computers and peripheral equipment", "Manufacture of communication equipment", "Manufacture of consumer electronics",
    "Manufacture of measuring, testing and navigation instruments", "Manufacture of watches and clocks", "Manufacture of irradiation and electromedical equipment", "Manufacture of optical instruments and photographic equipment", "Manufacture of magnetic and optical media",
    "Manufacture of semiconductors and photovoltaic cells", "Manufacture of sensors and transducers", "Manufacture of display products and LED screens", "Manufacture of wearables and smart devices", "Manufacture of radar, sonar and navigation systems",
    "Manufacture of 3D printers and scanners", "Manufacture of robots and cobots", "Manufacture of electric-vehicle chargers", "Manufacture of smart meters", "Manufacture of telecom handsets and routers",
    "Electronics repair and refurbishment", "Electronics design services and EMS", "Calibration and test-equipment service",
  ],
  "Automotive & Transport Equipment": [
    "Manufacture of motor vehicles", "Manufacture of bodies, trailers and semi-trailers", "Manufacture of parts and accessories for motor vehicles", "Building of ships and floating structures", "Building of pleasure and sporting boats",
    "Manufacture of railway locomotives and rolling stock", "Manufacture of air and spacecraft and related machinery", "Manufacture of military fighting vehicles", "Manufacture of motorcycles", "Manufacture of bicycles and invalid carriages",
    "Manufacture of other transport equipment", "Electric bus and truck manufacturing", "Battery-pack and EV-powertrain assembly", "Autonomous-vehicle technology", "Hydrogen and fuel-cell vehicles",
    "Caravan, camper and motorhome builders", "Ambulance and special-purpose vehicle builders", "Aircraft interiors and avionics suppliers", "Marine engines and propulsion", "Vehicle customisation and tuning",
  ],
  "Furniture & Other Manufacturing": [
    "Manufacture of furniture", "Manufacture of jewellery and related articles", "Manufacture of imitation jewellery", "Manufacture of musical instruments", "Manufacture of sports goods",
    "Manufacture of games and toys", "Manufacture of medical and dental instruments and supplies", "Manufacture of brooms and brushes", "Manufacture of pens, pencils and art materials", "Manufacture of candles, signs and novelties",
    "Manufacture of coins and medals", "Manufacture of mattresses", "Manufacture of office and shop furniture", "Manufacture of kitchen furniture", "Repair of fabricated metal products",
    "Repair and installation of machinery and equipment", "Repair of electronic and optical equipment", "Installation of industrial machinery", "Custom furniture and woodwork studios", "Antique restoration and upholstery",
    "Luthiers and instrument repair", "Prosthetics and orthotics manufacturing", "Dental laboratories", "Eyeglass labs and optical finishing", "Props, costumes and set fabrication",
  ],
  "Energy & Utilities": [
    "Electric power generation (thermal, hydro, nuclear, solar, wind)", "Electric power transmission", "Electric power distribution", "Trade of electricity (retail and brokers)", "Manufacture of gas and gas distribution through mains",
    "Steam and air-conditioning supply (district heating and cooling)", "Refined petroleum products and refinery", "Biofuels, ethanol and biodiesel", "Geothermal energy", "Tidal and wave energy",
    "Microgrids and off-grid energy services", "Community energy cooperatives", "Pellet, briquette and biomass fuel", "LPG and kerosene dealers", "Coal and coke distribution",
    "Energy trading and power exchanges", "Smart-meter and demand-response services", "Home solar kits and pay-as-you-go energy", "Diesel generator rental and mini-grid operators", "Hydrogen production and distribution",
  ],
  "Water, Waste & Environment": [
    "Sewerage", "Collection of non-hazardous waste", "Collection of hazardous waste", "Treatment and disposal of non-hazardous waste", "Treatment and disposal of hazardous waste",
    "Materials recovery", "Remediation of contaminated land and groundwater", "Asbestos and lead abatement", "Septic and sanitation services", "Rainwater, well and spring water supply",
    "Waste-picker and informal recycling cooperatives", "Composting and organic-waste processing", "Used-cooking-oil collection", "Tyre and rubber recycling", "Textile and clothing recycling",
    "Construction and demolition waste recycling", "Marine and river clean-up", "Environmental impact assessment", "Wildlife, nature-reserve and conservation management", "Carbon offset and nature-based solutions",
    "Public toilets and sanitation franchise",
  ],
  "Construction & Infrastructure": [
    "Development of building projects", "Construction of residential and non-residential buildings", "Construction of roads and railways", "Construction of utility projects (pipelines, power lines)", "Construction of water projects",
    "Construction of telecom and communication lines", "Other construction installation", "Building completion and finishing (plastering, joinery, flooring, painting, glazing)", "Roofing activities", "Scaffold erection and dismantling",
    "Specialised construction (foundations, piling, well drilling)", "Concrete work and bricklaying", "Steel erection", "Specialised tunnelling and underground works", "Port, harbour and jetty construction",
    "Airport and runway construction", "Dam, canal and irrigation construction", "Self-build and owner-builder supplies", "Heritage restoration and conservation building", "Timber-frame, log and bamboo construction",
    "Earthen, rammed-earth and low-cost housing", "Modular and container buildings", "Glass facade and curtain-wall installation", "Swimming-pool and landscape construction", "Fencing, gates and boundary-wall contractors",
    "Road marking and traffic-safety installation",
  ],
  "Wholesale Trade": [
    "Wholesale on a fee or contract basis", "Wholesale of agricultural raw materials and live animals", "Wholesale of food, beverages and tobacco", "Wholesale of textiles, clothing and footwear", "Wholesale of household goods",
    "Wholesale of information and communication equipment", "Wholesale of other machinery, equipment and supplies", "Wholesale of metals and metal ores", "Wholesale of wood, construction materials and sanitary equipment", "Wholesale of hardware, plumbing and heating equipment",
    "Wholesale of solid, liquid and gaseous fuels", "Wholesale of chemical products", "Wholesale of waste and scrap", "Non-specialised wholesale trade", "Wholesale of cut flowers and plants",
    "Wholesale of perfumery and cosmetics", "Wholesale of pharmaceutical and medical goods", "Wholesale of watches and jewellery", "Wholesale of recorded music, video and games", "Wholesale of seeds and agricultural inputs",
    "Wholesale of bicycles and spare parts", "Wholesale of second-hand goods", "Trade houses and sourcing agents", "Cash-and-carry and wholesale cooperatives", "Souk, bazaar and covered-market traders",
    "Container-load and bulk commodity brokers",
  ],
  "Retail Trade": [
    "Retail sale in non-specialised stores with food predominating", "Retail sale in non-specialised stores without food", "Retail sale of fruit and vegetables in specialised stores", "Retail sale of meat and meat products", "Retail sale of fish, crustaceans and molluscs",
    "Retail sale of bread, cakes and confectionery", "Retail sale of beverages", "Retail sale of tobacco products", "Retail sale of automotive fuel in specialised stores", "Retail sale of computers, peripherals and software",
    "Retail sale of telecommunications equipment", "Retail sale of audio and video equipment", "Retail sale of hardware, paints and glass", "Retail sale of carpets, rugs and wall coverings", "Retail sale of electrical household appliances",
    "Retail sale of books", "Retail sale of newspapers and stationery", "Retail sale of music and video recordings", "Retail sale of sporting equipment", "Retail sale of games and toys",
    "Retail sale of clothing", "Retail sale of footwear and leather goods", "Retail sale of pharmaceutical and medical goods", "Retail sale of cosmetic and toilet articles", "Retail sale of flowers, plants, seeds and fertilizers",
    "Retail sale of pet animals and pet food", "Retail sale of watches and jewellery", "Retail sale of second-hand books", "Retail sale of antiques and second-hand goods", "Retail sale via stalls and markets (food, textiles, others)",
    "Retail sale via mail order or internet", "Retail sale via vending machines", "Door-to-door and direct selling", "Multi-level marketing and network selling", "Teleshopping and live-commerce",
    "Bodega and corner shop", "Souvenir, duty-free and gift shops", "Farmers' market and food co-op", "Pop-up shops and market stalls", "Convenience-store franchisee",
    "Hardware and DIY megastore", "Home-improvement and garden centre", "Optician and eye-wear retail", "Mom-and-pop shop", "Trading post and village shop",
    "Tuck shop, canteen and school store",
  ],
  "Motor Vehicle Sales & Services": [
    "Sale of new and used motor vehicles", "Maintenance and repair of motor vehicles", "Sale of motor-vehicle parts and accessories", "Sale, maintenance and repair of motorcycles", "Sale of trucks, buses and heavy vehicles",
    "Sale of caravans and recreational vehicles", "Boat and marina dealers", "Vehicle auction and remarketing", "Vehicle-history and inspection services", "Car-sharing and subscription fleets",
    "Fleet-management and leasing", "Windscreen and glass repair", "Car-audio, tinting and wrapping", "Paintless dent and mobile valeting", "Taxi-meter and vehicle-tracking installers",
    "Parking structures and garage operators",
  ],
  "Transport & Logistics": [
    "Passenger rail transport, interurban", "Urban and suburban passenger land transport", "Taxi operation", "Other passenger land transport (coaches, shuttles)", "Freight transport by road",
    "Removal services", "Transport via pipeline", "Sea and coastal passenger water transport", "Sea and coastal freight water transport", "Inland passenger and freight water transport",
    "Freight air transport", "Space transport and launch services", "Support activities for land transport (terminals, toll roads, parking)", "Support activities for water transport (ports, pilotage, towage)", "Support activities for air transport (airports, air-traffic control)",
    "Cargo handling", "Freight forwarding, customs brokerage and NVOCC", "Postal activities under universal service obligation", "Courier activities", "Last-mile and gig delivery",
    "Cycle couriers and cargo bikes", "Motorcycle taxis and rickshaws", "Horse-drawn carriages and tourist rides", "Cable cars, funiculars and ski lifts", "Ferries, water taxis and tenders",
    "Toll-road and bridge operators", "Bus terminals and train stations operators", "Vehicle shipping and car carriers", "Heavy-lift and oversized-load haulage", "Tank-truck and bulk-liquid haulage",
    "Refrigerated and perishable-goods transport", "Hazmat and dangerous-goods transport", "Medical and organ transport services", "Armoured and cash-in-transit vehicles", "Pipeline and utility inspection services",
    "Freight marketplaces and digital forwarders", "Ship agents and chandlers", "Yacht and superyacht services", "Pilgrim, hajj and umrah transport",
  ],
  "Hospitality, Travel & Food Service": [
    "Short-term accommodation (hotels, motels, inns)", "Holiday and other short-stay accommodation", "Camping grounds, RV parks and trailer parks", "Other accommodation (student residences, workers' hostels)", "Restaurants and mobile food-service activities",
    "Event catering", "Other food-service activities (contract catering)", "Beverage-serving activities (bars, taverns, cafes)", "Travel agency activities", "Tour-operator activities",
    "Other reservation service activities", "Tourist information and visitor centres", "Tour guides and interpreters", "Capsule, pod and micro hotels", "Ryokan, riad, haveli and heritage stays",
    "Boutique hostels and guest houses", "Treehouse, igloo and unique stays", "Ski lodges and mountain huts", "Safari lodges and tented camps", "Cruise-ship and river-cruise operators",
    "Casino resorts and integrated resorts", "Wellness, yoga and Ayurveda retreats", "Medical and dental tourism facilitators", "Student-travel and gap-year programmes", "Honeymoon and destination-wedding planners",
    "Hospitality staffing and training", "Hotel revenue-management and distribution", "Restaurant technology and POS", "Ghost kitchens and delivery brands", "Street-food markets and night bazaars",
    "Tea houses, izakayas, tavernas and trattorias", "Pubs, taprooms and wine bars", "Tavern, shebeen and cantina", "Pizza, kebab and fast-food franchisee", "Bubble-tea and dessert chains",
    "Airline and railway catering", "Vending-machine food services", "School and hospital catering", "Military and remote-site catering",
  ],
  "Information Technology & Software": [
    "Publishing of computer games", "Other software publishing", "Computer programming activities", "Computer consultancy activities", "Computer facilities management activities",
    "Other IT and computer service activities", "Data processing, hosting and related activities", "Web portals", "Wired, wireless and satellite telecommunications", "Software testing and quality assurance",
    "Enterprise resource planning (ERP) vendors", "Customer-relationship management (CRM) vendors", "Human-resources and payroll software", "Accounting and tax software", "Point-of-sale and retail software",
    "Hotel, restaurant and travel software", "School, college and learning-management software", "Hospital, clinic and pharmacy software", "Legal, real-estate and construction software", "Logistics and fleet software",
    "Agri-tech and farm-management software", "Government and civic technology", "Open banking and payments APIs", "Low-code, no-code and RPA", "Digital identity and e-KYC",
    "Digital signatures and document management", "Video-conferencing and collaboration tools", "Search, maps and location services", "Voice, speech and translation technology", "Edge computing and 5G applications",
    "Digital twins and simulation", "Mobile-app stores and app studios", "Browser extensions, plugins and themes", "WordPress, Shopify and Wix agencies", "IT training, certification and bootcamps",
    "Hardware resellers and value-added resellers (VARs)", "Managed print and office IT", "Computer recycling and refurbishment",
  ],
  "Media, Publishing & Entertainment": [
    "Publishing of directories and mailing lists", "Publishing of newspapers", "Publishing of journals and periodicals", "Motion-picture, video and television programme production", "Motion-picture, video and television post-production",
    "Motion-picture distribution", "Motion-picture projection", "Sound-recording and music publishing", "Television programming and broadcasting", "News-agency activities",
    "Library and archive activities", "Museum activities and historical sites", "Botanical and zoological gardens and nature reserves", "Creative, arts and entertainment activities", "Operation of arts facilities",
    "Gambling and betting activities", "Sports activities", "Amusement and recreation activities", "Podcast networks and audio platforms", "Streaming and video-on-demand platforms",
    "Video-game streaming and esports media", "Short-video and social platforms", "E-books, audiobooks and digital publishing", "Self-publishing and print-on-demand authors", "Webcomics, manga and graphic novels",
    "Documentary and independent film makers", "Wedding and event videographers", "Stock photo, footage and music libraries", "Talent, modelling and casting agencies", "Influencer, creator and MCN networks",
    "Press, PR wire and media monitoring", "Community and campus radio", "Regional-language and vernacular media", "Religious broadcasting", "Cinema chains and drive-ins",
    "Live-music venues and festivals", "Theatre, opera and ballet companies", "Stand-up comedy and spoken-word", "Circus, magic and variety acts", "Karaoke, nightclubs and discos",
    "Theme parks and attractions", "Escape rooms, VR arcades and bowling",
  ],
  "Telecommunications": [
    "Wireless telecommunications activities", "Other telecommunications activities", "Telecom-tower and small-cell operators", "Subsea cable and landing-station operators", "Wholesale carrier and bandwidth traders",
    "Community networks and rural connectivity", "Internet exchange points and CDNs", "Business telephony and PBX installers", "Telecom billing and OSS/BSS software", "Prepaid cards and top-up distribution",
    "Messaging, SMS and CPaaS providers", "Emergency communications and public-safety radio",
  ],
  "Banking & Financial Services": [
    "Other monetary intermediation (commercial banks)", "Activities of holding companies", "Trusts, funds and similar financial entities", "Financial leasing", "Other credit granting (consumer, mortgage, microcredit)",
    "Other financial service activities", "Administration of financial markets (exchanges, clearing houses)", "Security and commodity contracts brokerage", "Other activities auxiliary to financial services", "Fund management activities",
    "Credit unions and savings banks", "Building societies and mutual banks", "Development-finance institutions and policy banks", "Islamic banking and takaful", "Money-service businesses and remittance",
    "Mobile-money agents and wallets", "Cryptocurrency exchanges and custodians", "Digital banks and neobanks", "Buy-now-pay-later and consumer lending", "Invoice factoring and trade finance",
    "Supply-chain finance", "Pawnbrokers and payday lenders", "Tontines, rotating savings and susu groups", "Village banks and community finance", "Private equity and buy-out funds",
    "Hedge funds and family offices", "Wealth managers and robo-advisers", "Stock-transfer and registrar agents", "Debt-collection and credit-repair", "Financial planning and bookkeeping",
    "Tax-refund and cheque-cashing outlets", "Currency-exchange booths and bureaux de change", "Crowdfunding and revenue-based finance", "ESG and impact-investing funds", "Green bonds and climate-finance",
  ],
  "Insurance & Pensions": [
    "Pension funding", "Insurance and pension-funding auxiliary activities", "Risk and damage evaluation", "Activities of insurance agents and brokers", "Other auxiliary insurance activities",
    "Takaful and Islamic insurance", "Mutual and cooperative insurers", "Micro-insurance and parametric insurance", "Pet, travel and gadget insurance", "Warranty and extended-service plans",
    "Insurtech and digital brokers", "Captive insurers and risk-retention groups", "Medical-expense sharing and health-cost sharing groups", "Funeral-plan and burial-society providers",
  ],
  "Real Estate": [
    "Buying and selling of own real estate", "Renting and operating of own or leased real estate", "Real-estate activities on a fee or contract basis", "Real-estate agencies and brokers", "Management of real estate on a fee basis",
    "Land development and subdivision", "Property investment and REITs", "Shopping-centre and mall owners", "Industrial-park and logistics-park developers", "Student-housing and senior-living operators",
    "Vacation-rental and short-stay management", "Co-living and build-to-rent", "Land-title, survey and registry services", "Real-estate appraisal and auction", "Housing cooperatives and condominiums",
    "Gated community and township developers", "Slum rehabilitation and affordable housing", "Real-estate crowdfunding and tokenisation", "Parking-space and storage rental", "Farmland and plantation owners",
    "Hotel and hospitality property owners", "Ground-lease and royalty-land owners", "Relocation and home-staging services",
  ],
  "Legal, Accounting & Consulting": [
    "Legal activities (barristers, solicitors, notaries)", "Accounting, bookkeeping and auditing activities", "Tax consultancy", "Activities of head offices", "Management consultancy activities",
    "Public-relations and communication activities", "Business-process consulting", "Strategy and operations consulting", "Human-resources and talent consulting", "Financial and investment consulting",
    "IT and digital-transformation consulting", "Environmental, social and governance (ESG) consulting", "Regulatory and compliance consulting", "Risk and internal-audit consulting", "Supply-chain and procurement consulting",
    "Healthcare and hospital consulting", "Education and institutional consulting", "Agribusiness and rural-development consulting", "Export-import and trade consulting", "Franchise and retail consulting",
    "Government-relations and lobbying", "Trust, estate and succession planning", "Patent and trademark attorneys", "Paralegals and legal-document preparers", "Mediation, arbitration and dispute resolution",
    "Customs brokers and trade-compliance", "Forensic and fraud examiners", "Insolvency practitioners and liquidators", "Expert witnesses and litigation support", "Court reporters and legal transcription",
    "Notaries public and apostille services", "Immigration, visa and citizenship advisers", "Land and property conveyancers", "Process servers and enforcement agents",
  ],
  "Architecture, Engineering & Design": [
    "Architectural activities", "Engineering activities and related technical consultancy", "Technical testing and analysis", "Urban planning and landscape architecture", "Civil, structural and geotechnical engineering",
    "Mechanical, electrical and plumbing (MEP) engineering", "Chemical and process engineering", "Environmental and sanitary engineering", "Marine and naval architecture", "Aeronautical and aerospace engineering",
    "Mining and petroleum engineering", "Fire-protection and safety engineering", "Acoustic and lighting design", "Building-information modelling (BIM) services", "Reverse engineering and rapid prototyping",
    "Industrial design", "Graphic design", "Fashion design", "Furniture and product design", "Exhibition and set design",
    "Service and experience design", "Surveying and mapping (cadastral, hydrographic)", "Building inspection and certification", "Energy performance and sustainability rating", "Materials and failure-analysis laboratories",
    "Drone inspection and photogrammetry",
  ],
  "Research & Development": [
    "Research and experimental development on natural sciences and engineering", "Research and experimental development on social sciences and humanities", "Biotechnology research and development", "Pharmaceutical and clinical research", "Agricultural and food research",
    "Materials, nanotechnology and chemistry research", "Energy, climate and environment research", "Space, aerospace and defence research", "Artificial-intelligence and robotics research", "Public-policy and economic think tanks",
    "Academic and university research centres", "Government and national laboratories", "Corporate R&D centres", "Technology-transfer and licensing offices", "Science parks and research clusters",
    "Citizen science and community research", "Standards, metrology and calibration bodies",
  ],
  "Advertising, Marketing & Market Research": [
    "Media representation", "Market research and public-opinion polling", "Display advertising and outdoor media", "Digital and performance marketing", "Search-engine optimisation and marketing",
    "Email and marketing automation", "Content marketing and copywriting", "Brand strategy and identity", "Public relations and crisis communication", "Trade-show and exhibition marketing",
    "Sponsorship and sports marketing", "Direct mail and printed promotions", "Loyalty, rewards and coupon programmes", "Promotional products and corporate gifting", "Retail merchandising and visual display",
    "In-store and shopper marketing", "Mobile, app and in-game advertising", "Affiliate networks and ad exchanges", "Podcast and audio advertising", "Cinema, transit and airport advertising",
    "Vehicle and bus wrapping", "Street-level, wall-painting and handbill advertising", "Local newspaper classifieds and directories", "Neighbourhood flyers and door-to-door promotion", "Customer-research, UX and usability testing",
    "Data-brokerage and audience analytics", "Neuromarketing and behavioural research",
  ],
  "Other Professional & Technical Services": [
    "Specialised design activities", "Photographic activities", "Other professional, scientific and technical activities", "Veterinary activities", "Business brokerage and valuation",
    "Agronomy and agricultural consulting", "Security consulting", "Quality, standards and certification consulting", "Economics, statistics and data-science consulting", "Patent brokers and IP valuation",
    "Meteorological and weather consulting", "Technical writing and documentation", "Industrial-hygiene and occupational-safety consulting", "Sports, talent and fitness consulting", "Wedding, event and personal consultants",
    "Genealogy and family-history research", "Handwriting, graphology and forensic document examiners", "Fact-checking and verification services", "Cartography and map-making", "Mystery shopping and audit services",
    "Auction houses and appraisers",
  ],
  "Staffing & Business Support": [
    "Renting and leasing of motor vehicles", "Renting and leasing of recreational and sports goods", "Renting of video tapes and discs", "Renting and leasing of other personal and household goods", "Renting and leasing of agricultural and construction machinery",
    "Renting and leasing of office machinery and equipment", "Renting and leasing of transport equipment", "Leasing of intellectual property", "Activities of employment placement agencies", "Temporary employment agency activities",
    "Other human-resources provision", "Executive search and head-hunting", "Recruitment-process outsourcing", "Professional employer organisations (PEOs)", "Travel agency and tour-operator reservation services",
    "Private investigation and security systems services", "Combined facilities support", "General cleaning of buildings", "Industrial and window cleaning", "Landscape care and maintenance",
    "Document preparation and secretarial support", "Activities of call centres", "Organisation of conventions and trade shows", "Activities of collection agencies and credit bureaus", "Packaging activities (contract packing)",
    "Business-support services n.e.c.", "Mailroom, copy-shop and print-on-demand services", "Offshore captive centres and shared-service centres", "Interpreters and sign-language services", "Equipment-rental and tool-hire shops",
    "Party, event and tent rental", "Costume, formalwear and bridal rental", "Camera, drone and AV equipment rental", "Book, game and DVD rental libraries", "Furniture and appliance rental (rent-to-own)",
    "Bike, scooter and e-mobility rental", "Boat, jet-ski and RV rental", "Medical-equipment and wheelchair rental", "Staff-leasing and labour-hire for harvest and seasonal work",
  ],
  "Government & Public Administration": [
    "Regulation of health, education and cultural services", "Regulation of business activities", "Foreign affairs", "Defence activities", "Public-order and safety activities",
    "Fire-service activities", "Compulsory social-security activities", "Local and municipal government", "Provincial, state and regional government", "Legislatures and parliaments",
    "Judiciary and tribunals", "Prisons and correctional services", "Immigration and border control", "Customs and revenue authorities", "Land, survey and registration offices",
    "Public libraries and archives", "Public broadcasting", "Public health agencies", "Disaster-management and civil-defence agencies", "Electoral commissions",
    "Anti-corruption and ombudsman offices", "Statistical and census offices", "Central banks and financial regulators", "Competition and consumer-protection authorities", "Environmental and forest departments",
    "Transport and highway authorities", "Housing and urban-development authorities", "Public-sector enterprises and state-owned companies", "Embassies, consulates and diplomatic missions", "Military cantonments and garrison services",
    "Veterans' affairs",
  ],
  "Education & Training": [
    "Pre-primary education", "Primary education", "General secondary education", "Technical and vocational secondary education", "Post-secondary non-tertiary education",
    "Tertiary education (universities, colleges)", "Sports and recreation education", "Cultural education (music, dance, art, drama)", "Other education n.e.c. (language, test prep, tutoring)", "Educational support activities",
    "Home-schooling and learning pods", "Homeschool co-ops and curriculum providers", "Charter, private and international schools", "Boarding schools and residential academies", "Madrasas, seminaries and religious schools",
    "Community colleges and adult-education centres", "Trade, apprenticeship and polytechnic institutes", "Flight, maritime and mining training", "Medical, nursing and allied-health colleges", "Law, management and business schools",
    "Online universities and MOOCs", "Corporate training and e-learning", "Soft-skills and leadership training", "Language schools and ESL/EFL academies", "Test-prep and entrance coaching",
    "Tutoring centres and marketplaces", "Special-needs and inclusive education", "Gifted and talent-development programmes", "Early-intervention and speech therapy education", "School-bus and school-transport operators",
    "School uniforms, books and supplies", "Student recruitment and study-abroad agents", "Scholarship and student-loan providers", "Education publishing and curriculum design", "Educational toys and STEM kits",
    "School-management and ed-tech platforms", "Libraries, study cafes and co-learning spaces", "Summer camps and holiday programmes", "Scouting, guides and cadet movements", "Driving, motorcycle and heavy-vehicle training",
    "Cooking, barista and bartending schools", "Beauty, spa and hairdressing academies", "Art, pottery and craft workshops", "Coaching for sports, chess and e-sports", "Meditation, yoga and wellness teacher training",
  ],
  "Healthcare & Life Sciences": [
    "Hospital activities", "Medical and dental practice activities", "Other human-health activities", "Nursing and midwifery services", "Physiotherapy, occupational and speech therapy",
    "Clinical laboratory and pathology services", "Diagnostic imaging centres", "Ambulance and emergency medical services", "Blood and organ banks", "Home-health and community nursing",
    "Mental-health and psychological services", "Substance-abuse treatment", "Fertility and IVF clinics", "Dialysis and renal care centres", "Cancer, radiotherapy and chemotherapy centres",
    "Rehabilitation and long-term care hospitals", "Day-surgery and ambulatory centres", "Urgent-care and walk-in clinics", "Primary-care and family-doctor practices", "Community health centres and dispensaries",
    "Mobile and outreach clinics", "Traditional and complementary medicine (TCM, Ayurveda, Unani, Kampo)", "Chiropractors, osteopaths and naturopaths", "Opticians, optometrists and eye hospitals", "Audiology and hearing-aid clinics",
    "Podiatry and foot-care", "Dentures, orthodontics and dental labs", "Pharmacy, dispensing and compounding", "Medical-device and equipment distributors", "Medical consumables and PPE suppliers",
    "Healthcare staffing and locum agencies", "Medical records, coding and billing", "Hospital laundry, kitchen and facility services", "Health-education and wellness programmes", "Public-health and vaccination programmes",
    "Occupational-health and corporate clinics", "School and university health services", "Sports-medicine and performance clinics", "Veterinary and animal hospitals", "Contract research and clinical-trial sites",
    "Biobanks and genomic services",
  ],
  "Arts, Sports & Recreation": [
    "Support activities to performing arts", "Artistic creation", "Museums activities", "Operation of historical sites and buildings", "Operation of sports facilities",
    "Activities of sport clubs", "Fitness facilities", "Other sports activities", "Activities of amusement parks and theme parks", "Other amusement and recreation activities",
    "Painting, sculpture and installation artists", "Photographers and photojournalists", "Poets, novelists and screenwriters", "Choreographers and dance companies", "Orchestras, bands, choirs and DJs",
    "Session musicians and touring acts", "Art dealers and galleries", "Auction houses for art and antiques", "Art fairs, biennales and festivals", "Tattoo, body-art and fashion-art studios",
    "Street artists, buskers and mural painters", "Sports leagues, franchises and federations", "Professional teams and athletes", "Sports agents and management", "Stadium, arena and racecourse operators",
    "Horse racing, stables and equestrian", "Motorsport, circuits and karting", "Golf, tennis, cricket and polo clubs", "Climbing, skiing and extreme-sports operators", "Diving, surfing and sailing schools",
    "Marinas and yacht clubs", "Hunting, fishing and shooting clubs", "National parks, camping and outdoor-recreation operators", "Lottery operators and sellers", "Casinos, card rooms and bingo halls",
    "Esports organisations and gaming cafes", "Fantasy-sports and prediction platforms", "Board-game cafes and hobby clubs", "Fairs, carnivals and mela operators",
  ],
  "Personal & Household Services": [
    "Washing and dry-cleaning of textile and fur products", "Hairdressing and other beauty treatment", "Funeral and related activities", "Physical well-being activities (spas, saunas, steam baths)", "Other personal service activities n.e.c.",
    "Activities of households as employers of domestic personnel", "Undifferentiated goods-producing activities of private households for own use", "Repair of computers and peripheral equipment", "Repair of communication equipment", "Repair of consumer electronics",
    "Repair of household appliances and home and garden equipment", "Repair of footwear and leather goods", "Repair of furniture and home furnishings", "Repair of watches, clocks and jewellery", "Repair of other personal and household goods",
    "Matrimonial and matchmaking services", "Astrology, fortune-telling and spiritual healing", "Dating, introduction and escort-free companionship services", "Pet grooming, boarding and training", "Dog walkers and pet sitters",
    "Personal shoppers and concierge services", "Personal assistants and life organisers", "Tutors and homework helpers", "Nannies, au pairs and babysitters", "Elder companions and respite carers",
    "Home organisers and declutter services", "Moving, storage and relocation assistance", "Laundromats and self-service laundries", "Tailors, cobblers and alterations", "Key cutting, engraving and trophy services",
    "Photo booths and portrait studios", "Tanning, waxing and nail bars", "Barbershops and traditional shaving", "Massage, reflexology and acupressure", "Hammams, onsens, saunas and bathhouses",
    "Yoga, Pilates and meditation instructors", "Tattoo and piercing artists", "Costume, party and children's entertainment", "Handyman and odd-job services", "Window cleaners and gutter cleaners",
    "Chimney sweeps and stove cleaners", "House-sitters and key-holders", "Au-pair, domestic and agency placement", "Wardrobe stylists and image consultants", "Ghost-writers, letter writers and scribes",
  ],
};

/** A second worldwide pass over the remaining sectors, appended after `EXTRA_WORLD`. */
const EXTRA_WORLD2: Record<string, string[]> = {
  "Consumer Goods & FMCG": [
    "Beverage and bottled-water brands", "Personal-care and hygiene brands", "Home-care and cleaning brands", "Baby-care and feminine-hygiene products", "Over-the-counter and wellness brands",
    "Private-label and store brands", "Contract manufacturers for brands", "Brand owners and licensing companies", "Stationery, school and office brands", "Footwear, apparel and accessories brands",
    "Pet-care brands", "Household plastics and homeware brands", "Sustainable and zero-waste product brands",
  ],
  "Fashion, Luxury & Lifestyle": [
    "Luxury and designer houses", "Ready-to-wear and fast-fashion brands", "Streetwear and sneaker brands", "Bridal and couture ateliers", "Ethnic and traditional-wear labels",
    "Modest and cultural fashion labels", "Sustainable and upcycled fashion", "Handbag, accessories and leather-goods labels", "Eyewear and sunglasses brands", "Perfume and fragrance houses",
    "Fashion models, stylists and photographers", "Fashion weeks, showrooms and trade shows", "Fashion e-commerce and rental platforms", "Pre-owned luxury resale", "Tailor and bespoke tailoring houses",
    "Textile designers and print studios", "Costume and theatrical wardrobe houses",
  ],
  "Beauty, Cosmetics & Wellness": [
    "Skin-care and cosmetics brands", "Hair-care and styling brands", "Men's grooming brands", "Natural, organic and herbal beauty", "Salons, barbershops and beauty chains",
    "Spas, wellness resorts and retreats", "Aesthetic, laser and dermatology clinics", "Hair-removal and body-contouring clinics", "Nail, lash and brow studios", "Beauty-device and tech makers",
    "Beauty schools and academies", "Makeup artists and bridal beauty", "Wellness coaches and holistic practitioners", "Fitness and wellness apps", "Supplements, vitamins and nutraceutical brands",
    "Aromatherapy and essential-oil makers", "Sauna, hot-spring and bathhouse operators", "Weight-loss and slimming centres",
  ],
  "Sports & Fitness": [
    "Gyms, health clubs and studios", "Personal trainers and coaches", "Yoga, Pilates and barre studios", "Martial-arts and combat-sports schools", "Swimming and aquatics centres",
    "Racquet, golf and country clubs", "Stadiums, arenas and sports complexes", "Professional clubs, leagues and franchises", "Amateur and school sports clubs", "Athlete management and sports agencies",
    "Sports medicine and physiotherapy", "Sports nutrition and supplements", "Sports equipment and apparel makers", "Sports retail and rentals", "Sports analytics and wearables",
    "Fitness apps, streaming and virtual coaching", "Outdoor, trail and adventure sports operators", "Marathon, triathlon and event organisers", "Sports broadcasting and media rights", "Referees, umpires and sports officials",
  ],
  "Gaming & Esports": [
    "Game development studios (PC, console, mobile)", "Game publishers and distributors", "Game engines, tools and middleware", "Tournament and league organisers", "Streaming and content-creator networks",
    "Game-testing and QA studios", "Game art, animation and audio outsourcing", "In-game advertising and monetisation", "Arcade, gaming lounges and LAN centres", "Game-hardware and accessory makers",
    "Board-game, card-game and tabletop publishers", "Casino-style and social gaming", "Educational games and gamification", "Blockchain games and digital collectibles", "Game journalism, reviews and media",
  ],
  "Events, Exhibitions & Weddings": [
    "Corporate-event and conference organisers", "Exhibition, trade-show and fair organisers", "Wedding planners and coordinators", "Wedding venues, lawns and banquet halls", "Event decorators and florists",
    "Event caterers and bartenders", "Stage, sound, light and AV production", "Event-staffing, hosts and promoters", "Event tech, ticketing and registration platforms", "Festival and concert promoters",
    "Party, birthday and baby-shower planners", "Photo booths and entertainment hire", "Destination and themed events", "Virtual and hybrid events", "Community and religious event services",
    "Sports and charity event organisers", "Pandals, tents and shamianas", "Barat, procession and baraat services",
  ],
  "Pets & Animal Care": [
    "Pet shops and aquarium stores", "Pet grooming and spa", "Pet boarding, daycare and sitting", "Dog trainers and behaviourists", "Pet food and treat makers",
    "Pet accessories and furniture brands", "Breeders and kennels", "Animal shelters and adoption groups", "Animal hospitals for livestock and equine", "Horse stables, riding schools and farriers",
    "Pet insurance and pet pharmacies", "Pet cremation and memorial services", "Wildlife rescue and rehabilitation", "Zoo, aquarium and bird sanctuaries", "Pet photographers and pet-tech",
    "Pigeon, fancy-bird and exotic-animal keepers", "Aquaculture of ornamental fish",
  ],
  "Marine & Maritime": [
    "Fishing boats and trawlers", "Boat building and yacht yards", "Marinas and boat clubs", "Ferry and water-taxi services", "Offshore and subsea contractors",
    "Marine surveyors and naval architects", "Diving, salvage and underwater services", "Shipping agencies", "Seafarers' recruitment and training", "Navy suppliers and coast-guard contractors",
    "Maritime law and arbitration", "Marine biology and oceanography", "Pearl, coral and shell industries", "Seafood processing and export", "Port tugs, pilots and linesmen",
  ],
  "Biotechnology & Life Sciences": [
    "Biotech R&D companies", "Biopharma and biologics makers", "Diagnostics and in-vitro device makers", "Genomics and sequencing services", "Clinical-trial organisations (CRO)",
    "Industrial and environmental biotechnology", "Food and cellular-agriculture biotech", "Bioinformatics and computational biology", "Synthetic biology and gene editing", "Stem-cell and regenerative medicine",
    "Medical-device startups and incubators", "Veterinary biotech and animal health", "Laboratory instruments and reagents suppliers", "Biosafety and cleanroom services", "Biobanking and cold-chain for biologics",
  ],
  "Environment & Sustainability": [
    "Renewable-energy developers and installers", "Energy-efficiency and green-building services", "Carbon accounting, credits and offsets", "ESG reporting and sustainability consulting", "Waste-to-energy and recycling plants",
    "Water conservation and rainwater harvesting", "Afforestation, mangrove and wetland restoration", "Organic, regenerative and natural farming", "Eco-tourism and conservation travel", "Environmental NGOs and campaign groups",
    "Air-quality and pollution-monitoring services", "Sustainable packaging and materials", "Climate-tech and adaptation startups", "Urban greening, green roofs and parks", "Biodiversity and wildlife-protection services",
    "Electric-mobility and charging infrastructure", "Clean-cooking stoves and fuels",
  ],
  "Home & Property Services": [
    "Home cleaning and maid services", "Pest control and fumigation", "Plumbing, electrical and handyman", "Carpentry, painting and renovation", "Interior design and home decor",
    "Landscaping, gardening and lawn care", "Home security, CCTV and smart-home installers", "Home-inspection and valuation", "Moving, packing and relocation", "Appliance repair and installation",
    "Roofing, waterproofing and insulation", "Solar and rainwater installers", "Property management and caretaking", "Window, door and glazing services", "Furniture assembly and repair",
    "Locksmiths and safe technicians", "Septic, drain and sewer services", "Chimney, fireplace and HVAC servicing", "Facility management for apartments", "Elevator and escalator service",
    "Renovation-marketplace platforms",
  ],
  "Packaging, Labelling & Printing Services": [
    "Corrugated and carton packaging", "Rigid plastic, glass and metal containers", "Labels, stickers and barcodes", "Packaging design and prototyping", "Contract packing and co-packing",
    "Gift, luxury and promotional packaging", "Industrial and export packaging (pallets, crates, drums)", "Sustainable and biodegradable packaging", "Offset, digital and screen printing", "Large-format, flex and signage printing",
    "Book, magazine and newspaper printing", "Business-card and stationery printing", "Textile and garment printing", "3D printing and prototyping bureaus", "Print finishing, lamination and binding",
  ],
  "Crafts, Handicrafts & Artisans": [
    "Pottery, ceramics and terracotta", "Wood carving, turning and inlay", "Metalcraft (brass, copper, silver, iron)", "Textile crafts (weaving, embroidery, batik, block print)", "Leather and bone crafts",
    "Basketry, cane, bamboo and grass crafts", "Stone and marble carving", "Glass blowing and stained glass", "Jewellery and bead making", "Paper, papier-mâché and calligraphy",
    "Toy, doll and puppet makers", "Candle, soap and natural-dye makers", "Folk and tribal art (Madhubani, Warli, Gond, Aboriginal)", "Rug and carpet weaving", "Musical-instrument makers",
    "Craft cooperatives and fair-trade groups", "Souvenir and tourist-craft sellers", "Restoration and heritage crafts",
  ],
  "Cooperatives & Community Enterprises": [
    "Agricultural and dairy cooperatives", "Credit unions and thrift cooperatives", "Consumer and worker cooperatives", "Housing and building cooperatives", "Fishermen's and artisans' cooperatives",
    "Women's self-help group enterprises", "Producer companies and collectives", "Energy and water user associations", "Community-owned shops, pubs and utilities", "Social enterprises and B-corps",
    "Mutual-aid and savings societies", "Village development committees", "Kibbutz, commune and eco-village enterprises", "Platform cooperatives",
  ],
  "Religious & Spiritual Services": [
    "Temples, mosques, churches, synagogues and gurdwaras", "Monasteries, ashrams and retreat centres", "Pilgrimage organisers and guides", "Priests, pandits, imams, pastors and rabbis", "Religious schools and seminaries",
    "Religious publishers and media", "Religious goods and ritual-item shops", "Charitable and welfare trusts of faith bodies", "Yoga, meditation and spiritual-wellness teachers", "Astrologers, palmists and spiritual healers",
    "Funeral and last-rites officiants", "Missionary and interfaith organisations", "Langar, community-kitchen and annadanam services", "Wedding and ritual officiants",
  ],
  "Mobility & Smart Transport": [
    "Ride-hailing and carpool platforms", "Micro-mobility (e-scooters, e-bikes)", "EV charging and battery swapping", "Fleet telematics and vehicle tracking", "Traffic management and smart parking",
    "Autonomous-vehicle and drone logistics", "Mobility-as-a-service (MaaS) platforms", "Public-transit ticketing and passes", "Road-safety and ADAS technology", "Connected-vehicle and V2X technology",
    "Hydrogen and alternative-fuel mobility", "Last-mile electric logistics", "Vehicle-rental and rental-tech",
  ],
  "Emerging & Specialty Industries": [
    "Quantum technology", "Space tech and satellite startups", "Augmented, virtual and mixed reality", "Robotics and automation", "3D printing and advanced manufacturing",
    "Synthetic and lab-grown food", "Neurotechnology and brain-computer interfaces", "Nanotechnology and advanced materials", "Climate engineering and carbon removal", "Metaverse and virtual worlds",
    "Smart cities and urban tech", "Wearables and health sensors", "Digital health and personalised medicine", "Fusion and next-generation energy", "Hypersonic and aerospace innovation",
  ],
  "Digital Creators & Creator Economy": [
    "Instagram, Reels and short-video creators", "Bloggers and newsletter writers", "Online educators and course creators", "Social-commerce and live-selling hosts", "Photographers and videographers on social platforms",
    "Meme, comedy and entertainment pages", "Affiliate and review creators", "Creator tools, editing and thumbnail services", "Digital-asset sellers (templates, presets, stock)", "Patreon, membership and subscription creators",
    "Music artists and independent labels", "Virtual influencers and VTubers",
  ],
  "Freelancers, Gig Work & Independent Professionals": [
    "Freelance developers, designers and writers", "Consultants, coaches and trainers", "Translators and transcribers", "Online tutors and instructors", "Photographers, videographers and editors",
    "Delivery, ride and errand gig workers", "Home-service gig professionals", "Digital nomads and remote contractors", "Independent accountants, lawyers and architects", "Crowd-work and micro-task workers",
    "Artists, illustrators and musicians for hire", "Event staff and temporary workers", "Handyman, tutor and caregiver gig-platform partners",
  ],
  "Internet Platforms & Marketplaces": [
    "E-commerce marketplaces", "Classifieds and listing portals", "Travel and booking platforms", "Food-delivery and quick-commerce apps", "Job portals and recruitment platforms",
    "Matrimony and dating platforms", "Real-estate and rental portals", "Online education and course marketplaces", "Fintech and payments apps", "Healthcare booking and telehealth platforms",
    "Gig and freelance marketplaces", "Agri-marketplaces and B2B trading platforms", "Peer-to-peer lending and crowdfunding", "Review, comparison and aggregator sites", "Content, video and audio platforms",
  ],
  "Digital Media & Content Services": [
    "News portals and digital newsrooms", "Blog networks and niche websites", "Video and OTT content producers", "Digital-publishing and e-magazines", "Content-writing and copy agencies",
    "Social-media content studios", "Animation, motion graphics and VFX", "Stock-media and licensing libraries", "Translation, subtitling and localisation", "SEO and content-strategy services",
    "Newsletter and audience-growth services", "Fact-checking and verification outlets", "Citizen-journalism and community media",
  ],
  "Music, Performing Arts & Talent": [
    "Singers, bands and orchestras", "Classical, folk and devotional musicians", "Dancers, choreographers and troupes", "Theatre actors and directors", "Film and TV actors, extras and voice artists",
    "DJs, VJs and live performers", "Music producers and recording studios", "Music teachers and academies", "Event bands, wedding singers and dhol players", "Stand-up comedians and mimicry artists",
    "Magicians, jugglers and circus artists", "Puppeteers, storytellers and folk performers", "Talent agencies and casting directors", "Sound, light and stage crews", "Music licensing and royalty-collection societies",
  ],
  "Writers, Authors & Publishing Professionals": [
    "Novelists, poets and playwrights", "Journalists, columnists and critics", "Copywriters, ghost-writers and technical writers", "Screenwriters and dialogue writers", "Editors, proofreaders and indexers",
    "Translators and literary agents", "Illustrators and book-cover designers", "Children's-book authors and illustrators", "Self-publishers and indie imprints", "Literary festivals and book clubs",
    "Academic and research authors", "Bookshops, libraries and book-fair organisers",
  ],
  "Fine Arts, Design & Visual Culture": [
    "Painters, sculptors and printmakers", "Illustrators, cartoonists and comic artists", "Photographers and photo artists", "Graphic, UI and motion designers", "Calligraphers and typographers",
    "Art galleries, dealers and auction houses", "Art restorers and conservators", "Murals, graffiti and street artists", "Textile, ceramic and glass artists", "Curators and art consultants",
    "Art schools and studios", "Digital artists and NFT creators", "Tattoo artists and body-art studios",
  ],
  "AI, Machine Learning & Data": [
    "AI product and model companies", "Machine-learning consulting and MLOps", "Computer-vision and imaging solutions", "Natural-language and speech solutions", "Generative-AI applications and agents",
    "Data engineering and warehousing", "Analytics, BI and dashboards", "Predictive maintenance and industrial AI", "Healthcare, legal and finance AI tools", "AI ethics, governance and safety services",
    "Edge AI and embedded ML",
  ],
  "Cybersecurity & Trust": [
    "Managed security service providers (MSSP)", "Security-operations centres (SOC) and monitoring", "Identity, access and zero-trust providers", "Endpoint, network and cloud security vendors", "Data-protection, privacy and GDPR consulting",
    "Application and API security", "Incident response and digital forensics", "Fraud prevention and anti-money-laundering tech", "Security awareness training and phishing simulation", "Cyber-insurance and risk quantification",
    "Certificate authorities and digital trust", "OT, SCADA and industrial-security services", "Bug-bounty and vulnerability-disclosure platforms",
  ],
  "Cloud, Data Centres & Infrastructure": [
    "Hyperscale and regional cloud providers", "Managed hosting and colocation", "Data-centre builders and operators", "Cloud migration and managed-cloud partners", "Content delivery, edge and CDN providers",
    "Network, SD-WAN and connectivity services", "Domain, DNS and web-hosting resellers", "Storage, backup and disaster recovery", "DevOps, platform engineering and SRE services", "FinOps and cloud-cost management",
    "Private, sovereign and hybrid cloud", "Green data centres and cooling providers", "Bare-metal and GPU-cloud providers", "IT asset disposal and data destruction",
  ],
  "Blockchain, Crypto & Web3": [
    "Blockchain development studios", "Crypto exchanges, wallets and custodians", "DeFi and decentralised-finance protocols", "NFT, digital-collectible and tokenisation platforms", "Mining and staking operators",
    "Smart-contract auditors and security", "Stablecoin and CBDC infrastructure", "Supply-chain and provenance blockchains", "DAO tooling and community governance", "Crypto payments and remittance",
    "Blockchain consulting and training", "Layer-1/2 networks and developer tools",
  ],
  "Industry Technology (Vertical Tech)": [
    "Agritech and precision farming", "Healthtech and medtech", "Fintech, insurtech and regtech", "Edtech and skilltech", "Proptech and construction tech",
    "Legaltech and govtech", "Logistics-tech and supply-chain tech", "Retail-tech and e-commerce enablers", "Hospitality and travel tech", "Manufacturing and Industry 4.0 tech",
    "Energy-tech, cleantech and utilities tech", "Mining and oil-gas tech", "Media-tech and adtech", "HR-tech and workforce platforms", "Sports-tech and fitness tech",
    "Pet-tech, fashion-tech and beauty-tech", "Auto-tech and mobility tech",
  ],
  "Jewellery, Gems & Precious Metals": [
    "Gold, silver and platinum jewellers", "Diamond cutters, polishers and traders", "Coloured-gemstone and pearl dealers", "Jewellery manufacturers and karigars", "Bullion dealers and refiners",
    "Hallmarking and assay centres", "Imitation, costume and fashion jewellery", "Bridal and traditional jewellery houses", "Jewellery designers and CAD studios", "Gemmological labs and certification",
    "Watch, clock and jewellery repair", "Gold-loan and pawn-based jewellers", "Lab-grown diamond producers", "Pawn and second-hand jewellery buyers",
  ],
  "Toys, Baby & Kids Products": [
    "Toy makers and brands", "Baby clothing and accessories", "Prams, car seats and baby gear", "Kids' furniture and nursery decor", "School bags, stationery and lunch boxes",
    "Children's books and publishers", "Kids' apparel and footwear", "Baby food and formula brands", "Kids' party supplies and entertainment", "Play-centres, soft-play and children's parks",
    "Toy libraries and rental platforms", "Handmade and wooden toy makers",
  ],
  "Alcohol, Cannabis & Specialty Beverages": [
    "Breweries, brewpubs and craft beer", "Wineries, vineyards and wine merchants", "Bars, pubs, taverns and nightclubs", "Liquor stores and wholesalers", "Toddy, arrack, mead and traditional liquor",
    "Non-alcoholic spirits and functional drinks", "Cannabis, hemp and CBD (where legal)", "Tea, coffee and specialty-beverage roasters", "Kombucha, cold-brew and juice producers", "Beverage distributors and bottlers",
    "Sommeliers, bartenders and mixology training",
  ],
  "Import, Export & Trade Facilitation": [
    "Importers and exporters (general)", "Commodity traders and merchants", "Customs house agents and clearing agents", "Freight forwarders and NVOCCs", "Trade-finance and letters of credit",
    "Export-promotion councils and trade bodies", "Sourcing agents and buying houses", "Quality inspection and pre-shipment audits", "Free-trade-zone and bonded-warehouse operators", "Border trade and informal cross-border traders",
    "Trade-fair and buyer-seller meet organisers", "Export-compliance and certification consultants",
  ],
  "Franchising & Business Opportunities": [
    "Food and beverage franchises", "Retail and fashion franchises", "Education and coaching franchises", "Health, fitness and beauty franchises", "Service and home-service franchises",
    "Automotive and transport franchises", "Hospitality and travel franchises", "Master franchises and area developers", "Business-for-sale and acquisition brokers", "Work-from-home and low-investment ventures",
    "Distributorship and dealership opportunities", "Kiosk, cart and vending ventures",
  ],
  "Industrial Services & Maintenance": [
    "Industrial cleaning and housekeeping", "Plant maintenance and shutdown contractors", "Electrical, instrumentation and automation services", "Mechanical erection and fabrication", "Equipment calibration and testing",
    "Industrial painting, coating and insulation", "Boiler, pressure-vessel and crane inspection", "Pipeline, tank and vessel cleaning", "Contract manpower and labour supply", "Scaffolding, rigging and lifting",
    "Industrial gases and welding supplies", "Predictive-maintenance and condition monitoring", "Spares, MRO and tool-crib suppliers", "Industrial safety training and audits", "Fire-protection and hydrant services",
  ],
  "Tourism, Culture & Heritage": [
    "Tour operators and travel agencies", "Tour guides and drivers", "Hotels, resorts and homestays", "Heritage, temple and pilgrimage tourism", "Wildlife safari and eco-lodges",
    "Adventure and trekking operators", "Cruise, houseboat and river tourism", "Tourist taxis and coaches", "Cultural shows, craft villages and festivals", "Tourism boards and information centres",
    "Souvenir, craft and local-product shops", "Rural, tribal and farm-stay tourism", "Medical, wellness and spiritual tourism", "Visa, forex and travel-insurance agents",
  ],
  "Nonprofit, Social Impact & Community": [
    "NGOs and charitable trusts", "Foundations and grant-makers", "Social-impact investors and funds", "Community-development organisations", "Volunteer networks and civic groups",
    "Advocacy and campaign groups", "Self-help and support groups", "Education, health and livelihood NGOs", "Disaster-response and relief groups", "Faith-based charities",
    "Crowdfunding for causes", "CSR implementation agencies", "Women, child and elder-welfare organisations",
  ],
};

/** Brokers, agents, facilitators and everyday middlemen, appended after `EXTRA_WORLD2`. */
const EXTRA_WORLD3: Record<string, string[]> = {
  "Real Estate": [
    "Flat and apartment broker", "Rental-flat and house broker", "PG, hostel and room-rental broker", "Plot and land broker (dalal)", "Farmhouse and agricultural-land broker",
    "Shop, office and commercial-space broker", "Warehouse and godown lease broker", "Resale-flat and second-hand property agent", "New-project and builder-sales agent", "Channel partner for developers",
    "Property dealer and consultant", "Tenant-verification and police-verification agent", "Rent-agreement and registration agent", "Property caretaker and watch-and-ward service", "Housing-society manager and secretary",
    "Property-tax and mutation agent", "Home-loan and property-finance agent", "Vastu and property consultant", "Real-estate photographer and virtual-tour creator", "Builder's site supervisor and labour contractor",
    "Estate agent, letting agent and realtor", "Auctioneer of property and land",
  ],
  "Legal, Accounting & Consulting": [
    "Stamp-paper vendor and document writer", "Deed writer and registration helper", "Court-fee, e-filing and legal-clerk services", "Tax-return and GST filing centre", "Accountant and bookkeeper for small shops",
    "Udyam, MSME and licence registration agent", "FSSAI, trade-licence and shop-act registration agent", "Company-incorporation and LLP agent", "ISO, BIS and certification agent", "Passport, visa and OCI agent",
    "Driving-licence and RTO agent", "Ration-card, Aadhaar and PAN facilitator", "Scheme, subsidy and loan-application facilitator", "Pension and provident-fund facilitator", "Legal-notice, affidavit and notary assistant",
  ],
};

/** Local entertainment, folk arts, orchestras, fairs and functions, appended after `EXTRA_WORLD3`. */
const EXTRA_WORLD4: Record<string, string[]> = {
  "Music, Performing Arts & Talent": [
    "Orchestra (arkestra) and dance party", "Orchestra singers and live-band troupe", "Stage dancers and dance groups for functions", "Band-baja and baraat band", "Brass band and dhol-tasha pathak",
    "Shehnai, nadaswaram and wedding musicians", "Nautanki and folk-theatre company", "Jatra, tamasha and lavani troupe", "Ramlila, Raslila and Krishnaleela committee", "Yakshagana, Kathakali, Chhau and regional dance-drama",
    "Bhajan sandhya, jagran and kirtan mandali", "Qawwali and sufi-music party", "Bhangra, giddha, garba and dandiya troupes", "Bihu, Lavani, Ghoomar and folk-dance groups", "Baul, Pandavani, Powada and folk singers",
    "Kathputli (puppet) and shadow-puppet artists", "Mimicry, comedy and stand-up artists", "Magicians, jugglers and acrobats", "Street performers, nat and bazigar", "DJ, sound and light operators",
    "Anchors, emcees and compères", "Playback and cover singers", "Bollywood, hip-hop and Zumba dance teachers", "Mariachi, flamenco, tango and samba performers", "Capoeira, belly-dance and fusion dance groups",
    "Taiko, gamelan, lion-dance and dragon-dance troupes", "Griots, storytellers and oral-tradition performers", "Choir, gospel and church-music groups", "Karaoke and open-mic hosts", "Recording, dubbing and jingle studios",
  ],
  "Events, Exhibitions & Weddings": [
    "Orchestra and dance party booking for weddings", "DJ, sound-box and light rental", "Ghodi, baggi and wedding-procession services", "Dulha-dulhan entry, doli and palki services", "Fireworks and sky-shot show operators",
    "Mandap, stage and flower-decoration artists", "Tent, shamiana, carpet and chair suppliers", "Halwai, cook and catering team for functions", "Photographers, video and drone operators", "Mehndi, sangeet and haldi function organisers",
    "Jagran, bhandara and satsang organisers", "Naming, thread, mundan and birthday ceremony organisers", "Social, political and rally-event arrangers", "Stage, LED-wall and generator suppliers", "Village fair, mela and tournament organisers",
    "Anniversary, retirement and farewell party planners",
  ],
  "Arts, Sports & Recreation": [
    "Dangal, akhara and wrestling tournaments", "Kabaddi, kho-kho and village sports tournaments", "Cricket, football and volleyball tournament organisers", "Merry-go-round, giant-wheel and mela jhula operators", "Circus, magic-show and puppet-show operators",
    "Video halls, mobile cinema and open-air screenings", "Pigeon racing, kite and bullock-race events", "Cockfight-free traditional games and rural sports (kancha, gilli-danda, pittu)", "Boating, shikara and tourist-pond operators", "Local gaming parlours and carrom, ludo, snooker clubs",
    "Open-air theatre and cultural-fest organisers",
  ],
  "Religious & Spiritual Services": [
    "Katha vachak, pravachan and kirtankar", "Bhajan, jagran and satsang mandali", "Qawwal, naat-khwan and religious reciters", "Granthi, ragi and kirtan jatha", "Maulvi, imam and nikah-khwan",
    "Padre, pastor and church choir", "Pandit, purohit and puja-path services", "Astrologer, kundali and muhurat consultant", "Pilgrim guides (panda) and tirth-purohit", "Temple trust, prasad and bhog makers",
    "Dharamshala and pilgrim-rest-house caretakers", "Idol, lamp and prayer-item makers", "Religious fairs, rath-yatra and procession committees",
  ],
};

/** Students, kids, individuals and community groups, appended after `EXTRA_WORLD4`. */
const EXTRA_WORLD5: Record<string, string[]> = {
  "Education & Training": [
    "School student (class 1–12)", "College and university student", "Postgraduate and PhD scholar", "Competitive-exam aspirant", "Student studying abroad",
    "Student entrepreneur and campus startup", "Student club, society and council", "School and college alumni association", "Parent-teacher and parents' association", "Teacher, lecturer and professor (individual)",
    "Private tutor and mentor", "Education influencer and study-channel creator", "Scholarship and fellowship seeker", "Intern and apprentice",
  ],
};

/** Village governance, public representatives and local leaders, appended after `EXTRA_WORLD5`. */
const EXTRA_WORLD6: Record<string, string[]> = {
  "Political, Campaign & Public-Representative Offices": [
    "Gram pradhan and mukhiya", "Sarpanch and up-sarpanch", "Panch and ward member (panchayat)", "Gram sabha and gram panchayat committee", "Block pramukh and BDC member",
    "Zila parishad member and chairman", "Vidhayak (MLA) and MLC office", "Sansad (MP) and Rajya Sabha member office", "Municipal councillor (parshad) and ward office", "Mayor, nagar palika and nagar panchayat chairman",
    "Political-party district, block and booth office", "Party karyakarta, worker and volunteer", "Youth wing, mahila wing and student wing", "Campaign manager and chunav prabandhak", "PA, secretary and personal staff of a leader",
    "Political consultant and election strategist", "Booth-level agent and polling agent", "Rally, jansabha and padyatra organiser", "Political-advertising, flex and slogan-writing agency", "Opinion-poll and voter-survey agency",
    "Social-media and IT cell for campaigns", "Community leader, samaj pradhan and caste/community head", "Khap, jamaat, panchayat-samaj and elders' committee", "Trade-union and kisan-union leader", "Former and retired public representative",
  ],
};

/** Bus, cab, trip and yatra booking businesses. */
const EXTRA_WORLD7: Record<string, string[]> = {
  "Transport & Logistics": [
    "Bus-booking and ticket agent (travels office)", "Online bus-ticket agent and counter (redBus, AbhiBus partners)", "Private bus and luxury-coach owner", "Sleeper, Volvo and AC-coach operator", "Mini-bus and 17-seater operator",
    "Tempo traveller and maxi-cab owner", "Innova, Ertiga and SUV taxi owner", "Cab booking and taxi dispatch office", "Outstation and one-way taxi service", "Airport and railway-station pick-up and drop",
    "Taxi stand and union (cab association)", "Tourist-permit and all-India-permit vehicle owner", "Driver supplier and fleet manager", "Marriage-party, picnic and school-trip bus booking", "Pilgrimage bus and yatra vehicle booking",
  ],
  "Hospitality, Travel & Food Service": [
    "Tour-package seller and holiday planner", "Weekend, picnic and group-trip organiser", "Tirth yatra and pilgrimage tour agent", "Char Dham, Vaishno Devi, Kashi and Ayodhya tour operator", "Haj, Umrah and Ziyarat group organiser",
    "Honeymoon and family-tour package planner", "School, college and corporate trip organiser", "Bus and cab booking for trips (trip aggregator)", "Railway, bus and flight ticket booking counter", "Hotel and dharamshala booking agent for yatris",
    "Local sightseeing and day-tour operator", "Camping, trekking and adventure-trip organiser", "Foreign tour, visa and passport tour operator", "Senior-citizen and women-only tour operator", "Wedding-guest and baraat travel arrangers",
  ],
};

function cat(name: string, baseSubs: string[]): BusinessCategory {
  const subs = [...baseSubs, ...(EXTRA[name] ?? []), ...(EXTRA_MORE[name] ?? []), ...(EXTRA_DEEP[name] ?? []), ...(EXTRA_LOCAL[name] ?? []), ...(EXTRA_WORLD[name] ?? []), ...(EXTRA_WORLD2[name] ?? []), ...(EXTRA_WORLD3[name] ?? []), ...(EXTRA_WORLD4[name] ?? []), ...(EXTRA_WORLD5[name] ?? []), ...(EXTRA_WORLD6[name] ?? []), ...(EXTRA_WORLD7[name] ?? [])];
  const code = slug(name);
  const seen = new Set<string>();
  const list: BusinessSub[] = [];
  for (const n of subs) {
    let c = `${code}:${slug(n)}`;
    for (let i = 2; seen.has(c); i++) c = `${code}:${slug(n)}-${i}`;
    seen.add(c);
    list.push({ code: c, name: n });
  }
  return { code, name, subs: list };
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  // Micro and street-level trades first: a vegetable seller or a tailor finds their own trade without digging through industries.
  cat("Vegetable, Fruit & Fresh Produce Sellers", [
    "Vegetable seller (sabziwala)", "Fruit seller (phalwala)", "Vegetable and fruit cart (thela)", "Roadside vegetable stall", "Weekly-market (haat) vegetable seller",
    "Wholesale vegetable and fruit dealer", "Door-to-door vegetable vendor", "Leafy-vegetable and herb seller", "Coconut and tender-coconut seller", "Banana and seasonal-fruit seller",
    "Mango and orchard fruit seller", "Potato, onion and garlic trader", "Organic and farm-fresh vegetable seller", "Cut-fruit and salad seller", "Sprouts and fresh-juice seller",
    "Flower and garland seller",
  ]),
  cat("Milk, Dairy, Egg & Poultry Sellers", [
    "Milk vendor (doodhwala)", "Milk booth and dairy outlet", "Curd, lassi and buttermilk seller", "Paneer, khoya and ghee seller", "Egg seller and egg stall",
    "Chicken and poultry-meat shop", "Mutton and goat-meat shop", "Fish and seafood seller", "Dry-fish seller", "Live-poultry and country-chicken seller",
    "Cattle and milch-animal trader", "Dairy cooperative collection agent", "Cream, butter and cheese seller", "Ice-cream and kulfi vendor",
  ]),
  cat("Tea Stalls, Snacks & Street Food Vendors", [
    "Tea stall (chaiwala)", "Coffee and tea kiosk", "Samosa, kachori and pakora stall", "Pani-puri and chaat seller", "Momos and noodles cart",
    "Vada-pav and pav-bhaji cart", "Dosa, idli and South-Indian cart", "Bhelpuri and sev-puri seller", "Roasted corn and peanut seller", "Sugarcane-juice and fruit-juice cart",
    "Lassi, falooda and cold-drink stall", "Ice-gola, kulfi and ice-cream cart", "Egg-roll and omelette cart", "Sandwich and burger cart", "Biryani and rice cart",
    "Roti, paratha and thali tiffin seller", "Snack and namkeen seller", "Cut-fruit and chaat seller",
  ]),
  cat("Sweet Shops, Bakeries & Home Food Makers", [
    "Sweet shop (mithai)", "Bakery and bread seller", "Cake and pastry maker", "Biscuit and rusk seller", "Papad, pickle and masala maker",
    "Home-made snacks and tiffin", "Jalebi and halwai counter", "Dry-fruit and gift-box seller", "Chikki, laddu and traditional sweets", "Frozen-food and ready-to-cook seller",
    "Tiffin and meal-box service", "Catering and cooking contractor",
  ]),
  cat("Kirana, Pan & Small Kiosk Owners", [
    "Kirana and general store", "Pan, bidi and cigarette kiosk", "Tea and cigarette stall", "Mobile recharge and SIM counter", "Stationery and xerox kiosk",
    "Egg, bread and daily-needs kiosk", "Cold-drink and snacks kiosk", "Bangle, bindi and ladies' accessories stall", "Toy and balloon seller", "Newspaper and magazine stall",
    "Lottery and ticket stall", "Water-bottle and soft-drink kiosk", "Medical and first-aid kiosk", "Footwear and chappal stall", "Phone cover and accessories stall",
    "Key and lock-repair kiosk",
  ]),
  cat("Tailors, Cloth Sellers & Garment Workers", [
    "Tailor (darzi)", "Ladies' tailor and boutique", "Gents' tailor and shirt maker", "Alteration and repair tailor", "Cloth merchant and sari seller",
    "Hawker cloth seller", "Readymade garment seller on cart", "Embroidery and zari worker", "Knitting and sweater maker", "Dry-cleaner and ironing (press) shop",
    "Washerman (dhobi) and laundry", "Garment piece-rate worker", "Thread, button and sewing-material shop", "Blanket, shawl and quilt maker",
  ]),
  cat("Barbers, Salon & Grooming Workers", [
    "Village barber (nai)", "Gents' hair-cutting salon", "Ladies' beauty parlour", "Mehendi artist", "Roadside barber",
    "Home-visit beautician", "Massage and champi service", "Beauty-product seller", "Hair-oil and cosmetics seller", "Nail and threading artist",
  ]),
  cat("Mechanics, Garages & Vehicle Repair Workers", [
    "Bike mechanic", "Car mechanic and garage", "Puncture and tyre repair", "Cycle repair shop", "Auto and e-rickshaw mechanic",
    "Truck and tractor mechanic", "Denting and painting worker", "Battery and electrical (auto) repair", "Car-wash and cleaning worker", "Spare-parts shop",
    "Mobile mechanic and roadside assistance", "Two-wheeler accessories seller", "Welding and fabrication worker", "Used-vehicle broker",
  ]),
  cat("Electricians, Plumbers & Skilled Tradespeople", [
    "Electrician (bijli mistri)", "Plumber", "Carpenter (barhai)", "Mason (rajmistri)", "House painter",
    "Tile and floor worker", "Welder and fabricator", "AC and refrigerator technician", "TV and appliance repair technician", "Mobile and laptop repair technician",
    "CCTV and wiring installer", "Borewell and pump mechanic", "Roofing and waterproofing worker", "POP and false-ceiling worker", "Glass and aluminium worker",
    "Locksmith and key maker", "Furniture polish and repair", "Solar and inverter technician",
  ]),
  cat("Drivers, Vehicle Owners & Delivery Partners", [
    "Auto-rickshaw driver and owner", "Taxi and cab driver", "E-rickshaw driver and owner", "Tempo and pickup driver", "Truck driver and owner",
    "Bus and van driver", "School-van owner", "Tractor and trolley owner", "JCB, crane and machine operator", "Bike-taxi and ride partner",
    "Food- and parcel-delivery rider", "Courier delivery boy", "Goods-carrier and handcart puller", "Water-tanker driver", "Ambulance driver",
    "Personal car driver (chauffeur)",
  ]),
  cat("Daily-Wage, Helper & Household Workers", [
    "Construction labourer and helper", "Farm labourer", "Loading and unloading worker", "Domestic help and maid", "Cook and kitchen helper",
    "Watchman and security guard", "Gardener (mali)", "Sweeper and cleaner", "Caretaker and attendant", "Nurse-aide and patient attendant",
    "Shop helper and salesperson", "Factory helper and operator", "Delivery and warehouse helper", "Hotel and dhaba worker", "Painter's and mason's helper",
  ]),
  cat("Flower, Pooja & Religious-Item Sellers", [
    "Pooja-samagri and incense seller", "Idol and photo-frame seller", "Temple prasad and coconut seller", "Rudraksha and mala seller", "Diya, candle and lamp seller",
    "Pandit and ritual services", "Religious books and calendars", "Rakhi and festival-item seller", "Holy-water and puja-kit seller",
  ]),
  cat("Scrap, Waste & Rag Pickers", [
    "Kabadiwala (scrap dealer)", "Rag picker and waste collector", "Old newspaper and paper buyer", "Iron and metal scrap buyer", "Plastic and bottle collector",
    "Old-clothes and utensil exchange", "Old furniture and appliance buyer", "Battery and e-waste collector",
  ]),
  cat("Mobile, Computer & Digital Service Points", [
    "Mobile repair shop", "Mobile recharge and bill-pay point", "Cyber cafe and online-form centre", "Photocopy and printing shop", "Passport-photo studio",
    "CSC and e-governance centre", "Aadhaar and PAN service point", "Bank mitra and micro-ATM point", "Ticket booking and travel counter", "DTH and cable-TV connection agent",
    "Computer-training centre", "Typing and DTP operator",
  ]),
  cat("Cattle, Poultry & Small Livestock Keepers", [
    "Cow and buffalo keeper", "Goat and sheep keeper", "Poultry (desi and broiler) keeper", "Duck and quail keeper", "Pig farmer",
    "Fish-pond keeper", "Bee keeper", "Camel, horse and donkey keeper", "Cattle-feed seller", "Veterinary helper and vaccinator",
    "Dung-cake and manure seller", "Milk-route and collection agent",
  ]),
  cat("Small Farmers, Gardeners & Nursery Owners", [
    "Small and marginal farmer", "Kitchen-garden grower", "Vegetable and flower grower", "Orchard and fruit grower", "Nursery and plant seller",
    "Seed and sapling seller", "Farm-machinery rental owner", "Pump and irrigation operator", "Sharecropper and tenant farmer", "Agricultural labour contractor",
    "Mushroom and herb grower", "Compost and organic-manure maker",
  ]),
  cat("Artisans, Craftspeople & Home Producers", [
    "Potter and clay worker", "Blacksmith (lohar)", "Cobbler (mochi) and leather worker", "Weaver and handloom worker", "Bamboo and cane craftsperson",
    "Wood and stone carver", "Jewellery and goldsmith worker", "Embroidery and handicraft maker", "Candle, agarbatti and soap maker", "Basket, mat and broom maker",
    "Toy and doll maker", "Home-based packing and assembly worker", "Painter and sign-board artist",
  ]),
  cat("Agriculture, Forestry & Fishing", [
    "Cereals, rice and oilseed farming", "Vegetable and fruit growing", "Plantation crops (tea, coffee, rubber, spices)", "Flowers, nurseries and horticulture",
    "Dairy and cattle farming", "Poultry and egg farming", "Sheep, goat and pig farming", "Beekeeping and sericulture", "Mixed farming",
    "Seeds, farm inputs and crop support services", "Post-harvest and primary processing services", "Hunting and trapping", "Forestry and logging",
    "Gathering of forest products", "Marine fishing", "Freshwater fishing", "Aquaculture and fish farming", "Organic and precision farming (agritech)", "Hydroponics and vertical farming",
  ]),
  cat("Mining & Quarrying", [
    "Coal and lignite mining", "Crude petroleum extraction", "Natural gas extraction", "Iron ore mining", "Non-ferrous metal ores (gold, copper, bauxite, others)",
    "Stone, sand and clay quarrying", "Salt extraction", "Chemical and fertilizer minerals", "Gemstones and diamonds", "Oil and gas drilling support", "Other mining support services",
  ]),
  cat("Food, Beverage & Tobacco Manufacturing", [
    "Meat and poultry processing", "Fish and seafood processing", "Fruit and vegetable processing", "Edible oils and fats", "Dairy products", "Grain milling and starch products",
    "Bakery products", "Sugar and confectionery", "Pasta, noodles and snacks", "Ready meals and packaged foods", "Spices, sauces and condiments", "Animal feed", "Distilled spirits",
    "Wine and fermented beverages", "Beer and malt", "Soft drinks and bottled water", "Tea and coffee processing", "Tobacco products",
  ]),
  cat("Textiles, Apparel & Leather", [
    "Spinning and weaving", "Knitting and crocheting", "Textile finishing and dyeing", "Carpets, rugs and home textiles", "Technical and industrial textiles", "Ready-made garments",
    "Uniforms and workwear", "Fur and leather apparel", "Footwear", "Leather goods and luggage", "Fashion design and accessories",
  ]),
  cat("Wood, Paper & Printing", [
    "Sawmilling and wood processing", "Wood products and veneer", "Builders' carpentry and joinery", "Wooden containers and pallets", "Pulp and paper", "Corrugated paper and cartons",
    "Household and stationery paper products", "Commercial printing", "Pre-press and bookbinding", "Reproduction of recorded media",
  ]),
  cat("Chemicals, Pharmaceuticals & Plastics", [
    "Basic and industrial chemicals", "Fertilizers and agrochemicals", "Paints, coatings and inks", "Soaps, detergents and cleaning products", "Cosmetics and personal care products",
    "Specialty chemicals", "Industrial gases", "Man-made fibres", "Pharmaceutical formulations", "Active pharmaceutical ingredients", "Biotechnology products and vaccines",
    "Rubber products and tyres", "Plastic products", "Petroleum refining", "Coke and fuel products",
  ]),
  cat("Metals, Machinery & Equipment", [
    "Iron and steel", "Non-ferrous metals", "Foundries and casting", "Structural metal products", "Tanks, boilers and pressure vessels", "Forging, stamping and machining",
    "Cutlery, tools and hardware", "General-purpose machinery", "Agricultural and forestry machinery", "Machine tools", "Mining and construction machinery",
    "Food and beverage processing machinery", "Textile and printing machinery", "Pumps, compressors and valves", "Electric motors, generators and transformers",
    "Batteries and accumulators", "Wires, cables and wiring devices", "Lighting equipment", "Domestic appliances", "Industrial automation and robotics",
    "Repair and maintenance of machinery", "Installation of industrial equipment",
  ]),
  cat("Electronics, Computers & Optical", [
    "Electronic components and semiconductors", "Printed circuit boards", "Computers and peripherals", "Communication equipment", "Consumer electronics",
    "Measuring, testing and navigation instruments", "Medical and electro-medical equipment", "Optical instruments and photographic equipment", "Watches and clocks",
    "Magnetic and optical media", "IoT devices and wearables", "Security and surveillance equipment",
  ]),
  cat("Automotive & Transport Equipment", [
    "Passenger cars and commercial vehicles", "Auto parts and accessories", "Vehicle bodies, trailers and caravans", "Motorcycles and scooters", "Bicycles and e-bikes",
    "Electric vehicles and charging equipment", "Shipbuilding and boat making", "Railway locomotives and rolling stock", "Tractors and off-highway vehicles",
  ]),
  cat("Aerospace & Defence", [
    "Aircraft and helicopter manufacturing", "Spacecraft and launch vehicles", "Satellites and space systems", "Aircraft maintenance, repair and overhaul",
    "Military vehicles and weapons", "Defence electronics and systems", "Drones and unmanned systems",
  ]),
  cat("Furniture & Other Manufacturing", [
    "Furniture (home and office)", "Mattresses", "Jewellery and precious metals", "Imitation jewellery", "Musical instruments", "Sports goods", "Games and toys",
    "Medical and dental supplies", "Office and school supplies", "Packaging products", "3D printing and additive manufacturing", "Signs, brushes and miscellaneous goods",
  ]),
  cat("Energy & Utilities", [
    "Thermal power generation", "Hydroelectric power", "Nuclear power", "Solar energy", "Wind energy", "Biomass, biogas and biofuels", "Geothermal and tidal energy",
    "Electricity transmission and distribution", "Gas distribution", "Steam and air-conditioning supply", "Energy trading and retail", "Energy storage",
    "Green hydrogen and fuel cells", "Energy services and efficiency",
  ]),
  cat("Water, Waste & Environment", [
    "Water collection, treatment and supply", "Sewerage and wastewater treatment", "Non-hazardous waste collection", "Hazardous waste management", "Waste treatment and disposal",
    "Recycling and materials recovery", "E-waste and scrap processing", "Site remediation and clean-up", "Environmental consulting and testing", "Pollution control services",
  ]),
  cat("Construction & Infrastructure", [
    "Residential building construction", "Commercial and industrial building construction", "Roads, highways and railways", "Bridges and tunnels", "Water, sewer and utility projects",
    "Power and telecom line construction", "Demolition and site preparation", "Electrical installation", "Plumbing, heating and air-conditioning installation",
    "Plastering, painting and flooring", "Roofing and structural steel erection", "Interior fit-out", "Prefabricated buildings", "Dredging and marine construction",
    "Architectural-grade glazing and facades", "Engineering, procurement and construction (EPC)",
  ]),
  cat("Wholesale Trade", [
    "Agricultural raw materials and live animals", "Food, beverages and tobacco", "Household goods and consumer products", "Textiles, clothing and footwear", "Pharmaceuticals and medical goods",
    "Machinery and industrial equipment", "Computers, electronics and telecom equipment", "Fuels, chemicals and industrial products", "Metals and minerals", "Construction materials and hardware",
    "Waste and scrap", "Commission and brokerage trade", "Import and export trading", "Distribution and supply-chain trading",
  ]),
  cat("Retail Trade", [
    "Supermarkets and grocery stores", "Specialised food and beverage stores", "Department stores", "Clothing and footwear stores", "Pharmacies and chemists", "Electronics and appliance stores",
    "Hardware and DIY stores", "Furniture and home furnishing stores", "Books, stationery and gifts", "Sports and toy stores", "Jewellery, watches and luxury goods", "Cosmetics and perfumery stores",
    "Automotive parts and accessories retail", "Fuel stations", "Online retail and e-commerce stores", "Marketplaces and aggregators", "Direct selling and multi-level marketing",
    "Street vendors and markets", "Second-hand goods and antiques", "Vending and convenience retail",
  ]),
  cat("Motor Vehicle Sales & Services", [
    "New and used car sales", "Vehicle maintenance and repair", "Spare parts and accessories", "Motorcycle sales and service", "Car wash and detailing", "Roadside assistance",
    "Car rental and leasing", "Electric vehicle charging services",
  ]),
  cat("Transport & Logistics", [
    "Passenger rail", "Freight rail", "Urban public transit and buses", "Taxi and ride-hailing", "Road freight and trucking", "Pipeline transport", "Sea and coastal passenger transport",
    "Sea freight and shipping", "Inland waterways", "Passenger air transport", "Air cargo", "Space transport", "Warehousing and storage", "Cold chain logistics", "Ports, terminals and harbours",
    "Airport and airline ground services", "Freight forwarding and customs brokerage", "Courier, postal and express delivery", "Last-mile delivery", "Fleet management and logistics technology",
  ]),
  cat("Hospitality, Travel & Food Service", [
    "Hotels and resorts", "Hostels and guesthouses", "Short-term rentals and serviced apartments", "Camping and holiday parks", "Restaurants", "Fast food and quick-service restaurants",
    "Cafes, bakeries and tea houses", "Catering and banquets", "Bars, pubs and nightclubs", "Cloud kitchens and food delivery", "Travel agencies", "Tour operators and sightseeing",
    "Reservation and booking platforms", "Event and conference organisers", "Theme-park and attraction operators",
  ]),
  cat("Information Technology & Software", [
    "Custom software development", "Software products and SaaS", "Mobile app development", "Web development and design", "IT consulting and strategy", "Managed IT services and support",
    "Cloud computing and DevOps", "Cybersecurity", "Artificial intelligence and machine learning", "Data analytics and business intelligence", "Blockchain and Web3", "IoT and embedded systems",
    "ERP and CRM implementation", "Software testing and QA", "Game development", "AR/VR and metaverse", "Robotic process automation", "Data centres and web hosting", "Web portals and search engines",
    "Data processing and digital services", "IT staffing and resourcing", "Digital transformation services", "Fintech software", "Healthtech software", "Edtech platforms", "E-commerce platforms and tools",
    "Low-code / no-code platforms", "API and integration platforms", "UI/UX design services",
  ]),
  cat("Media, Publishing & Entertainment", [
    "Book publishing", "Newspaper and magazine publishing", "Directories and online publishing", "Film and video production", "Television programme production", "Post-production, animation and VFX",
    "Film distribution and cinemas", "Music recording and publishing", "Radio broadcasting", "Television broadcasting", "OTT and video streaming", "Podcasts and audio platforms",
    "News agencies", "Content creation and influencers", "Social media platforms", "Gaming and esports media",
  ]),
  cat("Telecommunications", [
    "Wired telecommunications", "Wireless and mobile operators", "Satellite telecommunications", "Internet service providers", "Mobile virtual network operators", "Telecom towers and infrastructure",
    "VoIP and communications platforms (CPaaS)", "Network equipment services", "Telecom resellers and retail",
  ]),
  cat("Banking & Financial Services", [
    "Central banking", "Commercial and retail banking", "Cooperative banks and credit unions", "Microfinance", "Non-bank lending (NBFC)", "Credit cards and payments", "Payment gateways and processors",
    "Leasing and hire purchase", "Trusts, funds and similar vehicles", "Asset and wealth management", "Securities brokerage", "Investment banking", "Venture capital and private equity",
    "Stock and commodity exchanges", "Financial advisory and planning", "Credit rating and bureaus", "Fintech and digital banking", "Crypto and digital assets", "Foreign exchange and remittance", "Holding companies",
  ]),
  cat("Insurance & Pensions", [
    "Life insurance", "General (non-life) insurance", "Health insurance", "Reinsurance", "Pension funds", "Insurance brokers and agents", "Claims and loss adjusting", "Insurtech",
  ]),
  cat("Real Estate", [
    "Real estate development", "Residential leasing and rentals", "Commercial and office leasing", "Real estate agencies and brokerage", "Property management", "Land development and plotting",
    "Co-working and co-living", "Real estate investment trusts", "Valuation and surveying", "Proptech",
  ]),
  cat("Legal, Accounting & Consulting", [
    "Legal services", "Notary and patent services", "Accounting and audit", "Tax advisory", "Bookkeeping and payroll services", "Management consulting", "Strategy and business advisory",
    "HR and talent consulting", "Public relations and communications", "Corporate head offices", "Compliance and risk advisory",
  ]),
  cat("Architecture, Engineering & Design", [
    "Architecture", "Urban and town planning", "Civil and structural engineering", "Mechanical and electrical engineering", "Surveying and mapping (GIS)", "Technical testing and inspection",
    "Industrial and product design", "Interior design", "Graphic and communication design", "Fashion and textile design", "Landscape architecture",
  ]),
  cat("Research & Development", [
    "Natural sciences and engineering research", "Biotechnology research", "Clinical research and contract research organisations", "Social sciences and humanities research",
    "Think tanks and policy research", "Space and aerospace research", "Materials and nanotechnology research",
  ]),
  cat("Advertising, Marketing & Market Research", [
    "Advertising agencies", "Media buying and representation", "Digital marketing and SEO", "Social media marketing", "Influencer and affiliate marketing", "Branding and creative studios",
    "Market research and polling", "Event and experiential marketing", "Direct and email marketing", "Outdoor and display advertising",
  ]),
  cat("Other Professional & Technical Services", [
    "Photography and videography", "Translation and interpretation", "Veterinary services", "Business brokerage", "Meteorological and weather services", "Specialised consultancy (agri, energy, mining)",
    "Quantity surveying and cost consulting", "Freelance and independent professionals",
  ]),
  cat("Staffing & Business Support", [
    "Recruitment and executive search", "Temporary and contract staffing", "HR outsourcing and employer-of-record", "Call centres and customer support", "Business process outsourcing (BPO)",
    "Back-office and data-entry services", "Document preparation and secretarial services", "Credit collection services", "Equipment rental and leasing", "Packaging and labelling services",
    "Trade-show and exhibition services", "Office administration services",
  ]),
  cat("Security & Facility Services", [
    "Private security and guarding", "Security systems and monitoring", "Investigation services", "Building cleaning and janitorial", "Pest control", "Landscaping and gardening",
    "Integrated facility management", "Industrial cleaning",
  ]),
  cat("Government & Public Administration", [
    "General public administration", "Defence", "Police and public order", "Fire and rescue", "Justice and courts", "Social security administration", "Tax and customs authorities",
    "Regulatory bodies", "Municipal and local government", "Public sector undertakings", "e-Governance services",
  ]),
  cat("Education & Training", [
    "Pre-school and kindergarten", "Primary and secondary schools", "Colleges and universities", "Technical and vocational training", "IT and software training", "Coaching and test preparation",
    "Language training", "Arts, music and dance schools", "Sports and fitness instruction", "Driving schools", "Corporate and professional training", "E-learning and online courses",
    "Tutoring and home tuition", "Educational support services", "Skill development and internships", "Study-abroad and admissions consulting", "Edtech",
  ]),
  cat("Healthcare & Life Sciences", [
    "Hospitals", "General medical practice and clinics", "Specialist medical practice", "Dental practice", "Diagnostic laboratories and imaging", "Ambulance and emergency services",
    "Nursing and home healthcare", "Physiotherapy and rehabilitation", "Ayurveda, homeopathy and traditional medicine", "Mental health and counselling", "Telemedicine and digital health",
    "Blood banks and medical logistics", "Medical devices distribution", "Fertility and maternal care", "Wellness and preventive health", "Healthcare staffing",
  ]),
  cat("Social Care, NGOs & Associations", [
    "Elder care and residential care", "Child care and day nurseries", "Disability and special-needs support", "Community and social work", "Charities and NGOs", "Religious organisations",
    "Political organisations", "Trade unions and employer associations", "Professional and membership associations", "Foundations and trusts",
  ]),
  cat("Arts, Sports & Recreation", [
    "Performing arts and theatre", "Artists, writers and creators", "Museums and heritage sites", "Libraries and archives", "Zoos and botanical gardens", "Casinos, lotteries and betting",
    "Sports clubs and leagues", "Fitness centres and gyms", "Sports facilities and stadiums", "Amusement and water parks", "Esports and gaming venues", "Concerts and live-event venues",
  ]),
  cat("Personal & Household Services", [
    "Hairdressing and beauty salons", "Spa, massage and wellness centres", "Laundry and dry cleaning", "Funeral and related services", "Tailoring and boutiques", "Tattoo and body art",
    "Repair of electronics and appliances", "Repair of computers and phones", "Repair of household goods and footwear", "Pet care, grooming and boarding", "Domestic help and home services",
    "Photo studios and printing", "Wedding and event planning", "Matchmaking and dating services",
  ]),
  cat("International & Extraterritorial Organisations", [
    "United Nations and agencies", "Embassies and consulates", "Multilateral development organisations", "International NGOs", "Households as employers of domestic staff", "Own-use production by households",
  ]),
  cat("Consumer Goods & FMCG", [
    "Packaged food brands", "Beverage brands", "Personal care brands", "Household and cleaning products", "Baby and child products", "Health supplements and nutraceuticals",
    "Private-label manufacturing", "Consumer durables", "Stationery and school supply brands", "Direct-to-consumer (D2C) brands",
  ]),
  cat("Fashion, Luxury & Lifestyle", [
    "Fashion and apparel brands", "Luxury goods", "Eyewear", "Watch and jewellery brands", "Handbags and accessories", "Sustainable and ethical fashion", "Home décor and lifestyle products", "Perfumes and fragrances",
  ]),
  cat("Beauty, Cosmetics & Wellness", [
    "Skincare", "Makeup and colour cosmetics", "Hair care", "Salon and barbershop chains", "Spa and day-spa operators", "Wellness retreats", "Ayurvedic and herbal products", "Fitness nutrition and supplements",
  ]),
  cat("Sports & Fitness", [
    "Sports goods manufacturing and retail", "Gyms and fitness chains", "Yoga and wellness studios", "Sports academies and coaching", "Sports management and events", "Fitness apps and wearables", "Outdoor and adventure sports",
  ]),
  cat("Gaming & Esports", [
    "Game studios and developers", "Mobile gaming", "PC and console gaming", "Game publishing", "Esports teams and organisations", "Gaming hardware and peripherals", "Fantasy sports and real-money gaming", "Game streaming and communities",
  ]),
  cat("Events, Exhibitions & Weddings", [
    "Event management", "Exhibition and trade-show organisers", "Wedding planners", "Venue and banquet operators", "Audio-visual and staging services", "Ticketing platforms", "Conference and summit organisers",
  ]),
  cat("Pets & Animal Care", [
    "Pet food and supplies", "Pet retail", "Veterinary clinics and hospitals", "Pet grooming and boarding", "Animal breeding", "Pet technology", "Animal shelters and welfare",
  ]),
  cat("Marine & Maritime", [
    "Shipping lines", "Port and terminal operations", "Shipyards and ship repair", "Offshore oil and gas services", "Marine equipment", "Seafood export", "Cruise and ferry operations", "Maritime training and crewing", "Yacht and boat services",
  ]),
  cat("Biotechnology & Life Sciences", [
    "Biopharmaceuticals", "Genomics and bioinformatics", "Agricultural biotechnology", "Diagnostics and test kits", "Laboratory equipment and supplies", "Contract development and manufacturing (CDMO)", "Medical biotechnology", "Synthetic biology",
  ]),
  cat("Environment & Sustainability", [
    "Carbon credits and offsets", "ESG and sustainability consulting", "Renewable project development", "Green building and certification", "Water conservation", "Sustainable packaging", "Circular economy and reuse", "Climate technology",
  ]),
  cat("Home & Property Services", [
    "Plumbing and electrical services", "Home renovation and remodelling", "Interior contractors", "Packers, movers and relocation", "Home security and smart-home installation", "Appliance servicing", "Gardening and lawn care", "On-demand home services platforms",
  ]),
  cat("Packaging, Labelling & Printing Services", [
    "Flexible packaging", "Rigid and plastic packaging", "Glass and metal packaging", "Labels and stickers", "Packaging machinery", "Digital and wide-format printing", "Promotional products and merchandise",
  ]),
  cat("Crafts, Handicrafts & Artisans", [
    "Handloom and handicrafts", "Pottery and ceramics", "Woodcraft and carving", "Metalcraft and artefacts", "Souvenirs and gifts", "Artisan cooperatives", "Art galleries and dealers",
  ]),
  cat("Cooperatives & Community Enterprises", [
    "Agricultural cooperatives", "Dairy cooperatives", "Credit and thrift societies", "Self-help groups", "Farmer producer organisations", "Housing societies", "Community-owned enterprises",
  ]),
  cat("Religious & Spiritual Services", [
    "Temples, churches, mosques and trusts", "Pilgrimage and religious tourism", "Spiritual retreats and ashrams", "Religious education", "Religious goods and publications",
  ]),
  cat("Mobility & Smart Transport", [
    "Micro-mobility (scooters, bikes)", "Car sharing and pooling", "Autonomous vehicles", "Public-transit technology", "Parking management", "EV fleets and battery swapping", "Aviation technology and air mobility",
  ]),
  cat("Emerging & Specialty Industries", [
    "Quantum computing", "Nanotechnology", "Smart cities", "Space technology and satellites", "Longevity and anti-ageing", "Hemp and specialty crops (where legal)", "Robotics and autonomous systems", "Digital identity and trust services",
  ]),
  cat("Digital Creators & Creator Economy", [
    "YouTubers and video creators", "Short-video and reels creators", "Live streamers", "Podcasters and audio creators", "Bloggers and website publishers", "Newsletter and Substack writers",
    "Social-media influencers (lifestyle)", "Fashion and beauty influencers", "Tech and gadget reviewers", "Travel and food vloggers", "Fitness and wellness creators", "Gaming and esports creators", "Educational and course creators",
    "UGC (user-generated content) creators", "Memes and community page owners", "Digital artists and illustrators", "NFT and digital collectibles creators", "Voice-over and dubbing artists", "Affiliate marketers", "Brand ambassadors and endorsers",
    "Creator management agencies and MCNs", "Stock photo, video and music contributors", "Social-media managers and community managers", "Livestream sellers and shopping hosts",
  ]),
  cat("Freelancers, Gig Work & Independent Professionals", [
    "Freelance software developers", "Freelance designers and illustrators", "Freelance writers, editors and translators", "Freelance marketers and SEO specialists", "Freelance video editors and animators",
    "Virtual assistants and remote support", "Independent consultants", "Online tutors and coaches", "Gig and on-demand workers", "Remote talent marketplaces", "Micro-task and data-labelling platforms", "Solopreneurs and one-person businesses",
    "Part-time and side-hustle businesses", "Coworking-based independents",
  ]),
  cat("Internet Platforms & Marketplaces", [
    "Social networks and community platforms", "Online marketplaces (B2C)", "B2B marketplaces and trade portals", "Classified and listing portals", "Dating and matrimony platforms", "Ride-hailing and delivery apps", "Super apps",
    "Review, rating and comparison sites", "Job portals and career platforms", "Travel and booking portals", "Real-estate portals", "Crowdsourcing and Q&A communities", "Streaming and subscription platforms", "Peer-to-peer rental and sharing platforms",
  ]),
  cat("Digital Media & Content Services", [
    "Copywriting and content writing", "Video editing and post-production services", "Motion graphics and explainer videos", "Subtitling, dubbing and localisation", "Audiobook and voice production", "Stock content libraries",
    "Social-media content agencies", "Photography and photo editing studios", "Podcast production studios", "Digital publishing and e-books", "News and magazine websites", "Content licensing and syndication",
  ]),
  cat("Music, Performing Arts & Talent", [
    "Singers and vocalists", "Bands and musicians", "Music producers and composers", "DJs and electronic artists", "Instrument teachers and music schools", "Dancers and choreographers", "Actors and theatre artists",
    "Stand-up comedians", "Models and fashion talent", "Anchors, emcees and presenters", "Magicians and live entertainers", "Talent agencies and artist management", "Record labels and music distributors", "Casting and production crews",
  ]),
  cat("Writers, Authors & Publishing Professionals", [
    "Authors and novelists", "Journalists and reporters", "Editors and proofreaders", "Ghostwriters and speechwriters", "Self-publishing and book services", "Literary agents", "Screenwriters and scriptwriters",
    "Technical and academic writers", "Poets and spoken-word artists", "Cartoonists and comic creators",
  ]),
  cat("Fine Arts, Design & Visual Culture", [
    "Painters and visual artists", "Sculptors and installation artists", "Illustrators and concept artists", "Art galleries and auction houses", "Art restoration and conservation", "Photographers and visual storytellers",
    "Tattoo and body-art studios", "Calligraphy and lettering artists", "Fashion illustrators and textile designers", "Public art and murals",
  ]),
  cat("AI, Machine Learning & Data", [
    "Generative AI products and apps", "Large-language-model applications and agents", "AI consulting and strategy", "Computer vision solutions", "Natural-language processing", "Data labelling and annotation", "MLOps and AI infrastructure",
    "AI chips and accelerators", "Predictive analytics and forecasting", "Recommendation and personalisation engines", "Synthetic data and simulation", "AI for healthcare", "AI for finance and risk", "Robotics and autonomous systems", "Speech and voice AI", "AI governance and safety",
  ]),
  cat("Cybersecurity & Trust", [
    "Penetration testing and red teaming", "Managed detection and response (MSSP/SOC)", "Identity and access management", "Governance, risk and compliance (GRC)", "Application and cloud security", "Network and endpoint security",
    "Digital forensics and incident response", "Security awareness training", "Fraud detection and prevention", "Privacy and data-protection consulting", "Encryption and key management", "Threat intelligence",
  ]),
  cat("Cloud, Data Centres & Infrastructure", [
    "Public-cloud services and resellers", "Private and hybrid cloud", "Colocation and data centres", "Content-delivery networks", "Managed hosting and domains", "Edge computing", "Storage and backup services",
    "Disaster recovery services", "Network and SD-WAN services", "Observability and monitoring tools",
  ]),
  cat("Blockchain, Crypto & Web3", [
    "Crypto exchanges and brokers", "Wallets and custody", "Decentralised finance (DeFi)", "NFT marketplaces and platforms", "Blockchain development and consulting", "Crypto mining", "Tokenisation of assets",
    "Web3 gaming and metaverse", "DAO tooling and communities", "Crypto payments and stablecoins", "Smart-contract auditing",
  ]),
  cat("Industry Technology (Vertical Tech)", [
    "HR tech and payroll software", "Legal tech", "Proptech", "Agritech", "Logistics and supply-chain tech", "Retail and POS technology", "Martech and adtech", "Sales and CRM technology", "Govtech and civic tech",
    "Foodtech and restaurant tech", "Travel and hospitality tech", "Medtech", "Cleantech", "Construction tech", "Manufacturing tech (Industry 4.0)", "Sports tech", "Event tech", "Energy tech", "Mobility tech", "Insurtech and regtech",
  ]),
  cat("Jewellery, Gems & Precious Metals", [
    "Gold jewellery manufacturing", "Diamond cutting and polishing", "Silver and artificial jewellery", "Gemstone dealers", "Bullion and precious-metals trading", "Hallmarking and assaying", "Jewellery design studios", "Jewellery retail chains", "Watch and luxury accessory dealers",
  ]),
  cat("Toys, Baby & Kids Products", [
    "Toy manufacturing and retail", "Baby gear and nursery products", "Children's clothing", "Educational toys and learning kits", "Kids' books and activity products", "School bags and accessories", "Play centres and kids' entertainment",
  ]),
  cat("Alcohol, Cannabis & Specialty Beverages", [
    "Breweries and craft beer", "Wineries and vineyards", "Distilleries and spirits brands", "Bars and liquor distribution", "Non-alcoholic and functional beverages", "Kombucha and fermented drinks", "Cannabis and hemp products (where legal)", "Tea and coffee estates and roasters",
  ]),
  cat("Import, Export & Trade Facilitation", [
    "Export houses and merchant exporters", "Import trading and sourcing agents", "Customs clearing agents", "Trade-fair and buyer-seller meets", "Cross-border e-commerce", "Free-trade and special-economic-zone units", "Letters of credit and trade documentation", "International franchising and distribution",
  ]),
  cat("Franchising & Business Opportunities", [
    "Franchise brand owners (franchisors)", "Franchise consultants and brokers", "Master franchise and area development", "Business-opportunity and licensing programmes", "Retail and food franchise operators", "Service franchise operators",
  ]),
  cat("Industrial Services & Maintenance", [
    "Industrial maintenance and shutdown services", "Calibration and metrology labs", "Scaffolding and formwork", "Industrial cleaning and painting", "Non-destructive testing (NDT)", "Plant commissioning and turnkey projects", "Spare parts and MRO supply",
    "Industrial automation integrators", "Elevator and HVAC servicing", "Environmental, health and safety (EHS) services",
  ]),
  cat("Tourism, Culture & Heritage", [
    "Heritage and museum operators", "Cultural festivals and fairs", "Tour guides and local experiences", "Adventure and eco-lodges", "Tourism boards and promotion", "Religious and spiritual tourism", "Rural and farm-stay tourism", "Cruise and houseboat operators",
  ]),
  cat("Nonprofit, Social Impact & Community", [
    "Education and literacy NGOs", "Health and nutrition NGOs", "Environmental and wildlife NGOs", "Women and child welfare", "Disaster relief and humanitarian aid", "Microfinance and livelihood programmes", "Human-rights and advocacy groups",
    "Community clubs and associations", "Alumni and professional networks", "Volunteer and crowdfunding platforms", "Impact investing and social enterprises",
  ]),
  cat("General Stores, Grocery & Daily Needs", [
    "General & Kirana store", "Provision store", "Grocery store", "Supermarket", "Mini-mart and convenience store", "Wholesale grocery", "Vegetable shop", "Fruit shop", "Milk and dairy booth", "Egg shop",
    "Chicken and mutton shop", "Fish and seafood shop", "Dry-fruits and nuts shop", "Spices and masala shop", "Flour mill (atta chakki)", "Rice mill", "Oil mill (ghani)", "Bakery", "Sweet shop", "Namkeen and snacks shop",
    "Paan, cigarette and tobacco shop", "Tea stall and tea shop", "Ration and fair-price shop", "Organic store", "Imported foods and gourmet store", "Frozen foods and ice-cream distributor", "Pickles, papad and homemade foods",
    "Packaged drinking water supplier", "RO water can supplier", "Gas cylinder (LPG) agency", "Newspaper and magazine agency", "Stationery and photocopy shop", "Gift and general merchandise store", "Variety and dollar store",
    "Cosmetics and general store", "Pooja items and samagri shop", "Bangles and fancy store", "Hardware and general store", "Ice factory and cold drinks agency", "Farm-fresh and direct-from-farm store",
  ]),
  cat("Restaurants, Cafes & Eateries", [
    "Restaurant (multi-cuisine)", "Fine-dining restaurant", "Family restaurant", "Vegetarian restaurant", "Non-vegetarian restaurant", "Dhaba and highway restaurant", "Fast-food outlet", "Pizzeria", "Burger joint", "Biryani house",
    "South Indian restaurant", "North Indian restaurant", "Chinese restaurant", "Italian restaurant", "Continental restaurant", "Mexican restaurant", "Thai restaurant", "Japanese and sushi restaurant", "Korean restaurant",
    "Middle-Eastern and Arabic restaurant", "Mughlai restaurant", "Seafood restaurant", "Barbecue and grill", "Thali and home-style restaurant", "Cafe", "Coffee shop", "Bakery cafe", "Tea room", "Ice-cream parlour",
    "Juice and shake bar", "Dessert parlour", "Cake and pastry shop", "Chocolate shop", "Waffle, pancake and crepe shop", "Bubble-tea shop", "Food truck", "Cloud kitchen", "Tiffin and meal service", "Canteen and mess",
    "Chaat, pani-puri and street-food stall", "Momos and rolls outlet", "Sandwich and sub shop", "Vada-pav and snack outlet", "Dosa and idli outlet", "Bar and restaurant", "Pub and brewery pub", "Lounge and hookah bar", "Rooftop restaurant",
    "Food court", "Vegan and health-food restaurant", "Salad bar", "Home chef and home-kitchen", "Franchise food outlet", "Banquet and party kitchen",
  ]),
  cat("Medical Stores, Clinics & Local Healthcare", [
    "Medical store and pharmacy", "Generic medicine store", "General physician clinic", "Dental clinic", "Eye clinic and optician", "Skin and hair clinic", "Physiotherapy centre", "Diagnostic laboratory and pathology lab",
    "X-ray, ultrasound and scan centre", "Maternity home and nursing home", "Ayurvedic clinic", "Homeopathy clinic", "Unani and Siddha clinic", "Naturopathy and yoga clinic", "Chiropractic and acupuncture", "Dietitian and nutrition clinic",
    "Veterinary clinic", "Pet pharmacy", "Blood collection centre", "Ambulance service", "Hearing-aid centre", "Orthopaedic and surgical goods store", "Medical equipment rental", "Counselling and therapy centre", "De-addiction and rehabilitation centre",
    "Child-development and speech therapy", "Elder-care and home-nursing services", "Health-check and wellness camp organisers",
  ]),
  cat("Beauty Parlours, Salons & Personal Care", [
    "Beauty parlour", "Ladies' salon", "Gents' salon and barber shop", "Unisex salon", "Bridal makeup studio", "Nail studio", "Spa and massage centre", "Tattoo and piercing studio", "Mehendi artist", "Threading and waxing studio",
    "Hair-transplant and trichology clinic", "Slimming and weight-loss centre", "Perfume and fragrance shop", "Cosmetics and beauty-supply shop", "Wig and hair-extension shop", "Skin-care and aesthetic clinic", "Grooming academy and beautician courses",
  ]),
  cat("Clothing, Footwear & Fashion Shops", [
    "Ladies' wear shop", "Gents' wear shop", "Kids' wear shop", "Saree shop", "Ethnic and wedding wear", "Boutique and designer wear", "Tailoring shop", "Uniform shop", "Readymade garment shop", "Cloth and fabric merchant",
    "Lingerie and innerwear shop", "Footwear shop", "Bag and luggage shop", "Sherwani and groom wear", "Handloom and khadi shop", "Woollen and winter wear", "Jeans and casual wear", "T-shirt printing and custom apparel", "Garment wholesalers",
    "Embroidery and alteration shop", "Maternity and plus-size wear", "Thrift and second-hand clothing", "Sportswear store", "Scarves, stoles and accessories", "Costume and fancy-dress rental",
  ]),
  cat("Electronics, Mobile & Computer Shops", [
    "Mobile phone shop", "Mobile accessories shop", "Mobile repair shop", "Computer and laptop store", "Computer and laptop repair", "Printer, toner and cartridge shop", "CCTV and security-camera dealer", "Home-appliance store", "AC dealer and installer",
    "TV and audio dealer", "Electrical and lighting shop", "Inverter, battery and UPS dealer", "Solar product dealer", "Camera and photography equipment shop", "Gaming console and accessories shop", "Second-hand electronics and exchange store",
    "Cyber cafe and browsing centre", "Photocopy, printing and lamination", "SIM card, recharge and DTH dealer", "Cable TV and local ISP operator", "Computer hardware assembler", "Drone and gadget store", "Smart-home and gadget retailer",
  ]),
  cat("Hardware, Building Materials & Home Furnishing Shops", [
    "Hardware and tools store", "Plywood and laminates dealer", "Paint shop", "Sanitary and bath-fittings shop", "Tiles and marble dealer", "Cement dealer", "Steel and iron dealer", "Bricks, sand and aggregate supplier", "Electrical goods shop",
    "Plumbing materials shop", "Glass and aluminium fabricator", "Furniture shop", "Mattress and bedding shop", "Modular kitchen showroom", "Curtains and furnishing store", "Carpet and flooring shop", "Lighting and lamp showroom", "Timber depot and sawmill",
    "Pipes and fittings dealer", "Fasteners and fittings dealer", "Safety equipment and PPE shop", "Locks and security-hardware shop", "Doors and windows dealer", "Roofing sheets and PEB dealer", "Scrap and junk dealer", "Used and second-hand furniture shop",
    "Home décor and artefacts shop", "Wallpaper and wall-product dealer",
  ]),
  cat("Repair, Installation & Home Services", [
    "Plumber", "Electrician", "Carpenter", "Painter and polisher", "AC repair and service", "Refrigerator and washing-machine repair", "TV and appliance repair", "Watch and clock repair", "Shoe and bag repair", "Bicycle repair shop",
    "Two-wheeler garage and service", "Car garage and service centre", "Puncture and tyre shop", "Denting and painting workshop", "Car accessories and audio shop", "Car and bike wash", "Auto spare-parts dealer", "Truck and heavy-vehicle repair",
    "Welding and fabrication workshop", "Lathe and machining workshop", "Pest-control service", "RO and water-purifier service", "Water-tank and sump cleaning", "Sofa and carpet cleaning", "House and office cleaning", "Packers and movers",
    "Gardener and landscaping service", "Generator and genset service", "CCTV and alarm installation", "Solar rooftop installation", "Interior contractor", "Renovation and civil contractor", "Flooring and tiling contractor", "Waterproofing contractor",
    "Borewell and pump contractor", "Septic-tank and drain cleaning", "Chimney and kitchen-appliance service", "Locksmith and key duplication", "Upholstery and curtain stitching", "Electrical wiring contractor", "Home-appliance rental",
  ]),
  cat("Tuition, Coaching & Local Education", [
    "Tuition centre", "Coaching institute", "Playschool and pre-school", "Day-care and creche", "Computer training institute", "Spoken-English and personality development", "Foreign-language classes", "Dance classes", "Music classes",
    "Drawing and art classes", "Abacus and vedic-maths classes", "Yoga and meditation classes", "Karate and martial-arts classes", "Swimming coaching", "Skating and roller-sports coaching", "Cricket coaching academy", "Football academy",
    "Badminton and tennis academy", "Chess academy", "Driving school", "Typing and shorthand institute", "Tailoring and fashion-design classes", "Beautician and salon courses", "Bank, SSC and railway exam coaching", "UPSC and state-service coaching",
    "NEET, JEE and CET coaching", "Library and self-study room", "Hostel and PG for students", "Education and admission consultancy", "Home tutors and tutor networks",
  ]),
  cat("Hotels, Lodging, Weddings & Event Services", [
    "Hotel", "Budget hotel and lodge", "Guest house", "Dharamshala and pilgrim lodge", "Resort", "Homestay", "Farm stay", "Hostel and backpackers", "PG accommodation", "Serviced apartments",
    "Banquet hall", "Marriage hall and lawn", "Tent house and shamiana", "Event decoration", "Wedding photographer and videographer", "Wedding planner", "DJ and sound system", "Band and baraat services", "Catering service",
    "Florist and flower decoration", "Event transport and bridal car", "Invitation cards and printing", "Return gifts and hampers", "Event lighting and staging",
  ]),
  cat("Taxis, Vehicles & Local Transport Businesses", [
    "Taxi and cab service", "Auto-rickshaw", "Travel agency and ticketing", "Bus operator", "Tempo and mini-truck", "Truck and lorry owner", "Water tanker supplier", "JCB, crane and excavator rental", "Ambulance and hearse service",
    "Driver-on-call service", "Self-drive car rental", "Bike rental", "New-car dealership", "Used-car dealer", "Two-wheeler showroom", "Electric-vehicle showroom", "Petrol and diesel pump", "CNG and LPG station", "Parking and valet",
    "Towing and recovery", "Vehicle insurance and RTO agent", "Transport and cargo company", "Courier and parcel agency", "School-bus operator", "Tour and travel operator",
  ]),
  cat("Finance, Insurance & Agents (Local)", [
    "Insurance agent", "LIC and life-insurance advisor", "Mutual-fund distributor", "Loan and DSA agent", "Chit fund and savings scheme", "Money transfer and forex dealer", "Pawn broker and gold buyer", "Tax consultant", "GST and ITR filing practitioner",
    "Notary and stamp vendor", "Property dealer", "Real-estate broker", "Plot and land developer", "Rental and tenant agent", "Cooperative society and credit society", "Microfinance agent", "Banking correspondent and payment-bank point", "Bill-payment and recharge centre",
    "Stock-broking sub-broker", "Document writer and registration agent", "ATM and cash-management services",
  ]),
  cat("Farming, Dairy & Rural Businesses", [
    "Crop farm", "Dairy farm", "Poultry farm", "Goat and sheep farm", "Fish and pond farm", "Plant nursery", "Fertilizer shop", "Seed shop", "Pesticide and agro-chemical shop", "Tractor and farm-machinery dealer",
    "Farm tools and implements", "Cold storage and warehouse", "Sugarcane and jaggery unit", "Tea and coffee estate", "Spice farm and trading", "Flower farm", "Mushroom farm", "Honey and apiary", "Organic and natural farming",
    "Vermicompost and bio-fertilizer unit", "Silk and cocoon rearing", "Cattle-feed and fodder supplier", "Agricultural commission agent (mandi)", "Grain and pulse trader", "Tractor and harvester rental", "Irrigation and drip-system dealer",
    "Beekeeping and wax products", "Farm-to-home produce delivery", "Rural tourism and agri-tourism",
  ]),
  cat("Small Manufacturing, Workshops & MSME Units", [
    "Job-work and contract manufacturing", "Packaging unit", "Plastic moulding unit", "Garment manufacturing unit", "Pickle, papad and snack unit", "Bakery and biscuit unit", "Ice-cream and dairy unit", "Soap and detergent unit", "Candle and incense (agarbatti) unit",
    "Pottery and terracotta", "Handicraft unit", "Furniture workshop", "Metal fabrication and powder coating", "Machine shop and tool room", "Foundry and casting unit", "Press-shop and sheet metal", "Rubber products unit", "Paper products and paper-cup unit",
    "Printing press", "Flex and banner printing", "Screen and offset printing", "Leather workshop", "Jewellery workshop", "Brick kiln", "Stone crusher and quarry unit", "Cement-products unit (blocks, pipes)", "Paint and chemical unit", "Cosmetic and herbal unit",
    "Electrical assembly and product unit", "Transformer and motor repair", "LED and lighting manufacturer", "Plastic recycling unit", "Bag and sack manufacturing", "Mattress and foam unit", "Handloom and powerloom", "Dyeing and processing unit", "Spinning mill",
    "Food-processing and masala unit", "Packaged water and beverage plant", "Wooden toys and crafts unit",
  ]),
  cat("Wholesale, Distribution & Dealers", [
    "FMCG distributor and super stockist", "General wholesaler", "Commission agent", "Authorised dealer", "Importer", "Exporter", "Pharma stockist", "Grain and pulses trader", "Spices and oils trader", "Scrap and metal trader",
    "Textile and fabric trader", "Electronics distributor", "Mobile phone distributor", "Stationery distributor", "Cosmetics distributor", "Hardware and tools distributor", "Dry-fruit trader", "Tea and coffee trader", "Machinery dealer",
    "Chemical trader", "Plastic raw-material trader", "Paper and board trader", "Garment wholesaler", "Footwear wholesaler", "Vegetable and fruit wholesaler (mandi)", "Bulk and industrial supplier",
  ]),
  cat("Online Sellers, Home-Based & Micro Businesses", [
    "Home bakery", "Home chef and tiffin", "Online boutique", "Instagram and WhatsApp seller", "Reseller", "Dropshipper", "Handmade crafts seller", "Resin-art and candle maker", "Handmade jewellery maker", "Crochet and knitting",
    "Home tailor and designer", "Home tuition", "Home salon and makeup artist", "Cake artist", "Gift-hamper maker", "Amazon seller", "Flipkart seller", "Meesho and marketplace reseller", "Etsy and global handmade seller",
    "Print-on-demand store", "Digital-product seller", "Online course seller", "Subscription-box business", "Thrift and pre-loved reseller", "Plant and terrarium seller", "Spice and homemade-food seller",
  ]),
  cat("Gyms, Sports Clubs & Recreation (Local)", [
    "Gym and fitness centre", "Yoga studio", "Zumba and aerobics studio", "CrossFit box", "Swimming pool", "Sports club", "Cricket academy and nets", "Football turf", "Badminton court", "Tennis court", "Snooker and pool parlour",
    "Bowling alley", "Gaming zone and arcade", "Cinema and multiplex", "Theatre and auditorium", "Amusement and kids' play zone", "Trampoline park", "Go-karting", "Paintball and laser tag", "Horse riding", "Adventure and trekking club", "Skating rink", "Golf course and driving range",
    "Escape rooms", "Martial-arts dojo", "Boxing and wrestling gym", "Cycling and running clubs",
  ]),
  cat("Professional Practices & Local Offices", [
    "Advocate and law office", "CA and audit firm", "Company-secretary practice", "Architect firm", "Civil and structural engineer", "Interior designer", "Surveyor and valuer", "Consultancy firm", "Recruitment and placement agency",
    "Immigration and visa agency", "Typing and document services", "Translation bureau", "Photography studio", "Digital-marketing agency", "Web-design studio", "Software and app company", "Astrologer and vastu consultant", "Detective and investigation agency",
    "Security-guard agency", "Event-management firm", "Courier and logistics office", "Printing and publishing house", "Advertising and hoarding agency", "Call centre and BPO", "Medical-transcription and coding office", "Language and test-prep consultancy",
  ]),
  cat("Specialty & Hobby Shops", [
    "Book store", "Toy shop", "Gift shop", "Sports-goods shop", "Pet shop and aquarium", "Florist and flower shop", "Optical shop", "Jewellery shop", "Watch shop", "Perfume shop", "Musical-instrument store", "Art and craft supplies",
    "Party-supplies store", "Antique and collectibles shop", "Auction house", "Liquor and wine shop", "Vape and e-cigarette store", "Health-supplement store", "Herbal and Ayurvedic products shop", "Garden and plant shop",
    "Bicycle shop", "Boat and marine dealer", "Fireworks and crackers shop", "Religious goods and idols shop", "Photo-frame and gift-printing shop", "Trophy and awards shop", "School-supplies and uniform shop", "Baby and maternity shop",
    "Bridal and wedding store", "Surplus and outlet store", "Hobby and model shop", "Coins, stamps and collectibles", "Telescope and science kits", "Aquarium and fish-food shop", "Bird and exotic-pet shop",
  ]),
  cat("Community, Public & Faith Places", [
    "Temple", "Mosque", "Church", "Gurdwara", "Monastery and Buddhist centre", "Religious trust", "Ashram", "Community hall", "Social club", "Library", "Charitable trust", "Old-age home", "Orphanage and children's home",
    "Blood bank", "Voluntary organisation", "Residents' welfare association", "Self-help group", "Youth club", "Public toilets and amenities operator", "Cemetery and crematorium services",
  ]),
  cat("Government Service Points & Utilities", [
    "Common Service Centre (CSC)", "Post-office franchise", "Passport service centre", "Aadhaar and ID service centre", "E-governance kiosk", "Bank mitra and payment point", "Electricity distribution", "Water supply board", "Municipal services",
    "Public transport authority", "Police and law-enforcement offices", "Courts and legal-aid centres", "Panchayat and local bodies", "Tax and registration offices", "Public health centre", "Government school and college", "Defence canteen and ex-servicemen services",
  ]),
  cat("Rural Services & Village Businesses", [
    "Gram panchayat and village office", "Common service centre (rural)", "Village shop and general store", "Village school and anganwadi", "Primary health sub-centre",
    "Cooperative dairy society", "Cooperative credit society", "Self-help group enterprise", "Farmer producer organisation", "Village artisan and craft unit",
    "Rural transport (jeep, tractor-trolley, cart)", "Village flour, oil and rice mill", "Weekly haat and mela vendor", "Village tent, sound and event services", "Rural tourism and homestay",
    "Village-level entrepreneur (VLE)", "Rural internet and Wi-Fi provider", "Solar and renewable village service", "Gaushala and cattle shelter", "Pond, fishery and water-body lease",
    "Forest produce and tendu-leaf collection", "Kendu, lac and non-timber forest products", "Brick, sand and local construction supply", "Rural BPO and data-entry centre",
  ]),
  cat("Street Vendors, Hawkers & Mobile Businesses", [
    "Fruit and vegetable cart (thela)", "Street-food cart and stall", "Tea, coffee and juice cart", "Pani-puri, chaat and snack cart", "Ice-cream and kulfi cart",
    "Balloon, toy and gift hawker", "Flower and garland seller", "Roadside cobbler and bag repair", "Roadside tailor and alteration", "Knife-sharpening and tool services",
    "Newspaper and magazine hawker", "Scrap and waste collector (kabadiwala)", "Pavement book and clothing seller", "Mobile accessory and cover stall", "Mobile van (fish, milk, vegetables on wheels)",
    "Pushcart and handcart trader", "Fair, mela and exhibition stall", "Temple-side puja and prasad stall", "Peddler and door-to-door seller", "Seasonal vendor (festival, fireworks, rakhi)",
  ]),
  cat("Enterprise, Corporate & Group Companies", [
    "Corporate headquarters", "Holding and group company", "Subsidiary of a multinational", "Global capability centre (GCC)", "Shared-services and back-office centre",
    "Public-sector undertaking (PSU)", "Listed company", "Special economic zone (SEZ) unit", "Large manufacturing plant", "Regional and branch offices",
    "Industrial park and estate operator", "Conglomerate with multiple businesses", "Joint venture", "Family-owned business group", "Large distributor and super-stockist network",
    "Franchisor and master franchise", "Enterprise software and IT department", "Corporate social responsibility (CSR) arm", "Captive power and utilities unit", "Training academy and corporate university",
  ]),
  cat("Unorganised Sector & Daily-Wage Services", [
    "Daily-wage labour contractor", "Construction labour and mason group", "Agricultural labour contractor", "Loading and unloading labour", "Head-load and porter workers",
    "Domestic workers' cooperative", "Home-based piece-rate workers", "Artisan and craftsperson collective", "Ragpickers and waste-picker cooperative", "Fisher and boat-owner cooperative",
    "Street-vendor association", "Rickshaw and auto-driver union", "Women's cooperative enterprise", "Handloom weavers' society",
  ]),
  cat("Aviation, Airports & Aerospace Services", [
    "Airline and charter operator", "Airport operator and ground handling", "Air-cargo and freight forwarder", "Aircraft maintenance (MRO)", "Flying club and pilot training",
    "Helicopter and air-ambulance services", "Drone service provider", "Aviation fuel and catering", "Travel retail at airports", "Air-traffic and aviation consulting",
    "Aircraft parts and leasing", "Airstrip and aerodrome operator",
  ]),
  cat("Warehousing, Cold Chain & Storage", [
    "Warehouse and godown owner", "Cold storage and cold-chain operator", "Bonded and customs warehouse", "Fulfilment and e-commerce warehousing", "Grain silo and food-corporation depot",
    "Self-storage and locker rental", "Container yard and freight station", "Pharma and temperature-controlled storage", "Dark store and quick-commerce hub", "Pallet and racking services",
    "Reefer-truck and refrigerated transport", "Packing, kitting and labelling services",
  ]),
  cat("Scrap, Recycling & Second-hand Trade", [
    "Kabadiwala and scrap collector", "Metal and iron-scrap dealer", "Paper and cardboard scrap dealer", "Plastic and bottle scrap dealer", "E-waste and battery collection",
    "Used-oil and chemical recycler", "Old-vehicle and parts dismantler", "Second-hand furniture and appliance market", "Textile and rag recycler", "Glass and crockery scrap dealer",
    "Bio-waste and food-waste collector",
  ]),
  cat("Seasonal, Festival & Occasion Businesses", [
    "Diwali lights, diya and decoration seller", "Firecracker licensed dealer", "Rakhi and festival gift stall", "Holi colour and pichkari seller", "Ganesh and Durga idol makers",
    "Christmas tree and cake seller", "Eid sewai, dates and attar stall", "Navratri garba and dandiya supplies", "Kite and manja seller", "Umbrella and raincoat seller",
    "Winter-wear and heater seller", "Wedding-season tent and sound hire", "Summer cooler, matka and cold-drink stall", "Mango and seasonal fruit seller", "Fair and mela contractor",
    "Pilgrimage-season service provider",
  ]),
  cat("Tribal, Forest & Hill-Region Livelihoods", [
    "Forest produce and non-timber collection", "Tribal handicraft and art cooperative", "Lac, honey and herbal-product gatherer", "Bamboo and cane worker", "Hill-farming and terrace cultivation",
    "Apple, orchard and dry-fruit growers", "Yak, sheep and wool producers", "Mountain homestay and trekking guide", "Herbal tea and mountain-spice producer", "Pony and mule transport",
    "Cold-desert and high-altitude tourism", "Cooperative eco-tourism group",
  ]),
  cat("Coastal, Fishing & Island Livelihoods", [
    "Traditional fisher and boat owner", "Fish-landing and auction centre", "Ice plant and fish-cold storage", "Net and boat-engine repair", "Dry-fish and fish-pickle unit",
    "Seaweed and coastal farming", "Salt-pan worker and producer", "Beach shack and water-sports operator", "Ferry and jetty operator", "Coconut and coir worker",
    "Shell and pearl craft", "Fisher cooperative society",
  ]),
  cat("Desert & Dryland Livelihoods", [
    "Camel owner and safari operator", "Sheep, goat and wool herder", "Dryland and millet farming", "Rajasthani handicraft and textile artisan", "Folk musician and performer",
    "Desert camp and resort", "Water-tanker and rainwater-harvest services", "Leather and mojari craft", "Gum, guar and desert-produce trader", "Solar and wind small operator",
  ]),
  cat("Defence, Ex-Servicemen & Paramilitary Enterprises", [
    "Ex-servicemen security agency", "Defence canteen (CSD) and cooperative", "Ex-servicemen skill and training centre", "Defence contractor and supplier", "Armed-forces uniform and equipment supplier",
    "Veterans' welfare organisation", "Gun-licence and arms dealer", "Cadet and NCC training institute", "Border-area trade and services", "Military-station service provider",
  ]),
  cat("Funeral, Memorial & Last-Rites Services", [
    "Funeral-service provider", "Cremation-wood and ghat supplier", "Hearse and mortuary-van operator", "Coffin and memorial maker", "Cemetery and burial-ground management",
    "Last-rites priest and ritual services", "Memorial and tombstone mason", "Flower-wreath and condolence-card seller", "Mourning-meal catering", "Online memorial and obituary platform",
  ]),
  cat("Printing, Photo & Digital Services (Local)", [
    "Flex, banner and vinyl printing", "Visiting-card and wedding-card printer", "Rubber-stamp and seal maker", "Lamination and binding shop", "Xerox and document-scanning centre",
    "Digital photo-album and video editing", "Name-plate and sign-board maker", "T-shirt, mug and gift printing", "Laser engraving and trophy maker", "Ladies' and gents' online-form filling centre",
    "Cyber cafe and online-services centre",
  ]),
  cat("Rental, Leasing & Equipment Hire", [
    "Car, van and truck rental", "Motorcycle, scooter and bicycle rental", "RV, camper and trailer rental", "Boat, yacht and jet-ski charter", "Aircraft and helicopter leasing",
    "Construction and earth-moving equipment hire", "Scaffolding, formwork and crane hire", "Agricultural machinery hire", "Tool-hire and DIY equipment shops", "Generator, pump and compressor hire",
    "Office-machinery and IT-equipment leasing", "Medical and mobility-equipment rental", "Event, tent, stage and furniture hire", "Party, costume and formalwear rental", "Camera, AV and lighting hire",
    "Musical-instrument and sound-system rental", "Sports and outdoor-gear hire", "Film, TV and broadcast equipment rental", "Container and portable-cabin leasing", "Portable-toilet and site-facilities hire",
    "Pallet, crate and packaging pools", "Textile, linen and uniform rental", "Rent-to-own appliances and furniture", "Peer-to-peer rental platforms", "Equipment-finance and lease brokers",
    "Intellectual-property and franchise licensing",
  ]),
  cat("Postal, Courier & Last-Mile Delivery", [
    "National postal operators", "Post-office and postal-agency counters", "Courier and express companies", "Same-day and on-demand delivery", "Food and grocery delivery riders",
    "Parcel lockers and pick-up points", "Cross-border and international courier", "Freight-forwarding and e-commerce logistics", "Cold-chain and pharma delivery", "Document, legal and bank-courier services",
    "Bike messengers and cargo-bike couriers", "Drone and robot delivery", "Returns and reverse-logistics services", "Mail-sorting, bulk-mail and print-mail houses", "P.O. box and virtual-mailbox services",
    "Moving, relocation and removal companies", "Furniture and white-goods delivery and installation", "Village couriers, pony-express and bus-parcel agents",
  ]),
  cat("Oil, Gas & Mining Support Services", [
    "Oil and gas exploration contractors", "Seismic and geophysical survey", "Drilling-rig and well-service contractors", "Wireline, cementing and fracturing services", "Oilfield equipment and tubulars",
    "Offshore platform operations and supply vessels", "Pipeline construction, pigging and inspection", "Refinery turnaround and maintenance", "LNG, CNG and gas-processing plants", "Storage terminals and tank farms",
    "Petrol-station operators and convenience retail", "Fuel distribution, bunkering and aviation fuel", "Lubricants and fuel additives", "Oil-spill response and remediation", "Mining equipment dealers and repair",
    "Blast, drilling and explosives contractors", "Mine ventilation, dewatering and safety", "Mineral processing and beneficiation", "Assay laboratories and sample preparation", "Mine-camp, catering and logistics",
    "Coal washing and trading", "Quarry-equipment and crusher operators", "Decommissioning of oil and mining sites", "Hydrocarbon-trading and brokers", "Energy-transition and carbon-capture services",
  ]),
  cat("Ports, Shipping & Maritime Trade", [
    "Shipping lines and ship owners", "Ship management and crewing agencies", "Ship brokers and chartering agents", "Port and terminal operators", "Stevedoring and cargo handling",
    "Pilotage, towage and mooring", "Customs clearing and forwarding agents", "Marine surveyors and classification societies", "Ship repair, dry docks and shipyards", "Ship-breaking and recycling",
    "Bunker suppliers and ship chandlers", "Marine insurance and P&I clubs", "Container leasing and depots", "Inland-waterway and barge operators", "Dredging and harbour maintenance",
    "Fishing-port and harbour services", "Offshore-wind and subsea installation vessels", "Cruise-terminal and ferry operators", "Maritime training academies", "Coast-guard and maritime-safety services",
    "Marinas, boat yards and chandleries", "Seafarer welfare and missions",
  ]),
  cat("Railways, Metro & Public Transit", [
    "Passenger and freight railway operators", "Metro, tram and light-rail operators", "Bus-rapid-transit and city-bus operators", "Railway infrastructure and track maintenance", "Rolling-stock leasing and maintenance",
    "Station management and retail", "Signalling, ticketing and fare-collection", "Railway catering and vending licensees", "Heritage and tourist railways", "Cable cars, ropeways and funiculars",
    "Ride-hailing and multimodal mobility platforms", "Bike-share and shared-mobility operators", "Transport cooperatives and mini-bus associations", "Paratransit and community transport", "Intercity coach and sleeper-bus operators",
    "Porters, coolies and station services",
  ]),
  cat("Humanitarian, Relief & Development Organisations", [
    "Disaster-relief and emergency response", "Refugee and displacement assistance", "Food security and nutrition programmes", "Water, sanitation and hygiene (WASH) projects", "Health and vaccination missions",
    "Education-in-emergencies programmes", "Livelihood and microenterprise support", "Peacebuilding and conflict resolution", "Human-rights monitoring and legal aid", "Demining and humanitarian logistics",
    "Development consultancies and contractors", "International volunteer and gap-year organisations", "Faith-based relief and mission agencies", "Diaspora and remittance-for-development groups", "Community-based and grassroots organisations",
    "UN agencies, multilaterals and donor offices",
  ]),
  cat("Heritage, Museums & Cultural Institutions", [
    "Museums and science centres", "Art galleries and cultural centres", "Archives, libraries and manuscripts", "Heritage sites and monuments", "Historic houses, palaces and forts",
    "Archaeological and excavation services", "Conservation, restoration and conservation labs", "Intangible heritage and folk-culture groups", "Cultural festivals and carnivals", "Language and literature academies",
    "Cultural exchange and sister-city programmes", "Planetariums, aquariums and zoos", "Memorials, battlefields and heritage trails", "Tour guides and heritage interpreters", "Antique, rare-book and manuscript dealers",
  ]),
  cat("Trade Fairs, Markets & Marketplaces", [
    "Wholesale markets and mandis", "Farmers' and weekly markets", "Night markets and bazaars", "Souks, medinas and covered markets", "Flea markets and swap meets",
    "Auction yards and cattle markets", "Commodity exchanges and spot markets", "Trade-fair and exhibition organisers", "Convention and conference centres", "Craft fairs and artisan markets",
    "Online marketplace operators", "Classified-ad and local-listing platforms", "Freelance and services marketplaces", "B2B sourcing platforms", "Barter, swap and sharing communities",
    "Market-fee collectors and stall landlords",
  ]),
  cat("Space, Satellite & Geospatial", [
    "Satellite manufacturers and integrators", "Launch services and spaceports", "Earth-observation and remote-sensing data", "Satellite communications and broadband", "GNSS, navigation and positioning services",
    "Ground stations and tracking networks", "In-orbit servicing and debris management", "Space-tourism and microgravity research", "Space-medicine and life-support suppliers", "Geospatial analytics and mapping",
    "Drone survey and aerial imaging", "Weather and climate forecasting services", "Astronomy observatories and planetariums", "Defence and dual-use space systems",
  ]),
  cat("Franchising, Dealerships & Distributorships", [
    "Master franchisors", "Area developers and franchisees", "Retail and food franchisees", "Service and education franchisees", "Authorised dealers and distributors",
    "Sub-dealers, agents and commission sellers", "Direct-selling and network-marketing distributors", "Super-stockists and carrying-and-forwarding agents", "Licensed agents (insurance, lotto, ticketing)", "Channel partners and resellers",
    "Master distributors for imports", "Private-label and white-label suppliers",
  ]),
  cat("Market-Day, Roadside & Seasonal Traders", [
    "Weekly-market stall holder", "Roadside fruit, vegetable and snack seller", "Highway dhaba and truck-stop vendor", "Beach, temple and tourist-spot vendor", "Railway-platform and bus-stand hawker",
    "Festival, fair and carnival trader", "Pushcart and bicycle-cart trader", "Pavement and footpath seller", "Mobile (van, auto, rickshaw) vendor", "Door-to-door and house-call seller",
    "Barter and village-exchange trader", "Night-market and bazaar stall", "Floating-market and boat vendor", "Border-market and cross-border petty trader",
  ]),
  cat("Small & Home-Based Producers", [
    "Home bakers, cooks and tiffin makers", "Pickle, papad, jam and spice makers", "Candle, soap and incense makers", "Tailoring and embroidery at home", "Handloom, crochet and knitting workers",
    "Jewellery, craft and gift makers at home", "Dairy, ghee and paneer makers", "Beekeepers and honey sellers", "Mushroom, sprouts and microgreens growers", "Basket, mat and broom weavers",
    "Toy, doll and wood-craft makers", "Print, design and digital-product makers at home", "Women's SHG micro-units", "Cottage industries and village units",
  ]),
  cat("Private Households, Domestic Staff & Caregivers", [
    "Maids, cooks and drivers employed by households", "Caregivers for elderly and disabled", "Gardeners, watchmen and caretakers", "Private tutors", "Personal assistants and secretaries",
    "Household managers and butlers", "Live-in help and domestic-worker agencies", "Self-employed household service providers", "Households producing for own use (farming, crafts, repairs)",
  ]),
  cat("International & Cross-Border Organisations", [
    "United Nations agencies and programmes", "World Bank, IMF and regional development banks", "Embassies, consulates and high commissions", "International NGOs and federations", "Regional blocs and trade organisations",
    "Multinational company regional hubs", "International courts and arbitration centres", "International schools and exchange bodies", "Foreign chambers of commerce and trade offices", "Cultural institutes and language centres abroad",
  ]),
  cat("Brokers, Agents & Commission Middlemen", [
    "Flat and property broker", "Rental and PG broker", "Land and plot dealer (dalal)", "Vehicle and used-car broker", "Insurance agent and POSP",
    "Loan, credit-card and DSA agent", "Mutual-fund and stock sub-broker", "Travel, ticket and visa agent", "Job, placement and manpower consultant", "Marriage and matchmaking broker",
    "Commission agent (arhtiya) in mandi", "Cattle, livestock and horse broker", "Grain, seed and commodity broker", "Scrap and metal broker", "Steel, cement and building-material broker",
    "Textile, yarn and garment broker", "Jewellery, diamond and bullion broker", "Freight, truck and transport broker", "Customs, shipping and forwarding agent", "Import-export and sourcing agent",
    "Advertising, media and space-selling agent", "Art, antique and collectibles broker", "Business, franchise and startup broker", "Domain, website and digital-asset broker", "Yacht, aircraft and equipment broker",
    "Ticket, event and sports agent", "Talent, model and artist agent", "Sports and player agent", "Recruitment sub-agent and labour supplier", "Tender, contract and liaison agent",
    "Sales, distributor and manufacturer's representative", "Door-to-door sales and canvassing agent", "Referral and affiliate agent", "Auction agent and bidder representative",
  ]),
  cat("Government Paperwork & Document Facilitators", [
    "Common-service and e-governance centre", "Aadhaar, PAN and voter-ID service point", "Passport and visa application centre", "Driving licence and RTO work agent", "Ration-card and welfare-scheme facilitator",
    "Income, caste and domicile certificate agent", "Land-record, mutation and registry agent", "Stamp-paper, affidavit and notary assistant", "Court-clerk and legal-document services", "GST, ITR and tax-filing practitioner",
    "Udyam, trade-licence and FSSAI registration agent", "Pension, provident-fund and insurance-claim facilitator", "Birth, death and marriage certificate agent", "Bank, KYC and form-filling assistant", "Tender, e-procurement and contract-filing agent",
    "Scholarship and student-form filing centre",
  ]),
  cat("Student Services, Hostels & Campus Businesses", [
    "Student hostel and PG owner", "Mess, tiffin and canteen operator", "Study room, library and reading cafe", "Coaching-material, notes and book seller", "Stationery, xerox and project-binding shop",
    "Student travel and ticketing agent", "Admission, counselling and education consultant", "Laptop, mobile and gadget shop near campus", "Cyber cafe and exam-form centre", "Student cab and bike-rental service",
    "Campus ambassador and brand-activation agent", "Exam-centre and invigilation services", "Thesis, assignment and academic-editing services (ethical)", "Uniform, ID-card and badge makers", "Campus laundry and dhobi service",
  ]),
  cat("Labour Contractors, Manpower & Local Placement", [
    "Labour contractor and thekedar", "Construction-labour and mason supplier", "Agricultural and harvest labour supplier", "Domestic-worker and maid placement agency", "Security-guard and housekeeping supplier",
    "Hotel, restaurant and catering staff supplier", "Driver and chauffeur placement", "Nurse, ward-boy and patient-attendant supplier", "Factory and warehouse labour supplier", "Loading, unloading and hamali contractor",
    "Event and wedding-staff supplier", "Overseas-employment agent and recruiter", "Daily-wage worker chowk and adda coordinator", "Skilled-worker pool (electrician, plumber, painter)",
  ]),
  cat("Medical Support, Lab Collection & Healthcare Agents", [
    "Medical representative and pharma sales agent", "Pathology sample-collection agent", "Home-visit nurse and attendant agency", "Ambulance dispatch and patient-transport agent", "Medicine home-delivery and online-pharmacy partner",
    "Medical-camp, screening and vaccination organiser", "Hospital-liaison and insurance-claim agent", "Medical-tourism facilitator and interpreter", "Blood and organ-donor coordinator", "Oxygen, wheelchair and equipment rental",
    "Health-insurance agent and TPA desk", "Medical billing and records outsourcing", "Dental, eye and physiotherapy home-service providers", "Elder-care companion and day-care provider",
  ]),
  cat("Auto Allied & Roadside Businesses", [
    "Driving-school and licence-test trainer", "RTO, registration and fitness-certificate agent", "Vehicle insurance and PUC centre", "Vehicle loan and finance agent", "Used-car and bike broker",
    "Spare-parts hawker and scrap-vehicle buyer", "Tyre, battery and puncture roadside services", "Highway dhaba, motel and truck-stop operator", "Fuel-station attendant and convenience-store operator", "Toll, parking and weigh-bridge operator",
    "Car and bike accessories and modification shop", "Vehicle-washing, detailing and coating studio", "GPS, dashcam and tracking installer", "Towing, crane and breakdown-recovery service", "Roadside mechanic and mobile-repair van",
  ]),
  cat("Kitchen, Catering & Mess Businesses", [
    "Catering contractor for weddings and events", "Tiffin and dabba-delivery service", "College, hostel and office mess", "Home-chef and cloud-kitchen operator", "Halwai and sweet-maker for events",
    "Bhandara, langar and community-kitchen provider", "Outdoor and party-catering with tent service", "Industrial-canteen and contract-catering operator", "Cook-on-hire and pandit-cook services", "Bulk-food and meal-box supplier to schools",
    "Ration, vegetable and grocery supplier to caterers", "Utensil, crockery and event-tableware rental",
  ]),
  cat("Water, Ice & Daily Utility Vendors", [
    "RO and packaged-water can supplier", "Ice-factory and ice-block seller", "Cold-drink and soda distributor", "LPG and gas-cylinder delivery agent", "Milk, newspaper and bread delivery vendor",
    "Firewood, coal and cow-dung-fuel seller", "Kerosene and diesel retailer", "Mobile-recharge and DTH agent", "Electric-bill, water-bill and utility-payment agent", "Gas-stove, pipe and regulator seller",
    "Inverter, battery and solar-lamp seller",
  ]),
  cat("Second-hand, Resale & Exchange Businesses", [
    "Second-hand car and bike dealer", "Used-mobile and laptop buy-sell shop", "Old furniture and appliance dealer", "Second-hand book and textbook seller", "Used-clothing and thrift store",
    "Antique and old-coin dealer", "Pre-owned jewellery and gold buyer", "Old-machinery and tool dealer", "Used-tyre, battery and spare-parts dealer", "Exchange-offer and trade-in outlet",
    "Pawn shop and loan-against-goods", "Flea-market and Sunday-market seller", "Online resale and thrift reseller",
  ]),
  cat("Neighbourhood & Doorstep Service Providers", [
    "Plumber, electrician and carpenter on call", "AC, fridge and washing-machine technician", "RO and water-purifier service technician", "Pest-control and sanitisation service", "Home painter and polisher",
    "Laundry and ironing pick-up service", "Car-wash and bike-wash at home", "Doorstep mechanic and battery-jump service", "Beautician and massage at home", "Tutor and music teacher at home",
    "Cook, maid and baby-sitter on call", "Gardener and plant-care service", "Mobile and laptop repair at home", "Furniture assembly and handyman service", "Packers, movers and tempo on call",
    "Photographer and videographer on call",
  ]),
  cat("Local Folk Artists, Orchestras & Entertainment Troupes", [
    "Orchestra (arkestra) dance party", "Live orchestra and singers troupe", "Wedding band-baja and baraat band", "Brass band and dhol-tasha group", "Shehnai, nadaswaram and sitar players",
    "Nautanki and folk-theatre party", "Lavani, tamasha and jatra troupe", "Ramlila and Raslila mandali", "Yakshagana, Kathakali and Chhau artists", "Bhajan, kirtan and jagran mandali",
    "Qawwali party", "Bhangra and giddha troupe", "Garba and dandiya troupe", "Ghoomar, Bihu and Kalbelia dancers", "Baul, Bhopa and wandering folk singers",
    "Kathputli and puppet-show artists", "Street magician and bazigar", "Mimicry and comedy artist", "DJ and sound operator", "Emcee, anchor and compère",
    "Stage-dance and Bollywood-dance group", "Item-song and cover-dance performers", "Tamasha and mela performers", "Dhol, nagada and tasha players", "Folk-instrument players (algoza, ektara, dholak)",
    "Regional theatre and drama club", "Mohalla and village cultural committee", "Local singer and recording artist",
  ]),
  cat("Local Fairs, Melas & Amusements", [
    "Mela and fair contractor", "Giant wheel, merry-go-round and jhula operator", "Circus and tent-show owner", "Open-air cinema and video-hall owner", "Haat, bazaar and weekly-market organiser",
    "Kite, balloon and toy mela seller", "Dangal and akhara organiser", "Village tournament organiser", "Exhibition and pradarshani stall holder", "Bullock-cart and tractor rally organiser",
    "Boating, camel and horse-ride operators", "Ice-cream, popcorn and cotton-candy cart", "Game, shooting and lucky-draw stall", "Temple fair and rath-yatra stall holder", "Festival light and decoration contractor",
  ]),
  cat("Weddings & Function Service Providers (Local)", [
    "Orchestra, DJ and band booking", "Mandap, stage and tent decorator", "Wedding-card printer and designer", "Mehndi artist and bridal makeup artist", "Ghodi, baggi and doli supplier",
    "Halwai, cook and catering contractor", "Tent, chair, utensil and generator supplier", "Wedding photographer, videographer and drone", "Pandit, nikah-khwan and ritual service", "Firecracker and sky-shot show",
    "Flower-garland and florist", "Wedding transport, car and bus decorator", "Wedding-hall, lawn and dharamshala booking agent", "Return-gift, trousseau and shagun supplier", "Bride-groom clothes (sherwani, lehenga) rental",
    "Event labour, waiters and helper supplier", "Sound, light and LED-screen provider", "Wedding planner and coordinator",
  ]),
  cat("Students, Youth & Campus Life", [
    "School student", "Postgraduate, research scholar and PhD", "Diploma, ITI and polytechnic student", "Competitive-exam aspirant (UPSC, JEE, NEET, SSC, bank)", "Student club, society and fest committee",
    "Hostel and campus-life services", "Student council and union", "Alumni association", "Intern, trainee and apprentice", "Fresh graduate and job seeker",
    "Student freelancer and part-time worker", "Student content creator and campus influencer", "Study group, coaching batch and peer-learning circle", "NCC, NSS, scouts and guides unit", "Sports and cultural team of a school or college",
    "Youth club, NGO volunteer and community group",
  ]),
  cat("Kids, Children & Family Services", [
    "Pre-school, nursery and play-school", "Day-care, creche and after-school care", "Kids' activity, hobby and summer-camp classes", "Kids' coaching: art, music, dance, abacus and sports", "Children's birthday-party planner and entertainer",
    "Kids' fashion, footwear and school-wear shops", "Kids' toys, games and educational-material shops", "Kids' photography and baby-shoot studios", "Paediatric clinic, vaccination and child specialist", "Child psychologist, speech and special-needs therapy",
    "Baby products, maternity and new-parent services", "Children's library, story-time and book club", "Kids' gym, soft-play and trampoline park", "Child-model, TV and talent agency", "School van, bus and pick-and-drop service",
    "Children's hospital and paediatric ward", "Orphanage, child-care home and adoption services", "Young-entrepreneur and kids' business programmes", "Family counsellor and parenting coach", "Family-run home business",
  ]),
  cat("Individuals, Homemakers & Personal Use", [
    "Homemaker managing a household", "Working professional (salaried)", "Retired person and senior citizen", "Job seeker and career switcher", "Aspiring entrepreneur (idea stage)",
    "Hobbyist and part-time earner", "Freelancer and independent worker", "Artist, writer and creator (individual)", "Woman entrepreneur and home-based business", "Differently-abled entrepreneur",
    "Ex-serviceman and veteran", "Migrant and seasonal worker", "Farmer household and small landholder", "Tribal and forest-dweller household", "Personal-finance and family budget tracking",
    "Housing-society resident and RWA member", "Landlord with a few rental properties", "Investor and trader (individual)", "Volunteer and social worker", "Researcher and independent scholar",
  ]),
  cat("Seniors, Elder Care & Retirement Services", [
    "Senior-citizen clubs and day-centres", "Old-age homes and assisted living", "Home nurses and elder-care attendants", "Retirement-planning and pension advisers", "Elder-friendly products and mobility aids",
    "Senior tourism and pilgrimage tours", "Elder-care and companionship services", "Geriatric clinics and physiotherapy", "Legal, will and estate services for seniors",
  ]),
  cat("Women-Led & Self-Help Enterprises", [
    "Women's self-help group (SHG)", "Women-owned home business", "Women's cooperative and collective", "Women's skill-training and livelihood centre", "Women entrepreneurs' network and chamber",
    "Mahila mandal and community group", "Women-run tailoring, catering and craft units", "Women-run beauty, tutoring and childcare", "Women farmers' and dairy groups", "Women's shelter and support service",
  ]),
  cat("Band Baja, Brass Band & Wedding Music", [
    "Brass band and band-baja party", "Baraat band and procession music", "Dhol, tasha, nagada and nagara players", "Shehnai, nadaswaram and clarinet players", "Bagpipe, bugle and military-style band",
    "DJ and DJ-on-trolley (DJ ghodi)", "Orchestra and live-music party", "Banjo, harmonium and tabla players", "Dholak, manjira and folk-instrument players", "Wedding singers and playback singers",
    "Anchor, emcee and sound-system operator", "Band-uniform tailors and instrument repairers", "Instrument shops and band-equipment dealers", "Band booking and artist-management agents",
  ]),
  cat("Reel Creators, Vloggers & Social Media Influencers", [
    "Instagram reel creator", "YouTube Shorts creator", "Facebook, ShareChat and Moj/Josh short-video creator", "Daily and travel vlogger", "Food, recipe and street-food vlogger",
    "Fashion, makeup and lifestyle influencer", "Comedy, skit and meme creator", "Dance and lip-sync reel creator", "Gaming and live-stream creator", "Educational and how-to creator",
    "Tech-review and unboxing creator", "Fitness and wellness influencer", "Local-business promoter and reel editor", "Video editor, thumbnail and caption freelancer", "Influencer-marketing agent and creator manager",
    "Brand-deal and sponsorship creator", "Podcaster and audio creator", "Podcast, vlog and reel-studio owner",
  ]),
  cat("Village & Rural Content Creators", [
    "Village vlogger and rural-life YouTuber", "Farming and agriculture-tips channel", "Village cooking and traditional-recipe channel", "Animal, dairy and pet-keeping channel", "Local comedy and regional-language skit maker",
    "Regional music-video and album producer", "Bhojpuri, Haryanvi, Rajasthani and regional-song creators", "Local festival and wedding live-streamer", "Village news and local-issues reporter", "DIY, craft and rural-technology channel",
    "Rural-travel and pilgrimage vlogger", "Mobile-first video editors and reel makers",
  ]),
  cat("Photographers, Videographers & Studio Owners", [
    "Wedding photographer and cinematographer", "Event and function photographer", "Pre-wedding and couple-shoot photographer", "Portrait, passport and ID-photo studio", "Baby, maternity and kids' photographer",
    "Product and e-commerce photographer", "Real-estate and interior photographer", "Drone and aerial videographer", "Video editor and album designer", "Photo-lab, framing and printing shop",
    "Photo-booth and live-streaming services", "Documentary, news and field videographers", "Studio rental and lighting equipment hire",
  ]),
  cat("DJ, Sound, Light & Stage Operators", [
    "DJ and sound-system operator", "Sound, light and LED-wall provider", "Stage, truss and canopy builder", "Generator and power-backup provider", "Public-address (PA) and mic rental",
    "Event-lighting and laser-show operator", "Fog, CO2 and special-effects operator", "Cable-laying, rigging and stage-crew", "Concert and live-show production crew", "Sound-box, speaker and instrument repair",
  ]),
  cat("Tent House, Decorators & Event Suppliers", [
    "Tent house and shamiana contractor", "Chair, table, crockery and utensil rental", "Wedding mandap and stage decorator", "Flower and balloon decorator", "Light, jhalar and festival-lighting contractor",
    "Carpet, curtain and gadda supplier", "Cooler, fan and AC rental for functions", "Catering equipment and counter rental", "Barricade, gate and cloth-wall supplier", "Event labour and helper supplier",
  ]),
  cat("Local News, Reporters & Community Media", [
    "Local news reporter and stringer", "Local YouTube and digital news channel", "Cable-TV local news channel", "Community radio station", "Weekly and local newspaper publisher",
    "Press-photographer and field cameraman", "Local-news website and WhatsApp-news group", "Public-announcement (munadi) and loud-speaker service", "Wall-writing and local-ad painter", "Pamphlet, poster and handbill distributor",
  ]),
  cat("Devotional & Regional Music Artists", [
    "Bhajan and kirtan singer", "Qawwali, naat and sufi singer", "Regional folk and album singer", "Bhojpuri, Haryanvi, Punjabi and Rajasthani artist", "Marathi, Bengali, Odia and Assamese folk artist",
    "Garhwali, Kumaoni and Himachali folk artist", "Tamil, Telugu, Kannada and Malayalam local artists", "Music director and composer", "Lyricist and songwriter", "Recording and mixing studio",
    "Music-video director and editor", "Harmonium, tabla and instrument teacher", "Instrument maker and repairer",
  ]),
  cat("Cable, DTH & Local Internet Operators", [
    "Local cable-TV operator", "DTH installation and recharge agent", "Local broadband (ISP) franchisee", "Wi-Fi hotspot and cyber-cafe owner", "Fibre and last-mile installer",
    "Mobile-tower caretaker and site-support", "CCTV and set-top-box dealer", "TV, dish and antenna technician",
  ]),
  cat("Sports Coaches, Trainers & Local Athletes", [
    "Cricket, football and kabaddi coach", "Wrestling (pehalwan) and akhara ustad", "Athletics and running coach", "Gym trainer and bodybuilding coach", "Yoga and fitness instructor",
    "Swimming and water-sports coach", "Badminton, tennis and table-tennis coach", "Martial-arts and self-defence trainer", "Army, police and agniveer physical-training coach", "Local tournament organiser and referee",
    "Sports-goods dealer and ground manager", "Professional and semi-professional athlete",
  ]),
  cat("Tutors, Teachers & Skill Trainers (Individual)", [
    "School and tuition teacher", "Subject tutor (maths, science, English)", "Competitive-exam mentor", "Spoken-English and communication trainer", "Computer, coding and digital-skills trainer",
    "Music, dance and art teacher", "Tailoring, beautician and craft trainer", "Driving and vocational instructor", "Online and YouTube educator", "Special-educator and remedial tutor",
    "Skill-development and apprenticeship trainer",
  ]),
  cat("Tractor, Harvester & Farm-Machinery Owners", [
    "Harvester, thresher and combine owner", "Rotavator, cultivator and implement renter", "JCB, excavator and crane owner", "Water-pump and borewell operator", "Drone sprayer and agri-service provider",
    "Mini-truck and tempo owner for farm goods", "Machinery mechanic and spare-parts dealer",
  ]),
  cat("Local Construction & Material Suppliers", [
    "Brick-kiln owner", "Sand, gravel and aggregate supplier", "Stone-crusher and quarry operator", "Cement and steel dealer", "Tile, marble and granite supplier",
    "Contractor (thekedar) and sub-contractor", "Mason, rajmistri and labour gang leader", "Tractor-trolley and dumper operator", "RMC and concrete-mixer supplier", "Timber, door and window carpenter",
  ]),
  cat("Local Guides, Pilgrim Services & Tourism Helpers", [
    "Local tour guide", "Pilgrim guide and tirth-purohit", "Taxi, jeep and tempo-traveller driver for tourists", "Boatman and ghat services", "Homestay, dharamshala and lodge owner",
    "Souvenir, puja-item and handicraft seller", "Camping, trekking and adventure guide", "Porter, pony and palanquin services", "Photographer and videographer at tourist spots", "Tourist-information and booking agent",
  ]),
  cat("Political, Campaign & Public-Representative Offices", [
    "Sarpanch, pradhan and ward-member office", "MLA, MP and councillor office", "Political-party office and workers", "Election-campaign and survey agency", "Social worker and activist",
    "Public-relations and constituency manager", "Poll-booth and election-agent services", "Banner, flex and poster contractors", "Political-rally event organiser", "Citizen-helpdesk and grievance centre",
  ]),
  cat("Village & Local Government Offices and Officials", [
    "Gram panchayat office and panchayat secretary", "Gram sevak and village-development officer", "Patwari, lekhpal and revenue-record clerk", "Tehsildar, naib tehsildar and tehsil office", "SDM, BDO and block-development office",
    "Thana, chowki and police station", "Chowkidar, kotwal and village watchman", "Numberdar and village headman", "Anganwadi worker and ICDS centre", "ASHA, ANM and health sub-centre staff",
    "Government school and teacher", "Rural-development, MGNREGA and scheme office", "Agriculture, veterinary and extension office", "Electricity, water and PWD sub-office", "Cooperative society and PACS secretary",
    "Post-office and gramin dak sevak", "Ration and fair-price-shop dealer", "Forest guard and range office", "Revenue court, lok-adalat and legal-aid centre", "Municipal ward office and sanitation staff",
  ]),
  cat("Political & Social Leaders (Local)", [
    "Sarpanch, pradhan and mukhiya", "MLA (vidhayak), MLC and MP (sansad) offices", "Parshad, mayor and nagar-palika leaders", "Zila parishad and block-level leaders", "Party district president and office-bearers",
    "Karyakarta and party volunteers", "Campaign and election managers", "Social worker and samaj-sevak", "Community, caste and religious-body leaders", "Farmers' and workers' union leaders",
    "Women and youth-wing leaders", "Local activist and RTI worker",
  ]),
  cat("Bus, Cab & Trip Booking Services", [
    "Online bus-ticket agent and counter", "Cab and taxi booking office", "Outstation and one-way cab service", "Tempo traveller and mini-bus booking", "Luxury, sleeper and Volvo coach booking",
    "Marriage-party and baraat vehicle booking", "School, college and office trip bus booking", "Picnic, tour and group-trip bus booking", "Pilgrimage (yatra) bus and cab booking", "Airport, railway and bus-stand pick-up and drop",
    "Self-drive and driver-on-call booking", "Train-ticket, tatkal and IRCTC agent", "Flight-ticket and travel-desk agent", "Taxi-fleet owner and attached-vehicle operator", "Bus and cab commission and booking aggregator",
    "Travel-insurance and visa add-on agent",
  ]),
  cat("Pilgrimage, Yatra & Tour Operators", [
    "Tirth yatra and pilgrimage tour operator", "Char Dham yatra operator", "Vaishno Devi, Amarnath and Kedarnath yatra", "Kashi, Ayodhya, Mathura and Prayagraj tours", "Rameswaram, Tirupati and South-India temple tours",
    "Haj, Umrah and Ziyarat organiser", "Buddhist and Jain pilgrimage circuit tours", "Gurdwara and Sikh-heritage tours", "Kumbh and mela tour packages", "Senior-citizen and women-only yatra groups",
    "Yatra-bus, food and halt (dharamshala) arrangers", "Pilgrim guide, panda and tirth-purohit", "Cab and tempo-traveller for darshan", "Religious-tour cooks and langar service on trips", "Overseas pilgrimage and heritage-tour operators",
  ]),
  cat("Trip Planners, Holiday & Tour Package Sellers", [
    "Domestic holiday-package seller", "International tour-package seller", "Honeymoon and family-trip planner", "Weekend-getaway and picnic organiser", "Adventure, trekking and camping trips",
    "School and college educational-tour operator", "Corporate offsite and team-outing planner", "Cruise and houseboat package seller", "Hill-station, beach and heritage tours", "Bike-trip and road-trip organisers",
    "Group-departure and fixed-departure tour operator", "Local sightseeing, city-tour and day-trip operator", "Hotel, cab and ticket bundle (DIY itinerary) planner", "Wildlife-safari and eco-tour operator", "Medical, wellness and spiritual-retreat tours",
    "Travel blogger-led and community trips",
  ]),
  cat("Electricians & Electrical Workers", [
    "Electrician (house wiring)", "Industrial and factory electrician", "Electrical contractor and wireman", "Electrical fitter and product wirer", "Motor, transformer and generator repairer",
    "Lineman and power-line worker", "Solar-product and inverter installer", "Electrical shop and goods dealer", "Electrical engineer and supervisor", "CCTV, alarm and fire-alarm wiring technician",
    "Elevator and escalator electrician", "Marine, auto and aircraft electrician", "Electric-vehicle charger installer", "Street-light and traffic-signal electrician", "Domestic-appliance electrician",
  ]),
  cat("Plumbers & Pipe Fitters", [
    "Plumber (house and building)", "Pipe fitter and steam fitter", "Sanitary and bathroom-fittings installer", "Water-tank, pump and borewell plumber", "Drain and sewer-cleaning plumber",
    "Gas-pipe and LPG-line fitter", "Solar-water-heater installer", "Fire-sprinkler and hydrant fitter", "Plumbing-material shop and dealer", "Irrigation and drip-line fitter",
    "Industrial-pipe welder and fitter", "Boiler and heating engineer", "Water-purifier and RO installer", "Septic-tank and sanitation contractor",
  ]),
  cat("Carpenters, Joiners & Furniture Makers", [
    "Carpenter (barhai)", "Furniture maker and cabinet-maker", "Door, window and frame maker", "Modular-kitchen and wardrobe carpenter", "Shuttering and formwork carpenter",
    "Wood-turning and carving artisan", "Furniture polish and French-polish worker", "Upholsterer and sofa maker", "Boat and wooden-ship builder", "Timber merchant, sawmill and wood depot",
    "Plywood, laminate and veneer worker", "Bamboo and cane furniture maker", "Interior carpenter and false-ceiling worker", "Carpentry-tool and machine dealer", "Wooden toy and craft maker",
  ]),
  cat("Painters, Plasterers & Finishers", [
    "House painter and polisher", "Wall-putty, POP and plaster worker", "Textured, stencil and designer-wall painter", "Wall-paper and wall-product installer", "Spray-paint and industrial painter",
    "Vehicle painter and denting-painting worker", "Signboard and wall-lettering artist", "Waterproofing and coating applicator", "Tile, marble and floor-polishing worker", "False-ceiling and gypsum worker",
    "Paint shop and colour-mixing centre", "Mural and artistic-wall painter", "Furniture and door painter", "Exterior and high-rise (rope-access) painter",
  ]),
  cat("Welders, Fabricators & Metal Workers", [
    "Welder (arc, MIG, TIG)", "Gas cutter and brazier", "Steel fabricator and structural worker", "Gate, grill and shutter maker", "Sheet-metal and duct worker",
    "Blacksmith (lohar) and forge worker", "Lathe, milling and machine-shop operator", "Boiler-maker and pressure-vessel welder", "Pipeline and underwater welder", "Metal-roofing and PEB erector",
    "Scrap-metal and metal-recycling worker", "Aluminium and stainless-steel fabricator", "Powder-coating and galvanising worker", "Tool-and-die maker", "Welding-supplies and gas dealer",
  ]),
  cat("Masons, Bricklayers & Construction Workers", [
    "Mason (rajmistri) and bricklayer", "Stone mason and stone-cutter", "Tile and marble layer", "Concrete finisher and plasterer", "Steel-fixer and bar-bender",
    "Scaffolder and rigger", "Road, kerb and paving worker", "Roofer and thatcher", "Well-digger and excavator", "Demolition and dismantling worker",
    "Construction helper and labourer", "Site supervisor and foreman", "Crane, JCB and mixer operator", "Waterproofing and insulation worker", "Tunnel, bridge and dam worker",
  ]),
  cat("Builders, Contractors & Thekedars", [
    "Building contractor and builder", "Civil contractor and thekedar", "Sub-contractor and labour contractor", "Interior and fit-out contractor", "Road and infrastructure contractor",
    "Government-works contractor (Class A, B, C)", "Plumbing and electrical contractor", "Renovation and repair contractor", "Housing-colony and apartment builder", "Prefab and low-cost housing builder",
    "Demolition and earth-work contractor", "Landscape and garden contractor", "Painting and POP contractor", "Roofing and waterproofing contractor", "Architect-contractor and turnkey builder",
    "Real-estate developer and promoter",
  ]),
  cat("Technicians & Repair Specialists", [
    "AC and refrigerator technician", "Washing-machine and appliance technician", "TV, home-theatre and audio technician", "Mobile-phone repair technician", "Laptop, computer and printer technician",
    "CCTV and security-system technician", "Inverter, UPS and battery technician", "Lift and elevator technician", "Medical-equipment and lab technician", "Industrial-machine and PLC technician",
    "Auto and two-wheeler technician", "Network, internet and Wi-Fi technician", "Solar and wind technician", "Water-purifier and pump technician", "Genset, boiler and compressor technician",
    "Dish, cable and set-top-box technician", "Biomedical and X-ray technician", "Photocopier and office-machine technician",
  ]),
  cat("Housekeeping, Cleaning & Maid Services", [
    "Housekeeping staff (hotel, hospital, office)", "Domestic maid and house-help", "Janitor, sweeper and cleaner", "Deep-cleaning and sanitisation service", "Carpet, sofa and upholstery cleaner",
    "Window, facade and high-rise cleaner", "Kitchen and chimney cleaner", "Post-construction and move-in cleaning", "Laundry and linen service", "Pest-control and fumigation",
    "Industrial and factory cleaning", "School, college and hospital cleaning", "Housekeeping contractor and supplier", "Cleaning-supplies and machine dealer", "Gardener, mali and compound-care worker",
    "Washroom and toilet-cleaning service",
  ]),
  cat("Homemade Food & Home-Based Producers", [
    "Homemade pickle, papad and masala maker", "Home baker and cake maker", "Home-cooked tiffin and meal service", "Homemade sweets, namkeen and snacks", "Homemade jam, squash and chutney",
    "Homemade ghee, butter and paneer", "Homemade chocolate and dessert maker", "Homemade soap, candle and incense maker", "Homemade cosmetics and herbal products", "Home tailoring, embroidery and knitting",
    "Homemade handicraft and gift maker", "Home-based packing and assembly work", "Home-based tuition and craft classes", "Home-based beautician and mehendi artist", "Home-based online seller (reseller)",
    "Homemade baby food and health food", "Homemade frozen and ready-to-cook food", "Homemade pet food and treats",
  ]),
  cat("Ice Cream, Kulfi & Dessert Businesses", [
    "Ice-cream parlour and shop", "Ice-cream cart and bicycle vendor", "Kulfi and falooda maker", "Gelato, frozen-yoghurt and soft-serve", "Ice-cream manufacturer and brand",
    "Ice-cream franchise outlet", "Ice-gola, ice-candy and ice-cream-stick maker", "Milkshake, sundae and dessert bar", "Cake, pastry and dessert shop", "Ice-cream distributor and cold-storage dealer",
    "Ice-cream cone, cup and topping supplier", "Dairy-based dessert (rabri, rasmalai, shrikhand) maker", "Frozen-dessert truck and kiosk", "Home-made ice-cream seller",
  ]),
  cat("Dhaba, Highway Eateries & Roadside Restaurants", [
    "Dhaba (roadside restaurant)", "Highway truck-stop eatery", "Family dhaba and rural restaurant", "Punjabi, Rajasthani and regional dhaba", "Tea and tiffin stall on the road",
    "Rural mess and local canteen", "Tandoor, roti and parantha corner", "Sweet and snack shop on highway", "Food stall at bus stand and railway station", "Fuel-station restaurant and food court",
    "Roadside biryani, kebab and tikka stall", "Fish, mutton and chicken curry point", "Local thali and bhojnalaya", "Cook, tandoor-master and dhaba helper",
  ]),
  cat("Restaurant Owners, Chefs & Cooks", [
    "Restaurant owner and manager", "Executive chef and head cook", "Sous chef, line cook and commis", "Tandoor, grill and pizza chef", "Pastry chef and baker",
    "Halwai (sweet-maker) and mithai chef", "Cook for hire and home chef", "Caterer and catering chef", "Waiter, captain and steward", "Bartender, barista and mixologist",
    "Kitchen helper, dishwasher and steward", "Restaurant cashier and billing staff", "Food-delivery partner and rider", "Cloud-kitchen owner", "Restaurant supplier and kitchen-equipment dealer",
    "Food stylist and food-blogger chef", "Culinary teacher and cooking-class host",
  ]),
  cat("Cricketers, Athletes & Professional Sportspeople", [
    "Cricketer (professional, club, district)", "Footballer and hockey player", "Kabaddi and kho-kho player", "Wrestler (pehalwan) and boxer", "Badminton, tennis and table-tennis player",
    "Athlete, runner and track-and-field", "Swimmer and water-sports player", "Shooter, archer and weightlifter", "Cyclist and motorsport driver", "Chess, carrom and indoor-game player",
    "Esports and gaming professional", "Golf, polo and equestrian sportsperson", "Umpire, referee and match official", "Sports coach and fitness trainer", "Sports agent and manager",
    "Sports commentator and sports journalist", "Groundsman, curator and turf manager", "Sports-academy and tournament organiser",
  ]),
  cat("Jewellers, Goldsmiths & Jewellery Shops", [
    "Jewellery shop owner (sunar, jeweller)", "Goldsmith and gold-ornament maker", "Silversmith and silver-article maker", "Diamond cutter, polisher and trader", "Gemstone, pearl and coloured-stone dealer",
    "Imitation and artificial-jewellery seller", "Bridal and traditional jewellery maker", "Jewellery designer and CAD artist", "Jewellery repair, polishing and hallmarking", "Gold-loan, pawn and gold buyer",
    "Bullion dealer and gold trader", "Watch and jewellery retailer", "Jewellery manufacturer and karigar", "Lab-grown diamond and fashion-jewellery brand", "Online jewellery seller",
  ]),
  cat("Hardware & Building-Material Dealers", [
    "Hardware shop owner", "Paint and putty dealer", "Plywood, laminate and board dealer", "Cement, steel and TMT dealer", "Pipe, fitting and sanitary dealer",
    "Electrical goods and wire dealer", "Tile, marble and granite dealer", "Tools and power-tool dealer", "Lock, handle and fitting dealer", "Glass, aluminium and UPVC dealer",
    "Roofing, sheet and tarpaulin dealer", "Fasteners, nuts and bolts dealer", "Bricks, sand, stone and aggregate supplier", "Safety and industrial-supplies dealer", "Wood, bamboo and timber depot",
  ]),
  cat("Farmers, Cultivators & Agricultural Producers", [
    "Wheat, rice and cereal farmer", "Pulses, oilseed and millet farmer", "Sugarcane and cotton farmer", "Vegetable and fruit farmer", "Flower and herb farmer",
    "Dairy and cattle farmer", "Poultry and egg farmer", "Goat, sheep and pig farmer", "Fish and shrimp farmer", "Organic and natural farmer",
    "Greenhouse and hydroponic farmer", "Tea, coffee and spice planter", "Orchard and plantation owner", "Sharecropper and tenant farmer", "Contract and cooperative farmer",
    "Beekeeper and honey producer", "Mushroom and sprouts grower", "Agricultural labourer and farm helper", "Farm-machinery owner and custom-hiring operator", "Agri-entrepreneur and FPO member",
  ]),
  cat("Sports Goods, Gyms & Fitness Businesses", [
    "Gym and fitness-centre owner", "Sports-goods and equipment shop", "Cricket, football and badminton academy", "Sports-ground and turf owner", "Fitness trainer and gym instructor",
    "Yoga and wellness studio", "Sports-nutrition and supplement seller", "Sports-apparel and shoe store", "Swimming-pool and club owner", "Sports-event organiser",
    "Cycle shop and fitness-bike dealer", "Martial-arts and boxing academy", "Indoor-games and snooker parlour", "Adventure-sports and trekking operator",
  ]),
  cat("Occupations: Managers & Senior Officials", [
    "Chief executive, managing director and president", "Senior government official and legislator", "Traditional chief and head of village", "Senior official of a special-interest organisation", "Finance manager",
    "Human-resource manager", "Policy and planning manager", "Business-services and administration manager", "Sales, marketing and development manager", "Advertising and public-relations manager",
    "Research and development manager", "Agricultural, forestry and fishery production manager", "Manufacturing manager", "Mining manager", "Construction manager",
    "Supply, distribution and logistics manager", "ICT services manager", "Education manager and principal", "Health-services manager", "Social-welfare manager",
    "Financial and insurance services branch manager", "Professional-services manager (legal, accounting, consulting)", "Hotel manager", "Restaurant manager", "Retail and wholesale manager",
    "Sports, recreation and cultural centre manager", "Customer-services and call-centre manager", "Small-business owner and entrepreneur", "Shop owner and proprietor", "Farm owner and plantation manager",
  ]),
  cat("Occupations: Engineers & Scientists", [
    "Physicist and astronomer", "Meteorologist and climate scientist", "Chemist", "Geologist and geophysicist", "Mathematician, actuary and statistician",
    "Biologist, botanist and zoologist", "Agronomist, forestry and fisheries scientist", "Environmental protection professional", "Industrial and production engineer", "Civil engineer",
    "Environmental engineer", "Mechanical engineer", "Chemical engineer", "Mining engineer, metallurgist and related", "Electrical engineer",
    "Electronics engineer", "Telecommunications engineer", "Engineering professional (aerospace, marine, biomedical)", "Architect", "Landscape architect",
    "Product and garment designer", "Town and traffic planner", "Cartographer and surveyor", "Graphic and multimedia designer", "Interior designer and decorator",
  ]),
  cat("Occupations: Doctors, Nurses & Health Professionals", [
    "Generalist medical practitioner", "Specialist medical practitioner", "Surgeon and anaesthetist", "Nursing professional", "Midwifery professional",
    "Traditional and complementary medicine professional", "Paramedical practitioner", "Veterinarian", "Dentist", "Pharmacist",
    "Environmental and occupational health professional", "Physiotherapist", "Dietitian and nutritionist", "Audiologist and speech therapist", "Optometrist and ophthalmic optician",
    "Psychologist and counsellor", "Medical radiographer and imaging technologist", "Medical laboratory technologist", "Dental assistant and therapist", "Community-health worker",
    "Home-based personal-care worker", "Healthcare assistant and ward attendant", "Ambulance worker and emergency medical technician",
  ]),
  cat("Occupations: Teachers & Educators", [
    "University and higher-education teacher", "Vocational-education teacher", "Secondary-education teacher", "Primary-school teacher", "Early-childhood educator",
    "Special-needs teacher", "Language teacher and tutor", "Music, art and dance teacher", "Computer and IT trainer", "Driving and flying instructor",
    "Education methods specialist and curriculum developer", "School inspector and education officer", "Teacher's aide and classroom assistant", "Private tutor and home teacher", "Coaching-centre teacher",
    "Online and e-learning instructor", "Madrasa, gurukul and religious teacher", "Adult and literacy educator",
  ]),
  cat("Occupations: Business, Finance & Administration Professionals", [
    "Accountant", "Financial and investment adviser", "Financial analyst", "Management and organisation analyst", "Policy administration professional",
    "Personnel and careers professional", "Training and staff-development professional", "Advertising and marketing professional", "Public-relations professional", "Technical and medical sales professional",
    "ICT sales professional", "Auditor and tax professional", "Credit and loans officer", "Insurance agent and underwriter", "Stock and securities broker",
    "Real-estate agent and property manager", "Procurement and purchasing officer", "Customs and border inspector", "Government tax and licensing officer", "Social-security and welfare officer",
    "Business-services agent and contract clerk", "Conference and event planner", "Employment agent and labour contractor",
  ]),
  cat("Occupations: Software, IT & Digital Professionals", [
    "Systems analyst", "Software developer", "Web and multimedia developer", "Applications programmer", "Database designer and administrator",
    "Systems administrator", "Computer-network professional", "Cybersecurity specialist", "ICT operations technician", "ICT user-support technician",
    "Computer-network and systems technician", "Web technician", "Broadcasting and audio-visual technician", "Telecommunications engineering technician", "Data scientist and AI engineer",
    "UX and UI designer", "DevOps and cloud engineer", "Game developer and animator", "IT freelancer and consultant",
  ]),
  cat("Occupations: Lawyers, Social & Cultural Professionals", [
    "Judge and magistrate", "Lawyer, advocate and barrister", "Notary, solicitor and legal professional", "Archivist and curator", "Librarian and information professional",
    "Economist", "Sociologist, anthropologist and historian", "Philosopher, political scientist and related", "Psychologist and social scientist", "Social-work and counselling professional",
    "Religious minister, priest, imam, pandit and monk", "Author and writer", "Journalist and reporter", "Translator, interpreter and linguist", "Visual artist, painter and sculptor",
    "Musician, singer and composer", "Dancer and choreographer", "Film, stage and theatre director", "Actor and performer", "Announcer, newsreader and presenter",
    "Photographer and cinematographer", "Poet, playwright and screenwriter", "Community and development worker",
  ]),
  cat("Occupations: Technicians & Associate Professionals", [
    "Physical and engineering-science technician", "Civil-engineering technician", "Electrical-engineering technician", "Electronics-engineering technician", "Mechanical-engineering technician",
    "Chemical-engineering technician", "Mining and metallurgical technician", "Draughtsperson", "Physical-science technician", "Process-control technician",
    "Ship, aircraft and railway controller and technician", "Ship's engineer, deck officer and pilot", "Air-traffic controller and safety technician", "Life-science technician", "Agricultural and forestry technician",
    "Medical and pharmaceutical technician", "Medical-records technician", "Nursing and midwifery associate professional", "Traditional-medicine practitioner and faith healer", "Veterinary technician and assistant",
    "Dental, optical and physiotherapy technician", "Securities and finance dealer and broker", "Insurance representative", "Commercial sales representative", "Buyer and merchandiser",
    "Trade broker and agent", "Business-services agent", "Administrative and executive secretary", "Government regulatory associate professional", "Police inspector and detective",
    "Social-work associate professional", "Sports coach, instructor and official", "Fitness and recreation instructor", "Photographer and gallery technician", "Chef",
    "Religious associate professional",
  ]),
  cat("Occupations: Clerks, Secretaries & Office Support", [
    "General office clerk", "Secretary (general)", "Data-entry clerk and typist", "Bank-teller and counter clerk", "Betting and gambling clerk",
    "Contact-centre information clerk", "Telephone switchboard operator", "Receptionist", "Travel-agent and travel clerk", "Hotel and front-desk receptionist",
    "Interviewer and survey clerk", "Library and filing clerk", "Accounting and bookkeeping clerk", "Statistical, finance and insurance clerk", "Payroll clerk",
    "Stock and warehouse clerk", "Production clerk", "Transport and dispatch clerk", "Mail carrier and post-office clerk", "Coding, proofreading and related clerk",
    "Scribe and document writer", "Personnel and HR clerk", "Peon, office boy and office helper",
  ]),
  cat("Occupations: Salespeople, Cashiers & Shop Assistants", [
    "Shop salesperson and sales assistant", "Shopkeeper", "Street and market salesperson", "Door-to-door and telephone salesperson", "Fast-food counter worker",
    "Cashier and ticket clerk", "Mobile-food vendor", "Newspaper and kiosk vendor", "Vending-machine and parking-meter attendant", "Insurance and finance sales agent",
    "Rental and hire clerk", "Pawnbroker and money lender", "Stall and market-trader", "Fuel-station attendant", "Promoter and brand ambassador",
    "Merchandiser and shelf-stocker", "Online and social-media seller",
  ]),
  cat("Occupations: Hospitality, Beauty & Personal Services", [
    "Travel attendant and steward", "Cabin crew and flight attendant", "Conductor and ticket checker", "Travel guide and tour escort", "Cook",
    "Waiter and waitress", "Bartender and barista", "Hairdresser and barber", "Beautician and make-up artist", "Manicurist and pedicurist",
    "Spa and massage therapist", "Housekeeper and hotel housekeeper", "Building caretaker and janitor", "Domestic helper and house cleaner", "Launderer and dry-cleaner",
    "Child-care worker and nanny", "Teacher's aide", "Home-based personal-care worker", "Pet groomer and animal caretaker", "Companion and valet",
    "Undertaker and embalmer", "Astrologer, fortune-teller and related", "Driving instructor", "Wedding and event assistant", "Sauna, spa and bath attendant",
  ]),
  cat("Occupations: Protective Services & Security", [
    "Firefighter", "Police officer", "Prison guard", "Security guard", "Bouncer and doorman",
    "Private detective and bodyguard", "Lifeguard and rescue worker", "Armed-forces officer", "Armed-forces non-commissioned officer", "Armed-forces soldier and other ranks",
    "Home-guard and civil-defence volunteer", "Border and coast-guard personnel", "Traffic warden and parking enforcer", "Forest guard and wildlife ranger",
  ]),
  cat("Occupations: Skilled Farmers, Foresters & Fishers", [
    "Field-crop and vegetable grower", "Tree and shrub crop grower", "Gardener, horticulturist and nursery grower", "Mixed-crop grower", "Livestock and dairy producer",
    "Poultry producer", "Apiarist and sericulturist", "Mixed-crop and animal producer", "Forestry worker", "Aquaculture worker",
    "Inland and coastal waters fisher", "Deep-sea fisher", "Hunter and trapper", "Subsistence crop farmer", "Subsistence livestock farmer",
    "Subsistence fisher, hunter and gatherer", "Farm hand and agricultural labourer", "Plantation worker and tea-leaf picker", "Date-palm, coconut and toddy tapper", "Shepherd and cowherd (gwala)",
  ]),
  cat("Occupations: Construction & Building Trades", [
    "Building frame and related trades worker", "Bricklayer and related worker", "Stonemason, stone cutter and carver", "Concrete placer and finisher", "Carpenter and joiner",
    "Building structure worker", "Roofer", "Floor and tile layer", "Plasterer", "Insulation worker",
    "Glazier", "Plumber and pipe fitter", "Air-conditioning and refrigeration mechanic", "Building painter and related worker", "Structural-metal painter and varnisher",
    "Chimney sweep and building cleaner", "Building electrician", "Shuttering and scaffolding worker", "Surveyor's helper and site assistant", "Waterproofing and damp-proofing worker",
  ]),
  cat("Occupations: Metal, Machine & Vehicle Trades", [
    "Sheet-metal worker", "Structural-metal preparer and erector", "Welder and flame cutter", "Blacksmith, hammer-smith and forging press worker", "Toolmaker and related",
    "Metal-working machine-tool setter and operator", "Machinery mechanic and fitter", "Motor-vehicle mechanic and repairer", "Aircraft engine mechanic", "Agricultural and industrial machinery mechanic",
    "Bicycle and related repairer", "Precision-instrument maker and repairer", "Musical-instrument maker and tuner", "Jeweller and precious-metal worker", "Potter and glass-maker",
    "Signwriter, decorative painter and engraver", "Handicraft worker in wood, textile, leather", "Printing pre-press, printer and binder",
  ]),
  cat("Occupations: Electrical, Electronics & Telecom Trades", [
    "Electrical equipment installer and repairer", "Electrical line installer and repairer", "Electronics mechanic and servicer", "Information and communications technology installer and servicer", "Telephone and cable installer",
    "Mobile-tower and fibre technician", "Lift and escalator installer", "Solar and wind installer", "Appliance repair technician", "Computer repair and hardware assembler",
    "CCTV and security-system installer", "Biomedical-equipment technician",
  ]),
  cat("Occupations: Food, Garment & Craft Trades", [
    "Butcher, fishmonger and related food preparer", "Baker, pastry-cook and confectionery maker", "Dairy-products maker", "Fruit, vegetable and related preserver", "Food and beverage tester and grader",
    "Tobacco preparer and product maker", "Cabinet-maker and related", "Wood treater", "Woodworking-machine setter and operator", "Tailor, dressmaker, furrier and hatter",
    "Garment and related pattern-maker and cutter", "Sewing, embroidery and related worker", "Upholsterer and related", "Leather and related trades", "Shoemaker and related",
    "Weaver, knitter and spinner", "Dyer and textile finisher", "Basket, mat and bamboo weaver", "Potter, brick and tile maker", "Candle, incense and soap maker",
  ]),
  cat("Occupations: Plant, Machine & Factory Operators", [
    "Mining-plant operator", "Mineral and stone-processing plant operator", "Metal-processing plant operator", "Glass, ceramics and related plant operator", "Wood-processing and papermaking plant operator",
    "Chemical-processing plant operator", "Petroleum and natural-gas refining plant operator", "Power-production plant operator", "Water-treatment plant operator", "Incinerator and water-treatment plant operator",
    "Metal-finishing, plating and coating machine operator", "Rubber-, plastic- and paper-products machine operator", "Textile, fur and leather products machine operator", "Food and related products machine operator", "Packing, bottling and labelling machine operator",
    "Assembler (mechanical, electrical, electronic)", "Industrial robot and automation operator", "Laundry and dry-cleaning machine operator", "Printing and bookbinding machine operator",
  ]),
  cat("Occupations: Drivers & Mobile-Machine Operators", [
    "Train driver and locomotive engine driver", "Railway brake, signal and points operator", "Motorcycle driver and delivery rider", "Car, taxi and van driver", "Bus and tram driver",
    "Heavy-truck and lorry driver", "Mobile-plant (earth-moving, crane, forklift) operator", "Agricultural and forestry mobile-plant operator", "Ship's deck crew and related", "Ferry, boat and ropeway operator",
    "Rickshaw, e-rickshaw and auto driver", "Tractor and harvester driver", "Water-tanker and garbage-truck driver", "Ambulance and school-bus driver", "Chauffeur and personal driver",
    "Delivery and courier driver",
  ]),
  cat("Occupations: Labourers, Helpers & Elementary Workers", [
    "Domestic, hotel and office cleaner and helper", "Vehicle, window and laundry washer", "Crop farm labourer", "Livestock farm labourer", "Mixed crop and livestock labourer",
    "Garden and horticultural labourer", "Forestry labourer", "Fishery and aquaculture labourer", "Mining and quarrying labourer", "Civil-engineering labourer",
    "Building construction labourer", "Manufacturing labourer", "Hand packer", "Freight handler, loader and unloader (hamal)", "Porter, coolie and head-load worker",
    "Shelf filler and stock helper", "Food-preparation assistant and kitchen helper", "Fast-food preparer", "Street vendor of non-food products", "Street and market food seller",
    "Garbage and recycling collector", "Sweeper and sanitation worker", "Odd-job, messenger and delivery person", "Meter reader and vending-machine collector", "Car-park and toll attendant",
    "Door-to-door helper and canvasser", "Watchman and gatekeeper", "Water-carrier and well-worker",
  ]),
  cat("Other / Not Listed", ["Diversified conglomerate", "Start-up (industry not decided yet)", "Holding or investment vehicle", "Franchise operations", "Social enterprise", "Not applicable"]),
];

/** Selection stored on the company: up to 5 categories and 50 sub-categories, any of which may be typed by the company ("custom"). */
/** Everyday and regional words people type for their trade (Hindi / local names), so search finds the category without knowing its formal name. */
const ALIASES: Record<string, string> = {
  "Vegetable, Fruit & Fresh Produce Sellers": "sabzi sabji sabziwala phal fal phalwala thela mandi",
  "Milk, Dairy, Egg & Poultry Sellers": "doodh doodhwala dahi anda murga machhli machli chicken mutton",
  "Tea Stalls, Snacks & Street Food Vendors": "chai chaiwala nashta chaat golgappa thela tapri samosa",
  "Sweet Shops, Bakeries & Home Food Makers": "mithai halwai bakery cake tiffin dabba",
  "Kirana, Pan & Small Kiosk Owners": "kirana dukan dukaan gumti pan bidi cigarette paan",
  "Tailors, Cloth Sellers & Garment Workers": "darzi kapda kapde silai dhobi press",
  "Barbers, Salon & Grooming Workers": "nai napit hajam parlour salon",
  "Mechanics, Garages & Vehicle Repair Workers": "mistri garage puncture gadi bike car",
  "Electricians, Plumbers & Skilled Tradespeople": "mistri bijli nal plumber carpenter barhai rajmistri painter",
  "Drivers, Vehicle Owners & Delivery Partners": "driver chalak auto rickshaw taxi tempo truck delivery",
  "Daily-Wage, Helper & Household Workers": "mazdoor majdoor labour helper naukar maid bai",
  "Flower, Pooja & Religious-Item Sellers": "phool mala pooja puja pandit mandir",
  "Scrap, Waste & Rag Pickers": "kabadi kabadiwala raddi kachra",
  "Mobile, Computer & Digital Service Points": "mobile recharge cyber csc photocopy",
  "Cattle, Poultry & Small Livestock Keepers": "gaay bhains bakri murgi pashu",
  "Small Farmers, Gardeners & Nursery Owners": "kisan kheti khet mali nursery",
  "Artisans, Craftspeople & Home Producers": "kumhar lohar mochi julaha kaarigar karigar",
  "General Stores, Grocery & Daily Needs": "kirana grocery provision dukan",
  "Restaurants, Cafes & Eateries": "hotel dhaba restaurant khana",
  "Electricians & Electrical Workers": "electrician bijli mistri wireman wiring electric",
  "Plumbers & Pipe Fitters": "plumber nal mistri pipe fitter sanitary",
  "Carpenters, Joiners & Furniture Makers": "carpenter barhai penter furniture woodwork lakdi",
  "Painters, Plasterers & Finishers": "painter paint penter rangsaz putty pop plaster",
  "Welders, Fabricators & Metal Workers": "welder welding belder fabricator lohar iron steel",
  "Masons, Bricklayers & Construction Workers": "mason rajmistri raj mistri bricklayer construction labour",
  "Builders, Contractors & Thekedars": "builder bulder contractor thekedar thekedari civil construction",
  "Technicians & Repair Specialists": "technician repair mechanic ac fridge mobile",
  "Housekeeping, Cleaning & Maid Services": "housekeeping cleaning maid bai safai jharu pocha",
  "Homemade Food & Home-Based Producers": "homemade home made ghar ka khana home based gharelu",
  "Ice Cream, Kulfi & Dessert Businesses": "ice cream icecream kulfi gola dessert",
  "Dhaba, Highway Eateries & Roadside Restaurants": "dhaba dhana highway roadside restaurant",
  "Restaurant Owners, Chefs & Cooks": "restaurant chef cook rasoiya hotel",
  "Cricketers, Athletes & Professional Sportspeople": "cricketer cricket player khiladi sports athlete",
  "Jewellers, Goldsmiths & Jewellery Shops": "jewellery jewelry jeweller sunar sona gold silver",
  "Hardware & Building-Material Dealers": "hardware building material cement paint",
  "Farmers, Cultivators & Agricultural Producers": "farmer former kisan kheti cultivator",
  "Sports Goods, Gyms & Fitness Businesses": "sports gym fitness",
  "Bus, Cab & Trip Booking Services": "bus cab taxi booking ticket travels trip tour yatra tirth tempo traveller gadi",
  "Pilgrimage, Yatra & Tour Operators": "yatra tirth teerth pilgrimage darshan dham haj umrah tour bus booking",
  "Trip Planners, Holiday & Tour Package Sellers": "trip tour package holiday ghumna picnic honeymoon tourism",
  "Band Baja, Brass Band & Wedding Music": "band baja brass bandbaja baraat dhol shehnai dj ghodi",
  "Reel Creators, Vloggers & Social Media Influencers": "reel reels instagram youtube shorts vlogger vlog influencer creator moj josh sharechat",
  "Village & Rural Content Creators": "village gaon gramin vlogger youtuber rural channel",
  "Photographers, Videographers & Studio Owners": "photo photographer video studio album wedding shoot",
  "DJ, Sound, Light & Stage Operators": "dj sound light stage speaker box mic",
  "Tent House, Decorators & Event Suppliers": "tent house shamiana decorator mandap",
  "Local News, Reporters & Community Media": "news reporter patrakar channel akhbar",
  "Devotional & Regional Music Artists": "bhajan singer gayak music album bhojpuri haryanvi",
  "Political, Campaign & Public-Representative Offices": "neta sarpanch pradhan mla election",
  "Students, Youth & Campus Life": "student vidyarthi school college university campus youth hostel exam",
  "Kids, Children & Family Services": "kids children bachche baby child nursery playschool creche",
  "Individuals, Homemakers & Personal Use": "individual personal homemaker housewife retired senior job seeker hobby",
  "Seniors, Elder Care & Retirement Services": "senior elder old age retired bujurg",
  "Women-Led & Self-Help Enterprises": "women mahila shg self help group ladies",
  "Local Folk Artists, Orchestras & Entertainment Troupes": "arkestra orchestra dance party dj baja band nautanki jagran kirtan bhajan qawwali tamasha lavani dholak",
  "Local Fairs, Melas & Amusements": "mela fair jhula circus haat tamasha dangal",
  "Weddings & Function Service Providers (Local)": "shaadi vivah baraat tent decoration halwai function",
  "Music, Performing Arts & Talent": "orchestra arkestra dance singer band dj artist",
  "Brokers, Agents & Commission Middlemen": "broker dalal agent middleman commission flat property realtor",
  "Real Estate": "flat broker property dalal realtor plot rent",
  "Government Paperwork & Document Facilitators": "csc aadhaar pan rto licence passport form",
  "Labour Contractors, Manpower & Local Placement": "thekedar thekedari labour contractor majdoor manpower",
  "Neighbourhood & Doorstep Service Providers": "urban company home service on call mistri",
  "Medical Stores, Clinics & Local Healthcare": "dawai davakhana medical clinic doctor",
};

/** Words a category answers to when searching: its own sub-categories (so "vegetable" finds the category that holds it) plus everyday names. */
/** Local words used in names, with what they mean in plain English. */
const GLOSS: [RegExp, string][] = [
  [/\bkirana\b/i, "kirana = neighbourhood grocery shop"], [/\bthela\b/i, "thela = handcart"], [/\bdalal\b/i, "dalal = broker"], [/\barhtiya\b|\bmandi\b/i, "mandi = wholesale produce market"],
  [/\bkabadi/i, "kabadiwala = scrap buyer"], [/\bnai\b/i, "nai = barber"], [/\bdhobi\b/i, "dhobi = washerman"], [/\bdarzi\b/i, "darzi = tailor"], [/\bmistri\b/i, "mistri = skilled tradesperson"],
  [/\blohar\b/i, "lohar = blacksmith"], [/\bkumhar\b/i, "kumhar = potter"], [/\bmochi\b/i, "mochi = cobbler"], [/\bbarhai\b/i, "barhai = carpenter"], [/\brajmistri\b/i, "rajmistri = mason"],
  [/\bthekedar\b/i, "thekedar = contractor"], [/\bhalwai\b/i, "halwai = sweet-maker"], [/\bpandit\b|\bpurohit\b/i, "pandit = Hindu priest"], [/\bmukhiya\b/i, "mukhiya = village head"],
  [/\bpradhan\b/i, "pradhan = elected village head"], [/\bsarpanch\b/i, "sarpanch = panchayat head"], [/\bpatwari\b|\blekhpal\b/i, "patwari = village land-record officer"], [/\btehsildar\b/i, "tehsildar = revenue officer"],
  [/\bvidhayak\b|\bMLA\b/i, "vidhayak = state legislator (MLA)"], [/\bparshad\b/i, "parshad = ward councillor"], [/\bkaryakarta\b/i, "karyakarta = party worker"], [/\bhaat\b/i, "haat = weekly market"],
  [/\bmela\b/i, "mela = fair"], [/\bakhara\b|\bdangal\b/i, "akhara/dangal = wrestling ground/contest"], [/\bnautanki\b/i, "nautanki = folk theatre"], [/\bjagran\b/i, "jagran = night-long devotional singing"],
  [/\bkirtan\b/i, "kirtan = devotional singing"], [/\bqawwali\b/i, "qawwali = sufi devotional music"], [/\bbaraat\b/i, "baraat = groom's wedding procession"], [/\bghodi\b|\bbaggi\b/i, "ghodi/baggi = wedding horse/chariot"],
  [/\bshamiana\b|\btent house\b/i, "shamiana = event tent"], [/\bdhaba\b/i, "dhaba = roadside eatery"], [/\bdharamshala\b/i, "dharamshala = pilgrim rest-house"], [/\bgaushala\b|\bgoshala\b/i, "gaushala = cow shelter"],
  [/\btiffin\b|\bdabba\b/i, "tiffin = home-style meal box"], [/\bkabaddi\b/i, "kabaddi = team contact sport"], [/\btempo\b/i, "tempo = small goods/passenger vehicle"], [/\bpuncture\b/i, "puncture = tyre repair"],
  [/\bchowkidar\b|\bkotwal\b/i, "chowkidar = watchman"], [/\bnumberdar\b/i, "numberdar = village headman"], [/\banganwadi\b/i, "anganwadi = rural child-care centre"], [/\bASHA\b/, "ASHA = community health worker"],
  [/\bCSC\b|common service/i, "CSC = government service centre"], [/\bPG\b/, "PG = paying-guest room"], [/\bRTO\b/, "RTO = vehicle/licence office"], [/\bDSA\b/, "DSA = direct selling agent for loans"],
  [/\bSHG\b|self-help group/i, "SHG = women's savings and enterprise group"], [/\bFPO\b/, "FPO = farmer producer organisation"], [/\bMSME\b/, "MSME = micro, small and medium enterprise"],
];

/** When a name gives no clue of its own, the kind of work its category stands for says what it is (every sub-category gets a line). */
function categoryKindPhrase(category: string): string {
  const c = category.toLowerCase();
  if (/\bkids\b|\bchildren\b|toys, baby/.test(c)) return "A product, class or service for children and families";
  if (c.startsWith("occupations:")) return "A person who works in this job, on a salary or on their own";
  if (/(manufactur|textiles|wood, paper|chemicals|metals, machinery|electronics, computers|automotive|furniture & other|packaging|jewellery, gems|toys, baby)/.test(c)) return "Makes or processes this product in a workshop, unit or factory";
  if (/(agriculture|farmers|farming|cattle|livestock|forestry|fishing|fisher|coastal|small farmers|dairy)/.test(c)) return "Grows, raises, catches or collects this produce";
  if (/(mining|oil, gas|quarry)/.test(c)) return "Digs, extracts or processes this material from the ground";
  if (/(retail|shops|stores|store|wholesale|dealers|vendors|sellers|trader|marketplaces|general stores|kirana|kiosk|hawker|second-hand|import)/.test(c)) return "Buys and sells this, to customers or to other businesses";
  if (/(government|public administration|offices|ngo|association|cooperative|community|faith|religious|political|humanitarian|heritage|international|nonprofit|social care|local government)/.test(c)) return "An office, institution or group of this kind that serves the public or its members";
  if (/(education|students|tuition|kids|school)/.test(c)) return "Teaching, learning or child-care activity of this kind";
  if (/(health|medical|clinic|pharma|biotech|elder|seniors)/.test(c)) return "Health, medical or care activity of this kind";
  if (/(transport|logistics|mobility|railways|\bports\b|shipping|aviation|postal|courier|bus, cab|drivers)/.test(c)) return "Moves people or goods in this way";
  if (/(hospitality|restaurant|food service|tourism|travel|yatra|trip|hotel|dhaba|ice cream|sweet shops|tea stalls|catering|kitchen)/.test(c)) return "Offers food, stay, travel or tours of this kind";
  if (/(finance|banking|insurance|real estate|brokers)/.test(c)) return "Money, property, insurance or brokerage service of this kind";
  if (/(software|information technology|ai,|cyber|cloud|blockchain|vertical tech|telecom|digital|internet|space)/.test(c)) return "Technology, software or digital service of this kind";
  if (/(recreation|sports|fitness|gyms|fairs|melas|amusements)/.test(c)) return "A sports, fitness, recreation or amusement activity of this kind";
  if (/(media|music|arts|creator|performing|fine arts|writers|gaming|events|entertainment|reel|folk artists|band baja|photograph|dj,)/.test(c)) return "Creative, media or entertainment work of this kind";
  return "A business or professional service of this kind";
}

/** What kind of business a sub-category is, in one plain sentence, so a name like "Dhol, tasha and nagada players" or "Kabadiwala" is clear at a glance. */
export function subDescription(sub: BusinessSub, categoryName = ""): string {
  const n = sub.name;
  const rules: [RegExp, string][] = [
    [/\b(rental|renting|hire|leasing|lease)\b/i, "Rents out vehicles, equipment or space"],
    [/\b(manufactur|factory|mill|units?|production|maker|makers|fabricat|assembl|processing|foundry|printing press|workshop)\b/i, "Makes products in a workshop, unit or factory"],
    [/\b(wholesale|distribut|stockist|dealer|trader|importer|exporter|supplier|merchant)\b/i, "Buys and sells goods, often in bulk, to shops and businesses"],
    [/\b(broker|agent|dalal|commission|middlem|aggregator|facilitator|consultant for|booking|liaison)\b/i, "Arranges deals, bookings or paperwork for others, usually for a fee or commission"],
    [/\b(repair|service centre|servicing|mechanic|technician|installer|installation|maintenance)\b/i, "Repairs, installs or maintains things for customers"],
    [/\b(school|college|institute|academy|coaching|tuition|classes|tutor|training|teacher|trainer|university|course)\b/i, "Teaches or trains students and learners"],
    [/\b(clinic|hospital|doctor|medical|pharmacy|dental|nursing|therapy|diagnostic|laborator|ambulance|care centre|healthcare)\b/i, "Provides medical, health or care services"],
    [/\b(farm|farming|growing|grower|crop|cultivation|dairy|poultry|fishing|aquaculture|livestock|horticulture|nursery|plantation|orchard)\b/i, "Grows crops or raises animals and fish"],
    [/\b(contractor|construction|builder|civil|mason|erection|infrastructure|developer)\b/i, "Takes on construction or project work"],
    [/\b(taxi|cab|bus|truck|transport|courier|logistic|delivery|driver|freight|cargo|shipping|rickshaw|vehicle)\b/i, "Moves people or goods"],
    [/\b(hotel|resort|lodge|homestay|restaurant|cafe|catering|caterer|kitchen|food stall|eatery|bakery|sweet|bar\b|tour|travel|yatra|pilgrim)\b/i, "Offers food, stay, travel or tours"],
    [/\b(bank|loan|finance|insurance|credit|lending|investment|broking|wealth|pension|fund|payment|remittance)\b/i, "Provides money, credit, insurance or investment services"],
    [/\b(software|app\b|web\b|digital|cloud|data|AI\b|cyber|IT\b|platform|saas|tech\b|blockchain|game development)\b/i, "Builds or sells software, IT or digital services"],
    [/\b(creator|influencer|vlogger|artist|singer|musician|band|dancer|dj\b|photograph|video|studio|film|media|news|reporter|publisher|writer|performer|troupe|orchestra|theatre|content)\b/i, "Creates content, art, music or entertainment"],
    [/\b(ngo|trust|association|society|cooperative|union|committee|club|foundation|organisation|office|department|panchayat|council|government|authority|party)\b/i, "An organisation, office or group that serves a community or the public"],
    [/\b(shop|store|stall|kiosk|showroom|outlet|mart|market|seller|vendor|hawker|retail|boutique|bazaar|counter)\b/i, "A shop, stall or seller that sells directly to customers"],
    [/\b(cleaning|laundry|pest|security|guard|housekeeping|facility|salon|parlour|spa|massage|beautician|barber|tailor|maid|cook|caretaker)\b/i, "Provides personal, household or facility services"],
  ];
  const kind = rules.find(([re]) => re.test(n))?.[1] ?? categoryKindPhrase(categoryName);
  const gloss = GLOSS.find(([re]) => re.test(n))?.[1];
  return gloss ? `${kind} (${gloss})` : kind;
}

/** One line saying what a category covers, from its own sub-categories ("Includes vegetable seller, fruit seller … and 14 more"). */
export function categoryDescription(c: BusinessCategory): string {
  const pick = c.subs.slice(0, 4).map((x) => x.name.replace(/\s*\([^)]*\)/g, ""));
  const more = c.subs.length - pick.length;
  return `Includes ${pick.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

export function categoryKeywords(c: BusinessCategory): string[] {
  return [...c.subs.map((x) => x.name), ...(ALIASES[c.name]?.split(" ") ?? [])];
}

export interface BusinessSelection {
  standard: "ISIC Rev.4 (extended)";
  categories: { code: string; name: string; custom?: true }[];
  subCategories: { code: string; name: string; categoryCode?: string; custom?: true }[];
}

export type BusinessErrors = { businessCategories?: string; businessSubCategories?: string };
export type BusinessResult = { ok: true; value: BusinessSelection } | { ok: false; errors: BusinessErrors };

const byCode = new Map(BUSINESS_CATEGORIES.map((c) => [c.code, c]));

export const isCustomCode = (code: string) => code.startsWith(CUSTOM_PREFIX);
/** A typed entry, cleaned: letters/numbers and basic punctuation only, 2–60 characters. */
export function cleanCustomName(text: string): string {
  return text.replace(/[^\p{L}\p{N} &,.'()/+-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
export const customCode = (text: string) => `${CUSTOM_PREFIX}${cleanCustomName(text)}`;

/** Checks a submission against the taxonomy (never trust the form) and builds what gets stored. */
export function resolveBusiness(categoryCodes: string[], subCodes: string[]): BusinessResult {
  const cats: BusinessSelection["categories"] = [];
  const seenCat = new Set<string>();
  for (const code of categoryCodes) {
    if (isCustomCode(code)) {
      const name = cleanCustomName(code.slice(CUSTOM_PREFIX.length));
      if (name.length >= 2 && !seenCat.has(`c:${name.toLowerCase()}`)) {
        seenCat.add(`c:${name.toLowerCase()}`);
        cats.push({ code: `${CUSTOM_PREFIX}${name}`, name, custom: true });
      }
    } else if (byCode.has(code) && !seenCat.has(code)) {
      seenCat.add(code);
      cats.push({ code, name: byCode.get(code)!.name });
    }
  }
  if (cats.length === 0) return { ok: false, errors: { businessCategories: "Choose at least one business category." } };
  if (cats.length > MAX_BUSINESS_CATEGORIES) return { ok: false, errors: { businessCategories: `Choose at most ${MAX_BUSINESS_CATEGORIES} categories.` } };

  const chosen = new Set(cats.filter((c) => !c.custom).map((c) => c.code));
  const subs: BusinessSelection["subCategories"] = [];
  const seenSub = new Set<string>();
  for (const code of subCodes) {
    if (isCustomCode(code)) {
      const name = cleanCustomName(code.slice(CUSTOM_PREFIX.length));
      if (name.length >= 2 && !seenSub.has(`c:${name.toLowerCase()}`)) {
        seenSub.add(`c:${name.toLowerCase()}`);
        subs.push({ code: `${CUSTOM_PREFIX}${name}`, name, custom: true });
      }
      continue;
    }
    const owner = code.split(":")[0];
    const sub = chosen.has(owner) ? byCode.get(owner)?.subs.find((x) => x.code === code) : undefined;
    if (sub && !seenSub.has(sub.code)) {
      seenSub.add(sub.code);
      subs.push({ code: sub.code, name: sub.name, categoryCode: owner });
    }
  }
  if (subs.length === 0) return { ok: false, errors: { businessSubCategories: "Choose at least one sub-category." } };
  if (subs.length > MAX_BUSINESS_SUBCATEGORIES) return { ok: false, errors: { businessSubCategories: `Choose at most ${MAX_BUSINESS_SUBCATEGORIES} sub-categories.` } };
  return { ok: true, value: { standard: "ISIC Rev.4 (extended)", categories: cats, subCategories: subs } };
}

/** A valid sample submission (an IT category and its first sub-category) — for tests and seeders. */
export function sampleBusinessInput(): { categories: string[]; subCategories: string[] } {
  const c = BUSINESS_CATEGORIES.find((x) => x.code.startsWith("information-technology")) ?? BUSINESS_CATEGORIES[0];
  return { categories: [c.code], subCategories: [c.subs[0].code] };
}
