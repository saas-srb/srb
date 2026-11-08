/**
 * Variability pools: actor archetypes, settings, camera flavours, pacing, ambience.
 * All fictional, generic people. Adults only (18-60). No real person's likeness.
 */

export interface ActorArchetype {
  id: string;
  ageRange: string;
  gender: "woman" | "man";
  look: string;
  wardrobes: string[];
  accents: string[];
  personalities: string[];
}

export const ACTOR_ARCHETYPES: ActorArchetype[] = [
  { id: "college-woman", ageRange: "22-25", gender: "woman", look: "slim build, shoulder-length wavy black hair, natural skin with a few blemishes, small stud earrings",
    wardrobes: ["oversized mustard hoodie and blue jeans", "pastel kurti with denim jacket", "plain white tee and black cargo pants", "olive sweatshirt and joggers"],
    accents: ["neutral urban Indian English", "Delhi casual", "Pune casual", "Bengaluru casual"], personalities: ["bubbly and talkative", "curious and a bit shy", "sarcastic but warm", "easygoing"] },
  { id: "college-man", ageRange: "18-23", gender: "man", look: "lean build, short messy black hair, light stubble, slightly tired eyes",
    wardrobes: ["faded graphic tee and jeans", "navy hoodie and track pants", "checked shirt over a white tee", "plain grey tee and shorts"],
    accents: ["neutral urban Indian English", "Mumbai casual", "Lucknow-tinged", "Hyderabadi-tinged"], personalities: ["laid-back and joking", "enthusiastic and fast-talking", "thoughtful, pauses before speaking", "cheeky"] },
  { id: "young-professional-woman", ageRange: "24-29", gender: "woman", look: "medium build, hair in a loose claw clip, minimal makeup, small nose pin",
    wardrobes: ["linen shirt in sage green and straight trousers", "cream knit top and jeans", "printed co-ord set in earthy tones", "navy kurta with white palazzo"],
    accents: ["Mumbai casual", "Delhi casual", "Chennai-tinged English", "neutral urban Indian English"], personalities: ["practical and direct", "warm and chatty", "dry-humoured", "calm and organised"] },
  { id: "young-professional-man", ageRange: "25-30", gender: "man", look: "medium build, neatly cut hair, trimmed beard, glasses",
    wardrobes: ["rolled-sleeve light blue shirt and chinos", "dark green polo and jeans", "grey crew-neck sweater", "black tee with an open flannel shirt"],
    accents: ["Bengaluru casual", "Pune casual", "Delhi casual", "Kolkata-tinged"], personalities: ["analytical but friendly", "easy smile, relaxed", "slightly nerdy and excited", "straight-talking"] },
  { id: "mid-woman", ageRange: "28-32", gender: "woman", look: "average build, long hair tied back, natural look with a small bindi, faint smile lines",
    wardrobes: ["cotton kurta in teal and leggings", "maroon top and beige trousers", "floral shirt dress", "mustard kurti with dupatta"],
    accents: ["Marathi-tinged", "Gujarati-tinged", "Punjabi-tinged", "neutral urban Indian English"], personalities: ["motherly and reassuring", "energetic and funny", "no-nonsense", "gentle and thoughtful"] },
  { id: "mid-man", ageRange: "30-40", gender: "man", look: "sturdy build, short hair with a hint of grey at the temples, light beard",
    wardrobes: ["half-sleeve checked shirt and jeans", "plain navy tee and chinos", "kurta in off-white with jeans", "olive jacket over a grey tee"],
    accents: ["Punjabi-tinged", "Mumbai casual", "Kerala-tinged English", "Hindi-belt casual"], personalities: ["confident and humorous", "calm, speaks slowly", "talkative storyteller", "pragmatic"] },
  { id: "senior-woman", ageRange: "45-60", gender: "woman", look: "medium build, salt-and-pepper hair in a low bun, reading glasses on a chain, expressive laugh lines",
    wardrobes: ["cotton saree in soft green with a thin border", "printed salwar kameez", "simple kurta with a cardigan", "block-print kurta and dupatta"],
    accents: ["Tamil-tinged English", "Bengali-tinged", "Hindi-belt casual", "Marathi-tinged"], personalities: ["warm and wise", "playfully stubborn", "gentle and patient", "sharp and funny"] },
  { id: "senior-man", ageRange: "50-60", gender: "man", look: "solid build, grey moustache, receding hairline, kind eyes, wire-frame glasses",
    wardrobes: ["pale blue full-sleeve shirt and trousers", "cream kurta and pyjama", "sleeveless sweater over a shirt", "polo and khaki pants"],
    accents: ["Punjabi-tinged", "Gujarati-tinged", "Hindi-belt casual", "Telugu-tinged English"], personalities: ["dignified, speaks slowly", "jovial and loud", "curious about everything", "dry wit"] },
  { id: "south-woman", ageRange: "26-32", gender: "woman", look: "average build, thick dark braid over one shoulder, jasmine in hair, natural brows, warm brown skin",
    wardrobes: ["cotton kurta in indigo with white leggings", "silk-cotton salwar in magenta", "simple tee and jeans with small jhumkas", "mint green kurti"],
    accents: ["Tamil-tinged English", "Malayali-tinged English", "Kannada-tinged English", "Telugu-tinged English"], personalities: ["expressive and animated", "soft-spoken and precise", "funny in a quiet way", "warm and chatty"] },
  { id: "south-man", ageRange: "27-36", gender: "man", look: "medium build, thick black hair, full moustache, dark circles from long days",
    wardrobes: ["plain white shirt and dark trousers", "teal polo and jeans", "mundu-style cotton lungi at home with a tee", "grey tee and jeans"],
    accents: ["Tamil-tinged English", "Malayali-tinged English", "Kannada-tinged English", "Telugu-tinged English"], personalities: ["earnest and detailed", "cheerful", "reserved but witty", "quick with jokes"] },
  { id: "north-east-woman", ageRange: "22-28", gender: "woman", look: "petite build, straight hair with a side parting, soft natural makeup",
    wardrobes: ["beige turtleneck and dark jeans", "red check shirt and denim shorts", "pastel hoodie", "black tee with a long cardigan"],
    accents: ["neutral urban Indian English", "Delhi casual", "Shillong-tinged English", "Guwahati-tinged"], personalities: ["cool and calm", "playful", "thoughtful", "bright and friendly"] },
  { id: "bengali-man", ageRange: "28-38", gender: "man", look: "slightly built, curly hair, round glasses, stubble, relaxed posture",
    wardrobes: ["cotton panjabi in earthy brown", "grey tee and jeans", "striped shirt with rolled sleeves", "navy hoodie"],
    accents: ["Bengali-tinged", "Kolkata-tinged", "neutral urban Indian English", "Delhi casual"], personalities: ["adda-loving talker", "wry and observant", "gentle", "passionate about small details"] },
  { id: "gujarati-woman", ageRange: "28-32", gender: "woman", look: "average build, hair in a neat low ponytail, small bindi, bangles, friendly face",
    wardrobes: ["bandhani-print kurta", "plain cotton saree with a contrast blouse", "salwar suit in coral", "denim shirt and trousers"],
    accents: ["Gujarati-tinged", "Mumbai casual", "neutral urban Indian English", "Hindi-belt casual"], personalities: ["sweet and chatty", "organised and brisk", "humorous", "matter-of-fact"] },
  { id: "punjabi-man", ageRange: "28-40", gender: "man", look: "tall, well-built, neat turban or short hair with a trimmed beard, big laugh",
    wardrobes: ["pastel shirt and jeans", "black tee and bomber jacket", "kurta in mustard with denim", "white shirt and grey trousers"],
    accents: ["Punjabi-tinged", "Delhi casual", "Chandigarh casual", "neutral urban Indian English"], personalities: ["loud and warm", "showy but sincere", "easygoing", "generous storyteller"] },
  { id: "global-woman", ageRange: "25-32", gender: "woman", look: "medium build, light brown wavy hair, freckles, natural makeup",
    wardrobes: ["denim shirt and white tee", "cream sweater and jeans", "striped long-sleeve tee", "olive utility jacket"],
    accents: ["British", "American", "Australian", "Canadian"], personalities: ["upbeat", "dry and witty", "calm and clear", "enthusiastic"] },
  { id: "global-man", ageRange: "28-42", gender: "man", look: "medium build, short dark hair, five-o'clock shadow, relaxed expression",
    wardrobes: ["grey hoodie and jeans", "navy overshirt and white tee", "plain black tee", "plaid shirt and chinos"],
    accents: ["American", "British", "Irish", "South African"], personalities: ["friendly and casual", "dry humour", "thoughtful", "high energy"] },
  { id: "plus-size-woman", ageRange: "28-32", gender: "woman", look: "plus-size build, curly dark hair, confident smile, natural skin with visible pores",
    wardrobes: ["flowy printed kurta in blue", "black tee and wide-leg trousers", "rust co-ord set", "denim jacket over a long dress"],
    accents: ["Delhi casual", "Mumbai casual", "neutral urban Indian English", "Hyderabadi-tinged"], personalities: ["confident and funny", "warm and direct", "playful", "calm"] },
  { id: "athletic-man", ageRange: "22-32", gender: "man", look: "athletic build, close-cropped hair, light sweat sheen, tired but happy",
    wardrobes: ["sleeveless dri-fit tee and shorts", "plain black tee and joggers", "grey tank and track pants", "zip-up track jacket"],
    accents: ["Hindi-belt casual", "Haryanvi-tinged", "Mumbai casual", "Delhi casual"], personalities: ["motivating but unpreachy", "joking while out of breath", "quiet and focused", "friendly"] },
  { id: "athletic-woman", ageRange: "22-32", gender: "woman", look: "toned build, high ponytail, flushed cheeks, no makeup",
    wardrobes: ["fitted black training tee with high-waist leggings", "lilac training set", "oversized grey tee and shorts", "teal activewear with a headband"],
    accents: ["neutral urban Indian English", "Bengaluru casual", "Delhi casual", "Pune casual"], personalities: ["energetic", "no-excuses but kind", "funny", "calm and encouraging"] },
];

