// supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://olnrigfkbttnzooditmk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbnJpZ2ZrYnR0bnpvb2RpdG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NDM5MDAsImV4cCI6MjA3MjMxOTkwMH0.OzjJ5IKsOFlj_2o5H44yUu7c4sR4279vSa2XeKL3EKQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


