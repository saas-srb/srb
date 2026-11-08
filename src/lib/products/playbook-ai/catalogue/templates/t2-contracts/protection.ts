/** T2 contracts, part 2: confidentiality and protection (ct.nda_mutual, ct.nda_one_way, ct.nda_employee, ct.nonsolicit, ct.data_sharing). */
import { ai, c1, c2, f, hybridSection, lockedSection, p, when, whenYes } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { RawBlock, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import {
  CONTRACT_LAYOUT, I, NEVER_CONTRACT, baseTail, confidentiality, executionSection, generalProvisions, lawSection, liability, parties, termination,
} from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/common";

/** Definitions and obligations shared by both NDAs, written with the defined terms Discloser and Recipient. */
const ndaDefinitions = (): RawBlock[] => [
  c1("**Confidential Information** means all non-public information, in any form, that the Discloser or its representatives disclose to the Recipient in connection with the Purpose, whether before or after the Effective Date, including business, technical, financial, client, vendor, personnel and product information, and anything that a reasonable person would understand to be confidential from its nature or the way it is disclosed. It includes notes, analyses and other material that the Recipient prepares from it."),
  c1("**Purpose** means: {{input.purpose}}."),
  c1("**Representatives** means a party's directors, officers, employees, professional advisers and permitted subcontractors."),
];

const ndaObligations = (): RawBlock[] => [
  c1("The Recipient shall (a) use the Confidential Information only for the Purpose; (b) keep it confidential and protect it with at least the care it uses for its own confidential information, and never less than reasonable care; (c) disclose it only to Representatives who need to know it for the Purpose and who are bound by duties of confidentiality no less protective than this Agreement; and (d) be responsible for any breach of this Agreement by its Representatives."),
  c1("The Recipient shall not copy the Confidential Information except as the Purpose needs, shall not try to reverse engineer or analyse any sample, software or prototype it receives, and shall not use the Confidential Information to compete with the Discloser."),
  c1("The Recipient shall tell the Discloser promptly if it becomes aware of any unauthorised use or disclosure of the Confidential Information and shall help the Discloser to limit the damage."),
  c1("The Recipient may disclose Confidential Information to the extent that a law, court or regulator requires, if it gives the Discloser prompt notice where the law permits, so that the Discloser may seek protection, and discloses only what is required."),
];

const ndaExclusions = (): RawBlock[] => [
  c1("Confidential Information does not include information that the Recipient can show by written records (a) is or becomes public other than through a breach of this Agreement; (b) was lawfully known to the Recipient before the Discloser disclosed it; (c) was lawfully received from a third party who was free to disclose it; or (d) was developed by the Recipient independently without use of or reference to the Confidential Information."),
];

const ndaTermRemedies = (): RawBlock[] => [
  c1("This Agreement applies to Confidential Information disclosed during {{input.term_months|number}} months from the Effective Date. The Recipient's obligations continue for {{input.survival_months|number}} months after this Agreement ends and, for any trade secret, for as long as it remains a trade secret."),
  c1("A party may end this Agreement earlier by written notice to the other, but the obligations in respect of Confidential Information already disclosed continue as stated above."),
];

const ndaRemedies = (): RawBlock[] => [
  c1("On the Discloser's written request, and when this Agreement ends, the Recipient shall promptly return or destroy all Confidential Information and confirm in writing that it has done so, except for copies the law requires it to keep and routine backups, which remain subject to this Agreement."),
  c1("The Recipient acknowledges that a breach of this Agreement may cause the Discloser harm for which damages alone may not be an adequate remedy, and that the Discloser may seek an injunction or other equitable relief in addition to any other remedy."),
  c1("All Confidential Information remains the property of the Discloser. Nothing in this Agreement gives the Recipient any licence or right in it, or obliges either party to disclose any information or to enter into any further agreement, and the Discloser gives no warranty about the accuracy or completeness of the Confidential Information."),
];

const nda = (id: string, title: string, mutual: boolean) => defineTemplate(id, {
  title,
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."), I.effective(),
    ...(mutual ? [] : [f.select("discloser", "Who discloses the information", ["The Company", "The other party"], { help: "The party that shares its confidential information. The other party receives it." })]),
    f.longtext("purpose", "Purpose of the disclosure", { help: "Why the information is being shared, for example evaluating a possible business relationship." }),
    f.number("term_months", "Period during which information may be disclosed (months)", { min: 1, max: 600 }),
    I.survival(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", [
      ...parties("party", "Other Party", mutual ? "This mutual non-disclosure agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:" : "This non-disclosure agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:"),
      ...(mutual
        ? [p("Each party may disclose Confidential Information to the other, and in this Agreement the party disclosing is the \"Discloser\" and the party receiving is the \"Recipient\".")]
        : [when("input.discloser", "eq", "The Company", [p("The Company is the \"Discloser\" and the Other Party is the \"Recipient\".")]), when("input.discloser", "eq", "The other party", [p("The Other Party is the \"Discloser\" and the Company is the \"Recipient\".")])]),
    ]),
    lockedSection("definitions", "Definitions", ndaDefinitions()),
    lockedSection("obligations", "Obligations of the Recipient", ndaObligations()),
    lockedSection("exclusions", "Exclusions", ndaExclusions()),
    lockedSection("term", "Term", ndaTermRemedies()),
    lockedSection("remedies", "Return of information and remedies", ndaRemedies()),
    lockedSection("general", "General provisions", generalProvisions().filter((_, i) => i !== 1 && i !== 0)),
    lawSection(), executionSection("Other Party"),
  ],
});