/**
 * CASTING AND WARDROBE POLICY (applies to every style).
 * - Default casting is female-led: solo styles cast one woman, two-person styles one man and one woman, three-person styles at least one woman.
 * - Women in the default cast are young adults (22-32, never under 21; 18+ stays the hard floor for everyone), confident, stylish and expressive.
 *   "Bold" means a confident personality, trendy outfits, strong presence and expressive delivery. It never means revealing or provocative.
 * - Nothing is sexualised: no revealing or provocative clothing or poses, no body-focused camera framing, no suggestive wording. Video providers
 *   refuse sexualised people, ad platforms (Meta, Google/YouTube, LinkedIn) restrict such content, and it does not suit devotional, news, kids-topic or B2B contexts.
 * - Wardrobe follows context: "trendy" for everyday UGC, "modest" (professional, covered, polished) for news, B2B/corporate, kids-topic, education,
 *   finance-awareness, hiring and awareness styles, "traditional" (ethnic, covered) for devotional and festival styles. All outfits are fully covered.
 */
export type WardrobeTone = "trendy" | "modest" | "traditional";

export const TRENDY_WARDROBES: Record<"woman" | "man", string[]> = {
  woman: ["bold-colour co-ord set, statement earrings", "wide-leg trousers, crisp shirt and blazer", "printed midi dress and denim jacket", "knit top, straight jeans and gold hoops",
    "oversized shirt, tapered trousers and tote", "fusion kurta set, contrast dupatta, sneakers"],
  man: ["neat overshirt, tee and chinos", "bomber jacket, plain tee and jeans", "linen shirt, rolled sleeves, dark trousers", "casual blazer over a polo and jeans"],
};
export const MODEST_WARDROBES: Record<"woman" | "man", string[]> = {
  woman: ["full-sleeve blouse with tailored trousers", "blazer over a high-neck top and trousers", "long cotton kurta, straight pants, scarf", "pastel shirt dress, below the knee",
    "silk-blend saree with contrast blouse", "formal shirt, long jacket and straight trousers"],
  man: ["formal shirt with trousers", "crisp half-sleeve shirt and trousers", "plain kurta with a Nehru jacket", "smart blazer over a shirt and trousers"],
};
export const TRADITIONAL_WARDROBES: Record<"woman" | "man", string[]> = {
  woman: ["cotton saree in marigold yellow", "maroon silk-blend kurta set with dupatta", "emerald anarkali with gold-edged dupatta", "indigo block-print salwar suit"],
  man: ["cream kurta and pyjama", "silk kurta with a Nehru jacket", "cotton dhoti set with angavastram", "handloom kurta in earthy tones"],
};
export const BOLD_WOMAN_PERSONALITIES: string[] = [
  "confident, bold and expressive with a strong presence", "poised and stylish, speaks with conviction", "witty and commanding, big expressive gestures", "warm and fearless, animated delivery",
  "sharp, direct and charismatic", "upbeat, trendsetting and quick to laugh",
];

