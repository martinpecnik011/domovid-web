// Supabase project for /app. Only the public anon key belongs here (access is enforced by RLS).
// While a value is 'REPLACE', /app runs on the in-browser mock adapter.
export const SUPABASE_URL: string = 'https://migpyeomrcaxfmzpdrmg.supabase.co';
export const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ3B5ZW9tcmNheGZtenBkcm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDk4NzcsImV4cCI6MjExMDA4NTg3N30.6IVObsV8m94j2n45NCX8BTA6zdkrymiY5H_pdBMv5NI';
export const isConfigured: boolean = SUPABASE_URL !== 'REPLACE' && SUPABASE_ANON_KEY !== 'REPLACE';
