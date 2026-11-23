// PLACEHOLDER admission form. The school's real template will replace the contents of this file; nothing else needs to change.
// The sections, fields and declarations below drive the on-screen form AND the printable PDF.
export type SignRole = "applicant" | "guardian" | "lawyer";
export type FieldKind = "text" | "textarea" | "date" | "tel" | "email" | "select";
export interface FormField { id: string; label: string; kind: FieldKind; required?: boolean; options?: string[]; hint?: string; prefill?: "fullName" | "phone" | "email" | "dob" | "address" | "education" }
export interface FormSection { id: string; title: string; intro?: string; fields: FormField[] }
export interface SignBlock { role: SignRole; title: string; nameField: string; declaration: string }

export const admissionForm = {
  version: "placeholder-1",
  isPlaceholder: true,
  title: "Admission form",
  passportLabel: "Passport photograph",
  sections: [
    { id: "applicant", title: "Applicant", fields: [
      { id: "fullName", label: "Full name", kind: "text", required: true, prefill: "fullName" },
      { id: "otherNames", label: "Other names (if any)", kind: "text" },
      { id: "dob", label: "Date of birth", kind: "date", required: true, prefill: "dob" },
      { id: "gender", label: "Gender", kind: "select", required: true, options: ["Female", "Male"] },
      { id: "stateOfOrigin", label: "State of origin", kind: "text", required: true },
      { id: "lga", label: "Local government area", kind: "text", required: true },
      { id: "nationality", label: "Nationality", kind: "text", required: true },
      { id: "phone", label: "Phone number", kind: "tel", required: true, prefill: "phone" },
      { id: "email", label: "Email address", kind: "email", required: true, prefill: "email" },
      { id: "address", label: "Residential address", kind: "textarea", required: true, prefill: "address" },
      { id: "education", label: "Highest education completed", kind: "textarea", required: true, prefill: "education" },
      { id: "health", label: "Any health condition we should know about (optional)", kind: "textarea" },
    ] },
    { id: "guardian", title: "Parent, guardian or next of kin", fields: [
      { id: "guardianName", label: "Full name", kind: "text", required: true },
      { id: "guardianRelationship", label: "Relationship to the applicant", kind: "text", required: true },
      { id: "guardianPhone", label: "Phone number", kind: "tel", required: true },
      { id: "guardianOccupation", label: "Occupation", kind: "text" },
      { id: "guardianAddress", label: "Address", kind: "textarea", required: true },
    ] },
    { id: "lawyer", title: "Lawyer or witness", intro: "A lawyer or other witness confirms the identity of the applicant and the guardian.", fields: [
      { id: "lawyerName", label: "Full name", kind: "text", required: true },
      { id: "lawyerFirm", label: "Chambers or organisation", kind: "text" },
      { id: "lawyerPhone", label: "Phone number", kind: "tel", required: true },
      { id: "lawyerEnrolment", label: "Enrolment or registration number (optional)", kind: "text" },
      { id: "lawyerAddress", label: "Office address", kind: "textarea", required: true },
    ] },
  ] as FormSection[],
  signBlocks: [
    { role: "applicant", title: "Applicant's declaration", nameField: "fullName", declaration: "I confirm that the information in this form is true and complete, and that I will follow the rules of the institution." },
    { role: "guardian", title: "Parent or guardian's consent", nameField: "guardianName", declaration: "I confirm that I know the applicant, that I consent to this admission, and that the details I have given are correct." },
    { role: "lawyer", title: "Lawyer or witness attestation", nameField: "lawyerName", declaration: "I confirm that I have seen the applicant and the guardian and that they signed this form in my presence." },
  ] as SignBlock[],
  confirmation: "I confirm that all the information above is correct and that the three signatures are genuine.",
  officeLines: ["Received by (name)", "Signature", "Date", "Official stamp"],
};