export interface SettingDef {
  id: string;
  label: string;
  description: string;
  lighting: string[];
  timeOfDay: string[];
  props: string[];
}

export const SETTINGS: SettingDef[] = [
  { id: "bedroom-floor-cosy", label: "Cosy bedroom floor", description: "a cosy lived-in bedroom, sitting on the floor against the bed with cushions, fairy lights, a photo wall, a few plants",
    lighting: ["warm fairy-light glow mixed with a bedside lamp", "soft evening window light plus warm lamp", "dim golden lamp light, slightly grainy"], timeOfDay: ["evening", "late evening", "lazy weekend afternoon"],
    props: ["a steaming mug", "a small potted plant", "polaroid prints on the wall", "a throw blanket", "a half-open laptop", "a stack of books", "snack bowl"] },
  { id: "living-room-sofa", label: "Living room sofa", description: "a lived-in Indian living room with a fabric sofa, cushions, a TV unit and family photos in the background",
    lighting: ["daylight from a side window with a little glare", "warm tube light plus window light", "evening lamp light"], timeOfDay: ["afternoon", "evening", "Sunday morning"],
    props: ["a steel tea tumbler", "a remote on the arm of the sofa", "a plate of biscuits", "a folded newspaper", "a brass lamp", "mobile charger cable on the table"] },
  { id: "balcony-evening", label: "Apartment balcony", description: "a small apartment balcony with potted plants, a cane chair, hanging clothes in the distance and city rooftops behind",
    lighting: ["golden hour sun, slightly backlit", "soft overcast light", "blue-hour dusk with a warm indoor spill"], timeOfDay: ["golden hour", "early morning", "dusk"],
    props: ["two chai cups", "a hanging plant", "a rattan stool", "a small speaker", "dry laundry on a stand"] },
  { id: "home-kitchen", label: "Home kitchen", description: "a real Indian home kitchen with a gas stove, steel containers, a slightly cluttered counter and tiled backsplash",
    lighting: ["bright tube light with warm window spill", "morning window light", "overhead light, mild shadows"], timeOfDay: ["morning", "afternoon", "evening"],
    props: ["steel containers", "a chopping board with chopped onions", "a pressure cooker", "a spice dabba", "a kitchen towel on the shoulder"] },
  { id: "cafe-corner", label: "Neighbourhood cafe", description: "a casual neighbourhood cafe corner with wooden tables, chalkboard menu, other customers blurred in the background",
    lighting: ["warm window light", "mixed warm bulbs and daylight", "soft overcast daylight through glass"], timeOfDay: ["late morning", "afternoon", "early evening"],
    props: ["two cold coffees", "a notebook", "a plate of fries", "a phone on the table", "a tote bag on the chair"] },
  { id: "coworking-office", label: "Co-working office", description: "an open co-working space with laptops, plants, a whiteboard wall and colleagues working out of focus",
    lighting: ["cool office LED with window daylight", "bright overhead panels", "late afternoon window light"], timeOfDay: ["mid-morning", "afternoon", "late afternoon"],
    props: ["a laptop with stickers", "sticky notes on a wall", "a steel water bottle", "headphones on the desk", "a whiteboard with scribbles"] },
  { id: "small-office-desk", label: "Small office desk", description: "a small business office with a cluttered desk, file shelves, a wall calendar and a ceiling fan",
    lighting: ["tube light with a bit of flicker feel", "window light from the side", "desk lamp plus daylight"], timeOfDay: ["morning", "afternoon", "after hours"],
    props: ["files and folders", "a desktop monitor", "a tea cup", "a notepad with handwriting", "a wall clock"] },
  { id: "street-market-lane", label: "Street market lane", description: "a busy neighbourhood market lane with stalls, hanging bulbs, passing scooters and shopkeepers in the background",
    lighting: ["harsh midday sun with deep shadows", "late afternoon warm light", "evening mix of shop bulbs and dusk"], timeOfDay: ["midday", "late afternoon", "evening"],
    props: ["a fruit cart", "banners and signboards", "a parked scooter", "tea glasses", "hanging festoons"] },
  { id: "college-campus-steps", label: "College campus steps", description: "college campus steps and lawn with students walking, trees, notice boards and bicycles",
    lighting: ["dappled tree shade and sun", "flat overcast light", "bright morning sun"], timeOfDay: ["morning", "noon", "late afternoon"],
    props: ["backpacks", "a cycle stand", "a notice board", "paper cups of chai", "a campus canteen sign"] },
  { id: "gym-floor", label: "Local gym", description: "a neighbourhood gym floor with dumbbell racks, mirrors, rubber mats and a couple of people training in the background",
    lighting: ["bright overhead LEDs with mirror reflections", "warm evening gym lights", "morning window light mixed with LEDs"], timeOfDay: ["early morning", "evening", "late night"],
    props: ["a towel on the shoulder", "a shaker bottle", "dumbbells", "a resistance band", "a gym bag"] },
  { id: "shop-counter", label: "Neighbourhood shop", description: "a small family-run shop with shelves behind the counter, a cash drawer, hanging goods and a hand-written price-free signboard",
    lighting: ["tube lights with warm bulbs", "doorway daylight and shop lights", "evening shop lights glowing"], timeOfDay: ["late morning", "afternoon", "evening"],
    props: ["a glass-top counter", "a calculator", "stacked cartons", "a small idol with a garland", "a ledger book"] },
  { id: "parked-car", label: "Parked car", description: "the front seat of a parked hatchback, seat belt on, dashboard visible, a street out of focus through the windshield",
    lighting: ["daylight through the windshield with soft reflections", "dusk light with dashboard glow", "overcast flat light"], timeOfDay: ["afternoon", "dusk", "morning"],
    props: ["a phone mount", "a water bottle in the door", "sunglasses on the dash", "a small air freshener", "a tote bag on the seat"] },
  { id: "park-bench", label: "City park", description: "a city park with a bench, walking track, trees and joggers passing at a distance",
    lighting: ["soft morning sun through trees", "late afternoon warm light", "flat bright overcast"], timeOfDay: ["early morning", "late afternoon", "evening"],
    props: ["a water bottle", "earphones", "a jogging track", "a paper bag of snacks", "a tote bag"] },
  { id: "rooftop-dusk", label: "Rooftop", description: "a terrace rooftop with water tanks, strings of lights, neighbouring buildings and an open sky",
    lighting: ["golden hour backlight with soft flare", "blue-hour sky with warm string lights", "bright midday sun"], timeOfDay: ["golden hour", "dusk", "midday"],
    props: ["string lights", "a plastic chair", "a mat on the floor", "a thermos", "potted plants"] },
  { id: "dining-table", label: "Dining table", description: "a family dining table in a home, with a tablecloth, fruit bowl, a few dishes and a wall clock behind",
    lighting: ["warm pendant light plus window light", "tube light, slightly flat", "soft daylight"], timeOfDay: ["morning", "lunchtime", "night"],
    props: ["a fruit bowl", "steel plates", "a water jug", "a newspaper", "a laptop pushed to one side"] },
  { id: "study-desk-room", label: "Study desk", description: "a small study desk in a bedroom with textbooks, a desk lamp, sticky notes and a window with curtains",
    lighting: ["desk lamp glow with dark room", "window daylight with curtain softness", "mixed lamp and tube light"], timeOfDay: ["night", "morning", "afternoon"],
    props: ["a desk lamp", "highlighters", "a laptop", "a wall planner", "a coffee mug"] },
  { id: "dressing-mirror", label: "Dressing mirror corner", description: "a bedroom dressing table with a large mirror, small bottles and organisers, wardrobe doors partly visible",
    lighting: ["soft window light from the side", "warm bulb lights around the mirror", "overhead light, slightly yellow"], timeOfDay: ["morning", "early evening", "pre-party evening"],
    props: ["small bottles on the table", "hair clips", "a hairbrush", "a jewellery tray", "a folded towel"] },
  { id: "doorstep-entry", label: "Doorstep and entrance", description: "a flat's entrance with a shoe rack, a doormat, a nameplate-free door and a hallway light",
    lighting: ["hallway light with daylight from outside", "soft stairwell light", "warm porch bulb"], timeOfDay: ["afternoon", "evening", "morning"],
    props: ["a delivery carton", "a shoe rack", "a doormat", "a small plant", "scissors in hand"] },
  { id: "festive-living-room", label: "Festive living room", description: "a living room dressed for a festival with diyas, marigold garlands, a rangoli sketched near the door and string lights",
    lighting: ["warm diya glow with room lights", "soft evening light with festoon lights", "bright daytime with marigold colours popping"], timeOfDay: ["evening", "festival morning", "dusk"],
    props: ["brass diyas", "marigold garlands", "a plate of sweets", "gift boxes with plain wrapping", "a rangoli", "toran at the door"] },
  { id: "courtyard-home", label: "Home courtyard", description: "an open courtyard of a house with a tulsi plant, a charpai or cane seat, washed stone floor and plants",
    lighting: ["soft morning sun", "open shade bright and even", "late warm sun"], timeOfDay: ["morning", "afternoon", "late afternoon"],
    props: ["a tulsi plant", "a steel pot", "a cane seat", "a bucket and mug", "a string cot"] },
  { id: "clinic-reception", label: "Clinic reception", description: "a small neighbourhood clinic reception with a front desk, a waiting bench, a wall chart-free notice board and a potted plant",
    lighting: ["bright clean tube lights with window spill", "soft daylight through frosted glass", "warm evening reception lamps"], timeOfDay: ["morning", "late morning", "evening"],
    props: ["an appointment register", "a desk bell", "a waiting bench", "a water dispenser", "a small plant"] },
  { id: "salon-chair", label: "Salon floor", description: "a small neighbourhood salon with a styling chair, a large mirror, trolley of tools and basins at the back",
    lighting: ["bright vanity bulbs around the mirror", "warm overhead light with daylight from the shopfront", "evening salon glow"], timeOfDay: ["late morning", "afternoon", "evening"],
    props: ["a styling chair", "a hairbrush", "a towel", "scissors and combs", "a trolley of tools"] },
  { id: "restaurant-pass", label: "Restaurant kitchen pass", description: "a busy restaurant kitchen pass with steel counters, hanging order slips, cooks at the stove and plates ready to go",
    lighting: ["bright steel-reflecting kitchen lights", "warm flame glow with overhead tubes", "service-time mixed light"], timeOfDay: ["lunchtime", "evening", "dinner rush"],
    props: ["plates ready to serve", "a ladle", "order slips on a rail", "a steel counter", "a chef's towel"] },
  { id: "workshop-bench", label: "Workshop bench", description: "a small workshop with a wooden workbench, hand tools on a pegboard, offcuts, sawdust and a hanging work light",
    lighting: ["hanging work light with window daylight", "warm bulb over the bench", "side light from a roller shutter"], timeOfDay: ["morning", "afternoon", "late afternoon"],
    props: ["a hammer and spanner", "a measuring tape", "a half-finished piece", "a pegboard of tools", "sawdust on the bench"] },
  { id: "showroom-floor", label: "Showroom floor", description: "a clean showroom floor with polished tiles, products displayed on stands and large glass windows to the street",
    lighting: ["bright even showroom spotlights", "daylight from big windows", "warm evening spots with street glow"], timeOfDay: ["late morning", "afternoon", "evening"],
    props: ["a display stand", "a reception desk", "a brochure stand", "a car-key tray", "a floor plant"] },
  { id: "warehouse-aisle", label: "Warehouse aisle", description: "a tidy warehouse aisle with tall racks, labelled cartons, a pallet jack and a loading bay door at the end",
    lighting: ["high-bay industrial lights", "daylight from the loading bay door", "flat white tube lights"], timeOfDay: ["morning", "afternoon", "late afternoon"],
    props: ["stacked cartons", "a pallet jack", "a label printer", "a clipboard", "wooden pallets"] },
  { id: "classroom-board", label: "Classroom", description: "a small coaching classroom with rows of desks, a green board with chalk marks, a wall clock and a window",
    lighting: ["tube lights with window light", "bright daylight from the side", "evening tube lights"], timeOfDay: ["morning", "afternoon", "evening"],
    props: ["chalk and duster", "a stack of notebooks", "a wall clock", "a water bottle on a desk", "a green board"] },
  { id: "farm-field", label: "Farm field", description: "an open farm field with rows of crops, a dirt path, a small pump house and trees on the horizon",
    lighting: ["soft early sun across the field", "bright midday sun with deep shadows", "golden evening light"], timeOfDay: ["early morning", "midday", "golden hour"],
    props: ["a steel water can", "a cotton gamchha", "a sickle", "a crate of produce", "a straw hat"] },
  { id: "jewellery-counter", label: "Jewellery counter", description: "a small jewellery shop counter with velvet trays, glass display cases, soft spotlights and a seated customer area",
    lighting: ["warm focused spotlights on velvet trays", "bright showcase lights with daylight at the door", "evening shop glow"], timeOfDay: ["late morning", "afternoon", "evening"],
    props: ["a velvet tray", "a jeweller's loupe", "a glass showcase", "a small weighing scale", "a gift pouch"] },
  { id: "flat-tour-room", label: "Empty flat", description: "an empty apartment living room with clean walls, large windows, a balcony door and polished flooring ready to view",
    lighting: ["bright natural light through large windows", "soft overcast daylight, even", "warm late afternoon sun on the floor"], timeOfDay: ["late morning", "afternoon", "late afternoon"],
    props: ["a balcony door", "a window with light curtains", "a switchboard", "keys in hand", "a brochure"] },
  { id: "travel-viewpoint", label: "Travel viewpoint", description: "a scenic viewpoint on a hill or shoreline with a railing, distant horizon, a few visitors and open sky",
    lighting: ["soft golden light over the horizon", "bright clear daylight with a breeze", "blue hour with a warm glow"], timeOfDay: ["golden hour", "morning", "dusk"],
    props: ["a backpack", "a map", "a sun hat", "a water bottle", "a camera strap"] },
  { id: "event-stage", label: "Event hall stage", description: "an event hall with a small stage, a podium, rows of chairs, a banner backdrop and soft stage lights",
    lighting: ["warm stage spotlights with hall lights", "soft wash lights on the stage", "daylight from side doors with stage glow"], timeOfDay: ["morning", "afternoon", "evening"],
    props: ["a podium", "a microphone", "rows of chairs", "a banner backdrop", "a laptop on a stand"] },
  { id: "studio-desk-set", label: "Studio desk", description: "a compact studio with a desk, a monitor behind showing a plain graphic, two lamps and a neutral backdrop",
    lighting: ["soft key light with a warm lamp in the background", "even softbox-style window light", "mixed LED and warm lamp"], timeOfDay: ["morning", "afternoon", "evening"],
    props: ["a desk microphone", "a laptop", "headphones", "a notepad", "a coffee mug"] },
  { id: "screen-recording-frame", label: "Screen recording frame", description: "a phone screen shown large and clear with simple generic interface cards, and a small creator corner in the frame",
    lighting: ["clean even screen light", "soft room light behind the creator corner", "cool screen glow with warm room tones"], timeOfDay: ["afternoon", "evening", "night"],
    props: ["a phone on a stand", "a notification card", "a settings toggle", "a progress bar", "a desk edge"] },
  { id: "factory-floor", label: "Factory floor", description: "a clean factory floor with a machine line, safety markings, workers in the distance in uniform and a supervisor station",
    lighting: ["bright industrial overhead lights", "daylight from high windows", "flat even white light"], timeOfDay: ["morning", "afternoon", "late afternoon"],
    props: ["a machine panel", "safety markings on the floor", "a stack of finished parts", "a hard hat on a hook", "a conveyor"] },
  { id: "construction-site", label: "Contractor site", description: "an indoor renovation site with exposed walls, a ladder, paint cans, stacked tiles and drop sheets on the floor",
    lighting: ["bright daylight through bare windows", "a work lamp on a stand", "soft dusty afternoon light"], timeOfDay: ["morning", "midday", "late afternoon"],
    props: ["a ladder", "paint cans", "stacked tiles", "a measuring tape", "a work lamp"] },
  { id: "wedding-decor-hall", label: "Wedding decor hall", description: "a banquet hall dressed for a wedding with floral arches, draped fabric, warm string lights and a decorated stage",
    lighting: ["warm string lights and chandeliers", "soft evening glow with floral colour", "bright hall lights with gold accents"], timeOfDay: ["late afternoon", "evening", "dusk"],
    props: ["marigold garlands", "string lights", "a floral arch", "decorated chairs", "brass lamps"] },
  { id: "monsoon-window", label: "Rainy window", description: "a home window seat with rain on the glass, grey light outside, a cushion, a cup of chai and wet green leaves beyond",
    lighting: ["soft grey rain light with a warm lamp", "cool window light with droplets glinting", "dim afternoon with a warm bulb"], timeOfDay: ["afternoon", "evening", "morning"],
    props: ["a cup of chai", "an umbrella by the door", "a cushion", "a book", "a small plant"] },
  { id: "puja-corner", label: "Home prayer corner", description: "a small, tidy prayer corner at home with a plain wooden shelf, brass lamps, fresh flowers and incense, kept respectful and uncluttered",
    lighting: ["warm brass-lamp glow with soft morning light", "soft evening lamp light", "gentle daylight from a nearby window"], timeOfDay: ["early morning", "evening", "dusk"],
    props: ["a brass lamp", "fresh marigold flowers", "a small bell", "incense sticks", "a steel plate of prasad"] },
  { id: "temple-courtyard", label: "Temple courtyard", description: "a peaceful temple courtyard with stone floors, pillars, hanging bells and visitors walking quietly in the background, no sanctum or idols in frame",
    lighting: ["soft early sun through the pillars", "bright calm midday light", "golden evening light"], timeOfDay: ["early morning", "late afternoon", "golden hour"],
    props: ["a string of marigold flowers", "a brass bell", "a steel water pot", "a cloth bag", "a stone pillar"] },
  { id: "gaming-setup", label: "Gaming desk", description: "a tidy gaming desk with a monitor, a controller, a headset and soft colour accent lights in a bedroom corner",
    lighting: ["monitor glow with soft purple accent lights", "warm desk lamp with the room dim", "daylight from a window with the monitor on"], timeOfDay: ["evening", "night", "afternoon"],
    props: ["a game controller", "a headset", "a second monitor", "a snack bowl", "a mouse pad"] },
];