const ndaMutual = nda("ct.nda_mutual", "Mutual Non-Disclosure Agreement", true);
const ndaOneWay = nda("ct.nda_one_way", "Non-Disclosure Agreement", false);

const ndaEmployee = defineTemplate("ct.nda_employee", {
  title: "Employee Confidentiality and Intellectual Property Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [I.counter("employee", "Employee"), I.effective(), I.survival(), ...baseTail()],
  sections: [
    lockedSection("parties", "Parties", [
      p("This agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between **{{company.legal_name}}**, having its registered office at {{company.address}} (the \"Company\"), and **{{employee.name}}**, employee code {{employee.code}}, of {{employee.address}} (the \"Employee\"). It is made in connection with the Employee's employment with the Company."),
    ]),
    lockedSection("confidentiality", "Confidentiality", [
      c1("**Confidential Information** means all non-public information that the Employee learns or receives through the employment, including business plans, client and vendor information, pricing, source code, designs, processes, financial and personnel information, and information of third parties that the Company must keep confidential."),
      c1("The Employee shall keep Confidential Information secret during the employment and afterwards for {{input.survival_months|number}} months and, for any trade secret, for as long as it remains one; shall use it only for the Company's work; and shall not copy, remove, publish or share it except as the Company's work requires."),
      c1("This clause does not apply to information that is or becomes public other than through the Employee's breach, or that the Employee already lawfully knew before the employment, or that the law requires the Employee to disclose."),
      c1("Nothing in this Agreement stops the Employee from reporting a suspected violation of law to a regulator or authority, or from making a disclosure that the law protects."),
    ]),
    lockedSection("ip", "Assignment of intellectual property", [
      c1("All inventions, works, software, designs, documents, data and other material that the Employee creates, alone or with others, in the course of the employment or using the Company's time, systems, premises or Confidential Information (\"Work Product\"), and all intellectual property rights in them, belong to the Company from creation."),
      c1("To the extent any right in Work Product does not vest in the Company automatically, the Employee assigns it to the Company, now and for the future, for the full term of the right and throughout the world, and waives to the extent the law permits any moral right in it."),
      c1("The Employee shall promptly disclose Work Product to the Company and shall sign any document and do anything reasonably required to record or protect the Company's rights, including after the employment ends."),
      c1("If the Employee created anything before the employment that the Employee wishes to exclude from this clause, the Employee shall list it in writing for the Company before signing. Anything not listed is treated as not existing, and the Employee shall not include any earlier work in Work Product without the Company's written permission."),
    ]),
    lockedSection("return", "Return of property", [
      c1("When the employment ends, or earlier if the Company asks, the Employee shall return all Company property, documents, data and copies in any form, delete Confidential Information from personal devices and accounts, and confirm in writing that the Employee has done so."),
      c1("The Employee's obligations under this Agreement continue after the employment ends, and the Company may remind any new employer of them."),
    ]),
    lockedSection("general", "General provisions", [
      c1("The Employee acknowledges that a breach may cause the Company harm that damages alone may not remedy, and that the Company may seek an injunction in addition to any other remedy."),
      ...generalProvisions().slice(4, 8),
    ]),
    lawSection(), executionSection("Employee"),
  ],
});

