/**
 * Example questions shown in the Policy Assistant, global search and the dashboard widget.
 * Answers come from the backend RAG pipeline over uploaded policy documents.
 */
import type { PolicyCategory, SuggestedQuestion } from "../types/policyAssistant";

export const policyCategories: PolicyCategory[] = ["Leave", "Benefits", "Payroll", "Onboarding", "Hybrid Work", "IT & Security", "Conduct"];

export const suggestedQuestions: SuggestedQuestion[] = [
  { question: "What is the leave policy?", category: "Leave" },
  { question: "How do I enroll in benefits?", category: "Benefits" },
  { question: "What documents are required for onboarding?", category: "Onboarding" },
  { question: "When will I receive my first salary?", category: "Payroll" },
  { question: "How many sick days do I get?", category: "Leave" },
  { question: "Can I work from home?", category: "Hybrid Work" },
  { question: "How do I report a phishing email?", category: "IT & Security" },
  { question: "How do I raise a workplace concern?", category: "Conduct" },
];
