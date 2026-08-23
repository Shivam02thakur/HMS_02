CREATE UNIQUE INDEX one_active_admission_per_patient 
ON admissions(patient_id) WHERE status = 'ADMITTED';