const nonSolicit = defineTemplate("ct.nonsolicit", {
  title: "Non-Solicitation Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."), I.effective(),
    f.longtext("background", "Why this agreement is needed", { help: "The relationship in connection with which the covenant is given.", feedsSections: ["covenant"] }),
    f.number("period_months", "Period of the covenant (months)", { min: 1, max: 120, help: "Use a period that is reasonable for the relationship. A long period may not be enforceable." }),
    f.yesno("restrict_employees", "Restrict soliciting employees?", { defaultValue: "yes" }),
    f.yesno("restrict_clients", "Restrict soliciting clients and customers?", { defaultValue: "no" }),
    ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Other Party", "This non-solicitation agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("covenant", "Covenant", [
      c1("**Background.** [[input.background_text|Background|The relationship in connection with which this covenant is given]]"),
      c1("For {{input.period_months|number}} months from the Effective Date (the \"Restricted Period\"), the Other Party shall not, directly or through others, without the Company's prior written consent:"),
      whenYes("input.restrict_employees", [c2("solicit, induce or encourage any person who is an employee or consultant of the Company, and with whom the Other Party had dealings through the relationship, to leave the Company, or employ or engage any such person; this does not stop general advertisements not aimed at such persons;")]),
      whenYes("input.restrict_clients", [c2("solicit any client or customer of the Company, with whom the Other Party dealt through the relationship, for services that compete with those the Company provides to that client or customer.")]),
      c1("The parties agree that the covenant is intended to protect the Company's legitimate business interests in its people, relationships and Confidential Information, that it is limited in time and scope, and that it is reasonable. It applies only to the extent the law permits, and if a court finds any part too wide it shall be read down to the widest scope that is enforceable."),
    ], ai("Describe the relationship in connection with which the covenant is given, in two or three neutral sentences, using only the notes supplied.", ["party.name", "input.background"], NEVER_CONTRACT, { minWords: 20, maxWords: 90 })),
    lockedSection("remedies", "Remedies", [
      c1("The Other Party acknowledges that a breach of this Agreement may cause the Company harm that damages alone may not remedy, and that the Company may seek an injunction or other equitable relief in addition to damages and any other remedy."),
      c1("This Agreement does not limit any duty of confidentiality that either party owes the other under any other agreement or the law."),
    ]),
    lockedSection("general", "General provisions", generalProvisions().slice(2, 8)),
    lawSection(), executionSection("Other Party"),
  ],
});

