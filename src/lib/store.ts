export interface Patient {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  nextOfKin: string;
  insuranceName: string;
  enrolleeNumber: string;
  createdAt: string;
}

export interface Visit {
  id: string;
  patientId: string;
  date: string;
  // Visual Acuity
  vaOdDistance: string;
  vaOsDistance: string;
  vaOuDistance: string;
  vaOdNear: string;
  vaOsNear: string;
  vaOuNear: string;
  // Auto Refraction
  autoOdSphere: string;
  autoOdCylinder: string;
  autoOdAxis: string;
  autoOsSphere: string;
  autoOsCylinder: string;
  autoOsAxis: string;
  // Subjective Refraction
  subOdSphere: string;
  subOdCylinder: string;
  subOdAxis: string;
  subOsSphere: string;
  subOsCylinder: string;
  subOsAxis: string;
  // Final Prescription
  finalPrescription: string;
  // Case History
  chiefComplaint: string;
  duration: string;
  ocularHistory: string;
  medicalHistory: string;
  // Diagnosis & Treatment
  diagnosis: string;
  drugsGiven: string;
  glassesPrescribed: string;
}

const PATIENTS_KEY = 'optocare_patients';
const VISITS_KEY = 'optocare_visits';

export function getPatients(): Patient[] {
  const data = localStorage.getItem(PATIENTS_KEY);
  return data ? JSON.parse(data) : [];
}

export function savePatient(patient: Patient) {
  const patients = getPatients();
  const idx = patients.findIndex(p => p.id === patient.id);
  if (idx >= 0) patients[idx] = patient;
  else patients.push(patient);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
}

export function getPatient(id: string): Patient | undefined {
  return getPatients().find(p => p.id === id);
}

export function getVisits(patientId?: string): Visit[] {
  const data = localStorage.getItem(VISITS_KEY);
  const visits: Visit[] = data ? JSON.parse(data) : [];
  if (patientId) return visits.filter(v => v.patientId === patientId);
  return visits;
}

export function saveVisit(visit: Visit) {
  const visits = getVisits();
  const idx = visits.findIndex(v => v.id === visit.id);
  if (idx >= 0) visits[idx] = visit;
  else visits.push(visit);
  localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
}

export function getTodayVisitCount(): number {
  const today = new Date().toISOString().split('T')[0];
  return getVisits().filter(v => v.date.startsWith(today)).length;
}
