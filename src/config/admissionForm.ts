// The real Ever Fresh Vocational Institute "Application form for admission".
// One source for the on-screen form, validation AND the printable/filled PDF (src/server/voc/formpdf.ts).
// Wording is copied exactly from the school's form, including its own spelling and punctuation. Do not "correct" it here without the school's say-so.
export type SignRole = "sponsor" | "recommender" | "applicant" | "witness";
export type FieldKind = "text" | "date" | "tel" | "select";
export interface FormField {
  id: string; label: string; kind: FieldKind; required?: boolean; options?: string[]; hint?: string;
  /** Longest entry (characters). Keeps what is typed inside the blank line on the printed form. */
  max?: number;
  /** Filled from the application when the applicant has not typed anything yet. */
  prefill?: "phone" | "dob" | "address";
}
export interface SignBlock { role: SignRole; title: string; hand: string }

const f = (id: string, label: string, kind: FieldKind = "text", o: Partial<FormField> = {}): FormField => ({ id, label, kind, ...o });

export const COURSE_MODES = ["Full time", "Part time", "Weekend", "Special"] as const;

/** SECTION A */
const A_NAME: FormField[] = [
  f("surname", "Surname", "text", { required: true, max: 30 }),
  f("firstName", "First name", "text", { required: true, max: 30 }),
  f("middleName", "Middle name", "text", { max: 30 }),
];
const A_REST: FormField[] = [
  f("dob", "Date of birth", "date", { required: true, prefill: "dob" }),
  f("placeOfBirth", "Place of birth", "text", { max: 28 }),
  f("ageOnAdmission", "Age on admission", "text", { max: 6 }),
  f("sex", "Sex", "select", { required: true, options: ["Male", "Female"] }),
  f("height", "Height", "text", { max: 12 }),
  f("complexion", "Complexion", "text", { max: 14 }),
  f("homeTown", "Home town", "text", { max: 34 }),
  f("village", "Village", "text", { max: 32 }),
  f("localGovt", "Local Govt.", "text", { max: 16 }),
  f("stateOfOrigin", "State of origin", "text", { required: true, max: 18 }),
  f("nationality", "Nationality", "text", { required: true, max: 15 }),
  f("physicalDeformation", "Physical deformation", "text", { max: 70, hint: "If yes, specify. Leave blank if none." }),
  f("residentialAddress", "Residential address", "text", { required: true, max: 70, prefill: "address" }),
  f("postalAddress", "Present postal address", "text", { max: 16 }),
  f("contactNumbers", "Contact numbers", "text", { max: 13 }),
  f("mobile", "Mobile", "tel", { required: true, max: 20, prefill: "phone" }),
];

/** SECTION B: three rows, four columns (date, school, examination passed, date). */
const B_COLUMNS = ["DATE", "SCHOOLS/COLLEGES ATTENDED", "EXAMINATION PASSED", "DATE"] as const;
const B_ROWS: FormField[][] = [1, 2, 3].map((n) => [
  f(`sch${n}From`, "Date attended", "text", { max: 16 }),
  f(`sch${n}Name`, "School or college attended", "text", { max: 42 }),
  f(`sch${n}Exam`, "Examination passed", "text", { max: 36 }),
  f(`sch${n}ExamDate`, "Date passed", "text", { max: 14 }),
]);

/** SECTION C: five courses; for each one a mode of study may be marked. */
const C_COURSES = [
  { id: "course1", name: "CRAFT" },
  { id: "course2", name: "CATERING & HOTEL MANAGEMENT" },
  { id: "course3", name: "FASHION & TEXTILE DESIGN" },
  { id: "course4", name: "MAKE UP ARTIST" },
  { id: "course5", name: "COSMETOLOGY" },
].map((c) => ({ ...c, field: f(c.id, c.name, "select", { options: [...COURSE_MODES] }) }));

/** SECTION D (sponsor), E (recommender), G (witness) */
const D_FIELDS: FormField[] = [
  f("hailsFrom", "Applicant hails from", "text", { max: 20 }),
  f("sponsorName", "Name of sponsor", "text", { required: true, max: 66 }),
  f("sponsorResidential", "Residential address", "text", { required: true, max: 70 }),
  f("sponsorOffice", "Office address", "text", { max: 30 }),
  f("sponsorRelationship", "Relationship to applicant", "text", { required: true, max: 28 }),
  f("sponsorPhone", "Phone numbers", "text", { required: true, max: 26 }),
];
const E_FIELDS: FormField[] = [
  f("knownYears", "Years the recommender has known the applicant", "text", { required: true, max: 8 }),
  f("recName", "Name", "text", { required: true, max: 66 }),
  f("recProfession", "Profession", "text", { required: true, max: 40 }),
  f("recRank", "Rank", "text", { max: 26 }),
  f("recDesignation", "Designation", "text", { max: 28 }),
];
const G_FIELDS: FormField[] = [f("witnessName", "Witnessed by (name)", "text", { required: true, max: 60 })];