const dataSharing = defineTemplate("ct.data_sharing", {
  title: "Data Sharing Agreement",
  layout: CONTRACT_LAYOUT,
  inputs: [
    I.counter("party", "Other party", "Enter the other party's name and address."), I.effective(),
    f.select("direction", "Who shares the data", ["The Company shares data with the other party", "The other party shares data with the Company", "Both parties share data with each other"]),
    f.longtext("data_categories", "Data to be shared", { help: "Categories of data and of the people they relate to. Do not list actual personal data.", feedsSections: ["data"] }),
    f.longtext("purpose", "Purpose of sharing", { help: "The specific purpose, and nothing wider.", feedsSections: ["data"] }),
    f.longtext("security_notes", "Additional security measures agreed", { required: false, feedsSections: ["safeguards"] }),
    f.number("breach_notice_hours", "Hours within which a data breach must be reported", { min: 1, max: 720, help: "Use the period agreed between the parties and required by law and by your own policies." }),
    f.number("retention_months", "Months the data may be kept after the purpose ends", { min: 0, max: 600 }),
    I.termMonths(), I.noticeDays(), I.cureDays(), I.liabilityCap(), ...baseTail(),
  ],
  sections: [
    lockedSection("parties", "Parties", parties("party", "Other Party", "This data sharing agreement (the \"Agreement\") is made on {{input.effective_date|date}} (the \"Effective Date\") between:")),
    hybridSection("data", "Data and purpose", [
      c1("**Sharing.** Under this Agreement: {{input.direction}}. The party sharing data is the \"Provider\" and the party receiving it is the \"Recipient\"; where both share, each is the Provider of its own data and the Recipient of the other's."),
      c1("**Data.** The data shared (the \"Data\") is: [[input.data_description|Data|Categories of data and of the people they relate to]]"),
      c1("**Purpose.** The Recipient shall use the Data only for the following purpose and nothing else (the \"Purpose\"): [[input.purpose_text|Purpose|The specific purpose]]"),
      c1("Each party shall comply with the law on data protection that applies to it, including, as and when its provisions are in force, the Digital Personal Data Protection Act, 2023 and the rules made under it, and the Information Technology Act, 2000 and the rules made under it. The Provider confirms that it has the right and, where the law requires, the consent or other lawful ground to share the Data for the Purpose."),
    ], ai("State the categories of data and the specific purpose in precise language, using only the notes supplied. Never list actual personal data.", ["party.name", "input.data_categories", "input.purpose", "input.direction"], [...NEVER_CONTRACT, "personal data, identifiers or counts of individuals"], { minWords: 40, maxWords: 200 })),
    hybridSection("safeguards", "Safeguards", [
      c1("The Recipient shall keep the Data secure using reasonable security safeguards appropriate to its nature, including access controls limited to staff who need it for the Purpose, encryption in transit and at rest where reasonably possible, and measures to prevent unauthorised access, loss or disclosure."),
      c1("The Recipient shall not transfer the Data to anyone else, or outside India, or allow another party to process it, without the Provider's prior written consent and, where the law requires, appropriate safeguards."),
      c1("The Recipient shall use the Data only for the Purpose, shall not try to identify anyone from data that has been anonymised, and shall help the Provider to respond to any request or complaint from the people the Data relates to."),
      p("[[input.security_extra|Additional safeguards|Further safeguards agreed between the parties]]"),
    ], ai("Add short clauses for any further security measures in the notes. If there are none, write nothing.", ["input.security_notes"], NEVER_CONTRACT, { minWords: 5, maxWords: 100 })),
    lockedSection("breach", "Data breach", [
      c1("The Recipient shall tell the Provider in writing without delay and in any case within {{input.breach_notice_hours|number}} hours of becoming aware of any unauthorised access to, or loss, alteration or disclosure of, the Data (a \"Breach\"), stating what it knows about the nature of the Breach, the Data affected and the steps taken."),
      c1("The Recipient shall take immediate steps to contain the Breach, shall cooperate with the Provider's investigation, and shall give the Provider the information it needs to meet its own duties to authorities and to the people affected. The Provider decides whether and how those people and the authorities are told, unless the law requires otherwise."),
    ]),
    lockedSection("retention", "Retention and return", [
      c1("The Recipient shall keep the Data only as long as the Purpose needs and not more than {{input.retention_months|number}} months after the Purpose ends, unless the law requires it to keep it longer."),
      c1("When that period ends, or this Agreement ends, or the Provider asks, the Recipient shall return or securely delete the Data and confirm in writing that it has done so."),
    ]),
    lockedSection("confidentiality", "Confidentiality", confidentiality(false)),
    lockedSection("term", "Term", [c1("This Agreement starts on the Effective Date and continues for {{input.term_months|number}} months, unless it is ended earlier as this Agreement provides.")]),
    lockedSection("liability", "Liability", liability()),
    lockedSection("termination", "Termination", termination()),
    lockedSection("general", "General provisions", generalProvisions()),
    lawSection(), executionSection("Other Party"),
  ],
});


export const CT_PROTECTION: TemplateDef[] = [ndaMutual, ndaOneWay, ndaEmployee, nonSolicit, dataSharing];