export const CAMERA_FLAVOURS: string[] = [
  "slight handheld sway", "phone propped on a stack of books", "tiny focus hunting when the subject moves", "exposure shifts when light changes",
  "quick reframe after a laugh", "slightly tilted horizon", "a finger nearly touches the lens once", "gentle breathing movement while holding the phone",
  "auto-zoom crop from a front camera", "occasional soft refocus on a prop", "quick whip-pan between speaker and subject", "slow push-in as the point lands",
  "a brief rack focus from hands to face",
];

export const PACING: string[] = [
  "relaxed and unhurried, natural pauses", "brisk and energetic, quick back-and-forth", "warm and conversational with small overlaps",
  "deadpan and understated, humour in the pauses", "excited and slightly breathless", "calm and thoughtful, short silences", "playful, interrupting each other kindly",
  "crisp and clean, one idea per beat", "steady announcer rhythm, even and clear", "snappy cuts, no dead air",
];

export const AMBIENCE: string[] = [
  "soft room tone, no music", "ceiling fan hum and distant traffic, no music", "faint lo-fi acoustic guitar far under the voices",
  "street murmur, a distant horn, no music", "kitchen sounds, cutlery clink, no music", "quiet evening hush with a distant pressure-cooker whistle",
  "light birdsong and faint city hum", "gentle indoor acoustics with a slight echo",
  "quiet space with faint distant activity, no music", "clean close-mic room tone, no music", "soft ambient murmur and the odd footstep, no music",
  "light background hum and a distant door, no music",
];