export const admissionForm = {
  version: "ever-fresh-2026-1",
  isPlaceholder: false,
  title: "Application form for admission",
  letterhead: {
    name: "EVER FRESH VOCATIONAL INSTITUTE",
    lines: ["No. 1, Regent Street, Abubor Nnewichi,", "Behind King's Palace Hotel, Nnewi Anambra State, Nigeria.", "08035006435, 08038472422, 08133300777", "E-mail: everfreshcreations@yahoo.com"],
    motto: "Motto: Skill in all Wisdom (Dan 1:4)",
    formTitle: "APPLICATION FORM FOR ADMISSION",
    subtitle: "PROFESSIONAL EDUCATIONAL COURSES",
  },
  /** PLACEHOLDER logo. To use the real one: replace the file below (same name, JPEG) and set `caption` to null. Nothing else changes. */
  logo: { file: "public/brand/admission-form-logo.jpg", caption: ["GOVERNMENT", "APPROVED"] as [string, string] | null },
  /** A small printed reference (application number and page) at the foot of each PDF page, so a printed or scanned form can be matched to its application. Set false for a form with nothing added. */
  showReference: true,
  passportLabel: "Passport photograph",

  A: { title: "SECTION A: PERSONAL DATA", nameFields: A_NAME, fields: A_REST },
  B: { title: "SECTION B: SCHOOLS ATTENDED/QUALIFICATIONS", columns: B_COLUMNS, rows: B_ROWS, note: "(Attach photocopies of certificates/Testimonial)" },
  C: { title: "SECTION C: COURSES AVAILABLE", instruction: "(Mark below, the courses of your choice and mode of study)", modes: COURSE_MODES, courses: C_COURSES },
  D: {
    title: "SECTION D: SPONSOR'S UNDERTAKING", subtitle: "(To be completed by sponsor)", fields: D_FIELDS,
    lead: "I hereby undertake to be responsible for full moral and financial sponsorship of the", leadLine2: "applicant whose name is",
  },
  E: {
    title: "SECTION E: RECOMMENDATION", subtitle: "(To be completed by a clergyman, a professional Lawyer, Doctor, Lecturer, Senior Civil servant etc)", fields: E_FIELDS,
    before: "I have known the applicant for", after: "years. I recommend him/her without reservation as", line2: "capable in diligence and discipline of benefitting from the course he/she has applied for.",
  },
  F: { title: "SECTION F: ACCOMMODATION", lines: ["The Institute is fully residential. Day students are allowed only in exceptional cases after a", "written application."] },
  G: {
    title: "SECTION G: APPLICANT'S UNDERTAKING", subtitle: "(To be signed by applicant and witnessed by parents/Guardian/Sponsor)", fields: G_FIELDS,
    paragraph: [
      "Anticipating my admission, I hereby commit myself completely to the achievement of the objective of the",
      "school which is that \u201CEvery Successful Student should Graduate immediately into Job, self Employment or",
      "Future Education\u201D. Should I fail to co-operate in any way with the school to achieve this objective, I also",
      "accept to summarily be dismissed for gross immorality, misconduct, in-subordination and involvement in any",
      "form of unauthorized student unionism, political, religious or social. I also accept to pay in full for damage",
      "caused by me to the school property and to forfeit my fees should I withdraw or be dismissed.",
    ],
    /** The applicant's name fills the blank that starts this paragraph. */
    paragraph2: [
      "hereby undertake to be morally upright in conduct and behavior and to be a part in",
      "achieving the vision of this Missionary Based Institution of raising a generation of children in whom-was as",
      "blemish, but well favored and skillful in all wisdom and cunning in knowledge such that will have ability in",
      "them to stand before kings.",
    ],
  },
  /** Left blank on purpose: the school fills this box in by hand. */
  office: { title: "FOR OFFICIAL USE ONLY" },

  /** The four signatures. Order is the order they appear on the form. `hand` tells the applicant who signs. */
  signBlocks: [
    { role: "sponsor", title: "Sponsor's signature", hand: "Hand the phone or computer to your sponsor to sign." },
    { role: "recommender", title: "Recommender's signature", hand: "Hand the phone or computer to your recommender to sign." },
    { role: "applicant", title: "Applicant's signature", hand: "Sign here yourself." },
    { role: "witness", title: "Witness's signature", hand: "Hand the phone or computer to your parent, guardian or sponsor (the witness) to sign." },
  ] as SignBlock[],
  confirmation: "I confirm that all the information above is correct and that the four signatures are genuine.",
};

export const SIGN_ROLES: SignRole[] = admissionForm.signBlocks.map((b) => b.role);
/** Every field that is saved with the form. */
export const allFormFields: FormField[] = [
  ...A_NAME, ...A_REST, ...B_ROWS.flat(), ...C_COURSES.map((c) => c.field), ...D_FIELDS, ...E_FIELDS, ...G_FIELDS,
];
/** The applicant's full name as the form shows it (Surname First Name Middle Name). */
export const applicantName = (d: Record<string, string>) => [d.surname, d.firstName, d.middleName].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
/** "SECTION D: SPONSOR'S UNDERTAKING" -> "Section D: Sponsor's Undertaking", for on-screen headings. */
export const headingCase = (t: string) => t.toLowerCase().replace(/(^|[\s(/])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());