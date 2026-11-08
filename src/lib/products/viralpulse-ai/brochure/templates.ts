import type { BrochureCategory, BrochureSection, BrochureTheme, BrochureDoc } from "./types";
import { makeSection } from "./defaults";

export interface BrochureTemplatePreset {
  id: string;
  name: string;
  category: BrochureCategory;
  description: string;
  theme: BrochureTheme;
  createSections: () => BrochureSection[];
}

export const TEMPLATE_PRESETS: BrochureTemplatePreset[] = [
  {
    id: "training-executive",
    name: "Executive & Professional Certification",
    category: "training",
    description: "Structured curriculum, learning outcomes, instructor credentials, certification details, and enrollment.",
    theme: {
      primaryColor: "#4f46e5",
      accentColor: "#06b6d4",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Plus Jakarta Sans",
      bodyFont: "Inter",
      borderRadius: "lg",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Professional Development & Certification Program",
        subheadline: "Advance Your Career with Industry-Accredited Training",
        description: "Master high-impact skills through instructor-led practical sessions, live projects, and globally recognized credentials.",
        ctaLabel: "Apply for Enrollment",
        ctaUrl: "#contact",
        secondaryCtaLabel: "View Curriculum",
        secondaryCtaUrl: "#curriculum",
        backgroundImage: null,
        backgroundOverlay: 25,
        layout: "centered",
      };

      const s2 = makeSection("overview");
      s2.data = {
        type: "overview",
        title: "Program Overview & Objectives",
        body: "This comprehensive curriculum is engineered for professionals aiming to acquire validated competencies. Structured across foundational and advanced tracks, participants gain direct practical expertise with mentorship from industry practitioners.",
        image: null,
        layout: "text-left",
      };

      const s3 = makeSection("features");
      s3.data = {
        type: "features",
        title: "Program Highlights & Benefits",
        subtitle: "Key components designed for optimal learning outcomes",
        items: [
          { icon: "Award", title: "Recognized Certification", description: "Receive verifiable credentials upon capstone completion and practical evaluation." },
          { icon: "Users", title: "Mentor-Guided Cohorts", description: "Direct feedback sessions, code/strategy reviews, and collaborative case workshops." },
          { icon: "BookOpen", title: "Hands-on Practical Labs", description: "Work on real scenarios, industry datasets, and production-grade project submissions." },
        ],
        columns: 3,
      };

      const s4 = makeSection("curriculum");
      s4.data = {
        type: "curriculum",
        title: "Syllabus & Course Modules",
        subtitle: "A progressive path from fundamentals to specialized application",
        modules: [
          {
            title: "Module 1: Core Fundamentals & Methodologies",
            description: "Essential principles, foundational frameworks, and tooling setup.",
            lessons: ["Key Concepts & Architectural Principles", "Environment Configuration & Tooling", "Foundational Lab Exercise"],
            duration: "Weeks 1 - 2",
          },
          {
            title: "Module 2: Advanced Techniques & Real-world Application",
            description: "In-depth operational workflows, problem-solving, and implementation practices.",
            lessons: ["Advanced Strategies & System Patterns", "Performance Optimization & Quality Assurance", "Collaborative Case Study"],
            duration: "Weeks 3 - 5",
          },
          {
            title: "Module 3: Capstone Project & Certification Assessment",
            description: "End-to-end execution of a verified project and comprehensive assessment.",
            lessons: ["Project Scoping & Solution Design", "Mentor Review & Iteration", "Final Presentation & Certification Review"],
            duration: "Week 6",
          },
        ],
      };

      const s5 = makeSection("pricing");
      s5.data = {
        type: "pricing",
        title: "Tuition & Enrollment Options",
        subtitle: "Flexible plans for individuals and enterprise teams",
        currency: "₹",
        tiers: [
          {
            name: "Individual Enrollment",
            price: "24,999",
            period: "per participant",
            description: "Full access to live cohort sessions, course material, and certification.",
            features: [
              "Live interactive lectures & recorded sessions",
              "1-on-1 practical project reviews",
              "Certificate of Completion with unique verification",
              "Lifetime community discussion forum access",
            ],
            highlighted: false,
            ctaLabel: "Enroll as Individual",
            ctaUrl: "#contact",
          },
          {
            name: "Corporate & Team Cohort",
            price: "19,999",
            period: "per seat (min. 5 seats)",
            description: "Tailored schedules and customized enterprise case studies for teams.",
            features: [
              "All Individual Enrollment privileges",
              "Dedicated enterprise mentor & progress reporting",
              "Customized schedule aligned with company hours",
              "Post-training skill audit & performance scorecard",
            ],
            highlighted: true,
            ctaLabel: "Request Enterprise Quote",
            ctaUrl: "#contact",
          },
        ],
      };

      const s6 = makeSection("faq");
      s6.data = {
        type: "faq",
        title: "Frequently Asked Questions",
        subtitle: "Important details regarding prerequisites, schedule, and certification",
        columns: 2,
        items: [
          { question: "What are the eligibility requirements?", answer: "Basic domain familiarity is recommended. Complete prerequisites are outlined in the onboarding packet." },
          { question: "What is the weekly time commitment?", answer: "We recommend dedicating 6 to 8 hours per week, covering live sessions, reading, and lab assignments." },
          { question: "Are class recordings provided?", answer: "Yes, all cohort sessions are archived in high-definition and available throughout your enrollment." },
          { question: "How is the certification credential verified?", answer: "Certificates feature a unique digital credential hash that employers and third parties can verify online." },
        ],
      };

      const s7 = makeSection("contact");
      s7.data = {
        type: "contact",
        title: "Admissions & Inquiries",
        subtitle: "Connect with our program advisors to discuss course fit and upcoming cohort dates.",
        email: "admissions@example.com",
        phone: "+91 98765 43210",
        address: "Academic Campus & Executive Training Center",
        website: "https://example.com/training",
        whatsapp: "+919876543210",
        instagram: "",
        linkedin: "https://linkedin.com/company/training",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "name", label: "Full Name", type: "text", required: true },
          { key: "email", label: "Work Email", type: "email", required: true },
          { key: "phone", label: "Phone Number", type: "phone", required: true },
          { key: "cohort", label: "Preferred Batch Timing", type: "text", required: false },
          { key: "message", label: "Educational / Professional Background", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4, s5, s6, s7];
    },
  },
  {
    id: "product-catalog",
    name: "Industrial & Manufacturing Product Showcase",
    category: "product",
    description: "Technical specifications, material grades, catalog dimensions, and quotation request for manufactured goods.",
    theme: {
      primaryColor: "#0284c7",
      accentColor: "#f59e0b",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "md",
      density: "compact",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "High-Precision Engineering & Industrial Products",
        subheadline: "Certified Manufacturing | Stringent Quality Assurance | Custom Specifications",
        description: "Specialized manufacturer and supplier serving automotive, heavy engineering, warehousing, and commercial applications.",
        ctaLabel: "Download Technical Specs",
        ctaUrl: "#overview",
        secondaryCtaLabel: "Request Price List",
        secondaryCtaUrl: "#contact",
        backgroundImage: null,
        backgroundOverlay: 30,
        layout: "split-left",
      };

      const s2 = makeSection("overview");
      s2.data = {
        type: "overview",
        title: "Manufacturing Capabilities & Standards",
        body: "Equipped with automated CNC machining, precision molding, and certified material testing labs. Every production batch undergoes strict load testing, dimensional tolerance inspection, and surface finish certification.",
        image: null,
        layout: "text-left",
      };

      const s3 = makeSection("features");
      s3.data = {
        type: "features",
        title: "Product Range & Engineering Specifications",
        subtitle: "Engineered for high durability and continuous duty cycles",
        items: [
          { icon: "ShieldCheck", title: "Heavy Duty Load Ratings", description: "Tested to withstand maximum static and dynamic working limits with verified safety margins." },
          { icon: "Layers", title: "Premium Raw Materials", description: "Food-grade, virgin polymers, or high-tensile alloy steels based on operating specifications." },
          { icon: "Wrench", title: "Custom Dimensions & Mounts", description: "Tailored bore sizes, fitting brackets, and coating finishes configured for client requirements." },
        ],
        columns: 3,
      };

      const s4 = makeSection("gallery");
      s4.data = {
        type: "gallery",
        title: "Product Showcase & Application Gallery",
        items: [
          { src: null, alt: "Industrial Component Series A", caption: "Heavy Duty Series with Zinc-Plated Finish" },
          { src: null, alt: "Commercial Grade Assemblies", caption: "Precision Molded Assembly with Dual Sealed Bearings" },
          { src: null, alt: "Custom Fabricated Solution", caption: "Custom OEM Specification for Material Handling" },
        ],
        columns: 3,
        style: "grid",
      };

      const s5 = makeSection("stats");
      s5.data = {
        type: "stats",
        title: "Manufacturing Highlights",
        items: [
          { value: "ISO 9001", label: "Quality Certified Plant", icon: "Award" },
          { value: "50,000+", label: "Monthly Production Units", icon: "Package" },
          { value: "0.02 mm", label: "Machining Tolerance", icon: "Cpu" },
          { value: "100%", label: "Batch Load Tested", icon: "CheckCircle" },
        ],
        style: "branded",
      };

      const s6 = makeSection("contact");
      s6.data = {
        type: "contact",
        title: "Request Quotation & Technical Data Sheet",
        subtitle: "Provide your required specifications, quantities, and delivery timelines.",
        email: "sales@example.com",
        phone: "+91 81603 36194",
        address: "Industrial Area Phase II, Manufacturing Zone",
        website: "https://example.com/products",
        whatsapp: "+918160336194",
        instagram: "",
        linkedin: "https://linkedin.com/company/manufacturing",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "company", label: "Company / Organization Name", type: "text", required: true },
          { key: "contactPerson", label: "Contact Person", type: "text", required: true },
          { key: "email", label: "Official Email", type: "email", required: true },
          { key: "phone", label: "Phone / WhatsApp", type: "phone", required: true },
          { key: "quantity", label: "Estimated Order Volume (Units)", type: "text", required: false },
          { key: "requirements", label: "Product SKU & Technical Requirements", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4, s5, s6];
    },
  },
  {
    id: "company-profile",
    name: "Corporate Profile & Engineering EPC",
    category: "company",
    description: "Corporate presentations, core competencies, infrastructure, safety compliance, and leadership.",
    theme: {
      primaryColor: "#1e3a8a",
      accentColor: "#eab308",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Montserrat",
      bodyFont: "Inter",
      borderRadius: "md",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Building Strength, Delivering Excellence",
        subheadline: "Industrial Infrastructure, Civil Construction & Structural Engineering",
        description: "A leading multidisciplinary contracting and engineering organization committed to delivering complex industrial, commercial, and infrastructure developments.",
        ctaLabel: "Explore Capabilities",
        ctaUrl: "#services",
        secondaryCtaLabel: "Contact Our Projects Team",
        secondaryCtaUrl: "#contact",
        backgroundImage: null,
        backgroundOverlay: 40,
        layout: "split-right",
      };

      const s2 = makeSection("about");
      s2.data = {
        type: "about",
        title: "Company Heritage & Vision",
        body: "Established with a vision to deliver world-class infrastructure, we combine advanced construction methodologies, seasoned project management, and unwavering safety protocols across all project sites.",
        image: null,
        founded: "Established 2012",
        mission: "Deliver structurally superior and sustainable infrastructure on schedule with zero safety incidents.",
        vision: "To be the preferred EPC partner for landmark industrial and commercial developments.",
      };

      const s3 = makeSection("services");
      s3.data = {
        type: "services",
        title: "Core Competencies & Services",
        subtitle: "End-to-end turnkey solutions from engineering design to commissioning",
        items: [
          { title: "Industrial Civil Construction", description: "Heavy foundations, industrial sheds, warehouse superstructures, and floor slab engineering.", icon: "Building", price: "Custom RFP" },
          { title: "Fabrication & Structural Work", description: "Design, shop fabrication, surface treatment, and on-site erection of pre-engineered steel buildings.", icon: "Tool", price: "Custom RFP" },
          { title: "EPC & Turnkey Solutions", description: "Comprehensive engineering, procurement, and construction contracting with unified milestone accountability.", icon: "CheckSquare", price: "Custom RFP" },
          { title: "Plant Maintenance & Refurbishment", description: "Structural retrofitting, industrial flooring rehabilitation, and planned shutdown maintenance.", icon: "Wrench", price: "Annual / Contract" },
        ],
      };

      const s4 = makeSection("stats");
      s4.data = {
        type: "stats",
        title: "Track Record & Scale",
        items: [
          { value: "150+", label: "Projects Commissioned", icon: "CheckCircle" },
          { value: "2.5M+", label: "Sq. Ft. Built Area", icon: "Maximize" },
          { value: "100%", label: "Regulatory Compliance", icon: "Shield" },
          { value: "Zero", label: "Lost-Time Safety Incidents", icon: "Activity" },
        ],
        style: "dark",
      };

      const s5 = makeSection("contact");
      s5.data = {
        type: "contact",
        title: "Corporate Headquarters & Project Offices",
        subtitle: "Submit project tenders, vendor registrations, or partner inquiries.",
        email: "corporate@example.com",
        phone: "+91 81603 36194",
        address: "Express Highway Business Park, Industrial Estate",
        website: "https://example.com/corporate",
        whatsapp: "+918160336194",
        instagram: "",
        linkedin: "https://linkedin.com/company/construction-epc",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "company", label: "Company / Client Name", type: "text", required: true },
          { key: "representative", label: "Representative Name", type: "text", required: true },
          { key: "email", label: "Email Address", type: "email", required: true },
          { key: "phone", label: "Telephone / Mobile", type: "phone", required: true },
          { key: "projectType", label: "Project Category (Civil / Structural / EPC)", type: "text", required: false },
          { key: "rfpDetails", label: "Brief Scope of Work / Tender Ref", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4, s5];
    },
  },
  {
    id: "consulting-services",
    name: "Architectural & Interior Design Consultancy",
    category: "service",
    description: "Design consultancy, spatial planning, project management, and luxury fit-out showcase.",
    theme: {
      primaryColor: "#0f766e",
      accentColor: "#d97706",
      backgroundColor: "#fafaf9",
      textColor: "#1c1917",
      headingFont: "Cinzel",
      bodyFont: "Inter",
      borderRadius: "sm",
      density: "spacious",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Transforming Spaces with Architectural Precision",
        subheadline: "Architectural Design | Luxury Interior Architecture | Project Management",
        description: "Crafting bespoke residential, commercial, and hospitality environments that balance aesthetic elegance with functional rigor.",
        ctaLabel: "Schedule Design Consultation",
        ctaUrl: "#contact",
        secondaryCtaLabel: "View Featured Projects",
        secondaryCtaUrl: "#projects",
        backgroundImage: null,
        backgroundOverlay: 35,
        layout: "centered",
      };

      const s2 = makeSection("services");
      s2.data = {
        type: "services",
        title: "Design & Consultancy Services",
        subtitle: "Holistic architectural solutions from initial concept to turnkey execution",
        items: [
          { title: "Architectural Planning & Schematics", description: "Master planning, spatial flow design, municipal approval documentation, and 3D visualization.", icon: "Compass", price: "Consultation" },
          { title: "Interior Architecture & Fit-out", description: "Custom millwork, lighting design, curated material selection, and luxury bespoke finishes.", icon: "Home", price: "Custom Scale" },
          { title: "Project PMC & Site Supervision", description: "Contractor coordination, quality audit, timeline enforcement, and budget control.", icon: "Briefcase", price: "Retainer" },
        ],
      };

      const s3 = makeSection("process");
      s3.data = {
        type: "process",
        title: "Our Collaborative Process",
        subtitle: "A transparent 4-stage methodology delivering seamless spatial transformations",
        orientation: "horizontal",
        steps: [
          { number: "01", title: "Discovery & Briefing", description: "Spatial requirements analysis, lifestyle or brand vision, budget parameters, and site survey.", icon: "FileText" },
          { number: "02", title: "Concept & 3D Visualization", description: "Material palettes, mood boards, spatial layout plans, and photorealistic renderings.", icon: "Eye" },
          { number: "03", title: "Detailed Working Drawings", description: "Services engineering (MEP), joinery details, bill of quantities (BOQ), and contractor tenders.", icon: "Cpu" },
          { number: "04", title: "Execution & Handover", description: "On-site quality supervision, snag rectification, styling, and final client walkthrough.", icon: "CheckCircle" },
        ],
      };

      const s4 = makeSection("projects");
      s4.data = {
        type: "projects",
        title: "Selected Design Commissions",
        subtitle: "Highlights of completed residential and commercial spaces",
        items: [
          { title: "Contemporary Penthouse Residence", description: "4,500 sq. ft. duplex combining natural teak, Italian marble, and automated lighting.", image: null, tags: ["Residential", "Luxury Interior"], link: "" },
          { title: "Technology Studio Headquarters", description: "Collaborative open-plan office space featuring acoustic pods and biophilic zoning.", image: null, tags: ["Commercial", "Workplace"], link: "" },
          { title: "Boutique Hospitality Lounge", description: "Sensory dining space designed with warm ambient illumination and custom metalwork.", image: null, tags: ["Hospitality", "Interior"], link: "" },
        ],
      };

      const s5 = makeSection("contact");
      s5.data = {
        type: "contact",
        title: "Initiate Your Design Consultation",
        subtitle: "Tell us about your upcoming project location, scope, and timeline.",
        email: "studio@example.com",
        phone: "+91 98200 12345",
        address: "Design District, 4th Floor Studio Suites",
        website: "https://example.com/design",
        whatsapp: "+919820012345",
        instagram: "https://instagram.com/interiordesignstudio",
        linkedin: "https://linkedin.com/company/architecture-design",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "name", label: "Your Full Name", type: "text", required: true },
          { key: "phone", label: "Phone Number", type: "phone", required: true },
          { key: "email", label: "Email Address", type: "email", required: true },
          { key: "propertyType", label: "Property Type (Apartment, Villa, Commercial Office)", type: "text", required: true },
          { key: "carpetArea", label: "Approximate Carpet Area (Sq. Ft.)", type: "text", required: false },
          { key: "scope", label: "Project Scope & Target Completion Date", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4, s5];
    },
  },
  {
    id: "global-export",
    name: "Global Agricultural Export & Commodity Trade",
    category: "service",
    description: "Export grades, packaging options, container loading specifications, and trade inquiries.",
    theme: {
      primaryColor: "#d97706",
      accentColor: "#15803d",
      backgroundColor: "#ffffff",
      textColor: "#18181b",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "md",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Connecting Local Agricultural Excellence to Global Markets",
        subheadline: "Direct Farm Procurement | International Phytosanitary Standards | Global Freight",
        description: "Trusted international merchant exporter of premium agro-commodities, fresh produce, and dehydrated food products.",
        ctaLabel: "View Product Specifications",
        ctaUrl: "#features",
        secondaryCtaLabel: "Send Export Inquiry",
        secondaryCtaUrl: "#contact",
        backgroundImage: null,
        backgroundOverlay: 25,
        layout: "centered",
      };

      const s2 = makeSection("features");
      s2.data = {
        type: "features",
        title: "Export Commodities & Packaging Standards",
        subtitle: "Categorized by international grades, moisture content, and packaging options",
        items: [
          { icon: "Check", title: "Premium Foxnuts (Makhana)", description: "Grade 4+, 5+, 6+ hand-sorted, uniform size, vacuum/nitrogen flush bulk packaging." },
          { icon: "Check", title: "Fresh Pomegranate & Arils", description: "Bhagwa variety, dark ruby arils, sweet taste, packed in 3.5 kg / 4.5 kg corrugated export boxes." },
          { icon: "Check", title: "Fresh Green Chilli & Garlic", description: "Uniform color, pungency grading, cold chain maintained at 2-4°C from packhouse to vessel." },
        ],
        columns: 3,
      };

      const s3 = makeSection("process");
      s3.data = {
        type: "process",
        title: "Export Quality & Compliance Workflow",
        subtitle: "Ensuring zero transit spoilage and international customs compliance",
        orientation: "horizontal",
        steps: [
          { number: "01", title: "Grading & Sorting", description: "Automated optical sorting by size, weight, and blemish-free skin quality.", icon: "Filter" },
          { number: "02", title: "Phytosanitary & Lab Testing", description: "Residue testing (APEDA/FSSAI compliant) and government lab certificates.", icon: "ShieldCheck" },
          { number: "03", title: "Reefer Logistics", description: "Pre-cooled containers with active temperature and humidity monitoring sensors.", icon: "Truck" },
          { number: "04", title: "Customs Clearance", description: "Bill of Lading, Certificate of Origin, and complete commercial invoicing.", icon: "FileText" },
        ],
      };

      const s4 = makeSection("contact");
      s4.data = {
        type: "contact",
        title: "International Trade Desk",
        subtitle: "Request FOB/CIF quotations, sample shipments, or specifications sheet.",
        email: "export@example.com",
        phone: "+91 98200 88888",
        address: "Export Trade Center, Air Cargo Complex / Port Zone",
        website: "https://example.com/export",
        whatsapp: "+919820088888",
        instagram: "",
        linkedin: "https://linkedin.com/company/global-exporters",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "importer", label: "Importer / Company Name", type: "text", required: true },
          { key: "country", label: "Destination Country & Discharge Port", type: "text", required: true },
          { key: "contactName", label: "Authorized Representative", type: "text", required: true },
          { key: "email", label: "Business Email", type: "email", required: true },
          { key: "commodity", label: "Commodity & Grade Required", type: "text", required: true },
          { key: "containerVolume", label: "Container Quantity (e.g. 1x40ft FCL)", type: "text", required: false },
          { key: "incoterms", label: "Incoterms Preferred (FOB / CIF)", type: "text", required: false },
        ],
      };

      return [s1, s2, s3, s4];
    },
  },
  {
    id: "real-estate-development",
    name: "Luxury Real Estate & Residential Development",
    category: "real-estate",
    description: "Property specs, floor plans, location connectivity, clubhouse amenities, and site tour booking.",
    theme: {
      primaryColor: "#0f172a",
      accentColor: "#ca8a04",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Cinzel",
      bodyFont: "Inter",
      borderRadius: "lg",
      density: "spacious",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Luxury High-Rise Living Redefined",
        subheadline: "3 & 4 BHK Sky Residences | Unobstructed Skyline Panoramas | Private Club Amenities",
        description: "An exclusive gated enclave where modern architecture blends with verdant landscaped gardens and high-end lifestyle amenities.",
        ctaLabel: "Schedule Private Site Tour",
        ctaUrl: "#contact",
        secondaryCtaLabel: "Explore Floor Plans",
        secondaryCtaUrl: "#floorplan",
        backgroundImage: null,
        backgroundOverlay: 35,
        layout: "centered",
      };

      const s2 = makeSection("overview");
      s2.data = {
        type: "overview",
        title: "Architectural Grandeur & Sustainable Living",
        body: "Engineered with IGBC Gold green building certification, double-glazed acoustic facades, and expansive sundecks. Each apartment is designed with zero-dead-space efficiency and cross-ventilation.",
        image: null,
        layout: "text-left",
      };

      const s3 = makeSection("floorplan");
      s3.data = {
        type: "floorplan",
        title: "Residence Layouts & Specifications",
        subtitle: "Spacious plans crafted for privacy, natural light, and entertaining",
        image: null,
        specs: [
          { label: "Unit Configuration", value: "3 & 4 BHK Premium + Staff Room" },
          { label: "Carpet Area Range", value: "1,850 - 2,900 Sq. Ft." },
          { label: "Ceiling Clear Height", value: "11.5 Ft. Floor-to-Ceiling" },
          { label: "Parking Allocation", value: "2 Reserved Covered Stalls" },
        ],
      };

      const s4 = makeSection("location");
      s4.data = {
        type: "location",
        title: "Prime Connectivity & Neighborhood",
        address: "Prime Boulevard, Financial & Diplomatic Enclave",
        city: "Metropolitan Region",
        mapEmbedUrl: "",
        nearbyPlaces: [
          { name: "International Airport", distance: "18 mins" },
          { name: "Central Business District", distance: "12 mins" },
          { name: "Top International School", distance: "5 mins" },
          { name: "Multi-Speciality Medical Hub", distance: "8 mins" },
        ],
      };

      const s5 = makeSection("contact");
      s5.data = {
        type: "contact",
        title: "Book an Exclusive Site Experience",
        subtitle: "Our sales advisors will arrange private valet parking and a model apartment viewing.",
        email: "residences@example.com",
        phone: "+91 99000 11223",
        address: "Site Experience Center, Gate 1, Luxury Boulevard",
        website: "https://example.com/residences",
        whatsapp: "+919900011223",
        instagram: "",
        linkedin: "",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "name", label: "Full Name", type: "text", required: true },
          { key: "phone", label: "Mobile Number", type: "phone", required: true },
          { key: "email", label: "Email Address", type: "email", required: true },
          { key: "unitType", label: "Interested Configuration (3 BHK / 4 BHK)", type: "text", required: false },
          { key: "visitDate", label: "Preferred Site Visit Date & Time", type: "text", required: false },
        ],
      };

      return [s1, s2, s3, s4, s5];
    },
  },
  {
    id: "healthcare-services",
    name: "Medical Clinic & Healthcare Specialties",
    category: "healthcare",
    description: "Clinical departments, specialist doctor profiles, healthcare packages, and patient appointment requests.",
    theme: {
      primaryColor: "#0284c7",
      accentColor: "#10b981",
      backgroundColor: "#f8fafc",
      textColor: "#0f172a",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "lg",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Comprehensive Clinical Care & Advanced Medicine",
        subheadline: "NABH Accredited | Board-Certified Specialists | 24x7 Emergency Services",
        description: "Delivering patient-centric healthcare with diagnostic accuracy, modern surgical suites, and dedicated rehabilitation departments.",
        ctaLabel: "Book Doctor Consultation",
        ctaUrl: "#contact",
        secondaryCtaLabel: "View Clinical Departments",
        secondaryCtaUrl: "#services",
        backgroundImage: null,
        backgroundOverlay: 25,
        layout: "centered",
      };

      const s2 = makeSection("services");
      s2.data = {
        type: "services",
        title: "Clinical Specialties & Treatment Programs",
        subtitle: "Multi-disciplinary healthcare services provided under one roof",
        items: [
          { title: "Cardiology & Interventional Care", description: "Preventive heart checkups, non-invasive imaging, and rehabilitation therapy.", icon: "Heart", price: "Outpatient / Inpatient" },
          { title: "Orthopaedics & Joint Reconstruction", description: "Arthroscopic interventions, joint replacements, and sport injury rehabilitation.", icon: "Activity", price: "Consultation" },
          { title: "Internal Medicine & Diagnostics", description: "Comprehensive health screenings, management of chronic lifestyle conditions, and pathology.", icon: "Search", price: "Package" },
        ],
      };

      const s3 = makeSection("stats");
      s3.data = {
        type: "stats",
        title: "Clinical Excellence",
        items: [
          { value: "NABH", label: "Hospital Accreditation", icon: "Award" },
          { value: "45+", label: "Consultant Specialists", icon: "Users" },
          { value: "24/7", label: "Emergency & ICU Coverage", icon: "Clock" },
          { value: "99.2%", label: "Patient Care Satisfaction", icon: "Heart" },
        ],
        style: "branded",
      };

      const s4 = makeSection("contact");
      s4.data = {
        type: "contact",
        title: "Book an Appointment or Inquire",
        subtitle: "Our patient care coordinators will confirm your preferred specialist and slot.",
        email: "care@example.com",
        phone: "+91 98111 22334",
        address: "Healthcare Boulevard, Medical Campus",
        website: "https://example.com/hospital",
        whatsapp: "+919811122334",
        instagram: "",
        linkedin: "",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "patientName", label: "Patient Full Name", type: "text", required: true },
          { key: "phone", label: "Contact Phone Number", type: "phone", required: true },
          { key: "email", label: "Email Address", type: "email", required: false },
          { key: "department", label: "Consultation Department / Specialty", type: "text", required: true },
          { key: "preferredTime", label: "Preferred Day / Time Window", type: "text", required: false },
          { key: "symptoms", label: "Brief Symptoms or Medical History", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4];
    },
  },
  {
    id: "events-conference",
    name: "Conference & Corporate Event Showcase",
    category: "event",
    description: "Event schedule, keynote tracks, speaker roster, venue details, and delegate registration passes.",
    theme: {
      primaryColor: "#7c3aed",
      accentColor: "#f43f5e",
      backgroundColor: "#09090b",
      textColor: "#f4f4f5",
      headingFont: "Plus Jakarta Sans",
      bodyFont: "Inter",
      borderRadius: "xl",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Annual Technology & Leadership Summit 2026",
        subheadline: "Global Visionaries | 30+ Keynotes | Interactive Masterclasses | Strategic Networking",
        description: "Join 1,500+ leaders, founders, and engineers to discuss the latest paradigms in autonomous systems, AI architecture, and enterprise digital scale.",
        ctaLabel: "Reserve Delegate Pass",
        ctaUrl: "#pricing",
        secondaryCtaLabel: "View Summit Agenda",
        secondaryCtaUrl: "#agenda",
        backgroundImage: null,
        backgroundOverlay: 45,
        layout: "centered",
      };

      const s2 = makeSection("agenda");
      s2.data = {
        type: "agenda",
        title: "Summit Track & Session Schedule",
        items: [
          { time: "09:00 - 10:00 AM", title: "Opening Keynote: Future of Intelligence Systems", speaker: "Keynote Panel", description: "Strategic market shifts and technological inflection points shaping the next five years." },
          { time: "10:30 - 12:00 PM", title: "Track A: Scalable Enterprise Architectures", speaker: "Engineering Directors", description: "Production deployments, latency engineering, and distributed edge computing." },
          { time: "01:30 - 03:00 PM", title: "Track B: Product Strategy & Growth Levers", speaker: "Founders & Product Leads", description: "Designing high-retention software products and managing global expansion." },
          { time: "03:30 - 05:00 PM", title: "Executive Networking & VIP Reception", speaker: "All Attendees", description: "Curated 1-on-1 meetings, demo showcase booths, and closing awards." },
        ],
      };

      const s3 = makeSection("pricing");
      s3.data = {
        type: "pricing",
        title: "Delegate Registration Passes",
        subtitle: "Individual and corporate team passes with full summit access",
        currency: "₹",
        tiers: [
          {
            name: "Standard Delegate",
            price: "8,999",
            period: "per pass",
            description: "Access to all keynotes, breakout tracks, exhibition lounge, and networking lunch.",
            features: [
              "Access to all 3 conference stages",
              "Networking lunch & refreshments",
              "Access to attendee networking app",
              "Session presentation decks archive",
            ],
            highlighted: false,
            ctaLabel: "Book Standard Pass",
            ctaUrl: "#contact",
          },
          {
            name: "VIP & Speaker Access",
            price: "16,999",
            period: "per pass",
            description: "Premium access including VIP dinner, speaker lounge, and front-row seating.",
            features: [
              "All Standard Delegate privileges",
              "Reserved front-row seating at all sessions",
              "Exclusive access to VIP speaker lounge",
              "Invite to Executive Evening Dinner & Networking",
            ],
            highlighted: true,
            ctaLabel: "Book VIP Pass",
            ctaUrl: "#contact",
          },
        ],
      };

      const s4 = makeSection("venue");
      s4.data = {
        type: "venue",
        title: "Convention Center & Hotel Accommodations",
        name: "Grand International Convention Center",
        address: "Hall 1-4, Convention Boulevard",
        city: "Metropolitan Tech City",
        mapEmbedUrl: "",
        directions: "Conveniently accessible via Metro Station (Line 2, Exit B) and 15 minutes from the airport.",
        image: null,
      };

      const s5 = makeSection("contact");
      s5.data = {
        type: "contact",
        title: "Delegate Assistance & Sponsorship Inquiries",
        subtitle: "Inquire regarding group ticketing, booth sponsorships, or speaker credentials.",
        email: "summit@example.com",
        phone: "+91 97000 44556",
        address: "Conference Secretariat",
        website: "https://example.com/summit",
        whatsapp: "+919700044556",
        instagram: "",
        linkedin: "https://linkedin.com/company/tech-summit",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "name", label: "Full Name", type: "text", required: true },
          { key: "organization", label: "Company / Designation", type: "text", required: true },
          { key: "email", label: "Corporate Email", type: "email", required: true },
          { key: "phone", label: "Phone Number", type: "phone", required: true },
          { key: "passType", label: "Ticket Category (Standard / VIP / Group)", type: "text", required: false },
          { key: "inquiry", label: "Specific Inquiries or Group Requirements", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4, s5];
    },
  },
  {
    id: "travel-hospitality",
    name: "Luxury Resort & Travel Itinerary",
    category: "travel",
    description: "Day-by-day travel itinerary, resort amenities, excursion highlights, and reservation booking.",
    theme: {
      primaryColor: "#0284c7",
      accentColor: "#f59e0b",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Plus Jakarta Sans",
      bodyFont: "Inter",
      borderRadius: "xl",
      density: "spacious",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Bespoke Experiential Journeys & Luxury Retreats",
        subheadline: "Handcrafted Itineraries | Private Villa Stays | Authentic Cultural Immersion",
        description: "Discover curated travel programs designed with private aviation, dedicated local guides, and 5-star heritage properties.",
        ctaLabel: "Request Custom Itinerary",
        ctaUrl: "#contact",
        secondaryCtaLabel: "View Day-by-Day Journey",
        secondaryCtaUrl: "#itinerary",
        backgroundImage: null,
        backgroundOverlay: 30,
        layout: "centered",
      };

      const s2 = makeSection("itinerary");
      s2.data = {
        type: "itinerary",
        title: "Signature 5-Day Guided Journey",
        subtitle: "A seamless itinerary blending relaxation, heritage explorations, and private dining",
        days: [
          { day: "Day 1", title: "Arrival & Private Sunset Cruise", activities: ["Airport VIP meet and chauffeur transfer to luxury resort", "Check-in at private villa with welcome amenities", "Sunset cocktail cruise along the scenic bay"], meals: "Dinner included", accommodation: "Luxury Overwater Pool Villa" },
          { day: "Day 2", title: "Heritage Quarter & Culinary Masterclass", activities: ["Private morning walking tour of historical landmarks", "Hands-on masterclass with award-winning regional chef", "Afternoon leisure and wellness spa treatment"], meals: "Breakfast, Lunch, Dinner", accommodation: "Luxury Overwater Pool Villa" },
          { day: "Day 3", title: "Nature Reserve & Wildlife Safari", activities: ["Exclusive 4x4 guided nature expedition with resident naturalist", "Bush breakfast in the scenic reserve", "Stargazing session with high-powered astronomical telescope"], meals: "All meals included", accommodation: "Luxury Safari Lodge Pavilion" },
          { day: "Day 4", title: "Artisan Encounters & Coastal Excursions", activities: ["Visit to traditional craft studios with master artisans", "Private snorkeling and catamaran expedition", "Gala beach dining under the stars"], meals: "All meals included", accommodation: "Luxury Overwater Pool Villa" },
          { day: "Day 5", title: "Wellness Farewell & Departure", activities: ["Sunrise yoga session overlooking the ocean", "Leisure breakfast and late checkout", "Private chauffeur transfer to departure airport"], meals: "Breakfast included", accommodation: "Departure" },
        ],
      };

      const s3 = makeSection("contact");
      s3.data = {
        type: "contact",
        title: "Design Your Tailor-Made Journey",
        subtitle: "Connect with our travel curators to customize dates, group sizes, and private experiences.",
        email: "concierge@example.com",
        phone: "+91 99888 77665",
        address: "Luxury Travel Concierge Desk",
        website: "https://example.com/travel",
        whatsapp: "+919988877665",
        instagram: "",
        linkedin: "",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "leadGuest", label: "Lead Guest Name", type: "text", required: true },
          { key: "email", label: "Email Address", type: "email", required: true },
          { key: "phone", label: "Phone / WhatsApp", type: "phone", required: true },
          { key: "travelDates", label: "Target Travel Month / Dates", type: "text", required: false },
          { key: "pax", label: "Number of Travelers (Adults / Children)", type: "text", required: false },
          { key: "preferences", label: "Special Dietary or Experience Preferences", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3];
    },
  },
  {
    id: "marketing-promotion",
    name: "Brand Campaign & Limited-Time Promotion",
    category: "marketing",
    description: "Promotional campaigns, discount offers, product packages, terms, and direct lead generation.",
    theme: {
      primaryColor: "#e11d48",
      accentColor: "#fbbf24",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Montserrat",
      bodyFont: "Inter",
      borderRadius: "lg",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Exclusive Limited-Time Partnership Offer",
        subheadline: "Accelerate Your Business with Preferential Pricing & Complimentary Setup",
        description: "Take advantage of our seasonal promotion package designed to equip your organization with production-ready tools and enterprise advisory.",
        ctaLabel: "Claim Your Special Offer",
        ctaUrl: "#offer",
        secondaryCtaLabel: "Review Terms",
        secondaryCtaUrl: "#contact",
        backgroundImage: null,
        backgroundOverlay: 25,
        layout: "centered",
      };

      const s2 = makeSection("offer");
      s2.data = {
        type: "offer",
        title: "Special Campaign Package",
        subtitle: "Available exclusively for registrations confirmed before the deadline",
        discount: "40% Savings",
        originalPrice: "₹ 50,000",
        offerPrice: "₹ 29,999",
        validUntil: "Valid for the next 14 days only",
        terms: "Offer applies to new accounts. Standard service level agreements and support policies apply.",
        ctaLabel: "Lock In Promotional Rate",
        ctaUrl: "#contact",
        features: [
          "Complete suite onboarding with zero setup fees",
          "Dedicated account specialist for initial 90 days",
          "Priority 24/7 technical and strategic assistance",
          "Includes 5 complimentary team user licenses",
        ],
      };

      const s3 = makeSection("contact");
      s3.data = {
        type: "contact",
        title: "Claim Promotion & Speak with an Advisor",
        subtitle: "Submit your details to secure the promotional pricing and schedule your onboarding call.",
        email: "campaign@example.com",
        phone: "+91 98000 12345",
        address: "Marketing & Growth Operations",
        website: "https://example.com/promo",
        whatsapp: "+919800012345",
        instagram: "",
        linkedin: "",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "name", label: "Full Name", type: "text", required: true },
          { key: "company", label: "Company / Brand Name", type: "text", required: true },
          { key: "email", label: "Official Work Email", type: "email", required: true },
          { key: "phone", label: "Mobile / WhatsApp", type: "phone", required: true },
          { key: "offerCode", label: "Promotional Code (Optional)", type: "text", required: false },
        ],
      };

      return [s1, s2, s3];
    },
  },
  {
    id: "custom-blank",
    name: "Custom Industry / Blank Canvas",
    category: "custom",
    description: "Start with essential sections and customize for any specific business or niche requirement.",
    theme: {
      primaryColor: "#2563eb",
      accentColor: "#7c3aed",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "lg",
      density: "comfortable",
    },
    createSections: () => {
      const s1 = makeSection("hero");
      s1.data = {
        type: "hero",
        headline: "Professional Business & Solutions Overview",
        subheadline: "Customized digital brochure for your business",
        description: "Present your company profile, key service capabilities, and contact details to clients and partners.",
        ctaLabel: "Get In Touch",
        ctaUrl: "#contact",
        secondaryCtaLabel: "Learn More",
        secondaryCtaUrl: "#overview",
        backgroundImage: null,
        backgroundOverlay: 30,
        layout: "centered",
      };

      const s2 = makeSection("overview");
      s2.data = {
        type: "overview",
        title: "About Our Organization",
        body: "Describe your core competencies, business domain, and client value proposition here.",
        image: null,
        layout: "text-left",
      };

      const s3 = makeSection("features");
      s3.data = {
        type: "features",
        title: "Key Capabilities & Offerings",
        subtitle: "What sets our solutions apart",
        items: [
          { icon: "Star", title: "Domain Expertise", description: "Deep industry experience delivering consistent quality and measurable results." },
          { icon: "Shield", title: "Reliability & Compliance", description: "Committed to rigorous standards, accountability, and seamless communication." },
          { icon: "Zap", title: "Client-Centric Execution", description: "Tailored approaches configured precisely to meet client requirements." },
        ],
        columns: 3,
      };

      const s4 = makeSection("contact");
      s4.data = {
        type: "contact",
        title: "Contact & Inquiries",
        subtitle: "Reach out to discuss your requirements with our team.",
        email: "info@example.com",
        phone: "+91 90000 00000",
        address: "Corporate Office Address",
        website: "https://example.com",
        whatsapp: "+919000000000",
        instagram: "",
        linkedin: "",
        facebook: "",
        youtube: "",
        twitter: "",
        showForm: true,
        formFields: [
          { key: "name", label: "Full Name", type: "text", required: true },
          { key: "email", label: "Email Address", type: "email", required: true },
          { key: "phone", label: "Phone Number", type: "phone", required: false },
          { key: "message", label: "Inquiry / Requirements", type: "textarea", required: false },
        ],
      };

      return [s1, s2, s3, s4];
    },
  },
];

export function getTemplatePreset(id: string): BrochureTemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((t) => t.id === id);
}

export function getTemplatesForCategory(category: BrochureCategory): BrochureTemplatePreset[] {
  return TEMPLATE_PRESETS.filter((t) => t.category === category);
}
